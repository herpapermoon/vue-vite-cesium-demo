<template>
  <div class="parking-status">
    <div class="status-header">
      <h4>校园车位状态</h4>
      <div class="status-summary">
        <div class="status-item">
          <span class="label">总车位:</span>
          <span class="value">{{ totalSpots }}</span>
        </div>
        <div class="status-item">
          <span class="label">已占用:</span>
          <span class="value">{{ occupiedSpots }}</span>
        </div>
        <div class="status-item">
          <span class="label">空闲:</span>
          <span class="value">{{ availableSpots }}</span>
        </div>
      </div>
    </div>

    <div class="parking-list">
      <div 
        v-for="spot in parkingSpots" 
        :key="spot.id"
        class="parking-item"
        :class="{ 
          occupied: spot.isOccupied,
          full: spot.isFull 
        }">
        <div class="spot-info">
          <span class="spot-id">车位 #{{ spot.id }}</span>
          <span class="spot-status" :class="{ 
            'status-full': spot.isFull,
            'status-occupied': spot.isOccupied && !spot.isFull,
            'status-free': !spot.isOccupied 
          }">
            {{ spot.isFull ? '已满' : (spot.isOccupied ? '使用中' : '空闲') }}
          </span>
        </div>
        <div class="spot-location">
          位置: {{ formatLocation(spot.center) }}
        </div>
        <div class="capacity">
          已停放: {{ spot.bikeCount }}/{{ MAX_CAPACITY }} ({{ spot.occupancyRate }}%)
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, defineExpose } from 'vue';
import { getAllBikes, calculateDistance } from '@/cesiumUtils/randomPoints';
import Cesium from '@/cesiumUtils/cesium';

const parkingSpots = ref([]);
const PARKING_HEIGHT = 20;
const MAX_CAPACITY = 10;
const PARKING_SEARCH_RADIUS = 200; // 停车搜索半径

// 清除已有的车位实体
const clearParkingEntities = () => {
  const viewer = window.viewer3D;
  if (!viewer) return;
  
  viewer.entities.removeAll();
};

// 计算多边形中心点
const calculatePolygonCenter = (coordinates) => {
  const sumLon = coordinates.reduce((sum, coord) => sum + coord[0], 0);
  const sumLat = coordinates.reduce((sum, coord) => sum + coord[1], 0);
  return [
    sumLon / coordinates.length,
    sumLat / coordinates.length
  ];
};

// 格式化位置显示
const formatLocation = (center) => {
  if (!center) return '未知';
  return `${center[0].toFixed(6)}, ${center[1].toFixed(6)}`;
};

// 判断点是否在多边形内
const isPointInPolygon = (point, polygon) => {
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
};

// 查找指定范围内的可用停车区 - 去掉了export关键字
const findAvailableParkingSpotInRadius = (centerLon, centerLat, radiusInMeters = 100) => {
  if (!parkingSpots.value || parkingSpots.value.length === 0) {
    return null;
  }
  
  // 查找范围内的停车区
  const nearbySpots = parkingSpots.value.filter(spot => {
    if (!spot.center) return false;
    
    const distance = calculateDistance([centerLon, centerLat], spot.center);
    return distance <= radiusInMeters && !spot.isFull; // 在范围内且未满
  });
  
  if (nearbySpots.length === 0) {
    return null;
  }
  
  // 按距离排序，选择最近的
  nearbySpots.sort((a, b) => {
    const distA = calculateDistance([centerLon, centerLat], a.center);
    const distB = calculateDistance([centerLon, centerLat], b.center);
    return distA - distB;
  });
  
  const selectedSpot = nearbySpots[0];
  
  // 在停车区内生成随机停车位置
  const coordinates = selectedSpot.coordinates[0][0];
  const bounds = {
    minLon: Math.min(...coordinates.map(coord => coord[0])),
    maxLon: Math.max(...coordinates.map(coord => coord[0])),
    minLat: Math.min(...coordinates.map(coord => coord[1])),
    maxLat: Math.max(...coordinates.map(coord => coord[1]))
  };
  
  // 在停车区边界内生成随机点
  let parkingPosition = null;
  let attempts = 0;
  const maxAttempts = 20;
  
  while (!parkingPosition && attempts < maxAttempts) {
    const randomLon = bounds.minLon + Math.random() * (bounds.maxLon - bounds.minLon);
    const randomLat = bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat);
    
    // 检查是否在多边形内
    if (isPointInPolygon([randomLon, randomLat], coordinates)) {
      parkingPosition = [randomLon, randomLat];
    }
    attempts++;
  }
  
  // 如果无法在多边形内生成点，使用中心点
  if (!parkingPosition) {
    const offset = 0.00002; // 约2米的小偏移
    parkingPosition = [
      selectedSpot.center[0] + (Math.random() - 0.5) * offset,
      selectedSpot.center[1] + (Math.random() - 0.5) * offset
    ];
  }
  
  return {
    spot: selectedSpot,
    position: parkingPosition,
    distance: calculateDistance([centerLon, centerLat], selectedSpot.center)
  };
};

// 获取所有停车区数据 - 去掉了export关键字
const getAllParkingSpots = () => {
  return parkingSpots.value;
};

// 更新车位占用状态
const updateParkingStatus = () => {
  const bikes = getAllBikes();
  if (!bikes || !parkingSpots.value) return;
  
  parkingSpots.value = parkingSpots.value.map(spot => {
    // 统计在车位范围内的单车数量
    const bikesInSpot = bikes.filter(bike => {
      if (bike.status !== 'parked') return false;
      return isPointInPolygon(
        [bike.longitude, bike.latitude],
        spot.coordinates[0][0]
      );
    });

    const bikeCount = bikesInSpot.length;
    const isOccupied = bikeCount > 0;
    const isFull = bikeCount >= MAX_CAPACITY;
    const occupancyRate = (bikeCount / MAX_CAPACITY * 100).toFixed(1);

    return {
      ...spot,
      bikeCount,
      isOccupied,
      isFull,
      occupancyRate
    };
  });
};

// 在 Cesium 地图上可视化车位
const visualizeParkingSpots = () => {
  const viewer = window.viewer3D;
  if (!viewer || !parkingSpots.value.length) return;

  // 清除现有实体
  clearParkingEntities();
  
  parkingSpots.value.forEach(spot => {
    try {
      const coordinateArray = spot.coordinates[0][0].reduce((acc, coord) => {
        acc.push(coord[0], coord[1]);
        return acc;
      }, []);

      let color = Cesium.Color.GREEN.withAlpha(0.6); // 默认空闲状态
      
      if (spot.isFull) {
        color = Cesium.Color.RED.withAlpha(0.6); // 已满
      } else if (spot.isOccupied) {
        color = Cesium.Color.YELLOW.withAlpha(0.6); // 部分占用
      }

      // 添加车位多边形
      viewer.entities.add({
        name: `车位 #${spot.id}`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(coordinateArray),
          material: color,
          outline: true,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          height: PARKING_HEIGHT,
          extrudedHeight: PARKING_HEIGHT + 2
        },
        description: `
          <table class="cesium-infoBox-defaultTable">
            <tr><th>车位编号</th><td>#${spot.id}</td></tr>
            <tr><th>当前状态</th><td>${spot.isFull ? '已满' : (spot.isOccupied ? '已占用' : '空闲')}</td></tr>
            <tr><th>停放数量</th><td>${spot.bikeCount}/${MAX_CAPACITY}</td></tr>
            <tr><th>占用率</th><td>${spot.occupancyRate}%</td></tr>
          </table>
        `
      });

      // 添加车位标签
      viewer.entities.add({
        name: `车位标签 #${spot.id}`,
        position: Cesium.Cartesian3.fromDegrees(
          spot.center[0],
          spot.center[1],
          PARKING_HEIGHT + 3
        ),
        label: {
          text: `#${spot.id}`,
          font: '14px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          outlineColor: Cesium.Color.BLACK,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    } catch (error) {
      console.error('创建车位可视化失败:', error, spot);
    }
  });
};

// 加载车位数据
const loadParkingData = async () => {
  try {
    const response = await fetch('/src/assets/ships/测试车位地上1.geojson');
    const data = await response.json();
    
    // 转换geojson数据为车位数组
    parkingSpots.value = data.features.map(feature => {
      const coordinates = feature.geometry.coordinates;
      const center = calculatePolygonCenter(coordinates[0][0]);
      
      return {
        id: feature.properties.id,
        coordinates: coordinates,
        center: center,
        isOccupied: false,
        bikeCount: 0,
        isFull: false,
        occupancyRate: '0.0'
      };
    });

    // 初次更新车位占用状态并可视化
    updateParkingStatus();
    visualizeParkingSpots();
    
  } catch (error) {
    console.error('加载车位数据失败:', error);
  }
};

// 计算统计信息
const totalSpots = computed(() => parkingSpots.value.length);
const occupiedSpots = computed(() => parkingSpots.value.filter(spot => spot.isOccupied).length);
const availableSpots = computed(() => totalSpots.value - occupiedSpots.value);

// 组件加载时初始化
onMounted(() => {
  loadParkingData();
  
  // 定期更新状态
  setInterval(() => {
    updateParkingStatus();
    visualizeParkingSpots();
  }, 2000); // 2秒更新一次
  
  // 将停车区查询函数挂载到全局
  if (typeof window !== 'undefined') {
    window.findAvailableParkingSpotInRadius = findAvailableParkingSpotInRadius;
    window.getAllParkingSpots = getAllParkingSpots;
  }
});

// 使用defineExpose暴露需要外部访问的函数
defineExpose({
  findAvailableParkingSpotInRadius,
  getAllParkingSpots
});
</script>

<style scoped lang="scss">
.parking-status {
  height: 100%;
  display: flex;
  flex-direction: column;
  
  .status-header {
    padding: 10px;
    background: var(--cl-panel-dark);
    border-radius: 4px;
    margin-bottom: 10px;

    h4 {
      margin: 0 0 10px 0;
      color: var(--cl-text);
    }
  }

  .status-summary {
    display: flex;
    justify-content: space-between;
    margin-top: 10px;

    .status-item {
      text-align: center;
      
      .label {
        font-size: 12px;
        color: var(--cl-text-secondary);
      }
      
      .value {
        font-size: 16px;
        font-weight: bold;
        color: var(--cl-text);
      }
    }
  }

  .parking-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px 0;
  }

  .parking-item {
    padding: 10px;
    margin-bottom: 8px;
    background: var(--cl-panel-light);
    border-radius: 4px;
    border-left: 4px solid var(--cl-success);

    &.occupied {
      border-left-color: var(--cl-warning);
    }

    &.full {
      border-left-color: var(--cl-danger);
    }

    .spot-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;

      .spot-id {
        font-weight: bold;
      }

      .spot-status {
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 10px;
        background: var(--cl-success);
        color: white;

        &.status-full {
          background-color: var(--cl-danger);
        }
        &.status-occupied {
          background-color: var(--cl-warning);
        }
        &.status-free {
          background-color: var(--cl-success);
        }
      }
    }

    .spot-location {
      font-size: 12px;
      color: var(--cl-text-secondary);
    }

    .capacity {
      font-size: 12px;
      color: var(--cl-text-secondary);
      margin-top: 4px;
    }
  }
}
</style>