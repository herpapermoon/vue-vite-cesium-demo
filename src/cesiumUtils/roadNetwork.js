import { calculateDistance } from './randomPoints';

// 全局存储容器
let roadNetworkData = null // 道路网络数据
let roadSegments = [] // 道路线段数据，用于移动车辆
let roadNetwork = {} // 道路网络拓扑结构，用于连续移动

/**
 * 加载道路网络数据
 * @returns {Promise<Object>} 道路网络数据
 */
export const loadRoadNetwork = async () => {
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
export const getNextConnectedSegment = (currentSegment, direction) => {
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
 * 随机获取一个道路线段
 * @returns {Object} 随机线段 { start, end, roadId }
 */
export const getRandomRoadSegment = () => {
  if (roadSegments.length === 0) return null;
  return roadSegments[Math.floor(Math.random() * roadSegments.length)];
};

/**
 * 查找离给定点最近的道路线段
 * @param {Array} point - 点坐标 [经度, 纬度]
 * @returns {Object} 最近的线段和投影点信息
 */
export const findNearestRoadSegment = (point) => {
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
 * 在道路附近生成随机点
 * @param {Object} roadNetwork - 道路网络数据
 * @param {number} count - 生成点的数量
 * @param {number} minDistance - 距离道路的最小距离(米)
 * @param {number} maxDistance - 距离道路的最大距离(米)
 * @param {Array} bounds - 边界 [minLon, minLat, maxLon, maxLat]
 * @returns {Array} 生成的点 [[lon, lat], ...]
 */
export const generatePointsNearRoads = (roadNetwork, count, minDistance = 10, maxDistance = 100, bounds = [114.605, 30.45, 114.62, 30.465]) => {
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
    
    // 处理生成逻辑的公共函数
    const generatePointForSegment = (start, end) => {
      // 在线段上随机选择一个点
      const t = Math.random();
      const baseX = start[0] + t * (end[0] - start[0]);
      const baseY = start[1] + t * (end[1] - start[1]);
      
      // 计算垂直于线段的方向
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.sqrt(dx * dx + dy * dy);
      
      if (length === 0) return null;
      
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
        return [finalX, finalY];
      }
      return null;
    };
    
    // 对于 MultiLineString 类型
    if (road.geometry.type === 'MultiLineString') {
      // 随机选择一条线
      const lineIndex = Math.floor(Math.random() * coordinates.length);
      const line = coordinates[lineIndex];
      
      // 随机选择线段
      const segmentIndex = Math.floor(Math.random() * (line.length - 1));
      const start = line[segmentIndex];
      const end = line[segmentIndex + 1];
      
      const point = generatePointForSegment(start, end);
      if (point) {
        points.push(point);
      }
    }
    // 对于 LineString 类型
    else if (road.geometry.type === 'LineString') {
      // 随机选择线段
      const segmentIndex = Math.floor(Math.random() * (coordinates.length - 1));
      const start = coordinates[segmentIndex];
      const end = coordinates[segmentIndex + 1];
      
      const point = generatePointForSegment(start, end);
      if (point) {
        points.push(point);
      }
    }
  }
  
  return points;
};

/**
 * 获取两个坐标点之间的线性插值点
 * @param {Array} start - 起始点 [lon, lat]
 * @param {Array} end - 结束点 [lon, lat]
 * @param {number} fraction - 插值比例 (0-1)
 * @returns {Array} 插值点 [lon, lat]
 */
export const interpolatePosition = (start, end, fraction) => {
  return [
    start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction
  ];
};