/**
 * 校园单车数据存储服务
 * 提供单车数据的增删改查及其他管理功能
 */
import { calculateDistance, bikeImages, statusIconMap as originalStatusIconMap, getIconByStatus as originalGetIconByStatus } from './randomPoints';
import Cesium from '@/cesiumUtils/cesium';

class BikeStore {
  constructor() {
    this.bikes = [];
    this.users = [];
    this.trips = [];
    this.stations = [];
    
    // 视觉检测相关数据
    this.detectedBikes = new Map(); // 当前帧检测到的单车
    this.previousDetectedBikes = new Map(); // 上一帧检测到的单车
    this.bikeTrackingInfo = new Map(); // 单车追踪信息
    this.bikeHistory = new Map(); // 单车历史位置
    this.detectionStats = {
      total: 0,
      lastUpdate: null,
      history: [],
      types: {
        bicycle: 0,
        motorcycle: 0,
        unknown: 0
      }
    };
    
    // 实体管理
    this.entityMap = new Map(); // 存储所有单车相关的实体引用
    this.billboardCollections = new Map(); // 存储图标集合
    this.viewer = null; // Cesium实例引用
    
    // 使用从randomPoints导入的图标映射
    this.statusIconMap = { ...originalStatusIconMap };
  }

  /**
   * 设置Cesium实例引用
   * @param {Cesium.Viewer} viewer - Cesium查看器实例
   */
  setViewer(viewer) {
    this.viewer = viewer;
    return this;
  }
  
  /**
   * 初始化存储，导入单车数据
   * @param {Array} bikesData - 单车数据数组
   * @param {String} source - 数据来源标识
   * @returns {number} 导入的单车数量
   */
  initialize(bikesData, source = 'random') {
    // 添加数据来源标记
    const dataWithSource = bikesData.map(bike => ({
      ...bike,
      source: source
    }));
    
    // 合并到现有数据，保留视觉检测的数据
    const detectedIds = Array.from(this.detectedBikes.keys());
    this.bikes = [
      ...this.bikes.filter(b => b.source === 'detection' || detectedIds.includes(b.id)),
      ...dataWithSource.filter(b => !detectedIds.includes(b.id))
    ];
    
    console.log(`BikeStore已初始化，导入${dataWithSource.length}辆单车数据`);
    return this.bikes.length;
  }
  
  /**
   * 设置图标集合
   * @param {String} name - 集合名称
   * @param {Cesium.BillboardCollection} collection - 图标集合
   */
  setBillboardCollection(name, collection) {
    this.billboardCollections.set(name, collection);
    return this;
  }
  
  /**
   * 获取图标集合
   * @param {String} name - 集合名称
   * @returns {Cesium.BillboardCollection|null} 图标集合
   */
  getBillboardCollection(name) {
    return this.billboardCollections.get(name) || null;
  }
  
  /**
   * 获取或创建图标集合
   * @param {String} name - 集合名称
   * @returns {Cesium.BillboardCollection} 图标集合
   */
  getOrCreateBillboardCollection(name) {
    if (!this.billboardCollections.has(name)) {
      if (!this.viewer) {
        throw new Error('未设置Cesium.Viewer实例，无法创建图标集合');
      }
      const collection = this.viewer.scene.primitives.add(new Cesium.BillboardCollection());
      this.billboardCollections.set(name, collection);
    }
    return this.billboardCollections.get(name);
  }
  
  /**
   * 根据状态获取图标
   * @param {String} status - 单车状态
   * @returns {String} 图标URL
   */
  getIconByStatus(status) {
    // 使用从randomPoints导入的getIconByStatus函数
    return originalGetIconByStatus(status);
  }
  
  /**
   * 设置状态图标映射
   * @param {Object} iconMap - 状态到图标的映射
   */
  setStatusIconMap(iconMap) {
    this.statusIconMap = {
      ...this.statusIconMap,
      ...iconMap
    };
    return this;
  }

  /**
   * 添加单车数据
   * @param {Object} bikeData - 单车数据
   * @returns {Object} 添加的单车数据
   */
  addBike(bikeData) {
    // 检查是否已存在
    const existingIndex = this.bikes.findIndex(bike => bike.id === bikeData.id);
    if (existingIndex !== -1) {
      // 更新现有数据
      this.bikes[existingIndex] = {
        ...this.bikes[existingIndex],
        ...bikeData,
        lastUpdated: Date.now()
      };
      return this.bikes[existingIndex];
    } else {
      // 添加新数据
      const newBike = {
        ...bikeData,
        lastUpdated: Date.now()
      };
      this.bikes.push(newBike);
      return newBike;
    }
  }
  
  /**
   * 创建单车实体
   * @param {Object} bikeData - 单车数据
   * @param {String} collectionName - 图标集合名称
   * @returns {Object} 创建的实体
   */
  createBikeEntity(bikeData, collectionName = 'default') {
    if (!this.viewer) {
      throw new Error('未设置Cesium.Viewer实例，无法创建实体');
    }
    
    const { id, longitude, latitude, height = 17, status = 'parked', type = 'bicycle' } = bikeData;
    
    // 检查是否已存在该实体
    if (this.entityMap.has(id)) {
      return this.updateBikeEntity(id, bikeData);
    }
    
    // 获取图标集合
    const collection = this.getOrCreateBillboardCollection(collectionName);
    
    // 确定图标 - 使用从randomPoints.js导入的getIconByStatus函数
    let iconImage;
    if (type === 'motorcycle') {
      iconImage = originalGetIconByStatus('motorcycle');
    } else {
      iconImage = originalGetIconByStatus(status);
    }
    
    // 创建广告牌
    const billboard = collection.add({
      id: id,
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
      image: iconImage,
      scale: 0.1, // 增大比例，使单车更容易看见
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      eyeOffset: new Cesium.Cartesian3(0, 0, 0), // 确保没有视点偏移
      disableDepthTestDistance: Number.POSITIVE_INFINITY // 禁用深度测试，确保始终可见
    });
    
    // 创建标签
    const labelId = `label-${id}`;
    let label = null;
    
    // 仅为非随机生成的单车创建标签
    if (bikeData.source !== 'random') {
      const shortId = id.split('-').pop();
      label = this.viewer.entities.add({
        id: labelId,
        position: Cesium.Cartesian3.fromDegrees(longitude, latitude, height + 0.3),
        label: {
          text: `#${shortId}`,
          font: '12px sans-serif',
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -5),
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    }
    
    // 存储实体引用
    this.entityMap.set(id, { 
      billboard, 
      label, 
      labelId,
      collectionName
    });
    
    // 确保单车数据中也包含实体引用
    this.addBike({
      ...bikeData,
      entityId: id
    });
    
    return { billboard, label };
  }
  
  /**
   * 更新单车实体
   * @param {String} id - 单车ID
   * @param {Object} updateData - 更新的数据
   * @returns {Object} 更新后的实体
   */
  updateBikeEntity(id, updateData) {
    const entityRef = this.entityMap.get(id);
    if (!entityRef) {
      return this.createBikeEntity({ id, ...updateData });
    }
    
    const { billboard, label } = entityRef;
    const { longitude, latitude, height = 20, status, type } = updateData;
    
    // 更新广告牌位置
    if (longitude && latitude) {
      // 确保设置新位置
      billboard.position = Cesium.Cartesian3.fromDegrees(longitude, latitude, height);
      
      // 如果有标签，也更新标签位置
      if (label) {
        label.position = Cesium.Cartesian3.fromDegrees(longitude, latitude, height + 0.3);
      }
      
      // 确保实体可见
      billboard.show = true;
      if (label) label.show = true;
    }
    
    // 更新图标
    if (status || type) {
      let iconImage;
      if (type === 'motorcycle') {
        iconImage = originalGetIconByStatus('motorcycle');
      } else {
        iconImage = originalGetIconByStatus(status || 'parked');
      }
      billboard.image = iconImage;
    }
    
    // 更新单车数据
    this.updateBike(id, updateData);
    
    return { billboard, label };
  }
  
  /**
   * 移除单车实体
   * @param {String} id - 单车ID
   * @returns {Boolean} 是否成功移除
   */
  removeBikeEntity(id) {
    const entityRef = this.entityMap.get(id);
    if (!entityRef) {
      return false;
    }
    
    const { billboard, label, labelId, collectionName } = entityRef;
    
    // 移除广告牌
    const collection = this.getBillboardCollection(collectionName);
    if (collection && !collection.isDestroyed()) {
      const index = collection._billboards.indexOf(billboard);
      if (index !== -1) {
        collection.remove(billboard);
      }
    }
    
    // 移除标签
    if (label) {
      this.viewer.entities.removeById(labelId);
    }
    
    // 移除引用
    this.entityMap.delete(id);
    
    return true;
  }
  
  /**
   * 清除指定来源的单车及其实体
   * @param {String} source - 数据来源
   */
  clearBikesBySource(source) {
    // 找出指定来源的单车ID
    const bikeIds = this.bikes
      .filter(bike => bike.source === source)
      .map(bike => bike.id);
    
    // 移除实体
    bikeIds.forEach(id => this.removeBikeEntity(id));
    
    // 移除数据
    this.bikes = this.bikes.filter(bike => bike.source !== source);
    
    return bikeIds.length;
  }
  
  /**
   * 清除非指定来源的单车（保留特定来源）
   * @param {String} sourceToKeep - 要保留的数据来源
   */
  clearBikesExceptSource(sourceToKeep) {
    // 找出非指定来源的单车ID
    const bikeIds = this.bikes
      .filter(bike => bike.source !== sourceToKeep)
      .map(bike => bike.id);
    
    // 移除实体
    bikeIds.forEach(id => this.removeBikeEntity(id));
    
    // 保留指定来源的数据
    this.bikes = this.bikes.filter(bike => bike.source === sourceToKeep);
    
    return bikeIds.length;
  }
  
  /**
   * 清除所有billboard集合
   */
  clearAllBillboardCollections() {
    for (const [name, collection] of this.billboardCollections.entries()) {
      if (!collection.isDestroyed()) {
        collection.destroy();
      }
    }
    this.billboardCollections.clear();
  }

  /**
   * 获取所有单车
   * @returns {Array} 单车数组
   */
  getAllBikes() {
    return this.bikes;
  }

  /**
   * 根据ID获取单车
   * @param {string} id - 单车ID
   * @returns {Object|null} 单车对象或null
   */
  getBikeById(id) {
    return this.bikes.find(bike => bike.id === id) || null;
  }

  /**
   * 更新单车信息
   * @param {string} id - 单车ID
   * @param {Object} updates - 要更新的属性
   * @returns {boolean} 是否更新成功
   */
  updateBike(id, updates) {
    const index = this.bikes.findIndex(bike => bike.id === id);
    if (index !== -1) {
      this.bikes[index] = {
        ...this.bikes[index],
        ...updates,
        lastUpdated: Date.now()
      };
      return true;
    }
    return false;
  }

  /**
   * 更新单车位置
   * @param {string} id - 单车ID
   * @param {Cesium.Cartesian3} position - 新位置
   * @returns {boolean} 是否更新成功
   */
  updateBikePosition(id, position) {
    const bike = this.getBikeById(id);
    if (bike) {
      // 更新三维坐标
      bike.position = position.clone();
      
      // 更新经纬度
      const cartographic = Cesium.Cartographic.fromCartesian(position);
      bike.longitude = Cesium.Math.toDegrees(cartographic.longitude);
      bike.latitude = Cesium.Math.toDegrees(cartographic.latitude);
      
      // 更新时间戳
      bike.lastUpdated = Date.now();
      
      // 如果有billboard对象，同步更新其位置
      if (bike.billboard) {
        bike.billboard.position = position;
      }
      
      return true;
    }
    return false;
  }

  /**
   * 根据状态筛选单车
   * @param {string} status - 要筛选的状态
   * @returns {Array} 满足状态的单车数组
   */
  getBikesByStatus(status) {
    return this.bikes.filter(bike => bike.status === status);
  }

  /**
   * 获取指定范围内的单车
   * @param {number} centerLon - 中心点经度
   * @param {number} centerLat - 中心点纬度
   * @param {number} radiusInMeters - 半径（米）
   * @returns {Array} 该范围内的单车数组
   */
  getBikesInRadius(centerLon, centerLat, radiusInMeters) {
    return this.bikes.filter(bike => {
      const distance = calculateDistance(
        [centerLon, centerLat], 
        [bike.longitude, bike.latitude]
      );
      return distance <= radiusInMeters;
    });
  }

  /**
   * 记录行程信息
   * @param {string} bikeId - 单车ID
   * @param {string} userId - 用户ID
   * @param {Array} startPosition - 起始位置 [经度, 纬度]
   * @returns {string} 行程ID
   */
  startTrip(bikeId, userId, startPosition) {
    const tripId = `trip-${Date.now()}-${bikeId}`;
    
    // 更新单车状态
    this.updateBike(bikeId, { status: 'riding' });
    
    // 记录行程
    const trip = {
      id: tripId,
      bikeId,
      userId,
      startTime: Date.now(),
      startPosition,
      endTime: null,
      endPosition: null,
      status: 'active'
    };
    
    this.trips.push(trip);
    return tripId;
  }

  /**
   * 结束行程
   * @param {string} tripId - 行程ID
   * @param {Array} endPosition - 结束位置 [经度, 纬度]
   * @returns {Object} 行程信息
   */
  endTrip(tripId, endPosition) {
    const trip = this.trips.find(t => t.id === tripId);
    if (trip && trip.status === 'active') {
      // 更新行程信息
      trip.endTime = Date.now();
      trip.endPosition = endPosition;
      trip.status = 'completed';
      
      // 计算行程时长（分钟）
      trip.duration = (trip.endTime - trip.startTime) / 60000;
      
      // 计算行程距离（米）
      trip.distance = calculateDistance(trip.startPosition, endPosition);
      
      // 更新单车状态
      this.updateBike(trip.bikeId, { status: 'parked' });
      
      return trip;
    }
    return null;
  }

  /**
   * 导出单车数据为JSON格式
   * @returns {string} JSON字符串
   */
  exportBikesData() {
    // 创建不含循环引用的数据副本
    const exportData = this.bikes.map(bike => {
      const { billboard, ...exportBike } = bike;
      return exportBike;
    });
    
    return JSON.stringify(exportData);
  }

  /**
   * 导入单车数据
   * @param {string} jsonData - JSON格式的单车数据
   * @returns {number} 导入的单车数量
   */
  importBikesData(jsonData) {
    try {
      const importedBikes = JSON.parse(jsonData);
      this.bikes = importedBikes;
      return this.bikes.length;
    } catch (error) {
      console.error('导入单车数据失败:', error);
      return 0;
    }
  }

  /**
   * 获取单车统计信息
   * @returns {Object} 统计信息
   */
  getBikesStatistics() {
    const total = this.bikes.length;
    const parked = this.getBikesByStatus('parked').length;
    const riding = this.getBikesByStatus('riding').length;
    const detected = this.detectedBikes.size;
    
    // 合并检测统计和数据库统计
    return {
      total: total + detected, // 总数包括数据库中的和检测到的
      parked,
      riding,
      detected,
      utilizationRate: total > 0 ? ((riding / total) * 100).toFixed(2) : 0,
      types: this.detectionStats.types
    };
  }

  // ===== 以下是视觉检测相关方法 =====

  /**
   * 清除所有视觉检测相关的数据（包括历史记录）
   * 警告：这将删除所有检测数据！
   */
  clearAllDetectionData() {
    // 移除所有detection来源的实体
    this.clearBikesBySource('detection');
    
    this.detectedBikes.clear();
    this.previousDetectedBikes.clear();
    this.bikeTrackingInfo.clear();
    this.bikeHistory.clear();
    this.detectionStats = {
      total: 0,
      lastUpdate: null,
      history: [],
      types: {
        bicycle: 0,
        motorcycle: 0,
        unknown: 0
      }
    };
  }
  
  /**
   * 仅清除临时视觉检测数据（保留历史记录和主数据库中的单车）
   * 用于暂停检测而不丢失数据
   */
  clearTemporaryDetectionData() {
    this.detectedBikes.clear();
    this.previousDetectedBikes.clear();
    
    // 重置当前检测统计，但保留历史记录
    this.detectionStats.total = 0;
    this.detectionStats.types = {
      bicycle: 0,
      motorcycle: 0,
      unknown: 0
    };
  }
  
  /**
   * 清除视觉检测相关的临时数据
   * @deprecated 使用 clearAllDetectionData 或 clearTemporaryDetectionData 代替
   */
  clearDetectionData() {
    console.warn('BikeStore: clearDetectionData 已弃用，请使用 clearAllDetectionData 或 clearTemporaryDetectionData');
    this.clearTemporaryDetectionData(); // 默认使用不清除历史记录的版本
  }

  /**
   * 更新检测到的单车
   * @param {string} id - 单车ID
   * @param {Object} bikeData - 单车数据
   */
  updateDetectedBike(id, bikeData) {
    // 添加来源标记
    const bikeWithSource = {
      ...bikeData,
      source: 'detection'
    };
    
    this.detectedBikes.set(id, bikeWithSource);
    
    // 更新统计信息
    this.detectionStats.total = this.detectedBikes.size;
    this.detectionStats.lastUpdate = Date.now();
    
    // 更新类型统计
    const type = bikeData.type || 'unknown';
    if (type === 'bicycle' || type === 'motorcycle') {
      this.detectionStats.types[type] = (this.detectionStats.types[type] || 0) + 1;
    } else {
      this.detectionStats.types.unknown = (this.detectionStats.types.unknown || 0) + 1;
    }
    
    // 更新历史位置
    this.updateBikeHistoryPosition(id, bikeData);
    
    // 同时更新或创建实体
    if (this.viewer && bikeData.longitude && bikeData.latitude) {
      this.createBikeEntity({
        ...bikeWithSource,
        id: id
      }, 'detection');
    }
  }

  /**
   * 批量更新检测到的单车
   * @param {Array} bikes - 单车数据数组
   */
  updateDetectedBikes(bikes) {
    if (!Array.isArray(bikes) || bikes.length === 0) return;
    
    // 重置类型统计
    this.detectionStats.types = {
      bicycle: 0,
      motorcycle: 0,
      unknown: 0
    };
    
    // 临时存储当前帧的单车ID，用于避免重复统计
    const currentFrameBikeIds = new Set();
    
    // 批量更新
    bikes.forEach(bike => {
      if (!bike.id) return;
      
      // 避免同一帧中重复统计
      if (!currentFrameBikeIds.has(bike.id)) {
        currentFrameBikeIds.add(bike.id);
        
        // 更新单车数据
        this.updateDetectedBike(bike.id, bike);
        
        // 更新类型统计（确保更新的是类型总数而非当前帧数）
        const type = bike.type || 'unknown';
        if (type === 'bicycle' || type === 'motorcycle') {
          this.detectionStats.types[type]++;
        } else {
          this.detectionStats.types.unknown++;
        }
      }
    });
    
    // 更新总数统计 - 使用实际存储的单车数量而非传入的数组长度
    this.detectionStats.total = this.detectedBikes.size;
    this.detectionStats.lastUpdate = Date.now();
    
    // 记录检测统计历史
    this.recordDetectionStats();
  }

  /**
   * 保存当前检测结果到上一帧
   */
  savePreviousDetections() {
    this.previousDetectedBikes = new Map(this.detectedBikes);
  }

  /**
   * 清除当前检测结果
   */
  clearCurrentDetections() {
    this.detectedBikes.clear();
  }

  /**
   * 获取上一帧检测到的单车
   * @returns {Map} 上一帧单车Map
   */
  getPreviousDetectedBikes() {
    return this.previousDetectedBikes;
  }

  /**
   * 获取单车追踪信息
   * @returns {Map} 单车追踪信息Map
   */
  getBikeTrackingInfo() {
    return this.bikeTrackingInfo;
  }

  /**
   * 更新单车追踪信息
   * @param {string} id - 单车ID
   * @param {Object} trackInfo - 追踪信息
   */
  updateBikeTrackingInfo(id, trackInfo) {
    this.bikeTrackingInfo.set(id, trackInfo);
    
    // 同步更新到主数据库
    // 检查是否已存在于bikes数组中
    const existingIndex = this.bikes.findIndex(bike => bike.id === id);
    if (existingIndex === -1) {
      // 如果不存在，添加新记录
      const lastPosition = trackInfo.positions[trackInfo.positions.length - 1];
      if (lastPosition && lastPosition.longitude && lastPosition.latitude) {
        this.bikes.push({
          id,
          type: trackInfo.type || 'unknown',
          status: 'detected',
          longitude: lastPosition.longitude,
          latitude: lastPosition.latitude,
          height: lastPosition.height || 1.5,
          firstSeen: trackInfo.firstSeen,
          lastUpdated: trackInfo.lastSeen
        });
      }
    } else {
      // 如果已存在，更新信息
      const lastPosition = trackInfo.positions[trackInfo.positions.length - 1];
      if (lastPosition && lastPosition.longitude && lastPosition.latitude) {
        this.bikes[existingIndex].longitude = lastPosition.longitude;
        this.bikes[existingIndex].latitude = lastPosition.latitude;
        this.bikes[existingIndex].height = lastPosition.height || 1.5;
        this.bikes[existingIndex].lastUpdated = trackInfo.lastSeen;
      }
    }
  }

  /**
   * 移除单车追踪
   * @param {string} id - 单车ID
   */
  removeBikeTracking(id) {
    this.bikeTrackingInfo.delete(id);
  }

  /**
   * 更新单车历史位置
   * @param {string} id - 单车ID
   * @param {Object} position - 位置信息
   */
  updateBikeHistoryPosition(id, position) {
    if (!this.bikeHistory.has(id)) {
      this.bikeHistory.set(id, []);
    }
    
    const history = this.bikeHistory.get(id);
    history.push({...position, timestamp: Date.now()});
    
    // 限制历史记录数量
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * 获取单车历史位置
   * @param {string} id - 单车ID
   * @returns {Array} 历史位置数组
   */
  getBikeHistory(id) {
    return this.bikeHistory.get(id) || [];
  }

  /**
   * 移除单车
   * @param {string} id - 单车ID
   */
  removeBike(id) {
    // 从bikes数组中移除
    const index = this.bikes.findIndex(bike => bike.id === id);
    if (index !== -1) {
      this.bikes.splice(index, 1);
    }
    
    // 移除检测数据
    this.detectedBikes.delete(id);
    this.previousDetectedBikes.delete(id);
    this.bikeTrackingInfo.delete(id);
    this.bikeHistory.delete(id);
  }

  /**
   * 记录检测统计历史
   */
  recordDetectionStats() {
    const stats = {
      timestamp: Date.now(),
      total: this.detectionStats.total,
      types: { ...this.detectionStats.types }
    };
    
    this.detectionStats.history.push(stats);
    
    // 限制历史记录数量
    if (this.detectionStats.history.length > 100) {
      this.detectionStats.history.shift();
    }
  }
}

// 创建单例实例
const bikeStoreInstance = new BikeStore();

export default bikeStoreInstance;

