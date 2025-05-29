import Cesium from '@/cesiumUtils/cesium'
import ship0 from '@/assets/ships/ship0.png'
import ship1 from '@/assets/ships/ship1.png'
import ship2 from '@/assets/ships/ship2.png'
import ship3 from '@/assets/ships/ship3.png'
import ship4 from '@/assets/ships/ship4.png'

// 单车图标资源数组
const images = [ship0, ship1, ship2, ship3, ship4]

// 单车高度（米）
const BIKE_HEIGHT = 17;

// 全局存储容器
// let labels = []     // 标签集合 - 不再需要文字标签
let billboards = [] // 广告牌集合
// let lines = []      // 连线集合 - 不再需要动态连线
let preRender       // 预渲染事件句柄 - 用于动态移动车辆
let roadNetworkData = null // 道路网络数据
let bikesData = [] // 共享单车数据存储
let roadSegments = [] // 道路线段数据，用于移动车辆
let roadNetwork = {} // 道路网络拓扑结构，用于连续移动

/**
 * 共享单车状态枚举
 */
export const BikeStatus = {
  AVAILABLE: 'available', // 可用
  IN_USE: 'inUse',       // 使用中
  MAINTENANCE: 'maintenance', // 维护中
  LOW_BATTERY: 'lowBattery'   // 低电量
}

// 状态对应的图标映射
const statusIconMap = {
  [BikeStatus.AVAILABLE]: ship0,    // 可使用状态 - ship0
  [BikeStatus.IN_USE]: ship3,       // 使用中状态 - ship3
  [BikeStatus.MAINTENANCE]: ship2,  // 维护中状态 - ship2
  [BikeStatus.LOW_BATTERY]: ship1   // 低电量状态 - ship1
}

// 根据状态获取对应的图标
const getIconByStatus = (status) => {
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
  
  if (availableConnections.length === 0) return null;
  
  const randomConnection = availableConnections[
    Math.floor(Math.random() * availableConnections.length)
  ];
  
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
 * 计算两点之间的距离（米）
 * @param {Array} point1 - 点1 [经度, 纬度]
 * @param {Array} point2 - 点2 [经度, 纬度]
 * @returns {number} 距离（米）
 */
export const calculateDistance = (point1, point2) => {
  const R = 6371000; // A地球半径（米）
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

/**
 * 沿道路更新单车位置
 * @param {Object} bike - 单车对象
 */
const updateBikePositionAlongRoad = (bike) => {
  if (!bike || !bike.billboard || bike.status !== BikeStatus.IN_USE || !bike.routeInfo) {
    return;
  }
  
  // 处理过渡动画
  if (bike.routeInfo.transition) {
    const { startTime, duration, startPos, endPos, segmentAfterTransition } = bike.routeInfo.transition;
    const elapsed = (Date.now() - startTime) / 1000; // 经过的秒数
    const progress = Math.min(elapsed / duration, 1);
    
    if (progress < 1) {
      // 在起点和终点之间进行线性插值
      const [newLon, newLat] = interpolatePosition(startPos, endPos, progress);
      
      // 更新位置
      const newPosition = Cesium.Cartesian3.fromDegrees(newLon, newLat, BIKE_HEIGHT);
      bike.position = newPosition.clone();
      bike.billboard.position = newPosition;
      bike.longitude = newLon;
      bike.latitude = newLat;
      
      return;
    } else {
      // 过渡完成，开始新的线段移动
      delete bike.routeInfo.transition;
      if (segmentAfterTransition) {
        bike.routeInfo.currentSegment = segmentAfterTransition.segment;
        bike.routeInfo.direction = segmentAfterTransition.direction;
        bike.routeInfo.progress = segmentAfterTransition.startProgress;
      }
    }
  }
  
  const { currentSegment, progress, speed, direction } = bike.routeInfo;
  
  // 更新进度
  let newProgress = progress + speed * direction;
  
  // 如果到达线段终点或起点
  if ((newProgress >= 1 && direction === 1) || (newProgress <= 0 && direction === -1)) {
    // 尝试找到连接的下一个线段
    const nextSegmentInfo = getNextConnectedSegment(currentSegment, direction);
    
    if (nextSegmentInfo) {
      // 有连接的下一个线段，直接过渡
      bike.routeInfo.currentSegment = nextSegmentInfo.segment;
      bike.routeInfo.direction = nextSegmentInfo.direction;
      bike.routeInfo.progress = nextSegmentInfo.startProgress;
      
      // 计算新位置
      let newPos;
      if (nextSegmentInfo.direction === 1) {
        newPos = nextSegmentInfo.segment.start;
      } else {
        newPos = nextSegmentInfo.segment.end;
      }
      
      // 更新位置
      const [newLon, newLat] = newPos;
      const newPosition = Cesium.Cartesian3.fromDegrees(newLon, newLat, BIKE_HEIGHT);
      bike.position = newPosition.clone();
      bike.billboard.position = newPosition;
      bike.longitude = newLon;
      bike.latitude = newLat;
      
      return;
    } else {
      // 找不到连接的线段，创建一个到随机新线段的平滑过渡
      const newSegment = getRandomRoadSegment();
      if (!newSegment) {
        // 如果没有可用的线段，反转方向
        bike.routeInfo.direction = -bike.routeInfo.direction;
        bike.routeInfo.progress = bike.routeInfo.direction === 1 ? 0 : 1;
        return;
      }
      
      // 当前位置
      const currentPos = direction === 1 ? currentSegment.end : currentSegment.start;
      
      // 新线段起点位置
      const targetPos = Math.random() > 0.5 ? newSegment.start : newSegment.end;
      const targetDirection = targetPos === newSegment.start ? 1 : -1;
      
      // 设置过渡动画
      bike.routeInfo.transition = {
        startTime: Date.now(),
        duration: 2.0, // 2秒过渡时间
        startPos: currentPos,
        endPos: targetPos,
        segmentAfterTransition: {
          segment: newSegment,
          direction: targetDirection,
          startProgress: targetDirection === 1 ? 0 : 1
        }
      };
      
      return;
    }
  }
  
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
 * 生成随机点图元（测试用）
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
      console.log('摄像头已调整到共享单车分布区域');
    }
  });
};

/**
 * 主入口：生成共享单车标记和动态连线
 * @param {Cesium.Viewer} viewer - Cesium视图对象
 * @param {number} count - 生成数量
 * @param {number} [imgIndex] - 指定图标索引（不再使用）
 */
export const randomGenerateBillboards = async (viewer, count, imgIndex) => {
  console.log(`开始生成${count}个道路网附近的随机点...`);
  
  // 生成武汉市道路网附近的坐标点
  const posArr = await generatePos(count);
  
  console.log(`成功生成${posArr.length}个符合条件的点，开始创建图元...`);
  
  // 初始化图元集合
  billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());
  
  // 清空现有单车数据
  bikesData = [];

  // 状态分布比例: 70% 可用，10% 使用中，10% 维护中，10% 低电量
  const statusDistribution = [
    { status: BikeStatus.AVAILABLE, probability: 0.7 },
    { status: BikeStatus.IN_USE, probability: 0.1 },
    { status: BikeStatus.MAINTENANCE, probability: 0.1 },
    { status: BikeStatus.LOW_BATTERY, probability: 0.1 }
  ];

  posArr.forEach((position, index) => {
    // 根据概率分配状态
    const rand = Math.random();
    let cumulativeProbability = 0;
    let randomStatus = BikeStatus.AVAILABLE; // 默认状态
    
    for (const item of statusDistribution) {
      cumulativeProbability += item.probability;
      if (rand <= cumulativeProbability) {
        randomStatus = item.status;
        break;
      }
    }
    
    // 如果是低电量状态，确保电量在20%以下
    const batteryLevel = randomStatus === BikeStatus.LOW_BATTERY 
      ? Math.floor(Math.random() * 20) 
      : Math.floor(Math.random() * 80) + 20; // 其他状态电量在20-100%之间
    
    // 根据状态选择图标
    const iconImage = getIconByStatus(randomStatus);
    
    // 创建广告牌
    const billboard = billboards.add({
      id: `bike-${index}`,
      position,
      image: iconImage,
      scale: 0.1,
      pixelOffset: new Cesium.Cartesian2(0, 0),
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER
    });
    
    // 获取WGS84坐标
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    
    // 存储单车数据
    const bikeInfo = {
      id: `bike-${index}`,
      position: position.clone(), // 存储Cartesian3坐标（三维坐标）
      longitude: lon,            // 经度
      latitude: lat,             // 纬度
      billboard: billboard,      // 对应的广告牌对象
      status: randomStatus,      // 状态
      batteryLevel: batteryLevel, // 电量
      lastUpdated: Date.now(),   // 最后更新时间
      modelType: `Model-${String.fromCharCode(65 + Math.floor(Math.random() * 5))}` // 随机型号A-E
    };
    
    // 如果是使用中状态，添加路径信息
    if (randomStatus === BikeStatus.IN_USE) {
      // 使用道路线段来移动
      const roadSegment = getRandomRoadSegment();
      if (roadSegment) {
        bikeInfo.routeInfo = {
          currentSegment: roadSegment,
          progress: Math.random(), // 随机起始进度
          speed: 0.002 + Math.random() * 0.004, // 降低速度，使移动更平滑
          direction: Math.random() > 0.5 ? 1 : -1 // 随机方向
        };
        
        // 将位置更新为线段上的位置
        const [startLon, startLat] = roadSegment.start;
        const [endLon, endLat] = roadSegment.end;
        const progress = bikeInfo.routeInfo.progress;
        
        bikeInfo.longitude = startLon + progress * (endLon - startLon);
        bikeInfo.latitude = startLat + progress * (endLat - startLat);
        
        const newPosition = Cesium.Cartesian3.fromDegrees(bikeInfo.longitude, bikeInfo.latitude, BIKE_HEIGHT);
        bikeInfo.position = newPosition.clone();
        bikeInfo.billboard.position = newPosition;
      }
    }
    
    // 添加到存储
    bikesData.push(bikeInfo);
  });
  
  // 设置预渲染事件，更新使用中的单车位置
  preRender = viewer.scene.preRender.addEventListener(() => {
    // 获取所有使用中的单车
    const inUseBikes = bikesData.filter(bike => bike.status === BikeStatus.IN_USE);
    
    // 更新每辆使用中单车的位置
    inUseBikes.forEach(bike => {
      updateBikePositionAlongRoad(bike);
    });
  });
  
  // 初始化BikeStore
  try {
    const bikeStore = (await import('./BikeStore')).default;
    bikeStore.initialize(bikesData);
    
    // 尝试自动显示共享单车统计侧边栏
    setTimeout(() => {
      // 获取左侧边栏组件实例
      const leftSidebar = document.querySelector('.sidebar-container')?.__vueParentComponent?.ctx;
      if (leftSidebar && typeof leftSidebar.showBikeStats === 'function') {
        leftSidebar.showBikeStats();
      }
    }, 1000);
  } catch (error) {
    console.error('初始化BikeStore失败:', error);
  }
  
  // 自动调整摄像机位置
  flyToBikes(viewer, posArr);
  
  console.log(`成功创建${bikesData.length}个共享单车数据点`);
  return bikesData;
};

/**
 * 销毁共享单车图元
 */
export const destroyBillboard = () => {
  if (preRender) {
    preRender();
    preRender = undefined;
  }
  
  if (billboards) {
    billboards = billboards.destroy();
  }
  
  bikesData = []; // 清空数据
};

/**
 * 获取所有共享单车数据
 * @returns {Array} 共享单车数据数组
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
    bike.lastUpdated = Date.now();
    
    // 更新图标
    if (bike.billboard) {
      bike.billboard.image = getIconByStatus(status);
    }
    
    // 如果状态变为使用中，添加路径信息
    if (status === BikeStatus.IN_USE && oldStatus !== BikeStatus.IN_USE) {
      const roadSegment = getRandomRoadSegment();
      if (roadSegment) {
        bike.routeInfo = {
          currentSegment: roadSegment,
          progress: 0,
          speed: 0.002 + Math.random() * 0.004, // 较慢的速度使移动更平滑
          direction: 1
        };
        
        // 将位置更新为线段起点
        const [startLon, startLat] = roadSegment.start;
        bike.longitude = startLon;
        bike.latitude = startLat;
        
        const newPosition = Cesium.Cartesian3.fromDegrees(startLon, startLat, BIKE_HEIGHT);
        bike.position = newPosition.clone();
        bike.billboard.position = newPosition;
      }
    } 
    // 如果状态从使用中变为其他，移除路径信息
    else if (oldStatus === BikeStatus.IN_USE && status !== BikeStatus.IN_USE) {
      delete bike.routeInfo;
    }
    
    return true;
  }
  return false;
};

/**
 * 更新单车电量
 * @param {string} id - 单车ID
 * @param {number} batteryLevel - 新电量（0-100）
 * @returns {boolean} 是否更新成功
 */
export const updateBikeBattery = (id, batteryLevel) => {
  const bike = getBikeById(id);
  if (bike) {
    bike.batteryLevel = batteryLevel;
    bike.lastUpdated = Date.now();
    
    // 如果电量低于20%，更新状态为低电量
    if (batteryLevel < 20 && bike.status !== BikeStatus.LOW_BATTERY) {
      return updateBikeStatus(id, BikeStatus.LOW_BATTERY);
    }
    // 如果电量恢复且当前是低电量状态，更新为可用状态
    else if (batteryLevel >= 20 && bike.status === BikeStatus.LOW_BATTERY) {
      return updateBikeStatus(id, BikeStatus.AVAILABLE);
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
