<template>
  <div class="bike-stats">
    <!-- 基础数据概览 -->
    <div class="data-section">
      <h4>共享单车概况</h4>
      <div class="data-item">
        <span class="label">总数量:</span>
        <span class="value">{{ stats.total || 0 }}</span>
      </div>
      <div class="data-item">
        <span class="label">可用车辆:</span>
        <span class="value">{{ stats.available || 0 }}</span>
      </div>
      <div class="data-item">
        <span class="label">使用中:</span>
        <span class="value">{{ stats.inUse || 0 }}</span>
      </div>
      <div class="data-item">
        <span class="label">维护中:</span>
        <span class="value">{{ stats.maintenance || 0 }}</span>
      </div>
      <div class="data-item">
        <span class="label">低电量:</span>
        <span class="value">{{ stats.lowBattery || 0 }}</span>
      </div>
      <div class="data-item">
        <span class="label">利用率:</span>
        <span class="value">{{ stats.utilization || 0 }}%</span>
      </div>
    </div>
    
    <!-- 区域密度 -->
    <div class="data-section" v-if="stats.total > 0">
      <h4>区域密度</h4>
      <div class="density-grid">
        <div class="density-item" v-for="(area, index) in densityData" :key="index">
          <div class="area-name">{{ area.name }}</div>
          <div class="density-bar-container">
            <div class="density-bar" :style="{ width: area.percentage + '%' }"></div>
            <span class="density-value">{{ area.count }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 状态分布 -->
    <div class="data-section" v-if="stats.total > 0">
      <h4>状态分布</h4>
      <div class="status-chart">
        <div class="pie-container">
          <!-- 新饼图实现 -->
          <svg class="pie-chart-svg" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" fill="transparent" />
            <path v-for="(segment, index) in pieSegments" 
                  :key="index"
                  :d="segment.path"
                  :fill="segment.color" />
            <circle cx="50" cy="50" r="25" :fill="'var(--cl-panel-bg)'" />
          </svg>
        </div>
        
        <div class="status-legend">
          <div class="legend-item">
            <div class="color-dot" style="background-color: #2ecc71;"></div>
            <div class="legend-label">可用 ({{ getPercentage(stats.available) }}%)</div>
          </div>
          <div class="legend-item">
            <div class="color-dot" style="background-color: #3498db;"></div>
            <div class="legend-label">使用中 ({{ getPercentage(stats.inUse) }}%)</div>
          </div>
          <div class="legend-item">
            <div class="color-dot" style="background-color: #f39c12;"></div>
            <div class="legend-label">维护中 ({{ getPercentage(stats.maintenance) }}%)</div>
          </div>
          <div class="legend-item">
            <div class="color-dot" style="background-color: #e74c3c;"></div>
            <div class="legend-label">低电量 ({{ getPercentage(stats.lowBattery) }}%)</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 单车分布热点 - 只有在有数据时才显示以提升性能 -->
    <div class="data-section" v-if="stats.total > 0">
      <h4>分布热点</h4>
      <div class="hotspot-map">
        <!-- 简易热点图 -->
        <div class="grid-container">
          <div v-for="(cell, index) in heatmapGrid" 
               :key="index" 
               class="grid-cell"
               :style="{ backgroundColor: getCellColor(cell.intensity) }">
          </div>
        </div>
        
        <!-- 坐标说明 -->
        <div class="map-legend">
          <div>西北</div>
          <div>东北</div>
          <div>西南</div>
          <div>东南</div>
        </div>
      </div>
    </div>
    
    <!-- 刷新按钮 -->
    <div class="refresh-section">
      <button @click="refreshData" class="refresh-btn">刷新数据</button>
      <div class="last-update">上次更新: {{ lastUpdate }}</div>
    </div>
    
    <!-- 无数据提示 -->
    <div class="no-data-message" v-if="stats.total === 0">
      <p>暂无共享单车数据</p>
      <p>请先点击工具栏的"生成节点"按钮生成数据</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import bikeStore from '@/cesiumUtils/BikeStore';
import { BikeStatus } from '@/cesiumUtils/randomPoints';

// 状态数据
const stats = ref({
  total: 0,
  available: 0,
  inUse: 0,
  maintenance: 0,
  lowBattery: 0,
  utilization: '0.00'
});

// 区域密度数据
const densityData = ref([
  { name: '市中心', count: 0, percentage: 0 },
  { name: '东湖区', count: 0, percentage: 0 },
  { name: '汉口区', count: 0, percentage: 0 },
  { name: '武昌区', count: 0, percentage: 0 },
  { name: '其他区域', count: 0, percentage: 0 }
]);

// 热力图网格
const heatmapGrid = ref(Array(16).fill().map(() => ({ intensity: 0 })));

// 最后更新时间
const lastUpdate = ref('未更新');

// 生成SVG饼图路径
const describeArc = (x, y, radius, startAngle, endAngle) => {
  // 将角度转换为弧度
  const start = (startAngle - 90) * Math.PI / 180;
  const end = (endAngle - 90) * Math.PI / 180;
  
  // 计算起点和终点坐标
  const startX = x + radius * Math.cos(start);
  const startY = y + radius * Math.sin(start);
  const endX = x + radius * Math.cos(end);
  const endY = y + radius * Math.sin(end);
  
  // 判断是否需要绘制大弧
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  
  // 生成SVG路径
  return [
    `M ${x} ${y}`, // 移动到圆心
    `L ${startX} ${startY}`, // 绘制到起始点
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`, // 绘制弧
    'Z' // 闭合路径
  ].join(' ');
};

// 饼图数据计算
const pieSegments = computed(() => {
  if (!stats.value || stats.value.total === 0) return [];
  
  // 准备各种状态数据
  const data = [
    { value: stats.value.available, color: '#2ecc71' },   // 可用 - 绿色
    { value: stats.value.inUse, color: '#3498db' },       // 使用中 - 蓝色 
    { value: stats.value.maintenance, color: '#f39c12' }, // 维护中 - 橙色
    { value: stats.value.lowBattery, color: '#e74c3c' }   // 低电量 - 红色
  ];
  
  // 过滤掉0值，避免空白扇区
  const validData = data.filter(item => item.value > 0);
  
  let startAngle = 0;
  const result = [];
  
  // 计算每个扇区的角度和SVG路径
  validData.forEach(item => {
    const percentage = (item.value / stats.value.total) * 100;
    const angle = (percentage / 100) * 360;
    const endAngle = startAngle + angle;
    
    result.push({
      percentage,
      color: item.color,
      path: describeArc(50, 50, 50, startAngle, endAngle)
    });
    
    startAngle = endAngle;
  });
  
  return result;
});

// 初始化和更新数据
const updateData = () => {
  try {
    // 检查是否已初始化
    const allBikes = bikeStore.getAllBikes();
    if (!allBikes || allBikes.length === 0) {
      console.log('BikeStore尚未初始化或没有数据');
      stats.value = {
        total: 0,
        available: 0,
        inUse: 0,
        maintenance: 0,
        lowBattery: 0,
        utilization: '0.00'
      };
      return;
    }

    // 获取统计数据
    const storeStats = bikeStore.getBikesStatistics();
    stats.value = storeStats;
    
    // 更新区域密度
    updateDensityData();
    
    // 更新热力图
    updateHeatmap();
    
    // 更新最后更新时间
    const now = new Date();
    lastUpdate.value = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    console.log('单车数据已更新, 总数:', stats.value.total);
  } catch (error) {
    console.error('更新单车数据失败:', error);
  }
};

// 更新区域密度数据
const updateDensityData = () => {
  const allBikes = bikeStore.getAllBikes();
  if (!allBikes || allBikes.length === 0) return;
  
  // 简单根据经纬度判断区域
  // 实际项目中可能需要更复杂的地理围栏判断
  const centerLon = 114.31;
  const centerLat = 30.58;
  
  // 清零计数
  densityData.value.forEach(area => {
    area.count = 0;
  });
  
  // 计算各区域单车数
  allBikes.forEach(bike => {
    const { longitude, latitude } = bike;
    const distance = Math.sqrt(Math.pow(longitude - centerLon, 2) + Math.pow(latitude - centerLat, 2));
    
    // 简易区域划分
    if (distance < 0.03) {
      // 市中心
      densityData.value[0].count++;
    } else if (longitude > centerLon && latitude > centerLat) {
      // 东北 - 东湖区
      densityData.value[1].count++;
    } else if (longitude < centerLon && latitude > centerLat) {
      // 西北 - 汉口区
      densityData.value[2].count++;
    } else if (longitude > centerLon && latitude < centerLat) {
      // 东南 - 武昌区
      densityData.value[3].count++;
    } else {
      // 其他区域
      densityData.value[4].count++;
    }
  });
  
  // 计算百分比
  densityData.value.forEach(area => {
    area.percentage = Math.round((area.count / stats.value.total) * 100);
  });
};

// 更新热力图数据
const updateHeatmap = () => {
  const allBikes = bikeStore.getAllBikes();
  if (!allBikes || allBikes.length === 0) return;
  
  // 初始化热力图
  heatmapGrid.value = Array(16).fill().map(() => ({ intensity: 0 }));
  
  // 设置地图边界
  const minLon = 113.8;
  const maxLon = 114.7;
  const minLat = 30.2;
  const maxLat = 30.8;
  const lonRange = maxLon - minLon;
  const latRange = maxLat - minLat;
  
  // 计算每个单车所在的网格
  allBikes.forEach(bike => {
    const { longitude, latitude } = bike;
    
    // 计算在4x4网格中的位置
    const gridX = Math.min(3, Math.max(0, Math.floor((longitude - minLon) / lonRange * 4)));
    const gridY = Math.min(3, Math.max(0, Math.floor((latitude - minLat) / latRange * 4)));
    
    // 计算一维索引
    const index = gridY * 4 + gridX;
    
    // 增加强度
    if (index >= 0 && index < 16) {
      heatmapGrid.value[index].intensity++;
    }
  });
  
  // 归一化强度值到0-1
  const maxIntensity = Math.max(...heatmapGrid.value.map(cell => cell.intensity));
  if (maxIntensity > 0) {
    heatmapGrid.value.forEach(cell => {
      cell.intensity = cell.intensity / maxIntensity;
    });
  }
};

// 获取百分比
const getPercentage = (value) => {
  if (!stats.value.total) return 0;
  return Math.round((value / stats.value.total) * 100);
};

// 获取热力图单元格颜色
const getCellColor = (intensity) => {
  // 强度为0时显示透明
  if (intensity === 0) return 'transparent';
  
  // 使用热力图色值（从蓝到红）
  const r = Math.floor(intensity * 240);
  const g = Math.floor(80 - intensity * 80);
  const b = Math.floor(255 - intensity * 255);
  return `rgba(${r}, ${g}, ${b}, ${0.3 + intensity * 0.7})`;
};

// 手动刷新数据
const refreshData = () => {
  updateData();
};

// 组件挂载时初始化数据
let removeListener;
onMounted(() => {
  // 添加数据变化监听器
  if (typeof bikeStore.addChangeListener === 'function') {
    removeListener = bikeStore.addChangeListener(updateData);
  }
  
  // 首次更新数据
  updateData();
});

// 组件卸载时移除监听器
onUnmounted(() => {
  if (removeListener) {
    removeListener();
  }
});
</script>

<style scoped lang="scss">
.bike-stats {
  color: var(--cl-text);
}

.data-section {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  
  h4 {
    margin: 0 0 10px 0;
    font-size: 16px;
    color: var(--cl-primary);
  }
}

.data-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  
  .label {
    color: rgba(255, 255, 255, 0.7);
  }
  
  .value {
    font-weight: bold;
  }
}

.density-grid {
  .density-item {
    margin-bottom: 10px;
    
    .area-name {
      margin-bottom: 4px;
      font-size: 13px;
    }
    
    .density-bar-container {
      position: relative;
      height: 8px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
      
      .density-bar {
        height: 100%;
        background: var(--cl-primary);
        border-radius: 4px;
      }
      
      .density-value {
        position: absolute;
        right: 0;
        top: -18px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.8);
      }
    }
  }
}

.status-chart {
  display: flex;
  flex-direction: column;
  align-items: center;
  
  .pie-container {
    position: relative;
    width: 100px;
    height: 100px;
    margin: 0 auto;
  }
  
  .pie-chart-svg {
    width: 100%;
    height: 100%;
  }
  
  .status-legend {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 15px;
    width: 100%;
    
    .legend-item {
      display: flex;
      align-items: center;
      
      .color-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 6px;
      }
      
      .legend-label {
        font-size: 12px;
      }
    }
  }
}

.hotspot-map {
  .grid-container {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 2px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    overflow: hidden;
    
    .grid-cell {
      height: 40px;
      transition: background-color 0.3s;
    }
  }
  
  .map-legend {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(2, 1fr);
    margin-top: 5px;
    font-size: 10px;
    text-align: center;
    color: rgba(255, 255, 255, 0.6);
  }
}

.refresh-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  
  .refresh-btn {
    padding: 6px 12px;
    background: var(--cl-primary);
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 14px;
    margin-bottom: 8px;
    
    &:hover {
      background: var(--cl-hover);
    }
  }
  
  .last-update {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }
}

.no-data-message {
  text-align: center;
  padding: 20px;
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
}
</style>
