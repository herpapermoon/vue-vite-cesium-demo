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
        }"
        @click="flyToSpot(spot)">
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
          已停放: {{ spot.bikeCount }}/{{ spot.maxCapacity }} ({{ spot.occupancyRate }}%)
        </div>
        <div class="area-info">
          面积: {{ spot.area?.toFixed(2) || 0 }} m²
        </div>
        <div class="click-hint">点击跳转到地图位置</div>
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
const PARKING_SEARCH_RADIUS = 200; // 停车搜索半径

// 计算多边形面积（球面面积计算）
const calculatePolygonArea = (coordinates) => {
  if (!coordinates || coordinates.length < 3) return 0;
  
  // 将经纬度转换为弧度
  const toRadians = (degrees) => degrees * Math.PI / 180;
  
  // 使用球面多边形面积公式
  let area = 0;
  const R = 6371000; // 地球半径（米）
  
  for (let i = 0; i < coordinates.length; i++) {
    const j = (i + 1) % coordinates.length;
    const lat1 = toRadians(coordinates[i][1]);
    const lat2 = toRadians(coordinates[j][1]);
    const deltaLon = toRadians(coordinates[j][0] - coordinates[i][0]);
    
    area += deltaLon * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  
  area = Math.abs(area * R * R / 2);
  return area;
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

// 跳转到指定车位
const flyToSpot = (spot) => {
  const viewer = window.viewer3D;
  if (!viewer || !spot.center) return;
  
  const destination = Cesium.Cartesian3.fromDegrees(
    spot.center[0], 
    spot.center[1], 
    200
  );
  
  viewer.camera.flyTo({
    destination: destination,
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0.0
    },
    duration: 2.0,
    complete: () => {
      highlightSpot(spot);
    }
  });
};

// 高亮显示指定车位
const highlightSpot = (spot) => {
  const viewer = window.viewer3D;
  if (!viewer) return;
  
  const entities = viewer.entities.values;
  const spotEntity = entities.find(entity => 
    entity.name === `车位 #${spot.id}`
  );
  
  if (spotEntity && spotEntity.polygon) {
    spotEntity.polygon.material = Cesium.Color.CYAN.withAlpha(0.8);
    
    setTimeout(() => {
      let color = Cesium.Color.GREEN.withAlpha(0.6);
      if (spot.isFull) {
        color = Cesium.Color.RED.withAlpha(0.6);
      } else if (spot.isOccupied) {
        color = Cesium.Color.YELLOW.withAlpha(0.6);
      }
      spotEntity.polygon.material = color;
    }, 2000);
  }
};

// 清除已有的车位实体
const clearParkingEntities = () => {
  const viewer = window.viewer3D;
  if (!viewer) return;
  
  viewer.entities.removeAll();
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

// 查找指定范围内的可用停车区
const findAvailableParkingSpotInRadius = (centerLon, centerLat, radiusInMeters = 100) => {
  if (!parkingSpots.value || parkingSpots.value.length === 0) {
    return null;
  }
  
  const nearbySpots = parkingSpots.value.filter(spot => {
    if (!spot.center) return false;
    
    const distance = calculateDistance([centerLon, centerLat], spot.center);
    return distance <= radiusInMeters && !spot.isFull;
  });
  
  if (nearbySpots.length === 0) {
    return null;
  }
  
  nearbySpots.sort((a, b) => {
    const distA = calculateDistance([centerLon, centerLat], a.center);
    const distB = calculateDistance([centerLon, centerLat], b.center);
    return distA - distB;
  });
  
  const selectedSpot = nearbySpots[0];
  
  const coordinates = selectedSpot.coordinates[0][0];
  const bounds = {
    minLon: Math.min(...coordinates.map(coord => coord[0])),
    maxLon: Math.max(...coordinates.map(coord => coord[0])),
    minLat: Math.min(...coordinates.map(coord => coord[1])),
    maxLat: Math.max(...coordinates.map(coord => coord[1]))
  };
  
  let parkingPosition = null;
  let attempts = 0;
  const maxAttempts = 20;
  
  while (!parkingPosition && attempts < maxAttempts) {
    const randomLon = bounds.minLon + Math.random() * (bounds.maxLon - bounds.minLon);
    const randomLat = bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat);
    
    if (isPointInPolygon([randomLon, randomLat], coordinates)) {
      parkingPosition = [randomLon, randomLat];
    }
    attempts++;
  }
  
  if (!parkingPosition) {
    const offset = 0.00002;
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

// 获取所有停车区数据
const getAllParkingSpots = () => {
  return parkingSpots.value;
};

// 更新车位占用状态
const updateParkingStatus = () => {
  const bikes = getAllBikes();
  if (!bikes || !parkingSpots.value) return;
  
  parkingSpots.value = parkingSpots.value.map(spot => {
    const bikesInSpot = bikes.filter(bike => {
      if (bike.status !== 'parked') return false;
      return isPointInPolygon(
        [bike.longitude, bike.latitude],
        spot.coordinates[0][0]
      );
    });

    const bikeCount = bikesInSpot.length;
    const isOccupied = bikeCount > 0;
    const isFull = bikeCount >= spot.maxCapacity; // 使用动态容量
    const occupancyRate = (bikeCount / spot.maxCapacity * 100).toFixed(1);

    return {
      ...spot,
      bikeCount,
      isOccupied,
      isFull,
      occupancyRate
    };
  });
};

// 加载车位数据
const loadParkingData = async () => {
  try {
    const response = await fetch('/src/assets/ships/车位new.geojson');
    const data = await response.json();
    
    parkingSpots.value = data.features.map((feature, index) => {
      const coordinates = feature.geometry.coordinates;
      const center = calculatePolygonCenter(coordinates[0][0]);
      const spotId = feature.properties?.id || feature.properties?.ID || feature.properties?.name || (index + 1);
      
      // 计算面积并转换为容量（1平方米=1个车位）
      const area = calculatePolygonArea(coordinates[0][0]);
      const maxCapacity = Math.max(1, Math.floor(area)); // 至少1个车位
      
      return {
        id: spotId,
        coordinates: coordinates,
        center: center,
        area: area, // 保存面积信息
        maxCapacity: maxCapacity, // 动态容量
        isOccupied: false,
        bikeCount: 0,
        isFull: false,
        occupancyRate: '0.0'
      };
    });

    console.log('加载的车位数据:', parkingSpots.value);
    
    updateParkingStatus();
    visualizeParkingSpots();
    
  } catch (error) {
    console.error('加载车位数据失败:', error);
  }
};

// 在 Cesium 地图上可视化车位
const visualizeParkingSpots = () => {
  const viewer = window.viewer3D;
  if (!viewer || !parkingSpots.value.length) return;

  clearParkingEntities();
  
  parkingSpots.value.forEach(spot => {
    try {
      const coordinateArray = spot.coordinates[0][0].reduce((acc, coord) => {
        acc.push(coord[0], coord[1]);
        return acc;
      }, []);

      let color = Cesium.Color.GREEN.withAlpha(0.6);
      
      if (spot.isFull) {
        color = Cesium.Color.RED.withAlpha(0.6);
      } else if (spot.isOccupied) {
        color = Cesium.Color.YELLOW.withAlpha(0.6);
      }

      const displayId = spot.id !== undefined && spot.id !== null ? spot.id : '未知';

      viewer.entities.add({
        name: `车位 #${displayId}`,
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
            <tr><th>车位编号</th><td>#${displayId}</td></tr>
            <tr><th>面积</th><td>${spot.area.toFixed(2)} m²</td></tr>
            <tr><th>最大容量</th><td>${spot.maxCapacity}</td></tr>
            <tr><th>当前状态</th><td>${spot.isFull ? '已满' : (spot.isOccupied ? '已占用' : '空闲')}</td></tr>
            <tr><th>停放数量</th><td>${spot.bikeCount}/${spot.maxCapacity}</td></tr>
            <tr><th>占用率</th><td>${spot.occupancyRate}%</td></tr>
          </table>
        `
      });

      viewer.entities.add({
        name: `车位标签 #${displayId}`,
        position: Cesium.Cartesian3.fromDegrees(
          spot.center[0],
          spot.center[1],
          PARKING_HEIGHT + 0.1
        ),
        label: {
          text: `#${displayId}`,
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

// 计算统计信息
const totalSpots = computed(() => parkingSpots.value.length);
const occupiedSpots = computed(() => parkingSpots.value.filter(spot => spot.isOccupied).length);
const availableSpots = computed(() => totalSpots.value - occupiedSpots.value);

// 组件加载时初始化
onMounted(() => {
  loadParkingData();
  
  setInterval(() => {
    updateParkingStatus();
    visualizeParkingSpots();
  }, 2000);
  
  if (typeof window !== 'undefined') {
    window.findAvailableParkingSpotInRadius = findAvailableParkingSpotInRadius;
    window.getAllParkingSpots = getAllParkingSpots;
  }
});

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
    cursor: pointer;
    transition: all 0.3s ease;

    &:hover {
      background: var(--cl-panel-dark);
      transform: translateX(5px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

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

    .area-info {
      font-size: 12px;
      color: var(--cl-text-secondary);
      margin-top: 4px;
    }

    .click-hint {
      font-size: 11px;
      color: var(--cl-text-secondary);
      text-align: center;
      margin-top: 8px;
      padding: 4px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    &:hover .click-hint {
      opacity: 1;
    }
  }
}
</style>