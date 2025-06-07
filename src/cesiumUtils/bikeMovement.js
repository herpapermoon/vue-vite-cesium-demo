import Cesium from '@/cesiumUtils/cesium'
import bikeStore from './BikeStore'
import { BikeStatus, getIconByStatus, calculateDistance } from './randomPoints'

/**
 * 单车骑行管理器
 * 负责处理单车的骑行状态、路径规划和动画
 */
class BikeMovementManager {
  constructor() {
    this.viewer = null;
    this.roadNetworkData = null;
    this.roadSegments = [];
    this.roadNetwork = {};
    this.isActive = false;
    this.animationHandle = null;
    this.ridingBikes = new Map(); // 存储正在骑行的单车信息
    this.lastUpdateTime = Date.now();
    this.updateInterval = 50; // 更新间隔（毫秒）
  }

  /**
   * 初始化管理器
   * @param {Cesium.Viewer} viewer - Cesium查看器实例
   */
  async initialize(viewer) {
    this.viewer = viewer;
    bikeStore.setViewer(viewer);
    
    // 加载道路网络数据
    await this.loadRoadNetwork();
    
    console.log('BikeMovementManager 初始化完成');
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
   * 从道路网络数据中提取线段
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
      if (!road.geometry || !road.geometry.coordinates || road.geometry.coordinates.length === 0) {
        return;
      }
      
      const coordinates = road.geometry.coordinates;
      
      if (road.geometry.type === 'MultiLineString') {
        coordinates.forEach((line, lineIndex) => {
          for (let i = 0; i < line.length - 1; i++) {
            this.roadSegments.push({
              id: `segment-${roadIndex}-${lineIndex}-${i}`,
              start: line[i],
              end: line[i + 1],
              roadId: road.properties.fid || `road-${roadIndex}`,
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
            roadId: road.properties.fid || `road-${roadIndex}`,
            startNodeId: `node-${roadIndex}-${i}`,
            endNodeId: `node-${roadIndex}-${i+1}`
          });
        }
      }
    });
  }

  /**
   * 构建道路网络拓扑结构
   */
  buildRoadNetwork() {
    this.roadNetwork = {
      nodes: {},
      connections: {}
    };
    
    // 构建节点和连接
    this.roadSegments.forEach(segment => {
      const { startNodeId, endNodeId, start, end } = segment;
      
      if (!this.roadNetwork.nodes[startNodeId]) {
        this.roadNetwork.nodes[startNodeId] = {
          id: startNodeId,
          position: start,
          connections: []
        };
        this.roadNetwork.connections[startNodeId] = [];
      }
      
      if (!this.roadNetwork.nodes[endNodeId]) {
        this.roadNetwork.nodes[endNodeId] = {
          id: endNodeId,
          position: end,
          connections: []
        };
        this.roadNetwork.connections[endNodeId] = [];
      }
      
      this.roadNetwork.connections[startNodeId].push(endNodeId);
      this.roadNetwork.connections[endNodeId].push(startNodeId);
    });
    
    // 为每个节点添加相邻线段信息
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
   * 启动骑行模式 - 让40%的单车开始骑行
   */
  startRidingMode() {
    if (this.isActive) {
      console.log('骑行模式已经激活');
      return;
    }

    const allBikes = bikeStore.getAllBikes().filter(bike => bike.source === 'random');
    if (allBikes.length === 0) {
      console.warn('没有可用的单车数据');
      return;
    }

    // 选择40%的停车单车开始骑行
    const parkedBikes = allBikes.filter(bike => bike.status === BikeStatus.PARKED);
    const ridingCount = Math.floor(parkedBikes.length * 0.4);
    
    // 随机选择要骑行的单车
    const shuffled = [...parkedBikes].sort(() => 0.5 - Math.random());
    const bikesToRide = shuffled.slice(0, ridingCount);

    console.log(`开始骑行模式: ${bikesToRide.length}/${allBikes.length} 辆单车开始骑行`);

    // 为选中的单车分配骑行路径
    bikesToRide.forEach(bike => {
      this.startBikeRiding(bike.id);
    });

    this.isActive = true;
    this.startAnimation();

    return ridingCount;
  }

  /**
   * 停止骑行模式
   */
  stopRidingMode() {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    
    if (this.animationHandle) {
      this.animationHandle();
      this.animationHandle = null;
    }

    // 停止所有骑行的单车
    for (const bikeId of this.ridingBikes.keys()) {
      this.stopBikeRiding(bikeId);
    }

    this.ridingBikes.clear();
    console.log('骑行模式已停止');
  }

  /**
   * 让特定单车开始骑行
   * @param {string} bikeId - 单车ID
   */
  startBikeRiding(bikeId) {
    const bike = bikeStore.getBikeById(bikeId);
    if (!bike || bike.status === BikeStatus.RIDING) {
      return false;
    }

    // 找到最近的道路线段
    const nearestRoad = this.findNearestRoadSegment([bike.longitude, bike.latitude]);
    if (!nearestRoad || nearestRoad.distance > 200) {
      console.warn(`单车 ${bikeId} 距离道路太远，无法开始骑行`);
      return false;
    }

    const { segment, point, progress } = nearestRoad;
    
    // 创建骑行信息
    const ridingInfo = {
      bikeId: bikeId,
      currentSegment: segment,
      progress: progress,
      direction: Math.random() > 0.5 ? 1 : -1, // 随机方向
      speed: 0.00005 + Math.random() * 0.00005, // 随机速度 (度/帧)
      targetPosition: point,
      isTransitioning: true,
      transitionStart: Date.now(),
      transitionDuration: 2000, // 2秒过渡到道路
      originalPosition: [bike.longitude, bike.latitude],
      visitedSegments: new Set([segment.id])
    };

    this.ridingBikes.set(bikeId, ridingInfo);

    // 更新单车状态
    bikeStore.updateBike(bikeId, { status: BikeStatus.RIDING });
    bikeStore.updateBikeEntity(bikeId, { 
      status: BikeStatus.RIDING,
      type: bike.type || 'bicycle'
    });

    console.log(`单车 ${bikeId} 开始骑行`);
    return true;
  }

  /**
   * 停止特定单车骑行
   * @param {string} bikeId - 单车ID
   */
  stopBikeRiding(bikeId) {
    const bike = bikeStore.getBikeById(bikeId);
    if (!bike) return false;

    // 更新单车状态为停车
    bikeStore.updateBike(bikeId, { status: BikeStatus.PARKED });
    bikeStore.updateBikeEntity(bikeId, { 
      status: BikeStatus.PARKED,
      type: bike.type || 'bicycle'
    });

    // 移除骑行信息
    this.ridingBikes.delete(bikeId);

    console.log(`单车 ${bikeId} 停止骑行`);
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
      if (now - this.lastUpdateTime < this.updateInterval) {
        return;
      }

      this.updateRidingBikes();
      this.lastUpdateTime = now;
    });
  }

  /**
   * 更新所有骑行中的单车
   */
  updateRidingBikes() {
    for (const [bikeId, ridingInfo] of this.ridingBikes.entries()) {
      this.updateSingleBike(bikeId, ridingInfo);
    }
  }

  /**
   * 更新单个骑行单车的位置
   * @param {string} bikeId - 单车ID
   * @param {Object} ridingInfo - 骑行信息
   */
  updateSingleBike(bikeId, ridingInfo) {
    const bike = bikeStore.getBikeById(bikeId);
    if (!bike) {
      this.ridingBikes.delete(bikeId);
      return;
    }

    const now = Date.now();

    // 处理过渡阶段（从当前位置移动到道路上）
    if (ridingInfo.isTransitioning) {
      const elapsed = now - ridingInfo.transitionStart;
      const progress = Math.min(elapsed / ridingInfo.transitionDuration, 1);

      // 线性插值到目标位置
      const newLon = ridingInfo.originalPosition[0] + 
        (ridingInfo.targetPosition[0] - ridingInfo.originalPosition[0]) * progress;
      const newLat = ridingInfo.originalPosition[1] + 
        (ridingInfo.targetPosition[1] - ridingInfo.originalPosition[1]) * progress;

      // 更新位置
      bikeStore.updateBike(bikeId, { 
        longitude: newLon, 
        latitude: newLat 
      });
      bikeStore.updateBikeEntity(bikeId, { 
        longitude: newLon, 
        latitude: newLat 
      });

      // 过渡完成
      if (progress >= 1) {
        ridingInfo.isTransitioning = false;
        ridingInfo.progress = this.findProgressOnSegment(ridingInfo.currentSegment, [newLon, newLat]);
      }

      return;
    }

    // 正常骑行阶段
    this.moveAlongSegment(bikeId, ridingInfo);
  }

  /**
   * 沿路段移动单车
   * @param {string} bikeId - 单车ID
   * @param {Object} ridingInfo - 骑行信息
   */
  moveAlongSegment(bikeId, ridingInfo) {
    const { currentSegment, direction, speed } = ridingInfo;
    
    // 更新进度
    ridingInfo.progress += direction * speed;

    // 检查是否到达线段末端
    if (ridingInfo.progress <= 0 || ridingInfo.progress >= 1) {
      // 到达线段末端，需要选择下一个线段或停止
      const shouldContinue = Math.random() > 0.5; // 50% 概率继续

      if (shouldContinue) {
        const nextSegmentInfo = this.getNextSegment(currentSegment, direction, ridingInfo.visitedSegments);
        
        if (nextSegmentInfo) {
          // 切换到下一个线段
          ridingInfo.currentSegment = nextSegmentInfo.segment;
          ridingInfo.direction = nextSegmentInfo.direction;
          ridingInfo.progress = nextSegmentInfo.startProgress;
          ridingInfo.visitedSegments.add(nextSegmentInfo.segment.id);
          
          // 清理访问过的线段（避免无限增长）
          if (ridingInfo.visitedSegments.size > 20) {
            const segmentsArray = Array.from(ridingInfo.visitedSegments);
            ridingInfo.visitedSegments = new Set(segmentsArray.slice(-10));
          }
        } else {
          // 没有可用的下一个线段，停止骑行
          this.handleBikeReachDestination(bikeId);
          return;
        }
      } else {
        // 选择停止骑行
        this.handleBikeReachDestination(bikeId);
        return;
      }
    }

    // 确保进度在有效范围内
    ridingInfo.progress = Math.max(0, Math.min(1, ridingInfo.progress));

    // 计算当前位置
    const newPosition = this.interpolatePosition(
      currentSegment.start, 
      currentSegment.end, 
      ridingInfo.progress
    );

    // 更新单车位置
    bikeStore.updateBike(bikeId, { 
      longitude: newPosition[0], 
      latitude: newPosition[1] 
    });
    bikeStore.updateBikeEntity(bikeId, { 
      longitude: newPosition[0], 
      latitude: newPosition[1] 
    });
  }

  /**
   * 处理单车到达目的地的情况
   * @param {string} bikeId - 单车ID
   */
  handleBikeReachDestination(bikeId) {
    // 停止当前单车
    this.stopBikeRiding(bikeId);

    // 50% 概率启动另一辆停车的单车
    if (Math.random() > 0.5) {
      const parkedBikes = bikeStore.getAllBikes().filter(bike => 
        bike.source === 'random' && bike.status === BikeStatus.PARKED
      );

      if (parkedBikes.length > 0) {
        const randomBike = parkedBikes[Math.floor(Math.random() * parkedBikes.length)];
        setTimeout(() => {
          this.startBikeRiding(randomBike.id);
        }, 1000 + Math.random() * 2000); // 1-3秒延迟
      }
    }
  }

  /**
   * 获取下一个连接的路段
   * @param {Object} currentSegment - 当前路段
   * @param {number} direction - 当前方向
   * @param {Set} visitedSegments - 已访问的路段
   * @returns {Object|null} 下一个路段信息
   */
  getNextSegment(currentSegment, direction, visitedSegments) {
    const currentNodeId = direction === 1 ? currentSegment.endNodeId : currentSegment.startNodeId;
    const node = this.roadNetwork.nodes[currentNodeId];
    
    if (!node || node.connections.length === 0) return null;

    // 过滤掉当前线段和最近访问过的线段
    const availableConnections = node.connections.filter(conn => 
      conn.segmentId !== currentSegment.id && 
      !visitedSegments.has(conn.segmentId)
    );

    // 如果没有未访问的连接，允许访问已访问的（但不是当前的）
    let connections = availableConnections.length > 0 ? availableConnections : 
      node.connections.filter(conn => conn.segmentId !== currentSegment.id);

    if (connections.length === 0) {
      // 如果还是没有，允许掉头
      return {
        segment: currentSegment,
        direction: -direction,
        startProgress: direction === 1 ? 1 : 0
      };
    }

    // 随机选择下一个连接
    const randomConnection = connections[Math.floor(Math.random() * connections.length)];
    const nextSegment = this.roadSegments.find(seg => seg.id === randomConnection.segmentId);
    
    if (!nextSegment) return null;

    // 确定方向
    const nextDirection = randomConnection.nextNodeId === nextSegment.startNodeId ? 1 : -1;

    return {
      segment: nextSegment,
      direction: nextDirection,
      startProgress: nextDirection === 1 ? 0 : 1
    };
  }

  /**
   * 在线段上插值计算位置
   * @param {Array} start - 起点 [lon, lat]
   * @param {Array} end - 终点 [lon, lat]
   * @param {number} fraction - 插值比例 (0-1)
   * @returns {Array} 插值位置 [lon, lat]
   */
  interpolatePosition(start, end, fraction) {
    return [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction
    ];
  }

  /**
   * 查找离给定点最近的道路线段
   * @param {Array} point - 点坐标 [经度, 纬度]
   * @returns {Object|null} 最近的线段信息
   */
  findNearestRoadSegment(point) {
    if (this.roadSegments.length === 0) return null;
    
    let minDistance = Infinity;
    let nearestSegment = null;
    let projectionPoint = null;
    let projectionProgress = 0;
    
    this.roadSegments.forEach(segment => {
      const { start, end } = segment;
      const result = this.pointToLineProjection(point, start, end);
      
      if (result.distance < minDistance) {
        minDistance = result.distance;
        nearestSegment = segment;
        projectionPoint = result.point;
        projectionProgress = result.progress;
      }
    });
    
    return {
      segment: nearestSegment,
      point: projectionPoint,
      progress: projectionProgress,
      distance: minDistance
    };
  }

  /**
   * 计算点到线段的投影
   * @param {Array} point - 点 [lon, lat]
   * @param {Array} lineStart - 线段起点 [lon, lat]
   * @param {Array} lineEnd - 线段终点 [lon, lat]
   * @returns {Object} 投影结果
   */
  pointToLineProjection(point, lineStart, lineEnd) {
    const [x, y] = point;
    const [x1, y1] = lineStart;
    const [x2, y2] = lineEnd;
    
    const lengthSquared = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    
    if (lengthSquared === 0) {
      return {
        point: lineStart,
        progress: 0,
        distance: calculateDistance(point, lineStart)
      };
    }
    
    const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lengthSquared));
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    
    return {
      point: [projX, projY],
      progress: t,
      distance: calculateDistance([x, y], [projX, projY])
    };
  }

  /**
   * 计算点在线段上的进度
   * @param {Object} segment - 线段
   * @param {Array} point - 点坐标
   * @returns {number} 进度值 (0-1)
   */
  findProgressOnSegment(segment, point) {
    const result = this.pointToLineProjection(point, segment.start, segment.end);
    return result.progress;
  }

  /**
   * 获取当前骑行状态统计
   * @returns {Object} 统计信息
   */
  getRidingStats() {
    const totalBikes = bikeStore.getAllBikes().filter(bike => bike.source === 'random').length;
    const ridingCount = this.ridingBikes.size;
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
   * @returns {boolean} 当前激活状态
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
    console.log('BikeMovementManager 已销毁');
  }
}

// 创建单例实例
const bikeMovementManager = new BikeMovementManager();

export default bikeMovementManager;