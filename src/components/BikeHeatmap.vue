<template>
  <div class="heatmap-container" :class="{ active: visible }">
    <div class="heatmap-header">
      <h3>单车停放热点分析</h3>
      <div class="header-controls">
        <button class="close-btn" @click="close">✕</button>
      </div>
    </div>
    
    <div class="heatmap-content">
      <!-- 时段选择器 -->
      <div class="time-selector">
        <div class="time-label">时间范围：</div>
        <div class="time-options">
          <button 
            v-for="option in timeOptions" 
            :key="option.value" 
            :class="{ active: selectedTimeRange === option.value }"
            @click="selectTimeRange(option.value)">
            {{ option.label }}
          </button>
        </div>
      </div>
      
      <!-- 热点类型选择 -->
      <div class="heatmap-type-selector">
        <div class="type-label">显示类型：</div>
        <div class="type-options">
          <button 
            v-for="option in typeOptions" 
            :key="option.value" 
            :class="{ active: selectedType === option.value }"
            @click="selectType(option.value)">
            {{ option.label }}
          </button>
        </div>
      </div>
      
      <!-- 统计数据 -->
      <div class="heatmap-stats">
        <div class="stats-item">
          <div class="stats-label">热点区域数量：</div>
          <div class="stats-value">{{ hotspotCount }}</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">分析范围内单车总数：</div>
          <div class="stats-value">{{ totalBikesInRange }}</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">最高密度区域：</div>
          <div class="stats-value">{{ highestDensityArea }}</div>
        </div>
      </div>
      
      <!-- 时段分布图表 -->
      <div class="time-distribution">
        <div class="chart-title">各时段单车停放分布</div>
        <div class="chart-container" ref="timeChart"></div>
      </div>
    </div>
    
    <div class="heatmap-footer">
      <button class="action-btn refresh-btn" @click="refreshAnalysis">刷新分析</button>
      <button class="action-btn" @click="exportData">导出数据</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted, nextTick } from 'vue';
import bikeStoreInstance from '@/cesiumUtils/BikeStore';
import Cesium from '@/cesiumUtils/cesium';
// 导入ECharts核心模块
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, TitleComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// 注册必需的组件
echarts.use([
  BarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  CanvasRenderer
]);

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  viewer: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['close', 'update']);

// 状态变量
const selectedTimeRange = ref('today');
const selectedType = ref('parked');
const hotspotCount = ref(0);
const totalBikesInRange = ref(0);
const highestDensityArea = ref('未知');
const heatmapLayer = ref(null);
const timeChartInstance = ref(null);
const timeChart = ref(null);

// 时间选项
const timeOptions = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '全部', value: 'all' }
];

// 热点类型选项
const typeOptions = [
  { label: '停放热点', value: 'parked' },
  { label: '骑行起点', value: 'start' },
  { label: '骑行终点', value: 'end' },
  { label: '全部活动', value: 'all' }
];

// 关闭面板
const close = () => {
  clearHeatmap();
  emit('close');
};

// 选择时间范围
const selectTimeRange = (range) => {
  selectedTimeRange.value = range;
  generateHeatmap();
};

// 选择热点类型
const selectType = (type) => {
  selectedType.value = type;
  generateHeatmap();
};

// 刷新分析
const refreshAnalysis = () => {
  generateHeatmap();
};

// 导出数据
const exportData = () => {
  try {
    const data = analyzeHeatmapData();
    
    // 创建导出字符串
    let exportStr = '单车热点分析数据\n';
    exportStr += `分析时间: ${new Date().toLocaleString()}\n`;
    exportStr += `时间范围: ${getTimeRangeLabel(selectedTimeRange.value)}\n`;
    exportStr += `热点类型: ${getTypeLabel(selectedType.value)}\n`;
    exportStr += `热点区域数量: ${hotspotCount.value}\n`;
    exportStr += `分析范围内单车总数: ${totalBikesInRange.value}\n`;
    exportStr += `最高密度区域: ${highestDensityArea.value}\n\n`;
    
    exportStr += '热点区域详情:\n';
    data.hotspots.forEach((spot, index) => {
      exportStr += `${index + 1}. 位置: ${spot.location.longitude.toFixed(6)}, ${spot.location.latitude.toFixed(6)}, 密度: ${spot.density}\n`;
    });
    
    exportStr += '\n时段分布数据:\n';
    data.timeDistribution.forEach((count, hour) => {
      exportStr += `${hour}时: ${count}辆\n`;
    });
    
    // 创建下载
    const blob = new Blob([exportStr], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `单车热点分析_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('导出数据失败:', error);
  }
};

// 获取时间范围标签
const getTimeRangeLabel = (value) => {
  const option = timeOptions.find(opt => opt.value === value);
  return option ? option.label : '未知';
};

// 获取类型标签
const getTypeLabel = (value) => {
  const option = typeOptions.find(opt => opt.value === value);
  return option ? option.label : '未知';
};

// 生成热力图
const generateHeatmap = () => {
  try {
    clearHeatmap();
    const data = analyzeHeatmapData();
    renderHeatmap(data);
    updateStats(data);
    renderTimeDistribution(data);
  } catch (error) {
    console.error('生成热力图失败:', error);
  }
};

// 分析热力图数据
const analyzeHeatmapData = () => {
  // 从BikeStore获取数据
  const bikes = getBikesInTimeRange();
  totalBikesInRange.value = bikes.length;
  
  // 根据选择的类型过滤数据
  const filteredBikes = filterBikesByType(bikes);
  
  // 对位置数据进行聚类，识别热点区域
  const hotspots = identifyHotspots(filteredBikes);
  hotspotCount.value = hotspots.length;
  
  // 找出最高密度区域
  if (hotspots.length > 0) {
    const highest = hotspots.reduce((prev, current) => 
      (prev.density > current.density) ? prev : current);
    highestDensityArea.value = `经度:${highest.location.longitude.toFixed(4)}, 纬度:${highest.location.latitude.toFixed(4)}`;
  } else {
    highestDensityArea.value = '无数据';
  }
  
  // 按小时统计分布
  const timeDistribution = analyzeTimeDistribution(filteredBikes);
  
  return {
    hotspots,
    bikes: filteredBikes,
    timeDistribution
  };
};

// 获取指定时间范围内的单车数据
const getBikesInTimeRange = () => {
  const allBikes = bikeStoreInstance.getAllBikes();
  const now = Date.now();
  
  // 检查是否有lastUpdated字段，没有的话添加当前时间
  allBikes.forEach(bike => {
    if (!bike.lastUpdated) {
      bike.lastUpdated = now;
    }
  });
  
  switch (selectedTimeRange.value) {
    case 'today':
      // 今天0点
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      return allBikes.filter(bike => bike.lastUpdated >= todayStart.getTime());
      
    case 'week':
      // 7天前
      const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
      return allBikes.filter(bike => bike.lastUpdated >= weekAgo);
      
    case 'month':
      // 30天前
      const monthAgo = now - (30 * 24 * 60 * 60 * 1000);
      return allBikes.filter(bike => bike.lastUpdated >= monthAgo);
      
    case 'all':
    default:
      return [...allBikes];
  }
};

// 根据选择的类型过滤单车数据
const filterBikesByType = (bikes) => {
  switch (selectedType.value) {
    case 'parked':
      return bikes.filter(bike => bike.status === 'parked');
      
    case 'start':
      // 获取行程的起点
      const tripStarts = bikeStoreInstance.trips
        .filter(trip => {
          if (!trip.startTime) return false;
          
          // 根据时间范围过滤
          switch (selectedTimeRange.value) {
            case 'today':
              const todayStart = new Date();
              todayStart.setHours(0, 0, 0, 0);
              return trip.startTime >= todayStart.getTime();
            case 'week':
              return trip.startTime >= Date.now() - (7 * 24 * 60 * 60 * 1000);
            case 'month':
              return trip.startTime >= Date.now() - (30 * 24 * 60 * 60 * 1000);
            default:
              return true;
          }
        })
        .map(trip => {
          const bike = bikes.find(b => b.id === trip.bikeId);
          if (bike) {
            return {
              ...bike,
              longitude: trip.startPosition[0],
              latitude: trip.startPosition[1],
              tripTime: trip.startTime
            };
          }
          return null;
        })
        .filter(Boolean);
        
      return tripStarts;
      
    case 'end':
      // 获取行程的终点
      const tripEnds = bikeStoreInstance.trips
        .filter(trip => {
          if (!trip.endTime) return false;
          
          // 根据时间范围过滤
          switch (selectedTimeRange.value) {
            case 'today':
              const todayStart = new Date();
              todayStart.setHours(0, 0, 0, 0);
              return trip.endTime >= todayStart.getTime();
            case 'week':
              return trip.endTime >= Date.now() - (7 * 24 * 60 * 60 * 1000);
            case 'month':
              return trip.endTime >= Date.now() - (30 * 24 * 60 * 60 * 1000);
            default:
              return true;
          }
        })
        .map(trip => {
          const bike = bikes.find(b => b.id === trip.bikeId);
          if (bike && trip.endPosition) {
            return {
              ...bike,
              longitude: trip.endPosition[0],
              latitude: trip.endPosition[1],
              tripTime: trip.endTime
            };
          }
          return null;
        })
        .filter(Boolean);
        
      return tripEnds;
      
    case 'all':
    default:
      // 合并所有活动点
      const allPoints = [...bikes];
      
      // 添加行程起点
      bikeStoreInstance.trips.forEach(trip => {
        if (trip.startTime && trip.startPosition) {
          // 根据时间范围过滤
          let includeTrip = true;
          switch (selectedTimeRange.value) {
            case 'today':
              const todayStart = new Date();
              todayStart.setHours(0, 0, 0, 0);
              includeTrip = trip.startTime >= todayStart.getTime();
              break;
            case 'week':
              includeTrip = trip.startTime >= Date.now() - (7 * 24 * 60 * 60 * 1000);
              break;
            case 'month':
              includeTrip = trip.startTime >= Date.now() - (30 * 24 * 60 * 60 * 1000);
              break;
          }
          
          if (includeTrip) {
            allPoints.push({
              id: `trip-start-${trip.id}`,
              longitude: trip.startPosition[0],
              latitude: trip.startPosition[1],
              status: 'trip-start',
              tripTime: trip.startTime
            });
          }
        }
        
        if (trip.endTime && trip.endPosition) {
          // 根据时间范围过滤
          let includeTrip = true;
          switch (selectedTimeRange.value) {
            case 'today':
              const todayStart = new Date();
              todayStart.setHours(0, 0, 0, 0);
              includeTrip = trip.endTime >= todayStart.getTime();
              break;
            case 'week':
              includeTrip = trip.endTime >= Date.now() - (7 * 24 * 60 * 60 * 1000);
              break;
            case 'month':
              includeTrip = trip.endTime >= Date.now() - (30 * 24 * 60 * 60 * 1000);
              break;
          }
          
          if (includeTrip) {
            allPoints.push({
              id: `trip-end-${trip.id}`,
              longitude: trip.endPosition[0],
              latitude: trip.endPosition[1],
              status: 'trip-end',
              tripTime: trip.endTime
            });
          }
        }
      });
      
      return allPoints;
  }
};

// 识别热点区域，使用简单的聚类算法
const identifyHotspots = (bikes) => {
  if (!bikes || bikes.length === 0) {
    return [];
  }
  
  // 使用基于距离的简单聚类算法
  const clusters = [];
  const processedBikes = new Set();
  
  // 热点聚类的距离阈值（米）
  const clusterRadius = 50;
  
  for (const bike of bikes) {
    if (processedBikes.has(bike.id)) continue;
    
    // 创建新的聚类
    const cluster = {
      bikes: [bike],
      center: {
        longitude: bike.longitude,
        latitude: bike.latitude
      }
    };
    
    processedBikes.add(bike.id);
    
    // 找出所有在聚类半径内的单车
    for (const otherBike of bikes) {
      if (processedBikes.has(otherBike.id)) continue;
      
      const distance = calculateDistance(
        [cluster.center.longitude, cluster.center.latitude],
        [otherBike.longitude, otherBike.latitude]
      );
      
      if (distance <= clusterRadius) {
        cluster.bikes.push(otherBike);
        processedBikes.add(otherBike.id);
        
        // 更新聚类中心
        cluster.center = {
          longitude: cluster.bikes.reduce((sum, b) => sum + b.longitude, 0) / cluster.bikes.length,
          latitude: cluster.bikes.reduce((sum, b) => sum + b.latitude, 0) / cluster.bikes.length
        };
      }
    }
    
    clusters.push(cluster);
  }
  
  // 转换为热点数据格式
  return clusters.map(cluster => ({
    location: cluster.center,
    density: cluster.bikes.length,
    bikes: cluster.bikes.map(bike => bike.id)
  }));
};

// 分析时段分布
const analyzeTimeDistribution = (bikes) => {
  // 按小时统计
  const hourDistribution = Array(24).fill(0);
  
  bikes.forEach(bike => {
    // 使用tripTime或lastUpdated时间戳来确定时段
    const timestamp = bike.tripTime || bike.lastUpdated;
    if (timestamp) {
      try {
        // 提取小时并增加计数
        const hour = new Date(timestamp).getHours();
        if (hour >= 0 && hour < 24) {
          hourDistribution[hour]++;
        }
      } catch (error) {
        console.error('时间戳解析错误:', error, timestamp);
      }
    }
  });
  
  return hourDistribution;
};

// 计算两点之间的距离（米）
const calculateDistance = (point1, point2) => {
  // 使用Cesium提供的椭球表面距离计算
  const position1 = Cesium.Cartesian3.fromDegrees(point1[0], point1[1]);
  const position2 = Cesium.Cartesian3.fromDegrees(point2[0], point2[1]);
  return Cesium.Cartesian3.distance(position1, position2);
};

// 渲染热力图
const renderHeatmap = (data) => {
  if (!props.viewer || !data.hotspots || data.hotspots.length === 0) return;
  
  clearHeatmap();
  
  // 创建热点实体集合
  heatmapLayer.value = new Cesium.CustomDataSource('bikeHeatmap');
  props.viewer.dataSources.add(heatmapLayer.value);
  
  // 渲染热点
  data.hotspots.forEach(hotspot => {
    // 创建热点圆形
    const circle = heatmapLayer.value.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        hotspot.location.longitude,
        hotspot.location.latitude
      ),
      ellipse: {
        semiMinorAxis: 20 + hotspot.density * 2, // 根据密度调整大小
        semiMajorAxis: 20 + hotspot.density * 2,
        material: new Cesium.ColorMaterialProperty(
          Cesium.Color.fromCssColorString(getHeatColor(hotspot.density)).withAlpha(0.7)
        ),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        height: 0
      }
    });
    
    // 添加标签
    heatmapLayer.value.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        hotspot.location.longitude,
        hotspot.location.latitude,
        10
      ),
      label: {
        text: `${hotspot.density}辆`,
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -5),
      }
    });
  });
  
  // 聚焦到热点区域
  if (data.hotspots.length > 0) {
    // 找出热点区域的边界
    let minLon = Number.MAX_VALUE;
    let maxLon = -Number.MAX_VALUE;
    let minLat = Number.MAX_VALUE;
    let maxLat = -Number.MAX_VALUE;
    
    data.hotspots.forEach(hotspot => {
      minLon = Math.min(minLon, hotspot.location.longitude);
      maxLon = Math.max(maxLon, hotspot.location.longitude);
      minLat = Math.min(minLat, hotspot.location.latitude);
      maxLat = Math.max(maxLat, hotspot.location.latitude);
    });
    
    // 添加一些边距
    const lonPadding = (maxLon - minLon) * 0.2 || 0.01;
    const latPadding = (maxLat - minLat) * 0.2 || 0.01;
    
    // 飞行到矩形区域
    props.viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(
        minLon - lonPadding,
        minLat - latPadding,
        maxLon + lonPadding,
        maxLat + latPadding
      )
    });
  }
};

// 根据密度获取热力图颜色
const getHeatColor = (density) => {
  // 根据密度返回不同的颜色
  if (density <= 5) return '#00FF00'; // 绿色 - 低密度
  if (density <= 10) return '#FFFF00'; // 黄色 - 中密度
  if (density <= 20) return '#FFA500'; // 橙色 - 高密度
  return '#FF0000'; // 红色 - 非常高密度
};

// 更新统计信息
const updateStats = (data) => {
  totalBikesInRange.value = data.bikes.length;
  hotspotCount.value = data.hotspots.length;
  
  if (data.hotspots.length > 0) {
    // 找出最高密度区域
    const highestDensityHotspot = data.hotspots.reduce((prev, current) => 
      (prev.density > current.density) ? prev : current
    );
    
    highestDensityArea.value = `经度:${highestDensityHotspot.location.longitude.toFixed(4)}, 纬度:${highestDensityHotspot.location.latitude.toFixed(4)}`;
  } else {
    highestDensityArea.value = '无数据';
  }
};

// 渲染时段分布图表
const renderTimeDistribution = (data) => {
  if (!data.timeDistribution || !timeChart.value) return;

  // 销毁现有图表实例
  if (timeChartInstance.value) {
    timeChartInstance.value.dispose();
  }

  // 创建新图表实例
  timeChartInstance.value = echarts.init(timeChart.value);
  
  // 图表配置
  const option = {
    title: {
      text: '单车时段分布',
      textStyle: {
        color: '#ddd',
        fontSize: 14
      },
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      formatter: '{b}时: {c}辆单车'
    },
    xAxis: {
      type: 'category',
      data: Array(24).fill(0).map((_, i) => `${i}`),
      axisLabel: {
        color: '#ddd'
      },
      axisLine: {
        lineStyle: {
          color: '#555'
        }
      }
    },
    yAxis: {
      type: 'value',
      splitLine: {
        lineStyle: {
          color: '#444'
        }
      },
      axisLabel: {
        color: '#ddd'
      }
    },
    series: [{
      data: data.timeDistribution,
      type: 'bar',
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#83bff6' },
          { offset: 0.5, color: '#188df0' },
          { offset: 1, color: '#188df0' }
        ])
      },
      emphasis: {
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#2378f7' },
            { offset: 0.7, color: '#2378f7' },
            { offset: 1, color: '#83bff6' }
          ])
        }
      }
    }],
    backgroundColor: 'transparent',
    textStyle: {
      color: '#ddd'
    },
    grid: {
      left: '10%',
      right: '5%',
      bottom: '15%',
      containLabel: true
    }
  };
  
  // 应用配置
  timeChartInstance.value.setOption(option);
};

// 清除热力图
const clearHeatmap = () => {
  if (heatmapLayer.value && props.viewer) {
    props.viewer.dataSources.remove(heatmapLayer.value);
    heatmapLayer.value = null;
  }
};

// 监听可见性变化
watch(() => props.visible, (newVal) => {
  if (newVal) {
    nextTick(() => {
      generateHeatmap();
    });
  } else {
    clearHeatmap();
  }
});

// 组件挂载时
onMounted(() => {
  if (props.visible) {
    nextTick(() => {
      generateHeatmap();
    });
  }
  
  // 监听窗口大小变化，调整图表尺寸
  window.addEventListener('resize', handleResize);
});

// 处理窗口大小变化
const handleResize = () => {
  if (timeChartInstance.value) {
    timeChartInstance.value.resize();
  }
};

// 组件卸载时清除热力图
onUnmounted(() => {
  clearHeatmap();
  if (timeChartInstance.value) {
    timeChartInstance.value.dispose();
  }
  window.removeEventListener('resize', handleResize);
});

// 导出函数给父组件
defineExpose({
  generateHeatmap,
  clearHeatmap
});
</script>

<style scoped lang="scss">
.heatmap-container {
  position: absolute;
  top: 70px;
  right: 20px;
  width: 320px;
  background-color: rgba(20, 30, 48, 0.9);
  border: 1px solid var(--cl-border);
  border-radius: 4px;
  overflow: hidden;
  z-index: 1000;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  display: none;
  color: white;
  
  &.active {
    display: block;
  }
}

.heatmap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: rgba(30, 60, 90, 0.9);
  padding: 10px;
  border-bottom: 1px solid var(--cl-border);
  
  h3 {
    margin: 0;
    font-size: 16px;
  }
  
  .header-controls {
    display: flex;
    align-items: center;
  }
  
  .close-btn {
    background: transparent;
    border: none;
    color: white;
    font-size: 16px;
    cursor: pointer;
    
    &:hover {
      color: #f44336;
    }
  }
}

.heatmap-content {
  padding: 10px;
  max-height: 500px;
  overflow-y: auto;
}

.time-selector,
.heatmap-type-selector {
  margin-bottom: 15px;
  
  .time-label,
  .type-label {
    font-size: 14px;
    margin-bottom: 5px;
  }
  
  .time-options,
  .type-options {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    
    button {
      background: rgba(60, 100, 140, 0.5);
      border: 1px solid var(--cl-border);
      color: white;
      padding: 5px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      
      &:hover {
        background: rgba(70, 120, 170, 0.6);
      }
      
      &.active {
        background: var(--cl-primary);
        border-color: var(--cl-primary);
      }
    }
  }
}

.heatmap-stats {
  margin-bottom: 15px;
  background: rgba(40, 60, 80, 0.5);
  padding: 10px;
  border-radius: 3px;
  
  .stats-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 5px;
    font-size: 13px;
    
    &:last-child {
      margin-bottom: 0;
    }
    
    .stats-label {
      color: #aaa;
    }
    
    .stats-value {
      font-weight: bold;
    }
  }
}

.time-distribution {
  margin-top: 15px;
  
  .chart-title {
    font-size: 14px;
    margin-bottom: 10px;
    text-align: center;
  }
  
  .chart-container {
    height: 150px;
    background: rgba(40, 60, 80, 0.5);
    border-radius: 3px;
    padding: 10px;
  }
}

.heatmap-footer {
  padding: 10px;
  display: flex;
  justify-content: space-between;
  border-top: 1px solid var(--cl-border);
  background-color: rgba(30, 60, 90, 0.9);
  
  .action-btn {
    background: var(--cl-primary);
    border: none;
    color: white;
    padding: 5px 15px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
    
    &:hover {
      background: var(--cl-hover);
    }
    
    &.refresh-btn {
      background: #4CAF50;
      
      &:hover {
        background: #45a049;
      }
    }
  }
}
</style>