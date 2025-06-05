/**
 * 单车位置管理器
 * 管理检测到的单车在地图上的位置和显示
 */
import * as Cesium from 'cesium';
import bikeStore from './BikeStore';  // 导入BikeStore单例

class BikePositionManager {
  constructor(viewer, cameraManager) {
    this.viewer = viewer;
    this.cameraManager = cameraManager;
    this.bikeEntities = new Map(); // 仅存储Cesium实体对象，数据存储在BikeStore中
    
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
   * 检查值是否为有效数字
   * @param {any} value - 要检查的值
   * @returns {boolean} - 是否为有效数字
   */
  isValidNumber(value) {
    return typeof value === 'number' && isFinite(value) && !isNaN(value);
  }
  
  /**
   * 从视频检测结果更新单车位置
   * @param {Array} bikes 检测到的单车数组
   * @param {number} videoWidth 视频宽度
   * @param {number} videoHeight 视频高度
   */
  updateFromDetection(bikes, videoWidth, videoHeight) {
    try {
      // 验证输入参数
      if (!Array.isArray(bikes) || !this.isValidNumber(videoWidth) || !this.isValidNumber(videoHeight) || 
          videoWidth <= 0 || videoHeight <= 0) {
        console.warn('单车位置更新参数无效:', { bikesCount: bikes?.length, videoWidth, videoHeight });
        return;
      }

      // 如果没有激活的摄像头，无法进行坐标转换
      if (!this.cameraManager || !this.cameraManager.getActiveCamera()) {
        console.warn('没有激活的摄像头，无法更新单车位置');
        return;
      }
      
      const activeCamera = this.cameraManager.getActiveCamera();
      const updatedBikeIds = new Set();
      const currentTime = Date.now();
      const bikesWithPositions = [];
      
      // 获取已在场景中的单车ID集合，用于后续清理和更新判断
      const existingBikeIds = new Set(this.bikeEntities.keys());
      
      // 更新或创建单车实体
      for (const bike of bikes) {
        // 验证单车数据
        if (!bike || !bike.id || !this.isValidNumber(bike.x) || !this.isValidNumber(bike.y) || 
            !this.isValidNumber(bike.width) || !this.isValidNumber(bike.height)) {
          console.warn('跳过无效的单车数据:', bike);
          continue;
        }

        // 根据检测类型确定单车类型
        const bikeType = bike.type === 'bicycle' ? 'bicycle' : 
                        bike.type === 'motorcycle' ? 'motorcycle' : 'unknown';
        
        // 计算单车的地理坐标
        // 使用单车在图像中的底部中心点作为坐标点
        const bottomCenterX = bike.x;
        const bottomCenterY = bike.y + bike.height / 2;
        
        // 估计单车距离（可根据单车大小调整）
        const estimatedDistance = this.estimateDistance(bike.width, bike.height, bikeType);
        
        // 验证距离是否有效
        if (!this.isValidNumber(estimatedDistance) || estimatedDistance <= 0) {
          console.warn('单车距离估计无效:', estimatedDistance);
          continue;
        }
        
        // 将图像坐标转换为地理坐标
        const geoPosition = this.cameraManager.pixelToGeographic(
          bottomCenterX, bottomCenterY, videoWidth, videoHeight, estimatedDistance
        );
        
        // 如果坐标转换失败，跳过该单车
        if (!geoPosition || geoPosition.length !== 3) {
          console.warn('单车坐标转换失败:', { bottomCenterX, bottomCenterY, estimatedDistance });
          continue;
        }
        
        const [longitude, latitude, altitude] = geoPosition;
        
        // 验证地理坐标有效性
        if (!this.isValidNumber(longitude) || !this.isValidNumber(latitude) || 
            Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
          console.warn('单车地理坐标无效:', { longitude, latitude, altitude });
          continue;
        }
        
        // 记录更新的单车ID
        updatedBikeIds.add(bike.id);
        
        // 创建一个包含地理位置的单车数据对象
        const bikeWithPosition = {
          ...bike,
          longitude,
          latitude,
          height: this.defaultHeight,
          detectionTime: currentTime,
          cameraId: activeCamera.id,
          cameraName: activeCamera.name,
          status: 'detected' // 设置状态为检测到
        };
        
        bikesWithPositions.push(bikeWithPosition);
        
        try {
          // 更新或创建单车实体
          if (this.bikeEntities.has(bike.id)) {
            // 更新现有实体
            const entity = this.bikeEntities.get(bike.id);
            
            // 更新位置
            entity.position = Cesium.Cartesian3.fromDegrees(
              longitude, latitude, this.defaultHeight
            );
            
            // 更新描述信息
            entity.description = this.createBikeDescription(bikeWithPosition);
          } else {
            // 创建新实体
            const entity = this.viewer.entities.add({
              id: bike.id,
              name: `单车 #${bike.id.split('-')[1]}`,
              position: Cesium.Cartesian3.fromDegrees(
                longitude, latitude, this.defaultHeight
              ),
              billboard: {
                image: bikeType === 'motorcycle' ? this.motoIconPath : this.bikeIconPath,
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
              description: this.createBikeDescription(bikeWithPosition)
            });
            
            // 存储实体引用
            this.bikeEntities.set(bike.id, entity);
          }
        } catch (entityError) {
          console.error('创建或更新单车实体时出错:', entityError);
        }
      }
      
      // 移除不再检测到的单车实体(排除trail-开头的轨迹线)
      for (const bikeId of existingBikeIds) {
        // 只清理单车实体，不清理轨迹线等其他实体
        if (!bikeId.startsWith('trail-') && !updatedBikeIds.has(bikeId)) {
          if (this.bikeEntities.has(bikeId)) {
            this.viewer.entities.remove(this.bikeEntities.get(bikeId));
            this.bikeEntities.delete(bikeId);
          }
        }
      }
      
      // 将单车数据保存到BikeStore
      if (bikesWithPositions.length > 0) {
        try {
          // 批量更新单车数据到BikeStore
          bikeStore.updateDetectedBikes(bikesWithPositions);
        } catch (storeError) {
          console.error('更新BikeStore数据时出错:', storeError);
        }
      }
      
      // 更新热力图（如果启用）
      if (this.heatmapEnabled) {
        try {
          this.updateHeatmap();
        } catch (heatmapError) {
          console.warn('更新热力图时出错:', heatmapError);
        }
      }
      
      // 获取统计数据
      let stats;
      try {
        stats = bikeStore.getBikesStatistics();
      } catch (statsError) {
        console.warn('获取单车统计信息时出错:', statsError);
        stats = { total: bikesWithPositions.length };
      }
      
      // 触发位置更新事件
      this.emit('positionUpdate', {
        bikes: bikesWithPositions,
        stats
      });
    } catch (error) {
      console.error('更新单车位置时发生错误:', error);
    }
  }
  
  /**
   * 创建单车描述信息HTML
   * @param {Object} bike 单车数据
   * @returns {string} HTML描述
   */
  createBikeDescription(bike) {
    try {
      const { longitude, latitude, detectionTime, confidence, type, id } = bike;
      const confidencePct = Math.round((confidence || 0) * 100);
      const bikeType = type === 'bicycle' ? '自行车' : 
                      type === 'motorcycle' ? '电动车/摩托车' : '未知车型';
      const detectionTimeStr = new Date(detectionTime || Date.now()).toLocaleString();
      
      // 确保经纬度是有效数字，否则使用默认值
      const lon = this.isValidNumber(longitude) ? longitude.toFixed(6) : '未知';
      const lat = this.isValidNumber(latitude) ? latitude.toFixed(6) : '未知';
      
      return `
        <div style="padding: 10px; max-width: 300px;">
          <h3 style="margin-top: 0;">单车信息</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="font-weight: bold; padding: 3px 5px;">ID:</td>
              <td style="padding: 3px 5px;">${id || '未知'}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; padding: 3px 5px;">类型:</td>
              <td style="padding: 3px 5px;">${bikeType}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; padding: 3px 5px;">经度:</td>
              <td style="padding: 3px 5px;">${lon}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; padding: 3px 5px;">纬度:</td>
              <td style="padding: 3px 5px;">${lat}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; padding: 3px 5px;">置信度:</td>
              <td style="padding: 3px 5px;">${confidencePct}%</td>
            </tr>
            <tr>
              <td style="font-weight: bold; padding: 3px 5px;">检测时间:</td>
              <td style="padding: 3px 5px;">${detectionTimeStr}</td>
            </tr>
          </table>
        </div>
      `;
    } catch (error) {
      console.warn('创建单车描述信息时出错:', error);
      return `<div style="padding: 10px;"><h3>单车信息</h3><p>无法显示详情</p></div>`;
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
    
    if (!show) return;
    
    // 从BikeStore获取单车历史位置
    const history = bikeStore.getBikeHistory(bikeId);
    if (!history || history.length < 2) return;
    
    // 创建轨迹点
    const positions = history.map(p => 
      Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, p.height || this.defaultHeight)
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
    try {
      // 验证输入参数
      if (!this.isValidNumber(width) || !this.isValidNumber(height) ||
          width <= 0 || height <= 0) {
        console.warn('估计距离参数无效:', { width, height, type });
        return 10; // 返回默认距离10米
      }
      
      // 根据单车类型和大小估计距离
      // 这是一个简化的估计方法，实际应用中应使用更精确的算法
      
      // 假设普通单车高度约1.2米，摩托车约1.5米
      const realHeight = type === 'motorcycle' ? 1.5 : 1.2;
      
      // 假设视频高度为240像素，视场角为45度
      const videoHeight = 240;
      const fovY = 45; // 垂直视场角
      
      // 计算距离：实际高度 / (2 * tan(FOV/2) * (检测框高度/视频高度))
      const tanHalfFov = Math.tan(Cesium.Math.toRadians(fovY/2));
      if (!this.isValidNumber(tanHalfFov) || Math.abs(tanHalfFov) < 0.001) {
        console.warn('视场角计算结果无效:', tanHalfFov);
        return 10; // 返回默认距离
      }
      
      const distance = realHeight / (2 * tanHalfFov * (height/videoHeight));
      
      // 验证计算结果
      if (!this.isValidNumber(distance) || distance <= 0 || distance > 1000) {
        console.warn('距离计算结果无效:', distance);
        return 10; // 返回默认距离
      }
      
      // 添加一些随机偏移，使显示更自然（较小的随机偏移以确保稳定性）
      return distance + (Math.random() * 0.5 - 0.25);
    } catch (error) {
      console.error('估计单车距离时出错:', error);
      return 10; // 出错时返回默认值
    }
  }
  
  /**
   * 更新热力图
   */
  updateHeatmap() {
    // 从BikeStore获取所有单车位置
    const bikes = bikeStore.getAllBikes();
    this.heatmapPoints = [];
    
    // 提取位置信息
    for (const bike of bikes) {
      if (bike.longitude && bike.latitude) {
        this.heatmapPoints.push({
          longitude: bike.longitude,
          latitude: bike.latitude
        });
      }
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
   * 获取统计数据
   * @returns {Object} 统计数据
   */
  getStats() {
    return bikeStore.getBikesStatistics();
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
    
    // 从BikeStore中移除单车
    bikeStore.removeBike(bikeId);
    
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
    
    // 清除BikeStore中的检测数据
    bikeStore.clearDetectionData();
    
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