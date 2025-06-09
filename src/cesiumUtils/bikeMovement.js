import Cesium from '@/cesiumUtils/cesium'
import bikeStore from './BikeStore'
import { BikeStatus, getIconByStatus, calculateDistance } from './randomPoints'

/**
 * 单车骑行管理器 - 基于临时数组的轻量级实现
 */
class BikeMovementManager {
  constructor() {
    this.viewer = null;
    this.roadNetworkData = null;
    this.roadSegments = [];
    this.roadNetwork = {};
    this.isActive = false;
    this.animationHandle = null;
    
    // 临时移动数据数组 - 只存储移动相关信息
    this.movingBikes = [];
    this.lastUpdateTime = Date.now();
    this.updateInterval = 20; // 更新间隔（毫秒）
    this.storeUpdateInterval = 10000; // 10秒同步到store
    this.lastStoreUpdateTime = Date.now();
    
    // 车位相关数据
    this.parkingSpots = [];
    this.parkingSpotsLoaded = false;
  }

  /**
   * 初始化管理器
   */
  async initialize(viewer) {
    this.viewer = viewer;
    bikeStore.setViewer(viewer);
    await this.loadRoadNetwork();
    // 加载车位数据
    await this.loadParkingSpots();
    console.log('BikeMovementManager 初始化完成');
  }

  /**
   * 加载车位数据
   */
  async loadParkingSpots() {
    try {
      const response = await fetch('/src/assets/ships/车位new.geojson');
      const data = await response.json();
      
      this.parkingSpots = data.features.map((feature, index) => {
        const coordinates = feature.geometry.coordinates;
        const center = this.calculatePolygonCenter(coordinates[0][0]);
        const spotId = feature.properties?.id || feature.properties?.ID || feature.properties?.name || (index + 1);
        
        const area = this.calculatePolygonArea(coordinates[0][0]);
        const maxCapacity = Math.max(1, Math.floor(area / 1)); // 每1平方米1辆单车
        
        return {
          id: spotId,
          coordinates: coordinates,
          center: center,
          area: area,
          maxCapacity: maxCapacity,
          bikeCount: 0 // 初始无单车
        };
      });
      
      this.parkingSpotsLoaded = true;
      console.log(`成功加载 ${this.parkingSpots.length} 个车位数据`);
      return this.parkingSpots;
    } catch (error) {
      console.error('加载车位数据失败:', error);
      return [];
    }
  }
  
  /**
   * 计算多边形中心点
   */
  calculatePolygonCenter(coordinates) {
    const sumLon = coordinates.reduce((sum, coord) => sum + coord[0], 0);
    const sumLat = coordinates.reduce((sum, coord) => sum + coord[1], 0);
    return [
      sumLon / coordinates.length,
      sumLat / coordinates.length
    ];
  }
  
  /**
   * 计算多边形面积（球面面积计算）
   */
  calculatePolygonArea(coordinates) {
    if (!coordinates || coordinates.length < 3) return 0;
    
    const toRadians = (degrees) => degrees * Math.PI / 180;
    let area = 0;
    const R = 6371000;
    
    for (let i = 0; i < coordinates.length; i++) {
      const j = (i + 1) % coordinates.length;
      const lat1 = toRadians(coordinates[i][1]);
      const lat2 = toRadians(coordinates[j][1]);
      const deltaLon = toRadians(coordinates[j][0] - coordinates[i][0]);
      
      area += deltaLon * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    
    area = Math.abs(area * R * R / 2);
    return area;
  }
  
  /**
   * 更新车位占用状态
   */
  updateParkingSpotsStatus() {
    if (!this.parkingSpotsLoaded) return;
    
    const bikes = bikeStore.getAllBikes();
    if (!bikes) return;
    
    this.parkingSpots.forEach(spot => {
      const bikesInSpot = bikes.filter(bike => {
        if (bike.status !== BikeStatus.PARKED) return false;
        return this.isPointInPolygon(
          [bike.longitude, bike.latitude],
          spot.coordinates[0][0]
        );
      });
      
      spot.bikeCount = bikesInSpot.length;
    });
  }
  
  /**
   * 判断点是否在多边形内
   */
  isPointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    
    return inside;
  }
  
  /**
   * 查找附近可用的车位
   */
  findAvailableParkingSpotInRadius(centerLon, centerLat, radiusInMeters = 100) {
    if (!this.parkingSpotsLoaded || this.parkingSpots.length === 0) {
      return null;
    }
    
    // 更新车位状态
    this.updateParkingSpotsStatus();
    
    // 筛选附近未满的车位
    const nearbySpots = this.parkingSpots.filter(spot => {
      if (!spot.center) return false;
      
      const distance = calculateDistance([centerLon, centerLat], spot.center);
      return distance <= radiusInMeters && spot.bikeCount < spot.maxCapacity;
    });
    
    if (nearbySpots.length === 0) {
      return null;
    }
    
    // 按距离排序
    nearbySpots.sort((a, b) => {
      const distA = calculateDistance([centerLon, centerLat], a.center);
      const distB = calculateDistance([centerLon, centerLat], b.center);
      return distA - distB;
    });
    
    return nearbySpots[0];
  }
  
  /**
   * 在车位内找一个随机位置
   */
  findRandomPositionInParkingSpot(spot) {
    if (!spot || !spot.coordinates || !spot.coordinates[0] || !spot.coordinates[0][0]) {
      return null;
    }
    
    const polygon = spot.coordinates[0][0];
    const center = spot.center;
    
    // 尝试10次生成车位内的随机点
    for (let i = 0; i < 10; i++) {
      // 在车位中心5-10米范围内生成随机点
      const randomPos = this.generateRandomPositionNear(center, 1, 5);
      
      // 检查点是否在多边形内
      if (this.isPointInPolygon(randomPos, polygon)) {
        return randomPos;
      }
    }
    
    // 如果随机生成失败，直接返回中心点
    return center;
  }

  /**
   * 加载道路网络数据
   */
  async loadRoadNetwork() {
    if (this.roadNetworkData) return this.roadNetworkData;
    
    try {
      const response = await fetch('/src/assets/ships/wlcroad.geojson');
      this.roadNetworkData = await response.json();
      this.extractRoadSegments();
      this.buildRoadNetwork();
      console.log(`成功加载道路网络，包含 ${this.roadSegments.length} 个路段`);
      return this.roadNetworkData;
    } catch (error) {
      console.error('加载道路网络数据失败:', error);
      return null;
    }
  }

  /**
   * 提取道路线段
   */
  extractRoadSegments() {
    this.roadSegments = [];
    
    const mainRoads = this.roadNetworkData.features.filter(feature => {
      const fclass = feature.properties.fclass;
      return (
        fclass === 'residential' || 
        fclass === 'living_street' || 
        fclass === 'secondary' || 
        fclass === 'tertiary' || 
        fclass === 'footway'
      );
    });
    
    mainRoads.forEach((road, roadIndex) => {
      if (!road.geometry || !road.geometry.coordinates) return;
      
      const coordinates = road.geometry.coordinates;
      
      if (road.geometry.type === 'MultiLineString') {
        coordinates.forEach((line, lineIndex) => {
          for (let i = 0; i < line.length - 1; i++) {
            this.roadSegments.push({
              id: `segment-${roadIndex}-${lineIndex}-${i}`,
              start: line[i],
              end: line[i + 1],
              startNodeId: `node-${roadIndex}-${lineIndex}-${i}`,
              endNodeId: `node-${roadIndex}-${lineIndex}-${i+1}`
            });
          }
        });
      } else if (road.geometry.type === 'LineString') {
        for (let i = 0; i < coordinates.length - 1; i++) {
          this.roadSegments.push({
            id: `segment-${roadIndex}-${i}`,
            start: coordinates[i],
            end: coordinates[i + 1],
            startNodeId: `node-${roadIndex}-${i}`,
            endNodeId: `node-${roadIndex}-${i+1}`
          });
        }
      }
    });
  }

  /**
   * 构建道路网络拓扑
   */
  buildRoadNetwork() {
    this.roadNetwork = { nodes: {}, connections: {} };
    
    this.roadSegments.forEach(segment => {
      const { startNodeId, endNodeId, start, end } = segment;
      
      if (!this.roadNetwork.nodes[startNodeId]) {
        this.roadNetwork.nodes[startNodeId] = {
          id: startNodeId,
          position: start,
          connections: []
        };
      }
      
      if (!this.roadNetwork.nodes[endNodeId]) {
        this.roadNetwork.nodes[endNodeId] = {
          id: endNodeId,
          position: end,
          connections: []
        };
      }
    });
    
    this.roadSegments.forEach(segment => {
      const { id, startNodeId, endNodeId } = segment;
      
      this.roadNetwork.nodes[startNodeId].connections.push({
        segmentId: id,
        nextNodeId: endNodeId
      });
      
      this.roadNetwork.nodes[endNodeId].connections.push({
        segmentId: id,
        nextNodeId: startNodeId
      });
    });
  }

  /**
   * 启动骑行模式
   */
  startRidingMode() {
    if (this.isActive) {
      console.log('骑行模式已经激活');
      return this.movingBikes.length;
    }

    // 从store获取所有单车
    const allBikes = bikeStore.getAllBikes().filter(bike => bike.source === 'random');
    if (allBikes.length === 0) {
      console.warn('没有可用的单车数据');
      return 0;
    }

    // 选择40%的单车开始骑行
    const ridingCount = Math.floor(allBikes.length * 0.4);
    const shuffled = [...allBikes].sort(() => 0.5 - Math.random());
    const bikesToRide = shuffled.slice(0, ridingCount);

    // 清空移动数组
    this.movingBikes = [];

    // 为选中的单车创建移动信息
    bikesToRide.forEach(bike => {
      this.createMovingBike(bike);
    });

    this.isActive = true;
    this.startAnimation();

    console.log(`开始骑行模式: ${this.movingBikes.length}/${allBikes.length} 辆单车开始骑行`);
    return this.movingBikes.length;
  }

  /**
   * 停止骑行模式
   */
  stopRidingMode() {
    if (!this.isActive) return;

    this.isActive = false;
    
    if (this.animationHandle) {
      this.animationHandle();
      this.animationHandle = null;
    }

    // 将所有移动中的单车状态更新为停车
    this.movingBikes.forEach(movingBike => {
      // 更新store中的状态
      bikeStore.updateBike(movingBike.id, { 
        status: BikeStatus.PARKED,
        longitude: movingBike.longitude,
        latitude: movingBike.latitude
      });
      
      // 更新实体
      bikeStore.updateBikeEntity(movingBike.id, {
        status: BikeStatus.PARKED,
        longitude: movingBike.longitude,
        latitude: movingBike.latitude
      });
    });

    this.movingBikes = [];
    console.log('骑行模式已停止');
  }

  /**
   * 创建移动单车信息
   */
  createMovingBike(bike) {
    // 找到最近的道路
    const nearestRoad = this.findNearestRoadSegment([bike.longitude, bike.latitude]);
    if (!nearestRoad || nearestRoad.distance > 200) {
      console.warn(`单车 ${bike.id} 距离道路太远，跳过`);
      return false;
    }

    const { segment, progress } = nearestRoad;
    
    // 创建临时移动数据，添加visitedSegments记录已走过的路径
    const movingBike = {
      id: bike.id,
      longitude: bike.longitude,
      latitude: bike.latitude,
      currentSegment: segment,
      progress: progress,
      direction: Math.random() > 0.5 ? 1 : -1,
      speed: 0.001 + Math.random() * 0.002,
      maxSegments: 5 + Math.floor(Math.random() * 10), // 增加最大路段数
      segmentCount: 0,
      lastUpdate: Date.now(),
      visitedSegments: new Set([segment.id]) // 添加已访问路段记录
    };

    this.movingBikes.push(movingBike);

    // 立即更新store状态
    bikeStore.updateBike(bike.id, { status: BikeStatus.RIDING });
    bikeStore.updateBikeEntity(bike.id, { 
      status: BikeStatus.RIDING,
      type: bike.type || 'bicycle'
    });

    return true;
  }

  /**
   * 开始动画循环
   */
  startAnimation() {
    if (!this.viewer) return;

    this.animationHandle = this.viewer.scene.preRender.addEventListener(() => {
      if (!this.isActive) return;

      const now = Date.now();
      
      // 更新移动动画
      if (now - this.lastUpdateTime >= this.updateInterval) {
        this.updateMovingBikes();
        this.lastUpdateTime = now;
      }

      // 定期同步到store（每10秒）
      if (now - this.lastStoreUpdateTime >= this.storeUpdateInterval) {
        this.syncToStore();
        this.lastStoreUpdateTime = now;
      }
    });
  }

  /**
   * 更新所有移动中的单车
   */
  updateMovingBikes() {
    // 使用倒序遍历，便于删除元素
    for (let i = this.movingBikes.length - 1; i >= 0; i--) {
      const movingBike = this.movingBikes[i];
      
      if (!this.updateSingleMovingBike(movingBike)) {
        // 如果返回false，说明单车已到达线段末端
        
        // 新增：50%概率继续骑行，50%概率停车
        if (Math.random() < 0.5 && movingBike.segmentCount < movingBike.maxSegments) {
          // 继续骑行 - 寻找新路段
          const nextSegmentInfo = this.getNextSegment(movingBike.currentSegment, movingBike.direction, movingBike.visitedSegments);
          
          if (nextSegmentInfo) {
            // 找到了新路段，更新信息并继续
            movingBike.currentSegment = nextSegmentInfo.segment;
            movingBike.direction = nextSegmentInfo.direction;
            movingBike.progress = nextSegmentInfo.startProgress;
            movingBike.segmentCount++;
            
            // 添加到已访问路段集合
            movingBike.visitedSegments.add(nextSegmentInfo.segment.id);
            continue; // 继续下一次循环
          }
        }
        
        // 如果决定停车或没有找到新路段，处理到达目的地
        this.handleBikeReachDestination(movingBike);
        this.movingBikes.splice(i, 1);
      }
    }
  }

  /**
   * 更新单个移动中的单车
   */
  updateSingleMovingBike(movingBike) {
    const { currentSegment, direction, speed } = movingBike;
    
    // 更新进度
    movingBike.progress += direction * speed;

    // 检查是否到达线段末端
    if (movingBike.progress <= 0 || movingBike.progress >= 1) {
      return false; // 到达线段末端，交由updateMovingBikes处理
    }

    // 确保进度在有效范围内
    movingBike.progress = Math.max(0, Math.min(1, movingBike.progress));

    // 计算新位置
    const newPosition = this.interpolatePosition(
      currentSegment.start, 
      currentSegment.end, 
      movingBike.progress
    );

    // 更新临时数据中的位置
    movingBike.longitude = newPosition[0];
    movingBike.latitude = newPosition[1];
    movingBike.lastUpdate = Date.now();

    // 实时更新实体位置
    bikeStore.updateBikeEntity(movingBike.id, {
      longitude: newPosition[0],
      latitude: newPosition[1],
      height: 20 // 确保高度适当
    });

    return true; // 继续移动
  }

  /**
   * 处理单车到达目的地
   */
  handleBikeReachDestination(movingBike) {
    // 移除详细日志输出
    
    // 获取终点位置
    const segment = movingBike.currentSegment;
    const endPoint = movingBike.direction === 1 ? segment.end : segment.start;
    
    let parkingPosition;
    let usedParkingSpot = false;
    
    // 70% 概率寻找附近车位停车
    if (Math.random() < 0.7) {
      // 寻找100米内可用的车位
      const nearbySpot = this.findAvailableParkingSpotInRadius(endPoint[0], endPoint[1], 100);
      
      if (nearbySpot) {
        // 找到车位，在车位内找个随机位置停车
        parkingPosition = this.findRandomPositionInParkingSpot(nearbySpot);
        usedParkingSpot = true;
      } else {
        // 没找到车位，在终点附近生成随机位置（5-20米范围内）
        parkingPosition = this.generateRandomPositionNear(endPoint, 5, 20);
      }
    } else {
      // 30% 概率直接随机停放
      parkingPosition = this.generateRandomPositionNear(endPoint, 5, 20);
    }
    
    // 更新store状态为停车
    bikeStore.updateBike(movingBike.id, { 
      status: BikeStatus.PARKED,
      longitude: parkingPosition[0],
      latitude: parkingPosition[1]
    });
    
    // 更新实体 - 确保广告牌状态和位置同步更新
    bikeStore.updateBikeEntity(movingBike.id, {
      status: BikeStatus.PARKED,
      longitude: parkingPosition[0],
      latitude: parkingPosition[1]
    });

    // 启动另一辆停车的单车
    setTimeout(() => {
      if (this.isActive) {
        this.startRandomParkedBike();
      }
    }, 500 + Math.random() * 1500);
    
    // 如果使用了车位，更新车位状态
    if (usedParkingSpot) {
      this.updateParkingSpotsStatus();
    }
  }

  /**
   * 在指定点附近生成随机位置
   * @param {Array} centerPoint - 中心点 [lon, lat]
   * @param {number} minDistance - 最小距离（米）
   * @param {number} maxDistance - 最大距离（米）
   * @returns {Array} 随机位置 [lon, lat]
   */
  generateRandomPositionNear(centerPoint, minDistance, maxDistance) {
    // 随机角度 (0-360度)
    const angle = Math.random() * Math.PI * 2;
    
    // 随机距离 (minDistance-maxDistance米)
    const distance = minDistance + Math.random() * (maxDistance - minDistance);
    
    // 转换为经纬度偏移量（粗略估计：1度约等于111km）
    const distanceDeg = distance / 111000;
    
    // 计算偏移
    const offsetX = Math.cos(angle) * distanceDeg;
    const offsetY = Math.sin(angle) * distanceDeg;
    
    return [
      centerPoint[0] + offsetX,
      centerPoint[1] + offsetY
    ];
  }

  /**
   * 启动一辆随机的停车单车
   */
  startRandomParkedBike() {
    const parkedBikes = bikeStore.getAllBikes().filter(bike => 
      bike.source === 'random' && 
      bike.status === BikeStatus.PARKED &&
      !this.movingBikes.some(mb => mb.id === bike.id) // 不在移动数组中
    );

    if (parkedBikes.length > 0) {
      const randomBike = parkedBikes[Math.floor(Math.random() * parkedBikes.length)];
      this.createMovingBike(randomBike);
    }
  }

  /**
   * 定期同步移动数据到store（每10秒）
   */
  syncToStore() {
    console.log(`同步 ${this.movingBikes.length} 辆移动单车数据到store`);
    
    this.movingBikes.forEach(movingBike => {
      bikeStore.updateBike(movingBike.id, {
        longitude: movingBike.longitude,
        latitude: movingBike.latitude,
        status: BikeStatus.RIDING
      });
    });
  }

  /**
   * 获取下一个连接的路段，避免选择之前走过的路段
   * @param {Object} currentSegment - 当前路段
   * @param {number} direction - 当前方向 
   * @param {Set} visitedSegments - 已访问过的路段ID集合
   */
  getNextSegment(currentSegment, direction, visitedSegments) {
    const currentNodeId = direction === 1 ? currentSegment.endNodeId : currentSegment.startNodeId;
    const node = this.roadNetwork.nodes[currentNodeId];
    
    if (!node || node.connections.length === 0) return null;

    // 筛选未访问过的连接路段
    let availableConnections = node.connections.filter(conn => 
      conn.segmentId !== currentSegment.id && // 不是当前路段
      !visitedSegments.has(conn.segmentId) // 未访问过
    );

    // 如果没有未访问过的路段，允许使用已访问过的路段（但不回头）
    if (availableConnections.length === 0) {
      availableConnections = node.connections.filter(conn => 
        conn.segmentId !== currentSegment.id // 只保证不回头
      );
      
      // 仍然没有可用路段，允许掉头
      if (availableConnections.length === 0) {
        return {
          segment: currentSegment,
          direction: -direction,
          startProgress: direction === 1 ? 1 : 0
        };
      }
    }

    // 随机选择一个可用连接
    const randomConnection = availableConnections[Math.floor(Math.random() * availableConnections.length)];
    const nextSegment = this.roadSegments.find(seg => seg.id === randomConnection.segmentId);
    
    if (!nextSegment) return null;

    // 确定在新路段上的方向
    const nextDirection = randomConnection.nextNodeId === nextSegment.startNodeId ? 1 : -1;

    return {
      segment: nextSegment,
      direction: nextDirection,
      startProgress: nextDirection === 1 ? 0 : 1
    };
  }

  /**
   * 线性插值计算位置
   */
  interpolatePosition(start, end, fraction) {
    return [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction
    ];
  }

  /**
   * 查找最近的道路线段
   */
  findNearestRoadSegment(point) {
    if (this.roadSegments.length === 0) return null;
    
    let minDistance = Infinity;
    let nearestSegment = null;
    let projectionProgress = 0;
    
    this.roadSegments.forEach(segment => {
      const { start, end } = segment;
      const result = this.pointToLineProjection(point, start, end);
      
      if (result.distance < minDistance) {
        minDistance = result.distance;
        nearestSegment = segment;
        projectionProgress = result.progress;
      }
    });
    
    return {
      segment: nearestSegment,
      progress: projectionProgress,
      distance: minDistance
    };
  }

  /**
   * 计算点到线段的投影
   */
  pointToLineProjection(point, lineStart, lineEnd) {
    const [x, y] = point;
    const [x1, y1] = lineStart;
    const [x2, y2] = lineEnd;
    
    const lengthSquared = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    
    if (lengthSquared === 0) {
      return {
        progress: 0,
        distance: calculateDistance(point, lineStart)
      };
    }
    
    const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lengthSquared));
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    
    return {
      progress: t,
      distance: calculateDistance([x, y], [projX, projY])
    };
  }

  /**
   * 获取当前骑行状态统计
   */
  getRidingStats() {
    const totalBikes = bikeStore.getAllBikes().filter(bike => bike.source === 'random').length;
    const ridingCount = this.movingBikes.length;
    const parkedCount = totalBikes - ridingCount;

    return {
      total: totalBikes,
      riding: ridingCount,
      parked: parkedCount,
      isActive: this.isActive,
      ridingPercentage: totalBikes > 0 ? ((ridingCount / totalBikes) * 100).toFixed(1) : 0
    };
  }

  /**
   * 切换骑行模式
   */
  toggleRidingMode() {
    if (this.isActive) {
      this.stopRidingMode();
      return false;
    } else {
      this.startRidingMode();
      return true;
    }
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.stopRidingMode();
    this.viewer = null;
    this.roadNetworkData = null;
    this.roadSegments = [];
    this.roadNetwork = {};
    this.movingBikes = [];
    console.log('BikeMovementManager 已销毁');
  }
}

// 创建单例实例
const bikeMovementManager = new BikeMovementManager();

export default bikeMovementManager;