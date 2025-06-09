/**
 * 车位智能分析服务
 * 提供基于大模型的车位占用分析和调配建议
 */

// API配置
const API_KEY = 'sk-yepxevmdjwzkdyibbsjyafrynewmxkjnjbmzpctodpksvflm';
const API_BASE_URL = 'https://api.siliconflow.cn/v1';
const MODEL_NAME = 'deepseek-ai/DeepSeek-V3';

// 建筑物数据
let buildingsData = null;

/**
 * 分析车位占用情况并提供调配建议
 * @param {Object} parkingData 车位数据，包括parkingSpots和garages
 * @param {String} customQuery 自定义查询内容（可选）
 * @returns {Promise<Object>} 分析结果
 */
export async function analyzeParkingData(parkingData, customQuery = null) {
  try {
    // 准备分析数据
    const analysisData = prepareAnalysisData(parkingData);
    
    // 加载建筑物数据
    if (!buildingsData) {
      buildingsData = await loadBuildingsData();
    }
    
    // 构建提示内容
    const prompt = buildAnalysisPrompt(analysisData, customQuery);
    
    // 调用API
    const result = await callDeepseekAPI(prompt);
    
    // 直接返回分析结果
    return {
      success: true,
      detailedAnalysis: result,
      rawResponse: result
    };
  } catch (error) {
    console.error('车位分析出错:', error);
    return {
      success: false,
      error: error.message || '分析失败',
      detailedAnalysis: `分析过程中发生错误: ${error.message || '未知错误'}`,
      rawResponse: null
    };
  }
}

/**
 * 加载建筑物数据
 * @returns {Promise<Array>} 建筑物数据
 */
async function loadBuildingsData() {
  try {
    const response = await fetch('/src/assets/ships/wlc.geojson');
    const data = await response.json();
    return data.features;
  } catch (error) {
    console.error('加载建筑物数据失败:', error);
    return [];
  }
}

/**
 * 计算两点之间的距离（Haversine公式）
 * @param {Array} point1 第一个点 [经度, 纬度]
 * @param {Array} point2 第二个点 [经度, 纬度]
 * @returns {Number} 距离（米）
 */
function calculateDistance(point1, point2) {
  if (!point1 || !point2) return Infinity;
  
  const [lon1, lat1] = point1;
  const [lon2, lat2] = point2;
  
  const R = 6371000; // 地球半径（米）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * 计算多边形中心点
 * @param {Array} coordinates 多边形坐标
 * @returns {Array} 中心点 [经度, 纬度]
 */
function calculatePolygonCenter(coordinates) {
  // 处理多边形数据，可能有多层嵌套
  let points = coordinates;
  if (Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
    points = coordinates[0];
  }
  if (Array.isArray(points[0]) && Array.isArray(points[0][0])) {
    points = points[0];
  }
  
  const sumLon = points.reduce((sum, coord) => sum + coord[0], 0);
  const sumLat = points.reduce((sum, coord) => sum + coord[1], 0);
  
  return [
    sumLon / points.length,
    sumLat / points.length
  ];
}

/**
 * 找到最近的建筑物
 * @param {Array} point 点坐标 [经度, 纬度]
 * @param {Array} buildings 建筑物数据
 * @returns {Object} 最近的建筑物信息
 */
function findNearestBuilding(point, buildings) {
  if (!point || !buildings || buildings.length === 0) {
    return { name: "未知建筑", distance: Infinity };
  }
  
  let nearestBuilding = null;
  let minDistance = Infinity;
  
  buildings.forEach(building => {
    // 计算建筑物中心点
    const buildingCenter = calculatePolygonCenter(building.geometry.coordinates);
    
    // 计算距离
    const distance = calculateDistance(point, buildingCenter);
    
    // 更新最近的建筑物
    if (distance < minDistance) {
      minDistance = distance;
      nearestBuilding = {
        name: building.properties.name || "未命名建筑",
        distance: distance,
        center: buildingCenter
      };
    }
  });
  
  return nearestBuilding || { name: "未知建筑", distance: Infinity };
}

/**
 * 准备分析数据
 * @param {Object} parkingData 原始车位数据
 * @returns {Object} 精简后的分析数据
 */
function prepareAnalysisData(parkingData) {
  // 提取车位的关键信息
  const parkingSpots = parkingData.parkingSpots.map(spot => ({
    id: spot.id,
    center: spot.center,
    occupancyRate: parseFloat(spot.occupancyRate) || 0,
    bikeCount: spot.bikeCount,
    maxCapacity: spot.maxCapacity,
    area: spot.area,
    isOccupied: spot.isOccupied,
    isFull: spot.isFull
  }));
  
  // 提取车库的关键信息
  const garages = parkingData.garages.map(garage => ({
    id: garage.id,
    name: garage.name,
    position: garage.position,
    occupancyRate: parseFloat(garage.occupancyRate) || 0,
    bikeCount: garage.bikeCount,
    maxCapacity: garage.maxCapacity,
    isOccupied: garage.isOccupied,
    isFull: garage.isFull
  }));
  
  // 计算统计信息
  const stats = {
    totalSpots: parkingSpots.length,
    occupiedSpots: parkingSpots.filter(s => s.isOccupied).length,
    fullSpots: parkingSpots.filter(s => s.isFull).length,
    totalGarages: garages.length,
    occupiedGarages: garages.filter(g => g.isOccupied).length,
    fullGarages: garages.filter(g => g.isFull).length,
    highOccupancySpots: parkingSpots.filter(s => parseFloat(s.occupancyRate) > 90).length,
    lowOccupancySpots: parkingSpots.filter(s => parseFloat(s.occupancyRate) < 30).length
  };
  
  return { parkingSpots, garages, stats };
}

/**
 * 构建分析提示
 * @param {Object} analysisData 分析数据
 * @param {String} customQuery 自定义查询内容
 * @returns {String} 分析提示
 */
function buildAnalysisPrompt(analysisData, customQuery) {
  const { stats, parkingSpots, garages } = analysisData;
  
  // 识别高占用车位并关联建筑物
  const highOccupancySpots = parkingSpots
    .filter(spot => parseFloat(spot.occupancyRate) > 90)
    .sort((a, b) => parseFloat(b.occupancyRate) - parseFloat(a.occupancyRate))
    .slice(0, 5) // 取占用率最高的5个车位
    .map(spot => {
      const nearestBuilding = findNearestBuilding(spot.center, buildingsData);
      return {
        ...spot,
        nearestBuilding
      };
    });
  
  // 识别低占用车位并关联建筑物
  const lowOccupancySpots = parkingSpots
    .filter(spot => parseFloat(spot.occupancyRate) < 30)
    .sort((a, b) => parseFloat(a.occupancyRate) - parseFloat(b.occupancyRate))
    .slice(0, 5) // 取占用率最低的5个车位
    .map(spot => {
      const nearestBuilding = findNearestBuilding(spot.center, buildingsData);
      return {
        ...spot,
        nearestBuilding
      };
    });
  
  // 基础提示模板
  let promptTemplate = `分析以下车位和车库的占用情况，根据与周边建筑物的关系，找出需要调配的区域和优化建议：

统计信息:
- 总车位数: ${stats.totalSpots}
- 已占用车位数: ${stats.occupiedSpots}
- 已满车位数: ${stats.fullSpots}
- 高占用率(>90%)车位数: ${stats.highOccupancySpots}
- 低占用率(<30%)车位数: ${stats.lowOccupancySpots}
- 总车库数: ${stats.totalGarages}
- 已占用车库数: ${stats.occupiedGarages}
- 已满车库数: ${stats.fullGarages}

占用率最高的车位及其最近的建筑:
${highOccupancySpots.map(spot => 
  `- 车位 #${spot.id}: 占用率 ${spot.occupancyRate}%, 当前 ${spot.bikeCount}/${spot.maxCapacity}, 附近建筑: ${spot.nearestBuilding.name || '未知建筑'} (距离: ${spot.nearestBuilding.distance.toFixed(0)}米)`
).join('\n')}

占用率最低的车位及其最近的建筑:
${lowOccupancySpots.map(spot => 
  `- 车位 #${spot.id}: 占用率 ${spot.occupancyRate}%, 当前 ${spot.bikeCount}/${spot.maxCapacity}, 附近建筑: ${spot.nearestBuilding.name || '未知建筑'} (距离: ${spot.nearestBuilding.distance.toFixed(0)}米)`
).join('\n')}

请根据以上数据分析:
1. 根据车位与建筑物的关系，分析哪些建筑物附近停车位紧张，哪些建筑物附近停车位宽松
2. 提供具体建议，说明如何进行车位调配（例如："教学楼附近停车位紧张，应从图书馆调配车位"）
3. 针对高占用率区域，提出缓解措施
4. 针对低占用率区域，提出提高利用率的建议

请提供直接的分析文本，以"建筑区域停车现状"开始，然后是"关键建筑区域分析"、"调配建议"和"优化措施"等部分。回答应当具体、清晰、可操作，不需要包含JSON格式的数据。回答中必须明确提及具体建筑名称。不要分条可以分段。因为是测试数据所以可能问题较大，请以尽量温和的语言提出建议`;

  // 如果有自定义查询，添加到提示中
  if (customQuery) {
    promptTemplate = `${customQuery}\n\n以下是当前车位和车库的数据:\n\n${promptTemplate}`;
  }
  
  return promptTemplate;
}

/**
 * 调用DeepSeek API
 * @param {String} prompt 分析提示
 * @returns {Promise<String>} API响应
 */
async function callDeepseekAPI(prompt) {
  try {
    console.log('正在调用DeepSeek API进行分析...');
    
    // 准备请求数据
    const requestData = {
      model: MODEL_NAME,
      messages: [
        {
          role: 'system',
          content: '你是一个专业的校园停车场管理分析专家，擅长分析车位占用数据并提供调配建议。回答时必须根据车位附近的建筑物名称分析停车情况，例如"教学楼附近停车位紧张"或"图书馆周边停车位宽松"。请确保分析中明确提及具体建筑名称，并根据建筑功能和车位状况提供合理建议。不要输出任何JSON格式的内容。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // 较低的温度使回答更加确定和一致
      max_tokens: 2000
    };
    
    // 调用API
    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(requestData)
    });
    
    // 处理API响应
    if (!response.ok) {
      // 尝试获取错误详情
      let errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.error?.message || `API请求失败: ${response.status}`);
      } catch (e) {
        throw new Error(`API请求失败: ${response.status} - ${errorText}`);
      }
    }
    
    // 解析响应
    const responseText = await response.text();
    try {
      const data = JSON.parse(responseText);
      return data.choices[0].message.content;
    } catch (error) {
      console.error('解析API响应出错:', error, responseText);
      
      // 如果无法解析JSON，返回原始响应文本
      if (responseText && typeof responseText === 'string' && responseText.length > 0) {
        return responseText;
      }
      
      throw new Error('无法解析API响应');
    }
  } catch (error) {
    console.error('调用DeepSeek API出错:', error);
    throw error; // 向上抛出错误，不再使用本地模拟响应
  }
}

/**
 * 获取高占用车位
 * @param {Array} parkingSpots 车位数组
 * @param {Number} threshold 阈值（默认90%）
 * @returns {Array} 高占用车位数组
 */
export function getHighOccupancySpots(parkingSpots, threshold = 90) {
  return parkingSpots
    .filter(spot => parseFloat(spot.occupancyRate) > threshold)
    .sort((a, b) => parseFloat(b.occupancyRate) - parseFloat(a.occupancyRate));
}

/**
 * 获取低占用车位
 * @param {Array} parkingSpots 车位数组
 * @param {Number} threshold 阈值（默认30%）
 * @returns {Array} 低占用车位数组
 */
export function getLowOccupancySpots(parkingSpots, threshold = 30) {
  return parkingSpots
    .filter(spot => parseFloat(spot.occupancyRate) < threshold)
    .sort((a, b) => parseFloat(a.occupancyRate) - parseFloat(b.occupancyRate));
}

/**
 * 生成占用率热力图数据
 * @param {Array} parkingSpots 车位数组
 * @returns {Array} 热力图数据点
 */
export function generateHeatmapData(parkingSpots) {
  return parkingSpots.map(spot => ({
    position: spot.center,
    weight: parseFloat(spot.occupancyRate) / 100,
    id: spot.id
  }));
}

export default {
  analyzeParkingData,
  getHighOccupancySpots,
  getLowOccupancySpots,
  generateHeatmapData
};