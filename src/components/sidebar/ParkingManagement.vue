<template>
  <div class="parking-management">
    <!-- 切换标签 -->
    <div class="tab-switcher">
      <div 
        class="tab-button" 
        :class="{ active: activeTab === 'parking' }"
        @click="activeTab = 'parking'">
        🅿️ 车位管理
      </div>
      <div 
        class="tab-button" 
        :class="{ active: activeTab === 'garage' }"
        @click="activeTab = 'garage'">
        🏢 车库管理
      </div>
    </div>

    <!-- 车位内容 -->
    <div v-if="activeTab === 'parking'" class="parking-content">
      <div class="status-header">
        <h4>校园车位状态</h4>
        <div class="status-summary">
          <div class="status-item available">
            <span class="label">总车位:</span>
            <span class="value">{{ totalSpots }}</span>
          </div>
          <div class="status-item occupied">
            <span class="label">已占用:</span>
            <span class="value">{{ occupiedSpots }}</span>
          </div>
          <div class="status-item free">
            <span class="label">空闲:</span>
            <span class="value">{{ availableSpots }}</span>
          </div>
        </div>
      </div>

      <div class="controls">
        <button 
          class="control-btn" 
          @click="refreshParkingData"
          :disabled="isLoading">
          🔄 刷新数据
        </button>
        <button 
          class="control-btn" 
          @click="toggleVisualization">
          {{ showVisualization ? '🙈 隐藏可视化' : '👁️ 显示可视化' }}
        </button>
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
          :data-occupancy="getOccupancyLevel(spot.occupancyRate)"
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
          <div class="spot-details">
            <div class="detail-row">
              <span class="detail-label">位置:</span>
              <span class="detail-value">{{ formatLocation(spot.center) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">占用:</span>
              <span class="detail-value">{{ spot.bikeCount }}/{{ spot.maxCapacity }} ({{ spot.occupancyRate }}%)</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">面积:</span>
              <span class="detail-value">{{ spot.area?.toFixed(2) || 0 }} m²</span>
            </div>
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
          <div class="status-item available">
            <span class="label">总车库:</span>
            <span class="value">{{ totalGarages }}</span>
          </div>
          <div class="status-item occupied">
            <span class="label">已占用:</span>
            <span class="value">{{ occupiedGarages }}</span>
          </div>
          <div class="status-item free">
            <span class="label">空闲:</span>
            <span class="value">{{ availableGarages }}</span>
          </div>
        </div>
      </div>

      <div class="controls">
        <button 
          class="control-btn" 
          @click="refreshGarageData"
          :disabled="isLoading">
          🔄 刷新数据
        </button>
        <button 
          class="control-btn" 
          @click="toggleVisualization">
          {{ showVisualization ? '🙈 隐藏可视化' : '👁️ 显示可视化' }}
        </button>
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
          :data-occupancy="getOccupancyLevel(garage.occupancyRate)"
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
          <div class="garage-details">
            <div class="detail-row">
              <span class="detail-label">位置:</span>
              <span class="detail-value">{{ formatLocation(garage.position) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">占用:</span>
              <span class="detail-value">{{ garage.bikeCount }}/{{ garage.maxCapacity }} ({{ garage.occupancyRate }}%)</span>
            </div>
          </div>
          <div class="click-hint">点击跳转到地图位置</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, defineExpose, nextTick } from 'vue';
import bikeStore from '@/cesiumUtils/BikeStore';
import { calculateDistance } from '@/cesiumUtils/randomPoints';
import Cesium from '@/cesiumUtils/cesium';

// 响应式状态
const activeTab = ref('parking');
const parkingSpots = ref([]);
const garages = ref([]);
const isLoading = ref(false);
const showVisualization = ref(true);

// 常量定义
const PARKING_HEIGHT = 20;
const GARAGE_CYLINDER_RADIUS = 2;
const GARAGE_CYLINDER_HEIGHT = 10;
const GARAGE_CAPACITY = 100;
const UPDATE_INTERVAL = 5000; // 5秒更新一次

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
const isPointInGarageRadius = (point, garagePosition, radius = 50) => {
  const distance = calculateDistance(point, garagePosition);
  return distance <= radius;
};

// 跳转到指定车位
const flyToSpot = (spot) => {
  if (!bikeStore.viewer || !spot.center) return;
  
  const destination = Cesium.Cartesian3.fromDegrees(
    spot.center[0], 
    spot.center[1], 
    200
  );
  
  bikeStore.viewer.camera.flyTo({
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
  if (!bikeStore.viewer || !garage.position) return;
  
  const destination = Cesium.Cartesian3.fromDegrees(
    garage.position[0], 
    garage.position[1], 
    150
  );
  
  bikeStore.viewer.camera.flyTo({
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
  if (!bikeStore.viewer) return;
  
  const entities = bikeStore.viewer.entities.values;
  const spotEntity = entities.find(entity => 
    entity.name === `车位 #${spot.id}`
  );
  
  if (spotEntity && spotEntity.polygon) {
    const originalMaterial = spotEntity.polygon.material;
    spotEntity.polygon.material = Cesium.Color.CYAN.withAlpha(0.8);
    
    setTimeout(() => {
      spotEntity.polygon.material = originalMaterial;
    }, 2000);
  }
};

// 高亮显示指定车库
const highlightGarage = (garage) => {
  if (!bikeStore.viewer) return;
  
  const entities = bikeStore.viewer.entities.values;
  const garageEntity = entities.find(entity => 
    entity.name === `车库 #${garage.id}`
  );
  
  if (garageEntity && garageEntity.cylinder) {
    const originalMaterial = garageEntity.cylinder.material;
    garageEntity.cylinder.material = Cesium.Color.CYAN.withAlpha(0.8);
    
    setTimeout(() => {
      garageEntity.cylinder.material = originalMaterial;
    }, 2000);
  }
};

// 清除实体
const clearEntities = () => {
  if (!bikeStore.viewer) return;
  
  const entities = bikeStore.viewer.entities.values.slice();
  entities.forEach(entity => {
    if (entity.name && (
      entity.name.includes('车位') || 
      entity.name.includes('车库')
    )) {
      bikeStore.viewer.entities.remove(entity);
    }
  });
};

// 在 Cesium 地图上可视化车位
const visualizeParkingSpots = () => {
  if (!bikeStore.viewer || !parkingSpots.value.length || !showVisualization.value) return;
  
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

      bikeStore.viewer.entities.add({
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

// 在 Cesium 地图上可视化车库
const visualizeGarages = () => {
  if (!bikeStore.viewer || !garages.value.length || !showVisualization.value) return;
  
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

      bikeStore.viewer.entities.add({
        name: `车库 #${displayId}`,
        position: Cesium.Cartesian3.fromDegrees(
          lon,
          lat,
          PARKING_HEIGHT + GARAGE_CYLINDER_HEIGHT / 2
        ),
        cylinder: {
          topRadius: GARAGE_CYLINDER_RADIUS,
          bottomRadius: GARAGE_CYLINDER_RADIUS,
          length: GARAGE_CYLINDER_HEIGHT,
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

// 可视化所有设施
const visualizeAll = () => {
  if (showVisualization.value) {
    clearEntities();
    visualizeParkingSpots();
    visualizeGarages();
  } else {
    clearEntities();
  }
};

// 切换可视化显示
const toggleVisualization = () => {
  showVisualization.value = !showVisualization.value;
  visualizeAll();
};

// 更新车位占用状态
const updateParkingStatus = () => {
  const bikes = bikeStore.getAllBikes();
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

// 更新车库占用状态
const updateGarageStatus = () => {
  const bikes = bikeStore.getAllBikes();
  if (!bikes || !garages.value) return;
  
  garages.value = garages.value.map(garage => {
    const bikesInGarage = bikes.filter(bike => {
      if (bike.status !== 'parked') return false;
      return isPointInGarageRadius(
        [bike.longitude, bike.latitude],
        garage.position,
        50 // 50米范围内
      );
    });

    const bikeCount = bikesInGarage.length;
    const isOccupied = bikeCount > 0;
    const isFull = bikeCount >= garage.maxCapacity;
    const occupancyRate = (bikeCount / garage.maxCapacity * 100).toFixed(1);

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
    isLoading.value = true;
    const response = await fetch('/src/assets/ships/车位new.geojson');
    const data = await response.json();
    
    parkingSpots.value = data.features.map((feature, index) => {
      const coordinates = feature.geometry.coordinates;
      const center = calculatePolygonCenter(coordinates[0][0]);
      const spotId = feature.properties?.id || feature.properties?.ID || feature.properties?.name || (index + 1);
      
      const area = calculatePolygonArea(coordinates[0][0]);
      const maxCapacity = Math.max(1, Math.floor(area / 1)); // 改为每1平方米1辆单车
      
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
  } finally {
    isLoading.value = false;
  }
};

// 加载车库数据
const loadGarageData = async () => {
  try {
    isLoading.value = true;
    const response = await fetch('/src/assets/ships/车库点.geojson');
    const data = await response.json();
    
    garages.value = data.features.map((feature, index) => {
      const coordinates = feature.geometry.coordinates;
      const garageName = feature.properties?.Name || 
                        feature.properties?.name || 
                        `车库 #${feature.properties?.Number || (index + 1)}`;
      const garageId = feature.properties?.Number || 
                      feature.properties?.id || 
                      feature.properties?.ID || 
                      (index + 1);
      
      return {
        id: garageId,
        name: garageName,
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
  } finally {
    isLoading.value = false;
  }
};

// 刷新数据
const refreshParkingData = async () => {
  await loadParkingData();
  updateParkingStatus();
  if (showVisualization.value) {
    visualizeAll();
  }
};

const refreshGarageData = async () => {
  await loadGarageData();
  updateGarageStatus();
  if (showVisualization.value) {
    visualizeAll();
  }
};

// 查找可用停车位
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
  
  return nearbySpots[0];
};

// 查找可用车库
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
  
  return nearbyGarages[0];
};

// 计算统计信息
const totalSpots = computed(() => parkingSpots.value.length);
const occupiedSpots = computed(() => parkingSpots.value.filter(spot => spot.isOccupied).length);
const availableSpots = computed(() => totalSpots.value - occupiedSpots.value);

const totalGarages = computed(() => garages.value.length);
const occupiedGarages = computed(() => garages.value.filter(garage => garage.isOccupied).length);
const availableGarages = computed(() => totalGarages.value - occupiedGarages.value);

// 根据占用率获取占用等级
const getOccupancyLevel = (occupancyRate) => {
  const rate = parseFloat(occupancyRate) || 0;
  if (rate === 0) return '0';
  if (rate <= 25) return '25';
  if (rate <= 50) return '50';
  if (rate <= 75) return '75';
  return '100';
};

// 定时更新
let updateTimer = null;

// 组件加载时初始化
onMounted(async () => {
  await nextTick(); // 等待DOM更新
  
  // 等待bikeStore.viewer可用
  const waitForViewer = () => {
    return new Promise((resolve) => {
      const checkViewer = () => {
        if (window.viewer3D) {
          bikeStore.setViewer(window.viewer3D);
          resolve();
        } else {
          setTimeout(checkViewer, 100);
        }
      };
      checkViewer();
    });
  };
  
  await waitForViewer();
  
  // 加载数据
  await Promise.all([loadParkingData(), loadGarageData()]);
  
  // 初始化状态
  updateParkingStatus();
  updateGarageStatus();
  visualizeAll();
  
  // 设置定时更新
  updateTimer = setInterval(() => {
    updateParkingStatus();
    updateGarageStatus();
    if (showVisualization.value) {
      visualizeAll();
    }
  }, UPDATE_INTERVAL);
});

// 清理定时器
import { onUnmounted } from 'vue';
onUnmounted(() => {
  if (updateTimer) {
    clearInterval(updateTimer);
  }
  clearEntities();
});

defineExpose({
  findAvailableParkingSpotInRadius,
  findAvailableGarageInRadius,
  parkingSpots,
  garages
});
</script>

<style scoped lang="scss">
.parking-management {
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
      background: #4a90e2; // 改为蓝色背景
      color: white; // 白色文字
      transition: all 0.3s ease;
      font-size: 12px;
      
      &:hover {
        background: #357abd; // hover时深一点的蓝色
        color: white;
      }
      
      &.active {
        background: #2c5aa0; // 激活状态的深蓝色
        color: white;
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
      font-size: 14px;
    }
  }

  .status-summary {
    display: flex;
    justify-content: space-between;
    gap: 8px;

    .status-item {
      flex: 1;
      text-align: center;
      padding: 8px;
      border-radius: 4px;
      background: var(--cl-panel-light);
      
      &.available {
        border-left: 3px solid var(--cl-info);
      }
      
      &.occupied {
        border-left: 3px solid var(--cl-warning);
      }
      
      &.free {
        border-left: 3px solid var(--cl-success);
      }
      
      .label {
        display: block;
        font-size: 11px;
        color: var(--cl-text-secondary);
        margin-bottom: 2px;
      }
      
      .value {
        display: block;
        font-size: 16px;
        font-weight: bold;
        color: var(--cl-text);
      }
    }
  }

  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
    
    .control-btn {
      flex: 1;
      padding: 6px 12px;
      background: var(--cl-secondary);
      color: var(--cl-text);
      border: 1px solid var(--cl-border);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.3s ease;
      
      &:hover:not(:disabled) {
        background: var(--cl-hover);
      }
      
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }

  .parking-list, .garage-list {
    flex: 1;
    overflow-y: auto;
    padding: 5px 0;
  }

  .parking-item, .garage-item {
    padding: 12px;
    margin-bottom: 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.3s ease;
    border-left: 4px solid var(--cl-success);

    // 根据占用率动态设置背景色
    &[data-occupancy="0"] {
      background: #90ee90; // 淡绿色 (0%)
    }
    
    &[data-occupancy="25"] {
      background: #ffff99; // 淡黄色 (1-25%)
    }
    
    &[data-occupancy="50"] {
      background: #ffcc66; // 橙色 (26-50%)
    }
    
    &[data-occupancy="75"] {
      background: #ff9966; // 深橙色 (51-75%)
    }
    
    &[data-occupancy="100"] {
      background: #ff6666; // 红色 (76-100%)
    }

    &:hover {
      transform: translateX(5px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      filter: brightness(0.9); // hover时稍微变暗
      
      .click-hint {
        opacity: 1;
      }
    }

    &.occupied {
      border-left-color: var(--cl-warning);
    }

    &.full {
      border-left-color: var(--cl-danger);
    }

    .spot-info, .garage-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;

      .spot-id, .garage-id {
        font-weight: bold;
        font-size: 14px;
        color: #000; // 黑色字体以便在浅色背景上清晰显示
      }

      .spot-status, .garage-status {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 12px;
        color: white;
        font-weight: bold;
        
        &.status-free {
          background-color: var(--cl-success);
        }
        
        &.status-occupied {
          background-color: var(--cl-warning);
        }
        
        &.status-full {
          background-color: var(--cl-danger);
        }
      }
    }

    .spot-details, .garage-details {
      .detail-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
        
        .detail-label {
          font-size: 12px;
          color: #333; // 深灰色以便在浅色背景上清晰显示
        }
        
        .detail-value {
          font-size: 12px;
          color: #000; // 黑色以便在浅色背景上清晰显示
          font-weight: 500;
        }
      }
    }

    .click-hint {
      font-size: 10px;
      color: #666; // 深灰色以便在浅色背景上清晰显示
      text-align: center;
      margin-top: 8px;
      padding: 4px;
      background: rgba(0, 0, 0, 0.1); // 黑色半透明背景
      border-radius: 3px;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
  }

  // 车库特殊样式
  .garage-item {
    border-left-color: #2196f3;
    
    &.occupied {
      border-left-color: var(--cl-warning);
    }

    &.full {
      border-left-color: var(--cl-danger);
    }
    
    .garage-status {
      &.status-free {
        background-color: #2196f3;
      }
    }
  }
}
</style>