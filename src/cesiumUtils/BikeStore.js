/**
 * 校园单车数据存储服务
 * 提供单车数据的增删改查及其他管理功能
 */
import { calculateDistance } from './randomPoints';
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
  }

  /**
   * 初始化存储，导入单车数据
   * @param {Array} bikesData - 单车数据数组
   */
  initialize(bikesData) {
    this.bikes = [...bikesData];
    console.log(`BikeStore已初始化，导入${this.bikes.length}辆单车数据`);
    return this.bikes.length;
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
    this.detectedBikes.set(id, bikeData);
    
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

