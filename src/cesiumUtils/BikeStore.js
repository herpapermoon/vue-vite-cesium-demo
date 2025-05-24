/**
 * 共享单车数据存储服务
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
   * 获取电量低的单车
   * @param {number} threshold - 电量阈值（如20表示低于20%）
   * @returns {Array} 低电量单车数组
   */
  getLowBatteryBikes(threshold = 20) {
    return this.bikes.filter(bike => bike.batteryLevel < threshold);
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
    this.updateBike(bikeId, { status: 'inUse' });
    
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
      this.updateBike(trip.bikeId, { status: 'available' });
      
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
    const available = this.getBikesByStatus('available').length;
    const inUse = this.getBikesByStatus('inUse').length;
    const maintenance = this.getBikesByStatus('maintenance').length;
    const lowBattery = this.getLowBatteryBikes().length;
    
    return {
      total,
      available,
      inUse,
      maintenance,
      lowBattery,
      utilization: total > 0 ? ((inUse / total) * 100).toFixed(2) : 0
    };
  }
}

// 创建单例实例
const bikeStoreInstance = new BikeStore();

export default bikeStoreInstance;
