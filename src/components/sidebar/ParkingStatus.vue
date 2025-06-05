<template>
  <div class="parking-garage-status">
    <!-- 切换标签 -->
    <div class="tab-switcher">
      <div 
        class="tab-button" 
        :class="{ active: activeTab === 'parking' }"
        @click="activeTab = 'parking'">
        🅿️ 车位状态
      </div>
      <div 
        class="tab-button" 
        :class="{ active: activeTab === 'garage' }"
        @click="activeTab = 'garage'">
        🏢 车库状态
      </div>
    </div>

    <!-- 车位内容 -->
    <div v-if="activeTab === 'parking'" class="parking-content">
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

    <!-- 车库内容 -->
    <div v-if="activeTab === 'garage'" class="garage-content">
      <div class="status-header">
        <h4>校园车库状态</h4>
        <div class="status-summary">
          <div class="status-item">
            <span class="label">总车库:</span>
            <span class="value">{{ totalGarages }}</span>
          </div>
          <div class="status-item">
            <span class="label">已占用:</span>
            <span class="value">{{ occupiedGarages }}</span>
          </div>
          <div class="status-item">
            <span class="label">空闲:</span>
            <span class="value">{{ availableGarages }}</span>
          </div>
        </div>
      </div>

      <div class="garage-list">
        <div 
          v-for="garage in garages" 
          :key="garage.id"
          class="garage-item"
          :class="{ 
            occupied: garage.isOccupied,
            full: garage.isFull 
          }"
          @click="flyToGarage(garage)">
          <div class="garage-info">
            <span class="garage-id">{{ garage.name }}</span>
            <span class="garage-status" :class="{ 
              'status-full': garage.isFull,
              'status-occupied': garage.isOccupied && !garage.isFull,
              'status-free': !garage.isOccupied 
            }">
              {{ garage.isFull ? '已满' : (garage.isOccupied ? '使用中' : '空闲') }}
            </span>
          </div>
          <div class="garage-location">
            位置: {{ formatLocation(garage.position) }}
          </div>
          <div class="capacity">
            已停放: {{ garage.bikeCount }}/{{ garage.maxCapacity }} ({{ garage.occupancyRate }}%)
          </div>
          <div class="click-hint">点击跳转到地图位置</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, defineExpose } from 'vue';
import { getAllBikes, calculateDistance } from '@/cesiumUtils/randomPoints';
import Cesium from '@/cesiumUtils/cesium';

// 状态管理
const activeTab = ref('parking');
const parkingSpots = ref([]);
const garages = ref([]);

// 常量定义
const PARKING_HEIGHT = 20;
const GARAGE_CYLINDER_RADIUS = 3; // 车库圆柱体半径
const GARAGE_CYLINDER_HEIGHT = 25; // 车库圆柱体高度
const GARAGE_CAPACITY = 100; // 固定容量
const PARKING_SEARCH_RADIUS = 200;
const GARAGE_SEARCH_RADIUS = 50;

// 计算多边形面积（球面面积计算）
const calculatePolygonArea = (coordinates) => {
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

// 跳转到指定车库
const flyToGarage = (garage) => {
  const viewer = window.viewer3D;
  if (!viewer || !garage.position) return;
  
  const destination = Cesium.Cartesian3.fromDegrees(
    garage.position[0], 
    garage.position[1], 
    150
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
      highlightGarage(garage);
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

// 在 Cesium 地图上可视化车库
const visualizeGarages = () => {
  const viewer = window.viewer3D;
  if (!viewer || !garages.value.length) return;
  
  garages.value.forEach(garage => {
    try {
      let color = Cesium.Color.BLUE.withAlpha(0.7);
      
      if (garage.isFull) {
        color = Cesium.Color.RED.withAlpha(0.7);
      } else if (garage.isOccupied) {
        color = Cesium.Color.ORANGE.withAlpha(0.7);
      }

      const displayId = garage.id !== undefined && garage.id !== null ? garage.id : '未知';
      const displayName = garage.name || `车库 #${displayId}`;

      const lon = garage.position[0];
      const lat = garage.position[1];
      
      // 瘦高圆柱体参数
      const cylinderRadius = 2; // 圆柱体半径（米）
      const cylinderHeight = 10; // 圆柱体高度（米）

      // 创建瘦高的圆柱体作为车库标识
      viewer.entities.add({
        name: `车库 #${displayId}`,
        position: Cesium.Cartesian3.fromDegrees(
          lon,
          lat,
          PARKING_HEIGHT + cylinderHeight / 2 // 圆柱体中心位置
        ),
        cylinder: {
          topRadius: cylinderRadius,
          bottomRadius: cylinderRadius,
          length: cylinderHeight,
          material: color,
          outline: true,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2
        },
        description: `
          <table class="cesium-infoBox-defaultTable">
            <tr><th>车库名称</th><td>${displayName}</td></tr>
            <tr><th>车库编号</th><td>#${displayId}</td></tr>
            <tr><th>最大容量</th><td>${garage.maxCapacity}</td></tr>
            <tr><th>当前状态</th><td>${garage.isFull ? '已满' : (garage.isOccupied ? '使用中' : '空闲')}</td></tr>
            <tr><th>停放数量</th><td>${garage.bikeCount}/${garage.maxCapacity}</td></tr>
            <tr><th>占用率</th><td>${garage.occupancyRate}%</td></tr>
          </table>
        `
      });

     
    } catch (error) {
      console.error('创建车库可视化失败:', error, garage);
    }
  });
};

// 高亮显示指定车库
const highlightGarage = (garage) => {
  const viewer = window.viewer3D;
  if (!viewer) return;
  
  const entities = viewer.entities.values;
  const garageEntity = entities.find(entity => 
    entity.name === `车库 #${garage.id}`
  );
  
  if (garageEntity && garageEntity.cylinder) {
    garageEntity.cylinder.material = Cesium.Color.CYAN.withAlpha(0.8);
    
    setTimeout(() => {
      let color = Cesium.Color.BLUE.withAlpha(0.7);
      if (garage.isFull) {
        color = Cesium.Color.RED.withAlpha(0.7);
      } else if (garage.isOccupied) {
        color = Cesium.Color.ORANGE.withAlpha(0.7);
      }
      garageEntity.cylinder.material = color;
    }, 2000);
  }
};

// 清除实体 - 更新匹配逻辑，移除对车位标签的清理
const clearEntities = () => {
  const viewer = window.viewer3D;
  if (!viewer) return;
  
  const entities = viewer.entities.values.slice();
  entities.forEach(entity => {
    if (entity.name && (
      entity.name.includes('车位') || 
      entity.name.includes('车库')
    )) {
      viewer.entities.remove(entity);
    }
  });
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

// 判断点是否在车库范围内
const isPointInGarageRadius = (point, garagePosition, radius = GARAGE_SEARCH_RADIUS) => {
  const distance = calculateDistance(point, garagePosition);
  return distance <= radius;
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

// 查找指定范围内的可用车库
const findAvailableGarageInRadius = (centerLon, centerLat, radiusInMeters = 200) => {
  if (!garages.value || garages.value.length === 0) {
    return null;
  }
  
  const nearbyGarages = garages.value.filter(garage => {
    if (!garage.position) return false;
    
    const distance = calculateDistance([centerLon, centerLat], garage.position);
    return distance <= radiusInMeters && !garage.isFull;
  });
  
  if (nearbyGarages.length === 0) {
    return null;
  }
  
  nearbyGarages.sort((a, b) => {
    const distA = calculateDistance([centerLon, centerLat], a.position);
    const distB = calculateDistance([centerLon, centerLat], b.position);
    return distA - distB;
  });
  
  const selectedGarage = nearbyGarages[0];
  
  const offset = 0.0001;
  const parkingPosition = [
    selectedGarage.position[0] + (Math.random() - 0.5) * offset,
    selectedGarage.position[1] + (Math.random() - 0.5) * offset
  ];
  
  return {
    garage: selectedGarage,
    position: parkingPosition,
    distance: calculateDistance([centerLon, centerLat], selectedGarage.position)
  };
};

// 获取所有停车区数据
const getAllParkingSpots = () => {
  return parkingSpots.value;
};

// 获取所有车库数据
const getAllGarages = () => {
  return garages.value;
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
    const isFull = bikeCount >= spot.maxCapacity;
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

// 更新车库占用状态 - 单独计算，暂时默认为0
const updateGarageStatus = () => {
  // 暂时不扫描车辆，所有车库状态默认为空闲
  garages.value = garages.value.map(garage => {
    // 这里可以根据需要添加车库专用的状态计算逻辑
    // 目前设置为默认值
    const bikeCount = 0; // 默认为0
    const isOccupied = false; // 默认为空闲
    const isFull = false; // 默认不满
    const occupancyRate = '0.0'; // 默认占用率为0

    return {
      ...garage,
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
      
      const area = calculatePolygonArea(coordinates[0][0]);
      const maxCapacity = Math.max(1, Math.floor(area));
      
      return {
        id: spotId,
        coordinates: coordinates,
        center: center,
        area: area,
        maxCapacity: maxCapacity,
        isOccupied: false,
        bikeCount: 0,
        isFull: false,
        occupancyRate: '0.0'
      };
    });

    console.log('加载的车位数据:', parkingSpots.value);
    
  } catch (error) {
    console.error('加载车位数据失败:', error);
  }
};

// 加载车库数据
const loadGarageData = async () => {
  try {
    const response = await fetch('/src/assets/ships/车库点.geojson');
    const data = await response.json();
    
    garages.value = data.features.map((feature, index) => {
      const coordinates = feature.geometry.coordinates;
      // 优先使用Name字段，其次是Number字段，最后使用索引
      const garageName = feature.properties?.Name || 
                        feature.properties?.name || 
                        `车库 #${feature.properties?.Number || (index + 1)}`;
      const garageId = feature.properties?.Number || 
                      feature.properties?.id || 
                      feature.properties?.ID || 
                      (index + 1);
      
      return {
        id: garageId,
        name: garageName, // 添加name字段用于显示
        position: coordinates,
        maxCapacity: GARAGE_CAPACITY,
        isOccupied: false,
        bikeCount: 0,
        isFull: false,
        occupancyRate: '0.0'
      };
    });

    console.log('加载的车库数据:', garages.value);
    
  } catch (error) {
    console.error('加载车库数据失败:', error);
  }
};

// 在 Cesium 地图上可视化车位
const visualizeParkingSpots = () => {
  const viewer = window.viewer3D;
  if (!viewer || !parkingSpots.value.length) return;
  
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

      // 只添加车位多边形，不添加标签
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

     
    } catch (error) {
      console.error('创建车位可视化失败:', error, spot);
    }
  });
};

// 可视化所有设施
const visualizeAll = () => {
  clearEntities();
  visualizeParkingSpots();
  visualizeGarages();
};

// 计算统计信息
const totalSpots = computed(() => parkingSpots.value.length);
const occupiedSpots = computed(() => parkingSpots.value.filter(spot => spot.isOccupied).length);
const availableSpots = computed(() => totalSpots.value - occupiedSpots.value);

const totalGarages = computed(() => garages.value.length);
const occupiedGarages = computed(() => garages.value.filter(garage => garage.isOccupied).length);
const availableGarages = computed(() => totalGarages.value - occupiedGarages.value);

// 组件加载时初始化
onMounted(async () => {
  await loadParkingData();
  await loadGarageData();
  
  updateParkingStatus();
  updateGarageStatus(); // 车库单独更新
  visualizeAll();
  
  setInterval(() => {
    updateParkingStatus(); // 车位继续扫描车辆
    updateGarageStatus();  // 车库保持默认状态
    visualizeAll();
  }, 3000);
  
  if (typeof window !== 'undefined') {
    window.findAvailableParkingSpotInRadius = findAvailableParkingSpotInRadius;
    window.findAvailableGarageInRadius = findAvailableGarageInRadius;
    window.getAllParkingSpots = getAllParkingSpots;
    window.getAllGarages = getAllGarages;
  }
});

defineExpose({
  findAvailableParkingSpotInRadius,
  findAvailableGarageInRadius,
  getAllParkingSpots,
  getAllGarages
});
</script>

<style scoped lang="scss">
.parking-garage-status {
  height: 100%;
  display: flex;
  flex-direction: column;
  
  .tab-switcher {
    display: flex;
    margin-bottom: 10px;
    background: var(--cl-panel-dark);
    border-radius: 4px;
    overflow: hidden;
    
    .tab-button {
      flex: 1;
      padding: 8px 12px;
      text-align: center;
      cursor: pointer;
      background: var(--cl-panel-light);
      color: var(--cl-text-secondary);
      transition: all 0.3s ease;
      font-size: 12px;
      
      &:hover {
        background: var(--cl-hover);
        color: var(--cl-text);
      }
      
      &.active {
        background: var(--cl-primary);
        color: var(--cl-text);
        font-weight: bold;
      }
    }
  }
  
  .parking-content, .garage-content {
    height: calc(100% - 50px);
    display: flex;
    flex-direction: column;
  }
  
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

  .parking-list, .garage-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px 0;
  }

  .parking-item, .garage-item {
    padding: 10px;
    margin-bottom: 8px;
    background: var(--cl-panel-light);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.3s ease;

    &:hover {
      background: var(--cl-panel-dark);
      transform: translateX(5px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .spot-info, .garage-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;

      .spot-id, .garage-id {
        font-weight: bold;
      }

      .spot-status, .garage-status {
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 10px;
        color: white;
      }
    }

    .spot-location, .garage-location {
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

  // 车位样式
  .parking-item {
    border-left: 4px solid var(--cl-success);

    &.occupied {
      border-left-color: var(--cl-warning);
    }

    &.full {
      border-left-color: var(--cl-danger);
    }

    .spot-status {
      background: var(--cl-success);

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

  // 车库样式
  .garage-item {
    border-left: 4px solid #2196f3;

    &.occupied {
      border-left-color: var(--cl-warning);
    }

    &.full {
      border-left-color: var(--cl-danger);
    }

    .garage-status {
      background: #2196f3;

      &.status-full {
        background-color: var(--cl-danger);
      }
      &.status-occupied {
        background-color: var(--cl-warning);
      }
      &.status-free {
        background-color: #2196f3;
      }
    }
  }
}
</style>