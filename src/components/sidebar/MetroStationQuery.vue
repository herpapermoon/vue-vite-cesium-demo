<template>
  <div class="metro-station-query">
    <h4>地铁站查询</h4>
    
    <!-- 统计卡片 -->
    <div v-if="metroStations.length > 0" class="stats-cards">
      <div class="stat-card">
        <div class="stat-value">{{ avgBikes }}</div>
        <div class="stat-label">平均单车数</div>
      </div>
      <div class="stat-card good">
        <div class="stat-value">{{ goodCoverage }}</div>
        <div class="stat-label">优质覆盖</div>
      </div>
      <div class="stat-card poor">
        <div class="stat-value">{{ poorCoverage }}</div>
        <div class="stat-label">覆盖不足</div>
      </div>
    </div>

    <div class="query-controls">
      <button class="query-btn" @click="loadMetroStations" :disabled="isLoading">
        {{ isLoading ? '加载中...' : '查询地铁站' }}
      </button>
    </div>
    
    <div v-if="isLoading" class="loading-indicator">
      <div class="spinner"></div>
      <div>正在加载地铁站数据...</div>
    </div>
    
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <!-- 区域过滤 -->
    <div v-if="metroStations.length > 0" class="filter-controls">
      <select v-model="selectedArea" @change="filterStations">
        <option value="all">全部区域</option>
        <option v-for="area in uniqueAreas" :value="area">{{ area }}</option>
      </select>
    </div>

    <div v-if="metroStations.length > 0" class="stations-list">
      <h5>武汉市地铁站 ({{ filteredStations.length }})</h5>
      
      <div class="stations-table-container">
        <table class="stations-table">
          <thead>
            <tr>
              <th>地铁站名称</th>
              <th>区域</th>
              <th>周边单车</th>
              <th>覆盖评级</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="station in filteredStations" 
              :key="station.id" 
              :class="getCoverageClass(station.bikeCount)"
            >
              <td>{{ station.name }}</td>
              <td>{{ station.area }}</td>
              <td>{{ station.bikeCount }}</td>
              <td>
                <span class="rating-stars">{{ getCoverageRating(station.bikeCount) }}</span>
              </td>
              <td>
                <button class="locate-btn" @click="locateStation(station)">
                  定位
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <div v-else-if="!isLoading && !error" class="no-data-message">
      点击"查询地铁站"按钮加载地铁站数据
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import bikeStore from '@/cesiumUtils/BikeStore';
import { calculateDistance } from '@/cesiumUtils/randomPoints';
import Cesium from '@/cesiumUtils/cesium';
import { parseCSV } from '@/cesiumUtils/csvParser';

// 状态变量
const metroStations = ref([]);
const isLoading = ref(false);
const error = ref('');
const selectedArea = ref('all');
const uniqueAreas = ref([]);

// Cesium相关变量
let viewer = null;
let stationEntities = [];
let pulseAnimationHandler = null;
let currentAnimationEntities = [];

// 计算属性
const avgBikes = computed(() => {
  if (metroStations.value.length === 0) return 0;
  const total = metroStations.value.reduce((sum, s) => sum + s.bikeCount, 0);
  return (total / metroStations.value.length).toFixed(1);
});

const goodCoverage = computed(() => 
  metroStations.value.filter(s => s.bikeCount >= 30).length
);

const poorCoverage = computed(() => 
  metroStations.value.filter(s => s.bikeCount < 10).length
);

const filteredStations = computed(() => {
  return metroStations.value.filter(station => 
    selectedArea.value === 'all' || station.area === selectedArea.value
  );
});

// 方法
const getCoverageRating = (count) => {
  if (count >= 50) return '⭐⭐⭐⭐⭐';
  if (count >= 30) return '⭐⭐⭐⭐';
  if (count >= 20) return '⭐⭐⭐';
  if (count >= 10) return '⭐⭐';
  return '⭐';
};

const getCoverageClass = (count) => ({
  'good-row': count >= 30,
  'warning-row': count >= 10 && count < 30,
  'poor-row': count < 10
});

const getCesiumViewer = () => {
  if (!viewer && window.viewer3D) viewer = window.viewer3D;
  return viewer;
};

const clearStationEntities = () => {
  const viewer = getCesiumViewer();
  if (!viewer) return;
  stationEntities.forEach(entity => viewer.entities.remove(entity));
  stationEntities = [];
};

const clearAnimationEntities = () => {
  const viewer = getCesiumViewer();
  if (!viewer) return;
  if (pulseAnimationHandler) clearInterval(pulseAnimationHandler);
  currentAnimationEntities.forEach(entity => viewer.entities.remove(entity));
  currentAnimationEntities = [];
};

const loadMetroStations = async () => {
  isLoading.value = true;
  error.value = '';
  clearStationEntities();
  clearAnimationEntities();

  try {
    const response = await fetch('./data/武汉市POI数据.csv');
    if (!response.ok) throw new Error(`HTTP错误 ${response.status}`);
    const csvText = await response.text();
    const allPois = parseCSV(csvText, { hasHeader: true });

    const stations = allPois
      .filter(poi => poi.中类 === '地铁')
      .map((poi, index) => ({
        id: `station-${index}`,
        name: poi.名称 || '未命名地铁站',
        area: poi.区域 || '未知区域',
        longitude: parseFloat(poi.经度),
        latitude: parseFloat(poi.纬度),
        bikeCount: 0
      }));

    if (stations.length === 0) {
      error.value = '未找到地铁站数据';
    } else {
      calculateBikesNearStations(stations);
      metroStations.value = stations;
      uniqueAreas.value = [...new Set(stations.map(s => s.area))];
      displayAllStations(stations);
    }
  } catch (err) {
    error.value = `加载失败: ${err.message}`;
  } finally {
    isLoading.value = false;
  }
};

const calculateBikesNearStations = (stations) => {
  const allBikes = bikeStore.getAllBikes();
  stations.forEach(station => {
    station.bikeCount = allBikes.filter(bike => {
      const distance = calculateDistance(
        [station.longitude, station.latitude],
        [bike.longitude, bike.latitude]
      );
      return distance <= 1000;
    }).length;
  });
};

const displayAllStations = (stations) => {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  stations.forEach(station => {
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(station.longitude, station.latitude),
      billboard: {
        image: './data/metro_icon.png',
        scale: 0.05
      },
      label: {
        text: station.name,
        show: false
      }
    });
    stationEntities.push(entity);
  });
};

const locateStation = (station) => {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  clearAnimationEntities();
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(station.longitude, station.latitude, 400),
    orientation: {
      pitch: Cesium.Math.toRadians(-90)
    }
  });
  highlightStation(station);
};

const highlightStation = (station) => {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const circle = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(station.longitude, station.latitude),
    ellipse: {
      semiMinorAxis: 30,
      semiMajorAxis: 30,
      material: Cesium.Color.DEEPSKYBLUE.withAlpha(0.7)
    },
    label: {
      text: `${station.name}\n周边单车: ${station.bikeCount}辆`,
      show: true
    }
  });

  currentAnimationEntities.push(circle);
  let alpha = 0.7;
  let increasing = false;
  let counter = 0;
  pulseAnimationHandler = setInterval(() => {
    alpha = increasing ? alpha + 0.05 : alpha - 0.05;
    if (alpha >= 0.7) increasing = false;
    if (alpha <= 0.2) increasing = true;
    circle.ellipse.material = Cesium.Color.DEEPSKYBLUE.withAlpha(alpha);
    if (++counter >= 10) {
      clearInterval(pulseAnimationHandler);
      setTimeout(() => viewer.entities.remove(circle), 2000);
    }
  }, 50);
};

onMounted(() => {
  setTimeout(() => viewer = getCesiumViewer(), 1000);
});
</script>

<style scoped lang="scss">
.metro-station-query {
  color: var(--cl-text);
  padding: 10px;

  h4 {
    margin: 0 0 15px 0;
    color: var(--cl-primary);
  }
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 15px;

  .stat-card {
    background: rgba(255,255,255,0.1);
    border-radius: 8px;
    padding: 12px;
    text-align: center;

    &.good { border-top: 3px solid #4CAF50; }
    &.poor { border-top: 3px solid #F44336; }

    .stat-value {
      font-size: 18px;
      font-weight: bold;
      color: var(--cl-primary);
    }

    .stat-label {
      font-size: 12px;
      color: rgba(255,255,255,0.8);
    }
  }
}

.filter-controls {
  margin: 10px 0;

  select {
    width: 100%;
    padding: 6px;
    background: var(--cl-panel-bg);
    border: 1px solid var(--cl-border);
    color: var(--cl-text);
    border-radius: 4px;
  }
}

.stations-table {
  th:nth-child(2), td:nth-child(2) { width: 20%; }
  th:nth-child(3), td:nth-child(3) { width: 15%; }
  th:nth-child(4), td:nth-child(4) { width: 20%; }

  .good-row { background: rgba(76, 175, 80, 0.1) !important; }
  .warning-row { background: rgba(255, 193, 7, 0.1) !important; }
  .poor-row { background: rgba(244, 67, 54, 0.1) !important; }
}

.rating-stars {
  color: #FFD700;
  font-size: 14px;
}

.query-controls {
  margin-bottom: 15px;
}

.query-btn {
  padding: 8px 15px;
  background: var(--cl-primary);
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  
  &:hover:not(:disabled) {
    background: var(--cl-hover);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.loading-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 20px 0;
  
  .spinner {
    width: 30px;
    height: 30px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: var(--cl-primary);
    animation: spin 1s ease-in-out infinite;
    margin-bottom: 10px;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
}

.error-message {
  color: #e74c3c;
  padding: 10px;
  background: rgba(231, 76, 60, 0.1);
  border-radius: 4px;
  margin: 10px 0;
}

.stations-table-container {
  max-height: 300px;
  overflow-y: auto;
  margin: 10px 0;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--cl-primary-dark);
    border-radius: 3px;
  }
}

.stations-table {
  width: 100%;
  border-collapse: collapse;
  
  th, td {
    padding: 8px;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  th {
    font-weight: bold;
    background: rgba(20, 40, 70, 0.8);
  }
  
  tr:hover {
    background: rgba(255, 255, 255, 0.05);
  }
}

.locate-btn {
  padding: 4px 8px;
  background: var(--cl-secondary);
  border: none;
  border-radius: 4px;
  color: var(--cl-text);
  cursor: pointer;
  font-size: 12px;
  
  &:hover {
    background: var(--cl-hover);
  }
}

.no-data-message {
  text-align: center;
  padding: 20px;
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
}
</style>