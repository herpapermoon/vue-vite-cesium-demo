/**
 * 单车位置管理器
 * 管理检测到的单车在地图上的位置和显示
 */
import * as Cesium from 'cesium';

class BikePositionManager {
  constructor(viewer, cameraManager) {
    this.viewer = viewer;
    this.cameraManager = cameraManager;
    this.bikeEntities = new Map(); // 存储单车实体
    this.bikeHistory = new Map(); // 存储单车历史位置
    this.bikeStats = {
      total: 0,           // 当前检测到的单车总数
      lastUpdate: null,   // 上次更新时间
      history: [],        // 历史统计数据
      types: {            // 单车类型统计
        bicycle: 0,       // 自行车
        motorcycle: 0,    // 摩托车/电动车
        unknown: 0        // 未知类型
      }
    };
    
    // 默认高度设置
    this.defaultHeight = 1.5; // 默认单车高度，单位：米
    
    // 使用Cesium内置图标
    this.bikeIconPath = Cesium.buildModuleUrl('Assets/Textures/maki/bicycle.png');
    this.motoIconPath = Cesium.buildModuleUrl('Assets/Textures/maki/motorcycle.png');
    
    // 单车密度热力图
    this.heatmapEnabled = false;
    this.heatmapPoints = [];
    this.heatmapEntity = null;
    
    // 事件监听
    this.eventListeners = new Map();
  }
  
  /**
   * 添加事件监听器
   * @param {string} eventName 事件名称
   * @param {Function} callback 回调函数
   */
  on(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName).push(callback);
    return this;
  }
  
  /**
   * 触发事件
   * @param {string} eventName 事件名称
   * @param {any} data 事件数据
   */
  emit(eventName, data) {
    if (this.eventListeners.has(eventName)) {
      this.eventListeners.get(eventName).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`事件处理出错 (${eventName}):`, error);
        }
      });
    }
    return this;
  }
  
  /**
   * 从视频检测结果更新单车位置
   * @param {Array} bikes 检测到的单车数组
   * @param {number} videoWidth 视频宽度
   * @param {number} videoHeight 视频高度
   */
  updateFromDetection(bikes, videoWidth, videoHeight) {
    // 如果没有激活的摄像头，无法进行坐标转换
    if (!this.cameraManager || !this.cameraManager.getActiveCamera()) {
      console.warn('没有激活的摄像头，无法更新单车位置');
      return;
    }
    
    const activeCamera = this.cameraManager.getActiveCamera();
    const cameraPosition = activeCamera.position;
    const updatedBikeIds = new Set();
    const currentTime = Date.now();
    
    // 更新统计信息
    this.bikeStats.total = bikes.length;
    this.bikeStats.lastUpdate = currentTime;
    this.bikeStats.types = {
      bicycle: 0,
      motorcycle: 0,
      unknown: 0
    };
    
    // 更新或创建单车实体
    for (const bike of bikes) {
      // 根据检测类型确定单车类型
      const bikeType = bike.type === 'bicycle' ? 'bicycle' : 
                      bike.type === 'motorcycle' ? 'motorcycle' : 'unknown';
      
      // 更新类型统计
      this.bikeStats.types[bikeType]++;
      
      // 计算单车的地理坐标
      // 使用单车在图像中的底部中心点作为坐标点
      const bottomCenterX = bike.x;
      const bottomCenterY = bike.y + bike.height / 2;
      
      // 估计单车距离（可根据单车大小调整）
      // 这是一个简单的启发式方法，实际应用中可能需要更精确的深度估计
      const estimatedDistance = this.estimateDistance(bike.width, bike.height, bikeType);
      
      // 将图像坐标转换为地理坐标
      const geoPosition = this.cameraManager.pixelToGeographic(
        bottomCenterX, bottomCenterY, videoWidth, videoHeight, estimatedDistance
      );
      
      if (!geoPosition) continue;
      
      const [longitude, latitude, altitude] = geoPosition;
      
      // 记录更新的单车ID
      updatedBikeIds.add(bike.id);
      
      // 更新或创建单车实体
      if (this.bikeEntities.has(bike.id)) {
        // 更新现有实体
        const entity = this.bikeEntities.get(bike.id);
        
        // 更新位置
        entity.position = Cesium.Cartesian3.fromDegrees(
          longitude, latitude, this.defaultHeight
        );
        
        // 更新描述信息
        entity.description = this.createBikeDescription(bike, {
          longitude, latitude, detectionTime: currentTime
        });
        
        // 更新历史轨迹
        this.updateBikeHistory(bike.id, {
          position: [longitude, latitude, this.defaultHeight],
          timestamp: currentTime,
          confidence: bike.confidence,
          type: bikeType
        });
      } else {
        // 创建新实体
        const entity = this.viewer.entities.add({
          id: bike.id,
          name: `单车 #${bike.id.split('-')[1]}`,
          position: Cesium.Cartesian3.fromDegrees(
            longitude, latitude, this.defaultHeight
          ),
          billboard: {
            image: bikeType === 'motorcycle' ? 
              Cesium.buildModuleUrl('Assets/Textures/maki/motorcycle.png') : 
              Cesium.buildModuleUrl('Assets/Textures/maki/bicycle.png'),
            width: 32,
            height: 32,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          label: {
            text: `#${bike.id.split('-')[1]}`,
            font: '12px sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -36),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          description: this.createBikeDescription(bike, {
            longitude, latitude, detectionTime: currentTime
          })
        });
        
        // 存储实体引用
        this.bikeEntities.set(bike.id, entity);
        
        // 初始化历史轨迹
        this.bikeHistory.set(bike.id, [{
          position: [longitude, latitude, this.defaultHeight],
          timestamp: currentTime,
          confidence: bike.confidence,
          type: bikeType
        }]);
      }
    }
    
    // 处理未在当前帧中检测到的单车
    for (const [bikeId, entity] of this.bikeEntities.entries()) {
      if (!updatedBikeIds.has(bikeId)) {
        // 判断单车是否在视野内
        if (this.isInCameraView(entity.position, activeCamera)) {
          // 单车在视野内但未检测到，可能是临时遮挡，暂不处理
          // 可以增加消失计数，超过阈值后再移除
        } else {
          // 单车不在视野内，保持其位置不变
        }
      }
    }
    
    // 更新热力图（如果启用）
    if (this.heatmapEnabled) {
      this.updateHeatmap();
    }
    
    // 记录历史统计
    this.recordHistoricalStats();
    
    // 触发位置更新事件
    this.emit('positionUpdate', {
      bikes: Array.from(this.bikeEntities.keys()).map(id => {
        const entity = this.bikeEntities.get(id);
        const position = entity.position.getValue(Cesium.JulianDate.now());
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        
        return {
          id,
          longitude: Cesium.Math.toDegrees(cartographic.longitude),
          latitude: Cesium.Math.toDegrees(cartographic.latitude),
          height: cartographic.height,
          type: this.bikeHistory.has(id) ? 
            this.bikeHistory.get(id)[this.bikeHistory.get(id).length - 1].type : 'unknown'
        };
      }),
      stats: this.bikeStats
    });
  }
  
  /**
   * 创建单车描述信息HTML
   * @param {Object} bike 单车数据
   * @param {Object} geoInfo 地理信息
   * @returns {string} HTML描述
   */
  createBikeDescription(bike, geoInfo) {
    const { longitude, latitude, detectionTime } = geoInfo;
    const confidence = Math.round(bike.confidence * 100);
    const bikeType = bike.type === 'bicycle' ? '自行车' : 
                    bike.type === 'motorcycle' ? '电动车/摩托车' : '未知车型';
    const detectionTimeStr = new Date(detectionTime).toLocaleString();
    
    return `
      <div style="padding: 10px; max-width: 300px;">
        <h3 style="margin-top: 0;">单车信息</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="font-weight: bold; padding: 3px 5px;">ID:</td>
            <td style="padding: 3px 5px;">${bike.id}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; padding: 3px 5px;">类型:</td>
            <td style="padding: 3px 5px;">${bikeType}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; padding: 3px 5px;">经度:</td>
            <td style="padding: 3px 5px;">${longitude.toFixed(6)}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; padding: 3px 5px;">纬度:</td>
            <td style="padding: 3px 5px;">${latitude.toFixed(6)}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; padding: 3px 5px;">置信度:</td>
            <td style="padding: 3px 5px;">${confidence}%</td>
          </tr>
          <tr>
            <td style="font-weight: bold; padding: 3px 5px;">检测时间:</td>
            <td style="padding: 3px 5px;">${detectionTimeStr}</td>
          </tr>
        </table>
      </div>
    `;
  }
  
  /**
   * 更新单车历史轨迹
   * @param {string} bikeId 单车ID
   * @param {Object} position 位置信息
   */
  updateBikeHistory(bikeId, position) {
    if (!this.bikeHistory.has(bikeId)) {
      this.bikeHistory.set(bikeId, []);
    }
    
    const history = this.bikeHistory.get(bikeId);
    history.push(position);
    
    // 限制历史记录数量
    if (history.length > 100) {
      history.shift();
    }
  }
  
  /**
   * 显示单车历史轨迹
   * @param {string} bikeId 单车ID
   * @param {boolean} show 是否显示
   */
  showBikeTrail(bikeId, show = true) {
    // 首先移除已有的轨迹线
    this.hideBikeTrail(bikeId);
    
    if (!show || !this.bikeHistory.has(bikeId)) return;
    
    const history = this.bikeHistory.get(bikeId);
    if (history.length < 2) return;
    
    // 创建轨迹点
    const positions = history.map(p => 
      Cesium.Cartesian3.fromDegrees(p.position[0], p.position[1], p.position[2])
    );
    
    // 创建轨迹线
    const trailEntity = this.viewer.entities.add({
      id: `trail-${bikeId}`,
      polyline: {
        positions,
        width: 2,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: Cesium.Color.CYAN
        })
      }
    });
    
    // 存储轨迹实体引用
    this.bikeEntities.set(`trail-${bikeId}`, trailEntity);
    
    return trailEntity;
  }
  
  /**
   * 隐藏单车历史轨迹
   * @param {string} bikeId 单车ID
   */
  hideBikeTrail(bikeId) {
    const trailId = `trail-${bikeId}`;
    if (this.bikeEntities.has(trailId)) {
      this.viewer.entities.remove(this.bikeEntities.get(trailId));
      this.bikeEntities.delete(trailId);
    }
  }
  
  /**
   * 判断点是否在摄像头视野内
   * @param {Cesium.Cartesian3} position 点的位置
   * @param {Object} camera 摄像头信息
   * @returns {boolean} 是否在视野内
   */
  isInCameraView(position, camera) {
    // 转换为地理坐标
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
    const latitude = Cesium.Math.toDegrees(cartographic.latitude);
    const height = cartographic.height;
    
    // 计算点是否在视锥体内
    const coverageRect = this.cameraManager.calculateCoverageRectangle(camera);
    
    // 检查点是否在覆盖矩形内
    return Cesium.Rectangle.contains(coverageRect, Cesium.Cartographic.fromDegrees(longitude, latitude));
  }
  
  /**
   * 估计单车距离
   * @param {number} width 检测框宽度
   * @param {number} height 检测框高度
   * @param {string} type 单车类型
   * @returns {number} 估计距离（米）
   */
  estimateDistance(width, height, type) {
    // 根据单车类型和大小估计距离
    // 这是一个简化的估计方法，实际应用中应使用更精确的算法
    
    // 假设普通单车高度约1.2米，摩托车约1.5米
    const realHeight = type === 'motorcycle' ? 1.5 : 1.2;
    
    // 假设视频高度为240像素，视场角为45度
    const videoHeight = 240;
    const fovY = 45; // 垂直视场角
    
    // 计算距离：实际高度 / (2 * tan(FOV/2) * (检测框高度/视频高度))
    const distance = realHeight / (2 * Math.tan(Cesium.Math.toRadians(fovY/2)) * (height/videoHeight));
    
    // 添加一些随机偏移，使显示更自然
    return distance + Math.random() * 2 - 1;
  }
  
  /**
   * 更新热力图
   */
  updateHeatmap() {
    // 收集所有单车位置
    this.heatmapPoints = [];
    
    for (const [bikeId, entity] of this.bikeEntities.entries()) {
      // 跳过轨迹线
      if (bikeId.startsWith('trail-')) continue;
      
      const position = entity.position.getValue(Cesium.JulianDate.now());
      const cartographic = Cesium.Cartographic.fromCartesian(position);
      
      this.heatmapPoints.push({
        longitude: Cesium.Math.toDegrees(cartographic.longitude),
        latitude: Cesium.Math.toDegrees(cartographic.latitude)
      });
    }
    
    // 如果点数太少，不显示热力图
    if (this.heatmapPoints.length < 3) {
      if (this.heatmapEntity) {
        this.viewer.entities.remove(this.heatmapEntity);
        this.heatmapEntity = null;
      }
      return;
    }
    
    // 创建或更新热力图
    // 注意：Cesium原生不支持热力图，这里只是示例如何实现
    // 实际应用中可能需要使用其他库如heatmap.js
    
    // 这里简单地显示一个半透明的覆盖区域
    const positions = this.heatmapPoints.map(p => [p.longitude, p.latitude]);
    const boundingBox = this.calculateBoundingBox(positions);
    
    if (this.heatmapEntity) {
      this.viewer.entities.remove(this.heatmapEntity);
    }
    
    this.heatmapEntity = this.viewer.entities.add({
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(
          boundingBox.west, boundingBox.south, boundingBox.east, boundingBox.north
        ),
        material: new Cesium.ColorMaterialProperty(Cesium.Color.RED.withAlpha(0.2)),
        outline: true,
        outlineColor: Cesium.Color.RED.withAlpha(0.5)
      }
    });
  }
  
  /**
   * 计算坐标点集的边界框
   * @param {Array} positions 位置数组[[经度,纬度],...]
   * @returns {Object} 边界框{west,south,east,north}
   */
  calculateBoundingBox(positions) {
    let west = Number.POSITIVE_INFINITY;
    let south = Number.POSITIVE_INFINITY;
    let east = Number.NEGATIVE_INFINITY;
    let north = Number.NEGATIVE_INFINITY;
    
    positions.forEach(p => {
      const [lon, lat] = p;
      west = Math.min(west, lon);
      south = Math.min(south, lat);
      east = Math.max(east, lon);
      north = Math.max(north, lat);
    });
    
    return { west, south, east, north };
  }
  
  /**
   * 记录历史统计数据
   */
  recordHistoricalStats() {
    const stats = {
      timestamp: Date.now(),
      total: this.bikeStats.total,
      types: { ...this.bikeStats.types }
    };
    
    this.bikeStats.history.push(stats);
    
    // 限制历史记录数量
    if (this.bikeStats.history.length > 100) {
      this.bikeStats.history.shift();
    }
  }
  
  /**
   * 获取统计数据
   * @returns {Object} 统计数据
   */
  getStats() {
    return { ...this.bikeStats };
  }
  
  /**
   * 设置热力图开关
   * @param {boolean} enabled 是否启用
   */
  setHeatmapEnabled(enabled) {
    this.heatmapEnabled = enabled;
    
    if (!enabled && this.heatmapEntity) {
      this.viewer.entities.remove(this.heatmapEntity);
      this.heatmapEntity = null;
    } else if (enabled) {
      this.updateHeatmap();
    }
  }
  
  /**
   * 移除单个单车
   * @param {string} bikeId 单车ID
   */
  removeBike(bikeId) {
    // 移除实体
    if (this.bikeEntities.has(bikeId)) {
      this.viewer.entities.remove(this.bikeEntities.get(bikeId));
      this.bikeEntities.delete(bikeId);
    }
    
    // 移除轨迹
    this.hideBikeTrail(bikeId);
    
    // 移除历史记录
    this.bikeHistory.delete(bikeId);
    
    // 更新热力图
    if (this.heatmapEnabled) {
      this.updateHeatmap();
    }
  }
  
  /**
   * 清除所有单车
   */
  clearAllBikes() {
    // 移除所有单车实体
    for (const entity of this.bikeEntities.values()) {
      this.viewer.entities.remove(entity);
    }
    
    // 清空集合
    this.bikeEntities.clear();
    this.bikeHistory.clear();
    
    // 重置统计信息
    this.bikeStats = {
      total: 0,
      lastUpdate: null,
      history: [],
      types: {
        bicycle: 0,
        motorcycle: 0,
        unknown: 0
      }
    };
    
    // 移除热力图
    if (this.heatmapEntity) {
      this.viewer.entities.remove(this.heatmapEntity);
      this.heatmapEntity = null;
    }
    
    // 触发清除事件
    this.emit('cleared', null);
  }
}

export default BikePositionManager; 