/**
 * 异常骑行行为检测工具
 */

// 默认检测规则
export const DEFAULT_DETECTION_RULES = {
  speedLimit: { min: 5, max: 40 }, // km/h
  maxStopDuration: 300, // 秒
  maxDeviationDistance: 200, // 米
  minTrackPoints: 3, // 最少轨迹点数
  geofence: {
    allowedAreas: [],
    restrictedAreas: []
  }
};

/**
 * 计算两点间距离（米）
 */
export function calculateDistance(coord1, coord2) {
  const R = 6371000; // 地球半径（米）
  const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
  const dLon = (coord2[0] - coord1[0]) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1[1] * Math.PI / 180) * Math.cos(coord2[1] * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * 计算轨迹总长度
 */
export function calculateTrackLength(coordinates) {
  let totalDistance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    totalDistance += calculateDistance(coordinates[i-1], coordinates[i]);
  }
  return totalDistance;
}

/**
 * 计算平均速度
 */
export function calculateAverageSpeed(coordinates) {
  if (coordinates.length < 2) return 0;
  
  const distance = calculateTrackLength(coordinates);
  const startTime = coordinates[0][2] || 0;
  const endTime = coordinates[coordinates.length - 1][2] || 0;
  const timeInHours = (endTime - startTime) / (1000 * 60 * 60);
  
  return timeInHours > 0 ? (distance / 1000) / timeInHours : 0;
}

/**
 * 检测轨迹是否偏离路网
 */
export function detectPathDeviation(trackCoords, roadNetwork, maxDistance = 200) {
  if (!roadNetwork || !roadNetwork.features) return [];
  
  const deviations = [];
  
  trackCoords.forEach((coord, index) => {
    let minDistance = Infinity;
    let nearestRoad = null;
    
    // 查找最近的道路
    roadNetwork.features.forEach(road => {
      if (road.geometry.type === 'LineString') {
        road.geometry.coordinates.forEach(roadCoord => {
          const distance = calculateDistance(coord, roadCoord);
          if (distance < minDistance) {
            minDistance = distance;
            nearestRoad = road;
          }
        });
      }
    });
    
    // 如果距离超过阈值，记录为偏离
    if (minDistance > maxDistance) {
      deviations.push({
        pointIndex: index,
        coordinate: coord,
        deviation: minDistance,
        nearestRoad: nearestRoad?.properties?.name || '未知道路'
      });
    }
  });
  
  return deviations;
}

/**
 * 本地异常检测函数
 */
export function detectAnomaliesLocal(trackData, detectionRules = DEFAULT_DETECTION_RULES, roadNetwork = null) {
  const rules = { ...DEFAULT_DETECTION_RULES, ...detectionRules };
  const anomalies = [];

  if (!trackData || !trackData.features) {
    return { anomalies: [], totalChecked: 0 };
  }

  trackData.features.forEach((feature, index) => {
    if (feature.geometry.type === 'LineString') {
      const coords = feature.geometry.coordinates;
      const properties = feature.properties;
      const bikeId = properties.bikeId || `Unknown_${index}`;

      // 检测1: 速度异常
      if (properties.avgSpeed !== undefined) {
        if (properties.avgSpeed < rules.speedLimit.min) {
          anomalies.push({
            type: 'SPEED_TOO_SLOW',
            bikeId: bikeId,
            value: properties.avgSpeed,
            threshold: rules.speedLimit.min,
            severity: 'medium',
            timestamp: properties.startTime,
            coordinates: coords[0],
            message: `骑行速度过慢: ${properties.avgSpeed.toFixed(1)} km/h`
          });
        }
        
        if (properties.avgSpeed > rules.speedLimit.max) {
          anomalies.push({
            type: 'SPEED_TOO_FAST',
            bikeId: bikeId,
            value: properties.avgSpeed,
            threshold: rules.speedLimit.max,
            severity: 'high',
            timestamp: properties.startTime,
            coordinates: coords[0],
            message: `骑行速度过快: ${properties.avgSpeed.toFixed(1)} km/h`
          });
        }
      }

      // 检测2: 停留时间异常
      if (properties.stopDuration && properties.stopDuration > rules.maxStopDuration) {
        anomalies.push({
          type: 'LONG_STOP',
          bikeId: bikeId,
          value: properties.stopDuration,
          threshold: rules.maxStopDuration,
          severity: 'medium',
          timestamp: properties.startTime,
          coordinates: coords[Math.floor(coords.length / 2)],
          message: `异常停留时间: ${Math.round(properties.stopDuration/60)} 分钟`
        });
      }

      // 检测3: 轨迹数据不足
      if (coords.length < rules.minTrackPoints) {
        anomalies.push({
          type: 'INSUFFICIENT_DATA',
          bikeId: bikeId,
          value: coords.length,
          threshold: rules.minTrackPoints,
          severity: 'low',
          timestamp: properties.startTime,
          coordinates: coords[0],
          message: `轨迹数据不足: 仅有${coords.length}个点`
        });
      }

      // 检测4: 路径偏离（如果提供了路网数据）
      if (roadNetwork) {
        const deviations = detectPathDeviation(coords, roadNetwork, rules.maxDeviationDistance);
        if (deviations.length > 0) {
          anomalies.push({
            type: 'PATH_DEVIATION',
            bikeId: bikeId,
            value: deviations.length,
            threshold: 0,
            severity: 'high',
            timestamp: properties.startTime,
            coordinates: deviations[0].coordinate,
            deviations: deviations,
            message: `路径偏离: ${deviations.length}个点偏离道路`
          });
        }
      }
    }
  });

  return {
    anomalies,
    totalChecked: trackData.features.length,
    anomalyCount: anomalies.length,
    timestamp: new Date().toISOString()
  };
}

/**
 * 发送检测请求到服务器
 */
export async function detectAnomaliesServer(trackData, detectionRules = {}) {
  try {
    const response = await fetch('http://localhost:10000/api/detect-anomaly', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        trackData,
        detectionRules
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('服务器异常检测失败:', error);
    throw error;
  }
}

/**
 * 获取异常严重程度颜色
 */
export function getAnomalySeverityColor(severity) {
  const colors = {
    low: '#52c41a',      // 绿色
    medium: '#faad14',   // 橙色
    high: '#ff4d4f',     // 红色
    critical: '#722ed1'  // 紫色
  };
  return colors[severity] || colors.medium;
}

/**
 * 格式化异常消息
 */
export function formatAnomalyMessage(anomaly) {
  const timeStr = anomaly.timestamp ? 
    new Date(anomaly.timestamp).toLocaleString('zh-CN') : '未知时间';
  
  return `[${timeStr}] ${anomaly.message}`;
}