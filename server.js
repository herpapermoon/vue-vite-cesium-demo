const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();

// 启用CORS跨域请求
app.use(cors());

// 解析JSON请求体，增大限制以处理大型GeoJSON
app.use(express.json({ limit: '50mb' }));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 保存违规数据的API端点 - 确保这个端点在前面
app.post('/api/save-violations-geojson', (req, res) => {
  console.log('=== 收到违规数据保存请求 ===');
  console.log('请求URL:', req.url);
  console.log('请求方法:', req.method);
  console.log('请求体类型:', typeof req.body);
  console.log('请求体长度:', Array.isArray(req.body) ? req.body.length : 'not array');
  
  try {
    const data = req.body;
    
    // 验证数据
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return res.status(400).json({ 
        success: false, 
        message: '没有数据需要保存' 
      });
    }
    
    // 如果接收到的是数组格式，转换为GeoJSON格式
    let geoJsonData;
    if (Array.isArray(data)) {
      console.log('转换数组数据为GeoJSON格式，数组长度:', data.length);
      geoJsonData = {
        type: "FeatureCollection",
        name: "违规车辆数据",
        crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
        features: data.map(violation => ({
          type: "Feature",
          properties: {
            id: violation.id,
            bikeId: violation.bikeId,
            type: violation.type,
            status: violation.status,
            location: violation.location,
            detectedTime: violation.detectedTime,
            distanceFromParkingArea: violation.distanceFromParkingArea,
            nearestParkingArea: violation.nearestParkingArea?.name || '',
            adminNotes: violation.adminNotes || '',
            resolvedTime: violation.resolvedTime || null,
            processedBy: violation.processedBy || null
          },
          geometry: {
            type: "Point",
            coordinates: violation.coordinates || [0, 0]
          }
        }))
      };
    } else if (data && data.type === 'FeatureCollection') {
      console.log('接收到GeoJSON格式数据');
      geoJsonData = data;
    } else {
      console.error('无效的数据格式:', data);
      return res.status(400).json({ 
        success: false, 
        message: '无效的数据格式' 
      });
    }
    
    // 确保目录存在
    const dataDir = path.join(__dirname, 'public', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('创建data目录:', dataDir);
    }
    
    // 保存到violations.geojson文件
    const filePath = path.join(dataDir, 'violations.geojson');
    fs.writeFileSync(filePath, JSON.stringify(geoJsonData, null, 2), 'utf8');
    
    console.log(`违规数据已保存到: ${filePath}`);
    console.log(`保存特征数量: ${geoJsonData.features?.length || 0}`);
    
    return res.json({ 
      success: true, 
      message: '违规数据保存成功',
      filePath: '/data/violations.geojson',
      featuresCount: geoJsonData.features?.length || 0,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('保存违规数据时发生错误:', error);
    return res.status(500).json({ 
      success: false, 
      message: `服务器错误: ${error.message}` 
    });
  }
});

// 更新violations.geojson文件中的特定记录
app.put('/api/update-violation/:id', (req, res) => {
  try {
    const violationId = req.params.id;
    const updateData = req.body;
    
    const filePath = path.join(__dirname, 'public', 'data', 'violations.geojson');
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: '违规数据文件不存在'
      });
    }
    
    // 读取现有数据
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const geoJsonData = JSON.parse(fileContent);
    
    // 查找并更新指定的违规记录
    const featureIndex = geoJsonData.features.findIndex(
      feature => feature.properties.id === violationId
    );
    
    if (featureIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `未找到ID为 ${violationId} 的违规记录`
      });
    }
    
    // 更新记录
    geoJsonData.features[featureIndex].properties = {
      ...geoJsonData.features[featureIndex].properties,
      ...updateData,
      updatedTime: new Date().toISOString()
    };
    
    // 保存更新后的数据
    fs.writeFileSync(filePath, JSON.stringify(geoJsonData, null, 2), 'utf8');
    
    return res.json({
      success: true,
      message: '违规记录更新成功',
      updatedFeature: geoJsonData.features[featureIndex]
    });
    
  } catch (error) {
    console.error('更新违规记录时发生错误:', error);
    return res.status(500).json({
      success: false,
      message: `更新错误: ${error.message}`
    });
  }
});

// 保存停车区数据API端点
app.post('/api/save-parking-data', (req, res) => {
  try {
    const data = req.body;
    
    // 记录请求内容，帮助调试
    console.log('收到保存请求，数据类型:', typeof data);
    console.log('数据包含features项:', data && Array.isArray(data.features) ? data.features.length : 'no features');
    
    // 验证数据格式
    if (!data || !data.type || data.type !== 'FeatureCollection') {
      return res.status(400).json({ 
        success: false, 
        message: '无效的GeoJSON数据' 
      });
    }
    
    // 确保目录存在
    const dataDir = path.join(__dirname, 'public', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // 保存到文件
    const filePath = path.join(dataDir, 'CUG-station.geojson');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    
    console.log(`数据已保存到: ${filePath}`);
    
    // 确保响应是有效的JSON
    return res.json({ 
      success: true, 
      message: '停车区数据保存成功',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('保存数据时发生错误:', error);
    
    // 确保错误响应也是有效的JSON
    return res.status(500).json({ 
      success: false, 
      message: `服务器错误: ${error.message}`, 
      timestamp: new Date().toISOString()
    });
  }
});

// 添加轨迹数据保存API端点
app.post('/api/save-track-data', (req, res) => {
  try {
    const data = req.body;
    
    console.log('收到轨迹保存请求，数据类型:', typeof data);
    
    // 验证数据格式
    if (!data || !data.type || data.type !== 'FeatureCollection') {
      return res.status(400).json({ 
        success: false, 
        message: '无效的轨迹GeoJSON数据' 
      });
    }

    // 确保目录存在
    const trackDir = path.join(__dirname, 'public', 'tracks');
    if (!fs.existsSync(trackDir)) {
      fs.mkdirSync(trackDir, { recursive: true });
    }

    // 保存轨迹文件，按日期命名
    const timestamp = new Date().toISOString().split('T')[0];
    const filePath = path.join(trackDir, `tracks_${timestamp}.geojson`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

    console.log(`轨迹数据已保存到: ${filePath}`);
    
    return res.json({ 
      success: true, 
      message: '轨迹数据保存成功',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('保存轨迹数据时发生错误:', error);
    return res.status(500).json({ 
      success: false, 
      message: `服务器错误: ${error.message}` 
    });
  }
});

// 异常检测API端点
app.post('/api/detect-anomaly', (req, res) => {
  try {
    const { trackData, detectionRules } = req.body;
    
    // 默认检测规则
    const defaultRules = {
      speedLimit: { min: 5, max: 40 }, // km/h
      maxStopDuration: 300, // 秒
      maxDeviationDistance: 200 // 米
    };
    
    const rules = { ...defaultRules, ...detectionRules };
    const anomalies = [];

    // 遍历轨迹特征进行检测
    trackData.features.forEach((feature, index) => {
      if (feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates;
        const properties = feature.properties;
        
        // 检测1: 速度异常
        if (properties.avgSpeed) {
          if (properties.avgSpeed < rules.speedLimit.min) {
            anomalies.push({
              type: 'SPEED_TOO_SLOW',
              bikeId: properties.bikeId,
              value: properties.avgSpeed,
              threshold: rules.speedLimit.min,
              severity: 'medium',
              timestamp: properties.startTime,
              message: `骑行速度过慢: ${properties.avgSpeed} km/h`
            });
          }
          
          if (properties.avgSpeed > rules.speedLimit.max) {
            anomalies.push({
              type: 'SPEED_TOO_FAST',
              bikeId: properties.bikeId,
              value: properties.avgSpeed,
              threshold: rules.speedLimit.max,
              severity: 'high',
              timestamp: properties.startTime,
              message: `骑行速度过快: ${properties.avgSpeed} km/h`
            });
          }
        }

        // 检测2: 停留时间异常（简化版）
        if (properties.stopDuration && properties.stopDuration > rules.maxStopDuration) {
          anomalies.push({
            type: 'LONG_STOP',
            bikeId: properties.bikeId,
            value: properties.stopDuration,
            threshold: rules.maxStopDuration,
            severity: 'medium',
            timestamp: properties.startTime,
            message: `异常停留时间: ${Math.round(properties.stopDuration/60)} 分钟`
          });
        }

        // 检测3: 路径异常（基础版本）
        if (coords.length < 3) {
          anomalies.push({
            type: 'INSUFFICIENT_DATA',
            bikeId: properties.bikeId,
            severity: 'low',
            timestamp: properties.startTime,
            message: '轨迹数据不足'
          });
        }
      }
    });

    return res.json({
      success: true,
      anomalies: anomalies,
      totalChecked: trackData.features.length,
      anomalyCount: anomalies.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('异常检测时发生错误:', error);
    return res.status(500).json({ 
      success: false, 
      message: `检测错误: ${error.message}` 
    });
  }
});

// 获取历史异常记录API
app.get('/api/anomaly-history', (req, res) => {
  try {
    const anomalyDir = path.join(__dirname, 'public', 'anomalies');
    
    if (!fs.existsSync(anomalyDir)) {
      return res.json({ success: true, history: [] });
    }

    const files = fs.readdirSync(anomalyDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(anomalyDir, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
          date: file.replace('anomalies_', '').replace('.json', ''),
          ...content
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.json({
      success: true,
      history: files
    });

  } catch (error) {
    console.error('获取异常历史时发生错误:', error);
    return res.status(500).json({ 
      success: false, 
      message: `获取历史错误: ${error.message}` 
    });
  }
});

// 保存异常记录API
app.post('/api/save-anomaly', (req, res) => {
  try {
    const anomalyData = req.body;
    
    // 确保目录存在
    const anomalyDir = path.join(__dirname, 'public', 'anomalies');
    if (!fs.existsSync(anomalyDir)) {
      fs.mkdirSync(anomalyDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const filePath = path.join(anomalyDir, `anomalies_${timestamp}.json`);
    
    fs.writeFileSync(filePath, JSON.stringify(anomalyData, null, 2), 'utf8');

    return res.json({
      success: true,
      message: '异常记录保存成功',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('保存异常记录时发生错误:', error);
    return res.status(500).json({ 
      success: false, 
      message: `保存错误: ${error.message}` 
    });
  }
});

// 更新根路径，显示所有可用端点
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>单车管理API服务器</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #0066cc; margin-bottom: 20px; }
          .success { color: #28a745; font-size: 18px; margin-bottom: 30px; }
          .api-list { background: #f8f9fa; padding: 20px; border-radius: 5px; border-left: 4px solid #0066cc; }
          .endpoint { margin: 10px 0; padding: 10px; background: white; border-radius: 4px; border: 1px solid #dee2e6; }
          .method { font-weight: bold; color: #dc3545; margin-right: 10px; }
          .path { font-family: monospace; background: #e9ecef; padding: 2px 6px; border-radius: 3px; }
          .description { color: #6c757d; margin-top: 5px; font-size: 14px; }
          .status-info { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🚴 单车管理API服务器</h1>
          <div class="success">✓ 服务器运行正常!</div>
          
          <div class="status-info">
            <strong>服务器状态:</strong> 在线运行<br>
            <strong>端口:</strong> ${process.env.PORT || 10000}<br>
            <strong>启动时间:</strong> ${new Date().toLocaleString('zh-CN')}
          </div>
          
          <div class="api-list">
            <h3>📋 可用API端点:</h3>
            
            <div class="endpoint">
              <div><span class="method">POST</span><span class="path">/api/save-violations-geojson</span></div>
              <div class="description">保存违规车辆数据到GeoJSON文件</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">PUT</span><span class="path">/api/update-violation/:id</span></div>
              <div class="description">更新指定ID的违规记录</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">POST</span><span class="path">/api/save-parking-data</span></div>
              <div class="description">保存停车区域数据</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">POST</span><span class="path">/api/save-track-data</span></div>
              <div class="description">保存单车轨迹数据</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">POST</span><span class="path">/api/detect-anomaly</span></div>
              <div class="description">执行异常行为检测</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">GET</span><span class="path">/api/anomaly-history</span></div>
              <div class="description">获取历史异常记录</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">POST</span><span class="path">/api/save-anomaly</span></div>
              <div class="description">保存异常检测结果</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : '服务器错误'
  });
});

// 404处理
app.use((req, res) => {
  console.log('404 - 未找到路径:', req.method, req.url);
  res.status(404).json({
    success: false,
    message: `路径 ${req.method} ${req.url} 不存在`,
    availableEndpoints: [
      'POST /api/save-violations-geojson',
      'PUT /api/update-violation/:id',
      'POST /api/save-parking-data',
      'POST /api/save-track-data',
      'POST /api/detect-anomaly',
      'GET /api/anomaly-history',
      'POST /api/save-anomaly'
    ]
  });
});

// 启动服务器
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('=== 服务器启动成功 ===');
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log('可用端点:');
  console.log('  POST /api/save-violations-geojson - 保存违规数据');
  console.log('  PUT  /api/update-violation/:id - 更新违规记录');
  console.log('  POST /api/save-parking-data - 保存停车区数据');
  console.log('  POST /api/save-track-data - 保存轨迹数据');
  console.log('  POST /api/detect-anomaly - 异常行为检测');
  console.log('  GET  /api/anomaly-history - 获取异常历史记录');
  console.log('  POST /api/save-anomaly - 保存异常记录');
  console.log('========================');
});