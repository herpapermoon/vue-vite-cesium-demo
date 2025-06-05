import Cesium from '@/cesiumUtils/cesium'
import ship0 from '@/assets/ships/ship0.png'
import ship3 from '@/assets/ships/ship3.png'
import { getNextConnectedSegment, getRandomRoadSegment, findNearestRoadSegment, interpolatePosition } from './roadNetwork'
import { calculateDistance } from './randomPoints'

// 单车高度（米）
const BIKE_HEIGHT = 17;

// 全局存储容器
let preRender       // 预渲染事件句柄 - 用于动态移动车辆
let bikesData = [] // 校园单车数据存储
let lastStateUpdateTime = Date.now() // 上次状态更新时间

// 状态转换概率和时间间隔配置
const STATE_TRANSITION = {
  CHECK_INTERVAL: 5000,  // 检查状态转换的时间间隔（毫秒）
  PARKED_TO_RIDING: 0.05, // 停车转为骑行的概率 (每次检查有5%概率转换)
  RIDING_TO_PARKED: 0.08  // 骑行转为停车的概率 (每次检查有8%概率转换)
};

// 移动相关配置
const MOVEMENT_CONFIG = {
  STOP_PROBABILITY: 0.15,        // 在线段终点停车的概率 (15%概率停车)
  CONTINUE_PROBABILITY: 0.85,    // 继续移动到下一线段的概率 (85%概率继续)
  MAX_SEGMENT_VISITS: 50,        // 最大访问线段数量，防止无限循环
  SPEED_MIN: 0.0005,             // 最小移动速度
  SPEED_MAX: 0.0015,             // 最大移动速度
  TRANSITION_DURATION_MIN: 1.5,   // 过渡动画最小时长（秒）
  TRANSITION_DURATION_MAX: 3.0,   // 过渡动画最大时长（秒）
  SEARCH_RADIUS: 200,            // 寻找道路的搜索半径（米）
  SEGMENT_TRANSITION_DURATION: 0.8, // 线段切换过渡时长（秒）
  PARKING_TRANSITION_DURATION: 2.0  // 停车过渡时长（秒）
};

/**
 * 校园单车状态枚举
 */
export const BikeStatus = {
  PARKED: 'parked',     // 停车状态
  RIDING: 'riding'      // 骑行状态
}

// 状态对应的图标映射
const statusIconMap = {
  [BikeStatus.PARKED]: ship0,    // 停车状态 - ship0
  [BikeStatus.RIDING]: ship3      // 骑行状态 - ship3
}

// 根据状态获取对应的图标
export const getIconByStatus = (status) => {
  return statusIconMap[status] || ship0; // 默认使用ship0
}

/**
 * 统一的位置移动系统
 * 处理所有类型的位置变化：线段移动、线段切换、停车等
 * @param {Object} bike - 单车对象
 */
const updateBikeMovement = (bike) => {
  if (!bike || !bike.billboard) {
    return;
  }

  // 1. 处理移动过渡（从一个位置移动到另一个位置）
  if (bike.movementTransition) {
    updateMovementTransition(bike);
    return;
  }

  // 2. 处理正常的线段移动（只有骑行状态的车辆）
  if (bike.status === BikeStatus.RIDING && bike.routeInfo) {
    updateBikePositionAlongRoad(bike);
  }
};

/**
 * 处理移动过渡动画
 * @param {Object} bike - 单车对象
 */
const updateMovementTransition = (bike) => {
  const transition = bike.movementTransition;
  const now = Date.now();
  const elapsed = (now - transition.startTime) / 1000;
  const progress = Math.min(elapsed / transition.duration, 1);

  if (progress >= 1) {
    // 过渡完成
    const finalPosition = transition.targetPosition;
    
    // 更新最终位置
    bike.longitude = finalPosition[0];
    bike.latitude = finalPosition[1];
    
    const newPosition = Cesium.Cartesian3.fromDegrees(
      finalPosition[0], 
      finalPosition[1], 
      BIKE_HEIGHT
    );
    bike.position = newPosition.clone();
    bike.billboard.position = newPosition;

    // 执行过渡完成后的回调
    if (transition.onComplete) {
      transition.onComplete(bike);
    }

    // 清除过渡状态
    delete bike.movementTransition;
    
    console.log(`🚲 单车 ${bike.id} 移动过渡完成，到达位置 [${finalPosition[0].toFixed(6)}, ${finalPosition[1].toFixed(6)}]`);
  } else {
    // 计算当前位置（线性插值）
    const startPos = transition.startPosition;
    const targetPos = transition.targetPosition;
    
    const currentLon = startPos[0] + (targetPos[0] - startPos[0]) * progress;
    const currentLat = startPos[1] + (targetPos[1] - startPos[1]) * progress;
    
    // 更新位置
    bike.longitude = currentLon;
    bike.latitude = currentLat;
    
    const newPosition = Cesium.Cartesian3.fromDegrees(currentLon, currentLat, BIKE_HEIGHT);
    bike.position = newPosition.clone();
    bike.billboard.position = newPosition;
  }
};

/**
 * 启动移动过渡
 * @param {Object} bike - 单车对象
 * @param {Array} targetPosition - 目标位置 [经度, 纬度]
 * @param {number} duration - 移动时长（秒）
 * @param {Function} onComplete - 完成后的回调函数
 */
const startMovementTransition = (bike, targetPosition, duration, onComplete = null) => {
  bike.movementTransition = {
    startTime: Date.now(),
    duration: duration,
    startPosition: [bike.longitude, bike.latitude],
    targetPosition: targetPosition,
    onComplete: onComplete
  };
  
  console.log(`🚲 单车 ${bike.id} 开始移动过渡：从 [${bike.longitude.toFixed(6)}, ${bike.latitude.toFixed(6)}] 到 [${targetPosition[0].toFixed(6)}, ${targetPosition[1].toFixed(6)}]，用时 ${duration} 秒`);
};

/**
 * 沿道路更新单车位置（支持跨线段连续移动，防止调头）
 * @param {Object} bike - 单车对象
 */
const updateBikePositionAlongRoad = (bike) => {
  if (!bike.routeInfo) {
    return;
  }

  const { currentSegment, progress, speed, direction } = bike.routeInfo;
  
  // 更新进度
  let newProgress = progress + speed * direction;
  
  // 如果到达线段终点或起点，决定是否继续移动还是停车
  if ((newProgress >= 1 && direction === 1) || (newProgress <= 0 && direction === -1)) {
    
    // 检查是否已访问太多线段，如果是则强制停车
    if (bike.routeInfo.segmentVisitCount >= MOVEMENT_CONFIG.MAX_SEGMENT_VISITS) {
      console.log(`单车 ${bike.id} 达到最大访问线段数 (${MOVEMENT_CONFIG.MAX_SEGMENT_VISITS})，强制停车`);
      stopBikeAtCurrentEndpoint(bike, currentSegment, direction);
      return;
    }
    
    // 随机决定是否停车还是继续移动
    const shouldStop = Math.random() < MOVEMENT_CONFIG.STOP_PROBABILITY;
    
    if (shouldStop) {
      // 停车：在当前终点位置附近找一个停车点
      console.log(`单车 ${bike.id} 随机决定停车 (已访问 ${bike.routeInfo.segmentVisitCount} 个线段)`);
      stopBikeAtCurrentEndpoint(bike, currentSegment, direction);
      return;
    } else {
      // 继续移动：寻找下一个连接的线段（不能调头）
      const nextSegmentInfo = findNextNonReversalSegment(bike, currentSegment, direction);
      
      if (nextSegmentInfo) {
        // 平滑切换到下一个线段
        transitionToNextSegment(bike, nextSegmentInfo);
        return;
      } else {
        // 如果找不到合适的下一个线段（不调头），停车
        console.log(`单车 ${bike.id} 找不到合适的下一个线段（避免调头），停车`);
        stopBikeAtCurrentEndpoint(bike, currentSegment, direction);
        return;
      }
    }
  }
  
  // 更新当前线段的进度
  bike.routeInfo.progress = newProgress;
  
  // 计算新位置
  const [startLon, startLat] = currentSegment.start;
  const [endLon, endLat] = currentSegment.end;
  
  const newLon = startLon + newProgress * (endLon - startLon);
  const newLat = startLat + newProgress * (endLat - startLat);
  
  // 更新位置
  const newPosition = Cesium.Cartesian3.fromDegrees(newLon, newLat, BIKE_HEIGHT);
  bike.position = newPosition.clone();
  bike.billboard.position = newPosition;
  bike.longitude = newLon;
  bike.latitude = newLat;
};

/**
 * 寻找下一个非调头的线段
 * @param {Object} bike - 单车对象
 * @param {Object} currentSegment - 当前线段
 * @param {number} direction - 当前方向
 * @returns {Object|null} 下一个线段信息或null
 */
const findNextNonReversalSegment = (bike, currentSegment, direction) => {
  // 获取当前线段的终点位置
  const currentEndpoint = direction === 1 ? currentSegment.end : currentSegment.start;
  
  // 获取上一个线段信息（用于防止调头）
  const previousSegment = bike.routeInfo.previousSegment;
  
  // 获取所有连接到当前终点的线段
  const nextSegmentInfo = getNextConnectedSegment(currentSegment, direction);
  
  if (!nextSegmentInfo) {
    return null;
  }
  
  const nextSegment = nextSegmentInfo.segment;
  const nextDirection = nextSegmentInfo.direction;
  
  // 防止调头：检查下一个线段是否是上一个线段的反向
  if (previousSegment && areSameSegmentReversed(nextSegment, nextDirection, previousSegment.segment, previousSegment.direction)) {
    console.log(`单车 ${bike.id} 避免调头：下一个线段 ${nextSegment.id} 是上一个线段的反向`);
    
    // 尝试寻找其他可选的线段
    const alternativeSegments = findAlternativeSegments(currentEndpoint, currentSegment, previousSegment);
    
    if (alternativeSegments.length > 0) {
      // 随机选择一个替代线段
      const randomIndex = Math.floor(Math.random() * alternativeSegments.length);
      const alternativeSegment = alternativeSegments[randomIndex];
      
      console.log(`单车 ${bike.id} 选择替代线段 ${alternativeSegment.segment.id}`);
      return alternativeSegment;
    } else {
      // 没有其他选择，返回null（将导致停车）
      return null;
    }
  }
  
  // 检查是否重复访问过多次同一线段
  const nextSegmentId = nextSegment.id;
  if (bike.routeInfo.visitedSegments.has(nextSegmentId)) {
    // 如果已访问过，有一定概率停车避免死循环
    if (Math.random() < 0.3) { // 30%概率停车
      console.log(`单车 ${bike.id} 避免重复访问线段 ${nextSegmentId}，停车`);
      return null;
    }
  }
  
  return nextSegmentInfo;
};

/**
 * 检查两个线段是否是同一线段的反向
 * @param {Object} segment1 - 线段1
 * @param {number} direction1 - 线段1方向
 * @param {Object} segment2 - 线段2
 * @param {number} direction2 - 线段2方向
 * @returns {boolean} 是否是反向
 */
const areSameSegmentReversed = (segment1, direction1, segment2, direction2) => {
  // 如果是同一个线段且方向相反
  if (segment1.id === segment2.id && direction1 !== direction2) {
    return true;
  }
  
  // 如果是不同线段但连接相同的两个点（双向道路）
  const seg1Start = direction1 === 1 ? segment1.start : segment1.end;
  const seg1End = direction1 === 1 ? segment1.end : segment1.start;
  const seg2Start = direction2 === 1 ? segment2.start : segment2.end;
  const seg2End = direction2 === 1 ? segment2.end : segment2.start;
  
  // 检查起点和终点是否相反对应
  const tolerance = 0.0001; // 容差
  const startMatches = Math.abs(seg1Start[0] - seg2End[0]) < tolerance && 
                      Math.abs(seg1Start[1] - seg2End[1]) < tolerance;
  const endMatches = Math.abs(seg1End[0] - seg2Start[0]) < tolerance && 
                    Math.abs(seg1End[1] - seg2Start[1]) < tolerance;
  
  return startMatches && endMatches;
};

/**
 * 寻找替代线段（在当前终点处）
 * @param {Array} endpoint - 当前终点坐标
 * @param {Object} currentSegment - 当前线段
 * @param {Object} previousSegment - 上一个线段
 * @returns {Array} 可选的替代线段数组
 */
const findAlternativeSegments = (endpoint, currentSegment, previousSegment) => {
  // 这里需要调用 roadNetwork 模块的函数来获取连接到指定端点的所有线段
  // 由于原代码中没有这个函数，我们暂时返回空数组
  // 在实际使用中，需要在 roadNetwork.js 中实现 getSegmentsAtPoint 函数
  
  // TODO: 实现获取连接到指定点的所有线段的功能
  // const connectedSegments = getSegmentsAtPoint(endpoint);
  // return connectedSegments.filter(segInfo => 
  //   !areSameSegmentReversed(segInfo.segment, segInfo.direction, currentSegment, currentDirection) &&
  //   !areSameSegmentReversed(segInfo.segment, segInfo.direction, previousSegment.segment, previousSegment.direction)
  // );
  
  return []; // 临时返回空数组
};

/**
 * 平滑切换到下一个线段
 * @param {Object} bike - 单车对象
 * @param {Object} nextSegmentInfo - 下一个线段信息
 */
const transitionToNextSegment = (bike, nextSegmentInfo) => {
  const nextSegment = nextSegmentInfo.segment;
  const nextDirection = nextSegmentInfo.direction;
  const startProgress = nextSegmentInfo.startProgress;
  
  // 记录当前线段作为上一个线段（用于防止调头）
  const previousSegmentInfo = {
    segment: bike.routeInfo.currentSegment,
    direction: bike.routeInfo.direction
  };
  
  // 计算目标位置（下一个线段的起始位置）
  const [startLon, startLat] = nextSegment.start;
  const [endLon, endLat] = nextSegment.end;
  const targetLon = startLon + startProgress * (endLon - startLon);
  const targetLat = startLat + startProgress * (endLat - startLat);
  
  // 启动移动过渡到下一个线段的起始位置
  startMovementTransition(
    bike,
    [targetLon, targetLat],
    MOVEMENT_CONFIG.SEGMENT_TRANSITION_DURATION,
    (bike) => {
      // 过渡完成后，切换到新线段
      bike.routeInfo.previousSegment = previousSegmentInfo; // 记录上一个线段
      bike.routeInfo.currentSegment = nextSegment;
      bike.routeInfo.direction = nextDirection;
      bike.routeInfo.progress = startProgress;
      
      // 更新访问记录
      bike.routeInfo.visitedSegments.add(nextSegment.id);
      bike.routeInfo.segmentVisitCount++;
      
      // 可选：随机调整速度，增加真实感
      if (Math.random() < 0.1) { // 10%概率调整速度
        bike.routeInfo.speed = MOVEMENT_CONFIG.SPEED_MIN + 
          Math.random() * (MOVEMENT_CONFIG.SPEED_MAX - MOVEMENT_CONFIG.SPEED_MIN);
      }
      
      console.log(`单车 ${bike.id} 已切换到线段 ${nextSegment.id}，方向 ${nextDirection} (总计访问 ${bike.routeInfo.segmentVisitCount} 个线段)`);
    }
  );
};

/**
 * 在当前终点停车（使用移动过渡）
 * @param {Object} bike - 单车对象
 * @param {Object} currentSegment - 当前线段
 * @param {number} direction - 当前方向
 */
const stopBikeAtCurrentEndpoint = (bike, currentSegment, direction) => {
  // 当前终点位置
  const currentEndpoint = direction === 1 ? currentSegment.end : currentSegment.start;
  
  // 在当前终点附近随机选择一个点停车
  const randomOffset = 0.00005 + Math.random() * 0.0001; // 约5-15米的随机偏移
  const randomAngle = Math.random() * Math.PI * 2; // 随机角度
  
  const stopLon = currentEndpoint[0] + randomOffset * Math.cos(randomAngle);
  const stopLat = currentEndpoint[1] + randomOffset * Math.sin(randomAngle);
  
  // 启动移动过渡到停车位置
  startMovementTransition(
    bike,
    [stopLon, stopLat],
    MOVEMENT_CONFIG.PARKING_TRANSITION_DURATION,
    (bike) => {
      // 过渡完成后，更新状态为停车
      bike.status = BikeStatus.PARKED;
      bike.lastUpdated = Date.now();
      bike.billboard.image = getIconByStatus(BikeStatus.PARKED);
      
      // 删除路径信息
      delete bike.routeInfo;
      
      console.log(`单车 ${bike.id} 已停车在终点位置 [${bike.longitude.toFixed(6)}, ${bike.latitude.toFixed(6)}]`);
      
      // 触发一辆停车状态的单车开始骑行，保持动态平衡
      setTimeout(() => {
        startRandomParkedBike();
      }, 1000 + Math.random() * 4000); // 1-5秒后启动另一辆车
    }
  );
};

/**
 * 随机选择一辆停车状态的单车开始骑行
 */
const startRandomParkedBike = () => {
  // 获取所有停车状态的单车
  const parkedBikes = bikesData.filter(bike => 
    bike.status === BikeStatus.PARKED && !bike.movementTransition
  );
  
  // 如果没有停车状态的单车，直接返回
  if (parkedBikes.length === 0) {
    return;
  }
  
  // 限制同时骑行的单车数量
  const ridingBikes = bikesData.filter(bike => bike.status === BikeStatus.RIDING);
  const maxRidingBikes = Math.max(1, Math.floor(bikesData.length * 0.25)); // 最多25%的车在骑行
  
  if (ridingBikes.length >= maxRidingBikes) {
    return;
  }
  
  // 随机选择一辆单车
  const randomBike = parkedBikes[Math.floor(Math.random() * parkedBikes.length)];
  
  // 查找最近的道路线段
  const nearestRoad = findNearestRoadSegment([randomBike.longitude, randomBike.latitude]);
  
  // 如果找到了合适的道路线段
  if (nearestRoad && nearestRoad.distance < MOVEMENT_CONFIG.SEARCH_RADIUS) {
    startBikeRiding(randomBike, nearestRoad);
  }
};

/**
 * 启动单车骑行（使用移动过渡）
 * @param {Object} bike - 单车对象
 * @param {Object} nearestRoad - 最近的道路信息
 */
const startBikeRiding = (bike, nearestRoad) => {
  const { segment, point, progress } = nearestRoad;
  const direction = Math.random() > 0.5 ? 1 : -1;
  
  // 更新状态为骑行
  bike.status = BikeStatus.RIDING;
  bike.lastUpdated = Date.now();
  
  // 更新图标
  if (bike.billboard) {
    bike.billboard.image = getIconByStatus(BikeStatus.RIDING);
  }
  
  // 启动移动过渡到道路上
  startMovementTransition(
    bike,
    point,
    MOVEMENT_CONFIG.TRANSITION_DURATION_MIN + 
      Math.random() * (MOVEMENT_CONFIG.TRANSITION_DURATION_MAX - MOVEMENT_CONFIG.TRANSITION_DURATION_MIN),
    (bike) => {
      // 过渡完成后，创建路径信息
      bike.routeInfo = {
        currentSegment: segment,
        previousSegment: null, // 初始时没有上一个线段
        progress: progress,
        speed: MOVEMENT_CONFIG.SPEED_MIN + Math.random() * (MOVEMENT_CONFIG.SPEED_MAX - MOVEMENT_CONFIG.SPEED_MIN),
        direction: direction,
        visitedSegments: new Set([segment.id]),
        segmentVisitCount: 1
      };
      
      console.log(`单车 ${bike.id} 已开始骑行，在线段 ${segment.id} 上，方向 ${direction}`);
    }
  );
};

/**
 * 处理单车状态自动转换
 * 停车→骑行或骑行→停车
 */
const updateBikeStates = () => {
  const now = Date.now();
  
  // 检查是否到达状态更新时间
  if (now - lastStateUpdateTime < STATE_TRANSITION.CHECK_INTERVAL) {
    return;
  }
  
  lastStateUpdateTime = now;
  
  // 获取当前状态统计
  const parkedCount = bikesData.filter(bike => 
    bike.status === BikeStatus.PARKED && !bike.movementTransition
  ).length;
  const ridingCount = bikesData.filter(bike => bike.status === BikeStatus.RIDING).length;
  const totalCount = bikesData.length;
  
  // 动态调整转换概率，保持合理的骑行/停车比例
  const targetRidingRatio = 0.2; // 目标：20%的车在骑行
  const currentRidingRatio = ridingCount / totalCount;
  
  // 调整转换概率
  let parkToRideProb = STATE_TRANSITION.PARKED_TO_RIDING;
  let rideToParkProb = STATE_TRANSITION.RIDING_TO_PARKED;
  
  if (currentRidingRatio < targetRidingRatio) {
    // 骑行车辆太少，增加启动概率，减少停车概率
    parkToRideProb *= 1.5;
    rideToParkProb *= 0.7;
  } else if (currentRidingRatio > targetRidingRatio * 1.5) {
    // 骑行车辆太多，减少启动概率，增加停车概率
    parkToRideProb *= 0.6;
    rideToParkProb *= 1.3;
  }
  
  // 遍历所有单车，进行状态转换判断
  bikesData.forEach(bike => {
    // 跳过正在移动过渡中的单车
    if (bike.movementTransition) {
      return;
    }
    
    // 处理停车→骑行转换
    if (bike.status === BikeStatus.PARKED) {
      if (Math.random() < parkToRideProb) {
        // 找到最近的道路线段
        const nearestRoad = findNearestRoadSegment([bike.longitude, bike.latitude]);
        
        if (nearestRoad && nearestRoad.distance < MOVEMENT_CONFIG.SEARCH_RADIUS) {
          startBikeRiding(bike, nearestRoad);
          console.log(`单车 ${bike.id} 状态转换：停车 -> 骑行`);
        }
      }
    }
    // 处理骑行→停车转换
    else if (bike.status === BikeStatus.RIDING) {
      // 骑行时间越长，停车概率越高
      const ridingDuration = (now - bike.lastUpdated) / 1000; // 骑行时长（秒）
      const durationFactor = Math.min(ridingDuration / 300, 2); // 5分钟后概率翻倍，最多2倍
      const adjustedStopProb = rideToParkProb * (1 + durationFactor);
      
      if (Math.random() < adjustedStopProb) {
        // 在当前位置附近停车
        const randomOffset = 0.00004 + Math.random() * 0.00008; // 约4-12米的随机偏移
        const randomAngle = Math.random() * Math.PI * 2; // 随机角度
        
        const stopLon = bike.longitude + randomOffset * Math.cos(randomAngle);
        const stopLat = bike.latitude + randomOffset * Math.sin(randomAngle);
        
        // 启动移动过渡到停车位置
        startMovementTransition(
          bike,
          [stopLon, stopLat],
          MOVEMENT_CONFIG.PARKING_TRANSITION_DURATION,
          (bike) => {
            // 过渡完成后更新状态
            bike.status = BikeStatus.PARKED;
            bike.lastUpdated = now;
            
            // 更新图标
            if (bike.billboard) {
              bike.billboard.image = getIconByStatus(BikeStatus.PARKED);
            }
            
            // 清除路径信息
            const visitedCount = bike.routeInfo ? bike.routeInfo.segmentVisitCount : 0;
            delete bike.routeInfo;
            
            console.log(`单车 ${bike.id} 状态转换：骑行 -> 停车 (已访问 ${visitedCount} 个线段)`);
          }
        );
      }
    }
  });
};

/**
 * 初始化单车移动系统
 * @param {Cesium.Viewer} viewer - Cesium视图对象
 * @param {Array} bikes - 单车数据数组
 */
export const initializeBikeMovement = (viewer, bikes) => {
  bikesData = bikes;
  
  // 为骑行状态的单车初始化路径信息，支持跨线段移动
  bikesData.forEach(bike => {
    if (bike.status === BikeStatus.RIDING) {
      // 使用道路线段来移动
      const roadSegment = getRandomRoadSegment();
      if (roadSegment) {
        bike.routeInfo = {
          currentSegment: roadSegment,
          previousSegment: null, // 初始时没有上一个线段
          progress: Math.random(), // 随机起始进度
          speed: MOVEMENT_CONFIG.SPEED_MIN + Math.random() * (MOVEMENT_CONFIG.SPEED_MAX - MOVEMENT_CONFIG.SPEED_MIN),
          direction: Math.random() > 0.5 ? 1 : -1, // 随机方向
          visitedSegments: new Set([roadSegment.id]), // 记录已访问的线段
          segmentVisitCount: 1 // 访问线段计数
        };
        
        // 将位置更新为线段上的位置
        const [startLon, startLat] = roadSegment.start;
        const [endLon, endLat] = roadSegment.end;
        const progress = bike.routeInfo.progress;
        
        bike.longitude = startLon + progress * (endLon - startLon);
        bike.latitude = startLat + progress * (endLat - startLat);
        
        const newPosition = Cesium.Cartesian3.fromDegrees(bike.longitude, bike.latitude, BIKE_HEIGHT);
        bike.position = newPosition.clone();
        bike.billboard.position = newPosition;
      }
    }
  });
  
  // 启用预渲染事件处理
  preRender = viewer.scene.preRender.addEventListener(() => {
    // 更新单车状态（停车→骑行、骑行→停车）
    updateBikeStates();
    
    // 更新所有单车的移动（包括过渡和正常移动）
    bikesData.forEach(bike => {
      updateBikeMovement(bike);
    });
  });
};

/**
 * 销毁单车移动系统
 */
export const destroyBikeMovement = () => {
  if (preRender) {
    preRender();
    preRender = undefined;
  }
  
  bikesData = []; // 清空数据
};

/**
 * 获取单车统计信息
 * @returns {Object} 包含各种统计数据的对象
 */
export const getBikeStatistics = () => {
  const totalCount = bikesData.length;
  const parkedCount = bikesData.filter(bike => bike.status === BikeStatus.PARKED).length;
  const ridingCount = bikesData.filter(bike => bike.status === BikeStatus.RIDING).length;
  const movingCount = bikesData.filter(bike => bike.movementTransition).length;
  
  // 计算移动统计信息
  const ridingBikes = bikesData.filter(bike => bike.status === BikeStatus.RIDING && bike.routeInfo);
  const averageSegmentVisits = ridingBikes.length > 0 ? 
    ridingBikes.reduce((sum, bike) => sum + (bike.routeInfo.segmentVisitCount || 0), 0) / ridingBikes.length : 0;
  const maxSegmentVisits = ridingBikes.length > 0 ? 
    Math.max(...ridingBikes.map(bike => bike.routeInfo.segmentVisitCount || 0)) : 0;
  
  return {
    total: totalCount,
    parked: parkedCount,
    riding: ridingCount,
    moving: movingCount,
    parkedPercentage: totalCount > 0 ? Math.round((parkedCount / totalCount) * 100) : 0,
    ridingPercentage: totalCount > 0 ? Math.round((ridingCount / totalCount) * 100) : 0,
    movingPercentage: totalCount > 0 ? Math.round((movingCount / totalCount) * 100) : 0,
    averageSegmentVisits: Math.round(averageSegmentVisits * 100) / 100,
    maxSegmentVisits: maxSegmentVisits
  };
};

/**
 * 手动启动指定数量的单车开始骑行
 * @param {number} count - 要启动的单车数量
 * @returns {number} 实际启动的单车数量
 */
export const startBikes = (count = 1) => {
  const parkedBikes = bikesData.filter(bike => 
    bike.status === BikeStatus.PARKED && !bike.movementTransition
  );
  const actualCount = Math.min(count, parkedBikes.length);
  
  for (let i = 0; i < actualCount; i++) {
    const randomIndex = Math.floor(Math.random() * parkedBikes.length);
    const bike = parkedBikes.splice(randomIndex, 1)[0]; // 移除已选择的单车避免重复
    
    // 查找最近的道路线段
    const nearestRoad = findNearestRoadSegment([bike.longitude, bike.latitude]);
    
    if (nearestRoad && nearestRoad.distance < MOVEMENT_CONFIG.SEARCH_RADIUS * 1.5) {
      startBikeRiding(bike, nearestRoad);
      console.log(`手动启动单车 ${bike.id} 开始跨线段骑行`);
    }
  }
  
  return actualCount;
};

/**
 * 手动停止指定数量的骑行单车
 * @param {number} count - 要停止的单车数量
 * @returns {number} 实际停止的单车数量
 */
export const parkBikes = (count = 1) => {
  const ridingBikes = bikesData.filter(bike => 
    bike.status === BikeStatus.RIDING && !bike.movementTransition
  );
  const actualCount = Math.min(count, ridingBikes.length);
  
  for (let i = 0; i < actualCount; i++) {
    const randomIndex = Math.floor(Math.random() * ridingBikes.length);
    const bike = ridingBikes.splice(randomIndex, 1)[0];
    
    // 在当前位置附近停车
    const randomOffset = 0.00004 + Math.random() * 0.00008;
    const randomAngle = Math.random() * Math.PI * 2;
    
    const stopLon = bike.longitude + randomOffset * Math.cos(randomAngle);
    const stopLat = bike.latitude + randomOffset * Math.sin(randomAngle);
    
    // 启动移动过渡到停车位置
    startMovementTransition(
      bike,
      [stopLon, stopLat],
      MOVEMENT_CONFIG.PARKING_TRANSITION_DURATION,
      (bike) => {
        // 过渡完成后更新状态
        bike.status = BikeStatus.PARKED;
        bike.lastUpdated = Date.now();
        
        // 更新图标
        if (bike.billboard) {
          bike.billboard.image = getIconByStatus(BikeStatus.PARKED);
        }
        
        // 清除路径信息
        const visitedCount = bike.routeInfo ? bike.routeInfo.segmentVisitCount : 0;
        delete bike.routeInfo;
        
        console.log(`手动停车单车 ${bike.id} (已访问 ${visitedCount} 个线段)`);
      }
    );
  }
  
  return actualCount;
};

/**
 * 更新单车状态
 * @param {string} id - 单车ID
 * @param {string} status - 新状态
 * @returns {boolean} 是否更新成功
 */
export const updateBikeStatus = (id, status) => {
  const bike = bikesData.find(bike => bike.id === id);
  if (bike && !bike.movementTransition) { // 避免在移动过渡中修改状态
    bike.status = status;
    bike.lastUpdated = Date.now();
    
    // 更新图标
    if (bike.billboard) {
      bike.billboard.image = getIconByStatus(status);
    }
    
    return true;
  }
  return false;
};

/**
 * 根据状态筛选单车
 * @param {string} status - 要筛选的状态
 * @returns {Array} 满足状态的单车数组
 */
export const getBikesByStatus = (status) => {
  return bikesData.filter(bike => bike.status === status);
};

/**
 * 获取指定范围内的单车
 * @param {number} centerLon - 中心点经度
 * @param {number} centerLat - 中心点纬度
 * @param {number} radiusInMeters - 半径（米）
 * @returns {Array} 该范围内的单车数组
 */
export const getBikesInRadius = (centerLon, centerLat, radiusInMeters) => {
  return bikesData.filter(bike => {
    const distance = calculateDistance([centerLon, centerLat], [bike.longitude, bike.latitude]);
    return distance <= radiusInMeters;
  });
};