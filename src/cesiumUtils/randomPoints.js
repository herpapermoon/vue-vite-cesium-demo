import Cesium from '@/cesiumUtils/cesium'
import ship0 from '@/assets/ships/ship0.png'
import ship1 from '@/assets/ships/ship1.png'
import ship2 from '@/assets/ships/ship2.png'
import ship3 from '@/assets/ships/ship3.png'
import ship4 from '@/assets/ships/ship4.png'

// 单车图标资源数组
export const bikeImages = {
  ship0, 
  ship1, 
  ship2, 
  ship3, 
  ship4
}

// 单车高度（米）
const BIKE_HEIGHT = 17;

// 全局存储容器
// let labels = []     // 标签集合 - 不再需要文字标签
let billboards = [] // 广告牌集合
// let lines = []      // 连线集合 - 不再需要动态连线
let preRender       // 预渲染事件句柄 - 用于动态移动车辆
let roadNetworkData = null // 道路网络数据
let bikesData = [] // 校园单车数据存储
let roadSegments = [] // 道路线段数据，用于移动车辆
let roadNetwork = {} // 道路网络拓扑结构，用于连续移动
let lastStateUpdateTime = Date.now() // 上次状态更新时间


/**
 * 校园单车状态枚举
 */
export const BikeStatus = {
  PARKED: 'parked',     // 停车状态
  RIDING: 'riding'      // 骑行状态
}

// 状态对应的图标映射
export const statusIconMap = {
  [BikeStatus.PARKED]: ship0,    // 停车状态 - ship0
  [BikeStatus.RIDING]: ship3,     // 骑行状态 - ship3
  'detected': ship0,              // 检测状态 - ship0
  'bicycle': ship0,               // 自行车 - ship0
  'motorcycle': ship3             // 摩托车 - ship3
}

// 根据状态获取对应的图标
export const getIconByStatus = (status) => {
  return statusIconMap[status] || ship0; // 默认使用ship0
}

/**
 * 加载道路网络数据
 * @returns {Promise<Object>} 道路网络数据
 */
const loadRoadNetwork = async () => {
  if (roadNetworkData) return roadNetworkData;
  
  try {
    // 使用 fetch 获取 GeoJSON 文件 - 修改为 wlcroad.geojson
    const response = await fetch('/src/assets/ships/wlcroad.geojson');
    roadNetworkData = await response.json();
    
    // 提取道路线段供移动使用
    extractRoadSegments(roadNetworkData);
    // 构建道路网络拓扑结构
    buildRoadNetwork();
    
    return roadNetworkData;
  } catch (error) {
    console.error('加载道路网络数据失败:', error);
    return null;
  }
};

/**
 * 从道路网络数据中提取线段
 * @param {Object} roadNetwork - 道路网络数据
 */
const extractRoadSegments = (roadNetwork) => {
  roadSegments = [];
  
  // 按道路类型筛选重要道路 - 修改为使用 fclass 属性筛选
  const mainRoads = roadNetwork.features.filter(feature => {
    const fclass = feature.properties.fclass;
    return (
      fclass === 'residential' || 
      fclass === 'living_street' || 
      fclass === 'secondary' || 
      fclass === 'tertiary' || 
      fclass === 'footway'
    );
  });
  
  // 提取每条道路的线段
  mainRoads.forEach((road, roadIndex) => {
    if (!road.geometry || !road.geometry.coordinates || road.geometry.coordinates.length === 0) {
      return;
    }
    
    // 获取道路坐标
    const coordinates = road.geometry.coordinates;
    
    // 对于 MultiLineString 类型
    if (road.geometry.type === 'MultiLineString') {
      // 遍历每条线
      coordinates.forEach((line, lineIndex) => {
        for (let i = 0; i < line.length - 1; i++) {
          const segmentId = `segment-${roadIndex}-${lineIndex}-${i}`;
          roadSegments.push({
            id: segmentId,
            start: line[i],
            end: line[i + 1],
            roadId: road.properties.fid || `road-${roadIndex}`,
            startNodeId: `node-${roadIndex}-${lineIndex}-${i}`,
            endNodeId: `node-${roadIndex}-${lineIndex}-${i+1}`
          });
        }
      });
    }
    // 对于 LineString 类型
    else if (road.geometry.type === 'LineString') {
      for (let i = 0; i < coordinates.length - 1; i++) {
        const segmentId = `segment-${roadIndex}-${i}`;
        roadSegments.push({
          id: segmentId,
          start: coordinates[i],
          end: coordinates[i + 1],
          roadId: road.properties.fid || `road-${roadIndex}`,
          startNodeId: `node-${roadIndex}-${i}`,
          endNodeId: `node-${roadIndex}-${i+1}`
        });
      }
    }
  });
  
  console.log(`提取了 ${roadSegments.length} 个道路线段`);
};

/**
 * 构建道路网络拓扑结构
 */
const buildRoadNetwork = () => {
  // 初始化网络结构
  roadNetwork = {
    nodes: {}, // 节点信息
    connections: {} // 节点连接信息
  };
  
  // 添加所有节点
  roadSegments.forEach(segment => {
    const { startNodeId, endNodeId, start, end } = segment;
    
    // 添加起始节点
    if (!roadNetwork.nodes[startNodeId]) {
      roadNetwork.nodes[startNodeId] = {
        id: startNodeId,
        position: start,
        connections: []
      };
      roadNetwork.connections[startNodeId] = [];
    }
    
    // 添加结束节点
    if (!roadNetwork.nodes[endNodeId]) {
      roadNetwork.nodes[endNodeId] = {
        id: endNodeId,
        position: end,
        connections: []
      };
      roadNetwork.connections[endNodeId] = [];
    }
    
    // 添加连接关系
    roadNetwork.connections[startNodeId].push(endNodeId);
    roadNetwork.connections[endNodeId].push(startNodeId); // 双向连接
  });
  
  // 找到每个节点的所有相邻线段
  roadSegments.forEach(segment => {
    const { id, startNodeId, endNodeId } = segment;
    
    // 将线段添加到起始节点的连接中
    roadNetwork.nodes[startNodeId].connections.push({
      segmentId: id,
      nextNodeId: endNodeId
    });
    
    // 将线段添加到结束节点的连接中 (反向)
    roadNetwork.nodes[endNodeId].connections.push({
      segmentId: id,
      nextNodeId: startNodeId
    });
  });
  
  console.log(`构建了包含 ${Object.keys(roadNetwork.nodes).length} 个节点的道路网络`);
};

/**
 * 获取与当前线段连接的下一个线段
 * @param {Object} currentSegment - 当前线段
 * @param {number} direction - 当前方向 (1:从起点到终点, -1:从终点到起点)
 * @returns {Object} 下一个线段和方向
 */
const getNextConnectedSegment = (currentSegment, direction) => {
  if (!currentSegment) return null;
  
  // 确定当前节点ID
  const currentNodeId = direction === 1 ? currentSegment.endNodeId : currentSegment.startNodeId;
  
  // 获取节点连接信息
  const node = roadNetwork.nodes[currentNodeId];
  if (!node || node.connections.length === 0) return null;
  
  // 随机选择一个连接（排除当前线段）
  const availableConnections = node.connections.filter(
    conn => conn.segmentId !== currentSegment.id
  );
  
  // 如果没有其他连接，允许在当前线段上掉头
  if (availableConnections.length === 0) {
    return {
      segment: currentSegment,
      direction: -direction, // 反向
      startProgress: direction === 1 ? 1 : 0 // 从当前点开始反向
    };
  }
  
  // 随机选择下一个连接，增加随机性
  const randomIndex = Math.floor(Math.random() * availableConnections.length);
  const randomConnection = availableConnections[randomIndex];
  
  // 找到对应的线段
  const nextSegment = roadSegments.find(seg => seg.id === randomConnection.segmentId);
  if (!nextSegment) return null;
  
  // 确定新线段的方向
  // 如果连接的下一个节点是新线段的起点，则方向为1；如果是终点，则方向为-1
  const nextDirection = randomConnection.nextNodeId === nextSegment.startNodeId ? 1 : -1;
  
  return {
    segment: nextSegment,
    direction: nextDirection,
    startProgress: nextDirection === 1 ? 0 : 1 // 从起点或终点开始
  };
};

/**
 * 获取两个坐标点之间的线性插值点
 * @param {Array} start - 起始点 [lon, lat]
 * @param {Array} end - 结束点 [lon, lat]
 * @param {number} fraction - 插值比例 (0-1)
 * @returns {Array} 插值点 [lon, lat]
 */
const interpolatePosition = (start, end, fraction) => {
  return [
    start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction
  ];
};

/**
 * 随机获取一个道路线段
 * @returns {Object} 随机线段 { start, end, roadId }
 */
const getRandomRoadSegment = () => {
  if (roadSegments.length === 0) return null;
  return roadSegments[Math.floor(Math.random() * roadSegments.length)];
};

/**
 * 查找离给定点最近的道路线段
 * @param {Array} point - 点坐标 [经度, 纬度]
 * @returns {Object} 最近的线段和投影点信息
 */
const findNearestRoadSegment = (point) => {
  if (roadSegments.length === 0) return null;
  
  let minDistance = Infinity;
  let nearestSegment = null;
  let projectionPoint = null;
  let projectionProgress = 0;
  
  roadSegments.forEach(segment => {
    const { start, end } = segment;
    const [x, y] = point;
    const [x1, y1] = start;
    const [x2, y2] = end;
    
    // 计算线段长度的平方
    const lengthSquared = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    
    // 如果线段长度为0，直接计算到起点的距离
    if (lengthSquared === 0) {
      const distance = calculateDistance(point, start);
      if (distance < minDistance) {
        minDistance = distance;
        nearestSegment = segment;
        projectionPoint = start;
        projectionProgress = 0;
      }
      return;
    }
    
    // 计算投影点的参数
    const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lengthSquared));
    
    // 计算投影点坐标
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    
    // 计算距离
    const distance = calculateDistance([x, y], [projX, projY]);
    
    if (distance < minDistance) {
      minDistance = distance;
      nearestSegment = segment;
      projectionPoint = [projX, projY];
      projectionProgress = t;
    }
  });
  
  return {
    segment: nearestSegment,
    point: projectionPoint,
    progress: projectionProgress,
    distance: minDistance
  };
};

/**
 * 计算两点之间的距离（米）
 * @param {Array} point1 - 点1 [经度, 纬度]
 * @param {Array} point2 - 点2 [经度, 纬度]
 * @returns {number} 距离（米）
 */
export const calculateDistance = (point1, point2) => {
  const R = 6371000; // 地球半径（米）
  const [lon1, lat1] = point1;
  const [lon2, lat2] = point2;
  
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

/**
 * 计算点到线段的最短距离
 * @param {Array} point - 点 [经度, 纬度]
 * @param {Array} lineStart - 线段起点 [经度, 纬度]
 * @param {Array} lineEnd - 线段终点 [经度, 纬度]
 * @returns {number} 距离（米）
 */
const pointToLineDistance = (point, lineStart, lineEnd) => {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  
  // 计算线段长度的平方
  const lengthSquared = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  
  // 如果线段长度为0，直接返回点到起点的距离
  if (lengthSquared === 0) return calculateDistance(point, lineStart);
  
  // 计算投影点的参数
  const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lengthSquared));
  
  // 计算投影点坐标
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  
  // 返回点到投影点的距离
  return calculateDistance([x, y], [projX, projY]);
};

/**
 * 在道路附近生成随机点
 * @param {Object} roadNetwork - 道路网络数据
 * @param {number} count - 生成点的数量
 * @param {number} minDistance - 距离道路的最小距离(米)
 * @param {number} maxDistance - 距离道路的最大距离(米)
 * @param {Array} bounds - 边界 [minLon, minLat, maxLon, maxLat]
 * @returns {Array} 生成的点 [[lon, lat], ...]
 */
const generatePointsNearRoads = (roadNetwork, count, minDistance = 10, maxDistance = 100, bounds = [114.605, 30.45, 114.62, 30.465]) => {
  const points = [];
  const features = roadNetwork.features;
  const [minLon, minLat, maxLon, maxLat] = bounds;
  
  // 按道路类型筛选道路 - 修改为使用 fclass 属性筛选
  const mainRoads = features.filter(feature => {
    const fclass = feature.properties.fclass;
    return (
      fclass === 'residential' || 
      fclass === 'living_street' || 
      fclass === 'secondary' || 
      fclass === 'tertiary' || 
      fclass === 'footway'
    );
  });
  
  const attemptCount = count * 10; // 尝试次数，避免无限循环
  let attempts = 0;
  
  while (points.length < count && attempts < attemptCount) {
    attempts++;
    
    // 随机选择一条道路
    const roadIndex = Math.floor(Math.random() * mainRoads.length);
    const road = mainRoads[roadIndex];
    
    if (!road.geometry || !road.geometry.coordinates || road.geometry.coordinates.length === 0) {
      continue;
    }
    
    // 获取道路坐标
    const coordinates = road.geometry.coordinates;
    
    // 对于 MultiLineString 类型
    if (road.geometry.type === 'MultiLineString') {
      // 随机选择一条线
      const lineIndex = Math.floor(Math.random() * coordinates.length);
      const line = coordinates[lineIndex];
      
      // 随机选择线段
      const segmentIndex = Math.floor(Math.random() * (line.length - 1));
      const start = line[segmentIndex];
      const end = line[segmentIndex + 1];
      
      // 在线段上随机选择一个点
      const t = Math.random();
      const baseX = start[0] + t * (end[0] - start[0]);
      const baseY = start[1] + t * (end[1] - start[1]);
      
      // 计算垂直于线段的方向
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.sqrt(dx * dx + dy * dy);
      
      if (length === 0) continue;
      
      // 垂直向量
      const perpX = -dy / length;
      const perpY = dx / length;
      
      // 随机距离，在minDistance到maxDistance之间
      const distance = minDistance + Math.random() * (maxDistance - minDistance);
      
      // 随机决定方向（左侧或右侧）
      const direction = Math.random() > 0.5 ? 1 : -1;
      
      // 计算最终点坐标
      // 将距离从米转换为度（粗略估计：1度约等于111km）
      const distanceDeg = distance / 111000;
      const finalX = baseX + direction * perpX * distanceDeg;
      const finalY = baseY + direction * perpY * distanceDeg;
      
      // 检查是否在边界内
      if (finalX >= minLon && finalX <= maxLon && finalY >= minLat && finalY <= maxLat) {
        points.push([finalX, finalY]);
      }
    }
    // 对于 LineString 类型
    else if (road.geometry.type === 'LineString') {
      // 随机选择线段
      const segmentIndex = Math.floor(Math.random() * (coordinates.length - 1));
      const start = coordinates[segmentIndex];
      const end = coordinates[segmentIndex + 1];
      
      // 在线段上随机选择一个点
      const t = Math.random();
      const baseX = start[0] + t * (end[0] - start[0]);
      const baseY = start[1] + t * (end[1] - start[1]);
      
      // 计算垂直于线段的方向
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.sqrt(dx * dx + dy * dy);
      
      if (length === 0) continue;
      
      // 垂直向量
      const perpX = -dy / length;
      const perpY = dx / length;
      
      // 随机距离，在minDistance到maxDistance之间
      const distance = minDistance + Math.random() * (maxDistance - minDistance);
      
      // 随机决定方向（左侧或右侧）
      const direction = Math.random() > 0.5 ? 1 : -1;
      
      // 计算最终点坐标
      // 将距离从米转换为度（粗略估计：1度约等于111km）
      const distanceDeg = distance / 111000;
      const finalX = baseX + direction * perpX * distanceDeg;
      const finalY = baseY + direction * perpY * distanceDeg;
      
      // 检查是否在边界内
      if (finalX >= minLon && finalX <= maxLon && finalY >= minLat && finalY <= maxLat) {
        points.push([finalX, finalY]);
      }
    }
  }
  
  return points;
};

/**
 * 生成随机坐标点，沿道路网分布
 * @param {number} count - 生成的坐标点数量
 * @param {Array} center - 中心点坐标 [纬度, 经度, 高度]
 * @returns {Promise<Cesium.Cartesian3[]>} 三维笛卡尔坐标数组
 */
const generatePos = async (count = 200, center = [30.457, 114.615, 0]) => {
  // 加载道路网络数据
  const roadNetwork = await loadRoadNetwork();
  
  if (!roadNetwork) {
    // 如果加载失败，使用原有的随机生成逻辑
    console.warn('道路网络数据加载失败，使用随机分布');
    return generateRandomPos(count, center);
  }
  
  // 生成道路附近的点
  const [baseLat, baseLon, baseH] = center;
  const points = generatePointsNearRoads(
    roadNetwork, 
    count, 
    10,  // 最小距离10米
    100, // 最大距离100米
    [baseLon - 0.015, baseLat - 0.01, baseLon + 0.015, baseLat + 0.01] // 范围约束 - 已调整为wlcroad区域
  );
  
  // 如果生成的点不足，用随机点补充
  if (points.length < count) {
    console.warn(`仅生成了${points.length}个道路附近的点，将用随机点补充`);
    const randomPoints = generateRandomPos(count - points.length, center);
    
    // 转换生成的路点为Cesium.Cartesian3
    const roadPoints = points.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, baseH + BIKE_HEIGHT));
    
    // 合并道路点和随机点
    return [...roadPoints, ...randomPoints];
  }
  
  // 转换生成的点为Cesium.Cartesian3
  return points.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, baseH + BIKE_HEIGHT));
};

/**
 * 生成随机分布的点（原方法，用作备选）
 * @param {number} count - 生成的坐标点数量
 * @param {Array} center - 中心点坐标 [纬度, 经度, 高度]
 * @returns {Cesium.Cartesian3[]} 三维笛卡尔坐标数组
 */
const generateRandomPos = (count = 200, center = [30.457, 114.615, 0]) => {
  const [baseLat, baseLon, baseH] = center;
  
  return Array(count).fill().map(() => {
    // 限制生成范围（纬度±0.01度 ≈ 1.1km，经度±0.015度 ≈ 1.5km）
    const latOffset = (Math.random() * 0.02 - 0.01);  // 纬度范围
    const lonOffset = (Math.random() * 0.03 - 0.015); // 经度范围
    
    // 转换为Cesium三维坐标
    return Cesium.Cartesian3.fromDegrees(
      baseLon + lonOffset,  // 东经偏移
      baseLat + latOffset,  // 北纬偏移
      baseH + BIKE_HEIGHT   // 固定高度 + 单车高度(10米)
    );
  });
};

/**
 * 生成随机位移量（用于动画效果）
 * @param {number} range - 位移幅度范围
 * @returns {number} 随机位移值
 */
const generateDis = (range = 500) => Math.random() * range - range / 2;

/**
 * 执行图元动画效果
 * @param {Cesium.Primitive} primitive - 图元对象
 * @param {number[]} pos - 位移向量
 */
const animatePrimitive = (primitive, pos) => {
  const positionScratch = new Cesium.Cartesian3();
  Cesium.Cartesian3.clone(primitive.position, positionScratch);
  Cesium.Cartesian3.add(positionScratch, new Cesium.Cartesian3(...pos), positionScratch);
  primitive.position = positionScratch;
};


const updateBikeStates = () => {
  const now = Date.now();
  
  // 检查是否到达状态更新时间
  if (now - lastStateUpdateTime < STATE_TRANSITION.CHECK_INTERVAL) {
    return;
  }
  
  lastStateUpdateTime = now;
  
  // 遍历所有单车
  bikesData.forEach(bike => {
    // 处理停车→骑行转换
    if (bike.status === BikeStatus.PARKED) {
      if (Math.random() < STATE_TRANSITION.PARKED_TO_RIDING) {
        // 找到最近的道路线段
        const nearestRoad = findNearestRoadSegment([bike.longitude, bike.latitude]);
        
        if (nearestRoad && nearestRoad.distance < 100) { // 只有在道路100米范围内才转换
          // 开始过渡到骑行状态
          const { segment, point, progress } = nearestRoad;
          
          // 随机决定方向
          const direction = Math.random() > 0.5 ? 1 : -1;
          
          // 更新状态，使用随机历史时间
          bike.status = BikeStatus.RIDING;
          bike.lastUpdated = generateRandomTimeStamp(2); // 使用较短期间内的随机时间
          
          // 更新图标
          if (bike.billboard) {
            bike.billboard.image = getIconByStatus(BikeStatus.RIDING);
          }
          
          // 创建路径信息
          bike.routeInfo = {
            currentSegment: segment,
            progress: progress,
            speed: 0.001 + Math.random() * 0.002, // 随机速度
            direction: direction,
            visitedSegments: new Set([segment.id]) // 记录当前线段为已访问
          };
          
          // 设置平滑过渡到道路上
          bike.routeInfo.transition = {
            startTime: now,
            duration: 2.0, // 2秒过渡
            startPos: [bike.longitude, bike.latitude],
            endPos: point,
            segmentAfterTransition: {
              segment: segment,
              direction: direction,
              startProgress: progress
            }
          };
        }
      }
    }
    // 处理骑行→停车转换
    else if (bike.status === BikeStatus.RIDING) {
      if (Math.random() < STATE_TRANSITION.RIDING_TO_PARKED) {
        // 当前位置已经记录在bike.longitude和bike.latitude中
        
        // 更新状态，使用随机历史时间
        bike.status = BikeStatus.PARKED;
        bike.lastUpdated = generateRandomTimeStamp(2); // 使用较短期间内的随机时间
        
        // 更新图标
        if (bike.billboard) {
          bike.billboard.image = getIconByStatus(BikeStatus.PARKED);
        }
        
        // 清除路径信息
        delete bike.routeInfo;
      }
    }
  });
};

/**
 * 为单车生成随机的历史时间戳
 * @param {number} daysBack - 最多往前推算的天数
 * @returns {number} 随机时间戳
 */
const generateRandomTimeStamp = (daysBack = 7) => {
  const now = Date.now();
  // 计算过去daysBack天内的随机时间
  const randomOffset = Math.random() * daysBack * 24 * 60 * 60 * 1000;
  // 生成在过去daysBack天内的随机时间戳
  return now - randomOffset;
};

/**
 * 主入口：生成校园单车标记和动态连线
 * @param {Cesium.Viewer} viewer - Cesium视图对象
 * @param {number} count - 生成数量
 * @param {number} [imgIndex] - 指定图标索引（不再使用）
 */
export const randomGenerateBillboards = async (viewer, count, imgIndex) => {
  console.log(`开始生成${count}个道路网附近的随机点...`);
  
  // 导入BikeStore，确保使用同一个实例
  const bikeStore = (await import('./BikeStore')).default;
  
  // 设置Cesium视图对象
  bikeStore.setViewer(viewer);
  
  // 生成武汉市道路网附近的坐标点
  const posArr = await generatePos(count);
  
  console.log(`成功生成${posArr.length}个符合条件的点，开始创建图元...`);
  
  // 创建billboard集合
  const billboardCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
  
  // 设置图标集合到BikeStore
  bikeStore.setBillboardCollection('random', billboardCollection);
  
  // 清除之前随机生成的单车，保留视觉检测的单车
  bikeStore.clearBikesBySource('random');
  
  // 保存全局引用
  billboards = billboardCollection;
  
  // 清空现有单车数据数组
  bikesData = [];
  lastStateUpdateTime = Date.now();

  // 生成新的随机单车数据并创建实体
  for (let i = 0; i < posArr.length; i++) {
    const position = posArr[i];
    
    // 获取WGS84坐标
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    
    // 生成随机时间戳，分布在过去7天内
    const randomTimestamp = generateRandomTimeStamp(7);
    
    // 创建单车数据
    const bikeInfo = {
      id: `random-bike-${i}`,
      longitude: lon,
      latitude: lat,
      height: BIKE_HEIGHT,
      status: BikeStatus.PARKED,
      source: 'random',
      modelType: `Model-${String.fromCharCode(65 + Math.floor(Math.random() * 5))}`, // 随机型号A-E
      lastUpdated: randomTimestamp // 使用随机时间戳
    };
    
    // 使用BikeStore创建实体
    bikeStore.createBikeEntity(bikeInfo, 'random');
    
    // 同时保存到本地数组以保持向后兼容
    bikesData.push({
      ...bikeInfo,
      position: position.clone() // 保存三维坐标
    });
  }
  
  // 可以保留一个空的预渲染事件，以便将来恢复功能
  preRender = viewer.scene.preRender.addEventListener(() => {
    // 单车保持静止状态，不执行任何更新
  });
  
  // 自动调整摄像机位置
  flyToBikes(viewer, posArr);
  
  console.log(`成功创建${bikesData.length}个校园单车数据点 (全部为停车状态)`);
  return bikeStore.getAllBikes();
};

/**
 * 销毁校园单车图元
 */
export const destroyBillboard = () => {
  if (preRender) {
    preRender();
    preRender = undefined;
  }
  
  // 导入BikeStore进行清理
  try {
    const bikeStore = require('./BikeStore').default;
    // 清除随机生成的单车
    bikeStore.clearBikesBySource('random');
  } catch (error) {
    console.error('清理BikeStore失败:', error);
    
    // 回退到传统方式清理
    if (billboards) {
      billboards = billboards.destroy();
    }
  }
  
  bikesData = []; // 清空数据
};

/**
 * 获取所有校园单车数据
 * @returns {Array} 校园单车数据数组
 */
export const getAllBikes = () => {
  return bikesData;
};

/**
 * 根据ID获取单车数据
 * @param {string} id - 单车ID
 * @returns {Object|null} 单车数据对象或null
 */
export const getBikeById = (id) => {
  return bikesData.find(bike => bike.id === id) || null;
};

/**
 * 更新单车状态
 * @param {string} id - 单车ID
 * @param {string} status - 新状态
 * @returns {boolean} 是否更新成功
 */
export const updateBikeStatus = (id, status) => {
  const bike = getBikeById(id);
  if (bike) {
    const oldStatus = bike.status;
    bike.status = status;
    
    // 生成随机历史时间戳，而不是使用当前时间
    bike.lastUpdated = generateRandomTimeStamp(3); // 使用较短期间(3天)内的随机时间
    
    // 更新图标
    if (bike.billboard) {
      bike.billboard.image = getIconByStatus(status);
    }
    
    // 如果状态变为骑行，添加路径信息
    if (status === BikeStatus.RIDING && oldStatus !== BikeStatus.RIDING) {
      // 找到最近的道路线段
      const nearestRoad = findNearestRoadSegment([bike.longitude, bike.latitude]);
      
      if (nearestRoad && nearestRoad.segment) {
        const { segment, point, progress } = nearestRoad;
        
        // 随机决定方向
        const direction = Math.random() > 0.5 ? 1 : -1;
        
        bike.routeInfo = {
          currentSegment: segment,
          progress: progress,
          speed: 0.001 + Math.random() * 0.002, // 随机速度
          direction: direction,
          visitedSegments: new Set([segment.id]) // 记录已访问的线段
        };
        
        // 设置平滑过渡到道路上
        bike.routeInfo.transition = {
          startTime: Date.now(),
          duration: 2.0, // 2秒过渡
          startPos: [bike.longitude, bike.latitude],
          endPos: point,
          segmentAfterTransition: {
            segment: segment,
            direction: direction,
            startProgress: progress
          }
        };
      } else {
        // 如果找不到最近的道路，使用随机道路段
        const roadSegment = getRandomRoadSegment();
        if (roadSegment) {
          bike.routeInfo = {
            currentSegment: roadSegment,
            progress: 0,
            speed: 0.001 + Math.random() * 0.002, // 较慢的速度使移动更平滑
            direction: 1,
            visitedSegments: new Set([roadSegment.id]) // 记录已访问的线段
          };
          
          // 将位置更新为线段起点
          const [startLon, startLat] = roadSegment.start;
          
          // 设置过渡动画
          bike.routeInfo.transition = {
            startTime: Date.now(),
            duration: 3.0, // 3秒过渡时间
            startPos: [bike.longitude, bike.latitude],
            endPos: [startLon, startLat],
            segmentAfterTransition: {
              segment: roadSegment,
              direction: 1,
              startProgress: 0
            }
          };
        }
      }
    } 
    // 如果状态从骑行变为其他，移除路径信息
    else if (oldStatus === BikeStatus.RIDING && status !== BikeStatus.RIDING) {
      delete bike.routeInfo;
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

/**
 * 手动聚焦到单车分布区域
 * @param {Cesium.Viewer} viewer - Cesium视图对象
 */
export const focusOnBikes = (viewer) => {
  if (!bikesData || bikesData.length === 0) {
    console.warn('没有可用的单车数据，无法聚焦');
    return;
  }
  
  // 获取所有单车位置
  const positions = bikesData.map(bike => bike.position);
  
  // 飞向单车分布区域
  flyToBikes(viewer, positions);
};

/**
 * 生成随机点图元（测试用）
 * @param {Cesium.Viewer} viewer - Cesium视图对象
 * @param {number} count - 生成点的数量
 */
export const randomGeneratePoints = async (viewer, count) => {
  const posArr = await generatePos(count);
  const points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
  
  posArr.forEach(position => {
    points.add({
      pixelSize: 5,
      color: Cesium.Color.BLUE,
      position
    });
  });
};

/**
 * 生成动态扩散圆环效果
 * @param {Cesium.Viewer} viewer - Cesium视图对象
 * @param {Cesium.Cartesian3} position - 位置
 * @param {string} id - 唯一标识符
 * @param {number} startAlpha - 起始透明度
 * @param {number} maxSize - 最大尺寸
 * @param {number} speed - 扩散速度
 */
export const setCircles = (viewer, position, id, startAlpha = 0.6, maxSize = 100, speed = 1) => {
  const circles = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
  let size = 1;
  const circle = circles.add({ id: `circle${id}`, position });
  
  // 每帧更新圆环状态
  viewer.scene.preUpdate.addEventListener(() => {
    size += speed;
    if (size >= maxSize) size = 1;
    circle.pixelSize = size;
    circle.color = Cesium.Color.GRAY.withAlpha(startAlpha - (startAlpha/maxSize)*size);
  });
};

/**
 * 计算点集的边界盒子
 * @param {Array} positions - 位置点数组
 * @returns {Object} 包含边界信息的对象
 */
const calculateBoundingSphere = (positions) => {
  if (!positions || positions.length === 0) {
    return null;
  }
  
  // 创建一个包含所有点的包围球
  return Cesium.BoundingSphere.fromPoints(positions);
};

/**
 * 自动调整摄像机位置以显示所有点
 * @param {Cesium.Viewer} viewer - Cesium视图对象
 * @param {Array} positions - 位置点数组
 */
const flyToBikes = (viewer, positions) => {
  if (!positions || positions.length === 0) {
    return;
  }
  
  // 计算包围球
  const boundingSphere = calculateBoundingSphere(positions);
  if (!boundingSphere) {
    return;
  }
  
  // 增加视口距离，以更好地观察
  const padding = boundingSphere.radius * 0.3;
  
  // 飞向包围球
  viewer.camera.flyToBoundingSphere(boundingSphere, {
    duration: 2.0, // 飞行时间（秒）
    offset: new Cesium.HeadingPitchRange(0, -Cesium.Math.PI_OVER_FOUR, boundingSphere.radius + padding),
    complete: () => {
      console.log('摄像头已调整到校园单车分布区域');
    }
  });
};

