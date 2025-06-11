<template>
  <div class="peak-analysis-container" :class="{ active: visible }">
    <div class="peak-header">
      <h3>高峰期用车分析与预测</h3>
      <div class="header-controls">
        <button class="close-btn" @click="close">✕</button>
      </div>
    </div>
    
    <div class="peak-content">
      <!-- 时间范围选择 -->
      <div class="time-selector">
        <div class="time-label">分析周期：</div>
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

      <!-- 预测模式选择 -->
      <div class="prediction-mode-selector">
        <div class="mode-label">预测模式：</div>
        <div class="mode-options">
          <button 
            v-for="option in predictionModes" 
            :key="option.value" 
            :class="{ active: selectedPredictionMode === option.value }"
            @click="selectPredictionMode(option.value)">
            {{ option.label }}
          </button>
        </div>
      </div>

      <!-- 历史高峰期图表 -->
      <div class="peak-chart-section">
        <div class="section-title">历史高峰期分析</div>
        <div class="chart-container" ref="historyChartRef"></div>
        
        <!-- 高峰期统计信息 -->
        <div class="peak-stats">
          <div class="stat-item">
            <div class="stat-label">主要高峰期：</div>
            <div class="stat-value">{{ primaryPeakHours }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">次要高峰期：</div>
            <div class="stat-value">{{ secondaryPeakHours }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">平均使用量：</div>
            <div class="stat-value">{{ averageUsage }}辆/小时</div>
          </div>
        </div>
      </div>

      <!-- 预测需求图表 -->
      <div class="prediction-section">
        <div class="section-title">未来需求预测</div>
        <div class="chart-container" ref="predictionChartRef"></div>
        
        <!-- 预测统计信息 -->
        <div class="prediction-stats">
          <div class="stat-item">
            <div class="stat-label">预计高峰需求：</div>
            <div class="stat-value">{{ predictedPeakDemand }}辆</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">建议投放量：</div>
            <div class="stat-value">{{ suggestedSupply }}辆</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">预测准确度：</div>
            <div class="stat-value">{{ predictionAccuracy }}%</div>
          </div>
        </div>
        
        <!-- 高峰时段建议 -->
        <div class="peak-suggestions">
          <div class="suggestion-title">优化建议</div>
          <div class="suggestion-content">
            <p>{{ peakSuggestion }}</p>
          </div>
        </div>
      </div>
    </div>
    
    <div class="peak-footer">
      <button class="action-btn refresh-btn" @click="refreshAnalysis">重新分析</button>
      <button class="action-btn" @click="exportData">导出报告</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted, nextTick, computed } from 'vue';
import bikeStoreInstance from '@/cesiumUtils/BikeStore';
import Cesium from '@/cesiumUtils/cesium';
// 导入ECharts核心模块
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, TitleComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// 注册必需的组件
echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
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
const selectedTimeRange = ref('week');
const selectedPredictionMode = ref('normal');
const historyChartRef = ref(null);
const predictionChartRef = ref(null);
const historyChartInstance = ref(null);
const predictionChartInstance = ref(null);

// 统计数据
const primaryPeakHours = ref('7:00-9:00, 17:00-19:00');
const secondaryPeakHours = ref('12:00-13:00');
const averageUsage = ref(0);
const predictedPeakDemand = ref(0);
const suggestedSupply = ref(0);
const predictionAccuracy = ref(0);
const peakSuggestion = ref('');

// 时间选项
const timeOptions = [
  { label: '日分析', value: 'day' },
  { label: '周分析', value: 'week' },
  { label: '月分析', value: 'month' },
  { label: '季度分析', value: 'quarter' }
];

// 预测模式选项
const predictionModes = [
  { label: '标准预测', value: 'normal' },
  { label: '保守预测', value: 'conservative' },
  { label: '积极预测', value: 'aggressive' }
];

// 历史数据
const historicalData = ref([]);
// 预测数据
const predictedData = ref([]);

// 根据分析结果动态计算的建议
const computedSuggestion = computed(() => {
  if (!historicalData.value || historicalData.value.length === 0) {
    return '数据不足，无法提供具体建议。';
  }
  
  // 根据当前模式和数据生成建议
  const modeText = {
    'normal': '根据标准预测',
    'conservative': '根据保守预测',
    'aggressive': '根据积极预测'
  }[selectedPredictionMode.value];
  
  return `${modeText}，建议在工作日早上${primaryPeakHours.value.split(',')[0]}和晚上${primaryPeakHours.value.split(',')[1]}增加单车投放量至${suggestedSupply.value}辆，周末可适当减少至${Math.round(suggestedSupply.value * 0.7)}辆。主要投放点应集中在教学楼、宿舍区与校门口周边。`;
});

// 关闭面板
const close = () => {
  emit('close');
};

// 选择时间范围
const selectTimeRange = (range) => {
  selectedTimeRange.value = range;
  refreshAnalysis();
};

// 选择预测模式
const selectPredictionMode = (mode) => {
  selectedPredictionMode.value = mode;
  updatePrediction();
};

// 刷新分析
const refreshAnalysis = () => {
  analyzeHistoricalData();
  updatePrediction();
};

// 导出数据
const exportData = () => {
  try {
    // 创建导出字符串
    let exportStr = '单车高峰期分析与预测报告\n';
    exportStr += `分析时间: ${new Date().toLocaleString()}\n`;
    exportStr += `分析周期: ${getTimeRangeLabel(selectedTimeRange.value)}\n`;
    exportStr += `预测模式: ${getPredictionModeLabel(selectedPredictionMode.value)}\n\n`;
    
    exportStr += '历史高峰期分析:\n';
    exportStr += `主要高峰期: ${primaryPeakHours.value}\n`;
    exportStr += `次要高峰期: ${secondaryPeakHours.value}\n`;
    exportStr += `平均使用量: ${averageUsage.value}辆/小时\n\n`;
    
    exportStr += '未来需求预测:\n';
    exportStr += `预计高峰需求: ${predictedPeakDemand.value}辆\n`;
    exportStr += `建议投放量: ${suggestedSupply.value}辆\n`;
    exportStr += `预测准确度: ${predictionAccuracy.value}%\n\n`;
    
    exportStr += '优化建议:\n';
    exportStr += peakSuggestion.value + '\n\n';
    
    exportStr += '按小时分布详情:\n';
    for (let i = 0; i < 24; i++) {
      const histValue = historicalData.value[i] || 0;
      const predValue = predictedData.value[i] || 0;
      exportStr += `${i}:00 - 历史:${histValue}辆, 预测:${predValue}辆\n`;
    }
    
    // 创建下载
    const blob = new Blob([exportStr], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `单车高峰期分析_${new Date().toISOString().slice(0, 10)}.txt`;
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

// 获取预测模式标签
const getPredictionModeLabel = (value) => {
  const option = predictionModes.find(opt => opt.value === value);
  return option ? option.label : '未知';
};

// 分析历史数据
const analyzeHistoricalData = () => {
  try {
    // 获取单车使用数据
    let timeData;
    
    // 使用BikeStore的分析功能获取时段分布
    timeData = bikeStoreInstance.analyzeTimeDistribution(
      mapTimeRange(selectedTimeRange.value), 
      'all'
    );
    
    // 如果没有足够数据，生成模拟数据用于展示
    if (!timeData || timeData.every(v => v === 0)) {
      timeData = generateMockData();
    }
    
    historicalData.value = timeData;
    
    // 计算统计信息
    calculateStatistics(timeData);
    
    // 渲染历史数据图表
    renderHistoryChart(timeData);
  } catch (error) {
    console.error('分析历史数据失败:', error);
  }
};

// 将组件的时间范围映射到BikeStore的时间范围
const mapTimeRange = (componentRange) => {
  switch (componentRange) {
    case 'day': return 'today';
    case 'week': return 'week';
    case 'month': return 'month';
    case 'quarter': return 'all'; // BikeStore没有quarter，使用all替代
    default: return 'all';
  }
};

// 生成模拟数据（当没有足够真实数据时使用）
const generateMockData = () => {
  // 模拟一天24小时的单车使用量
  // 早高峰、午高峰、晚高峰模式
  const mockData = [
    5, 3, 2, 2, 7, 15, 45, 78, 65, 30, 25, 40, 
    55, 35, 30, 35, 55, 85, 70, 40, 25, 20, 10, 7
  ];
  
  // 根据选择的时间范围调整数据
  switch (selectedTimeRange.value) {
    case 'day':
      // 单日数据可能波动更大
      return mockData.map(v => Math.round(v * (0.8 + Math.random() * 0.4)));
    case 'week':
      // 一周数据相对平滑
      return mockData;
    case 'month':
      // 月度数据波动更大，总量更高
      return mockData.map(v => Math.round(v * 1.2));
    case 'quarter':
      // 季度数据更平滑，反映长期趋势
      return mockData.map(v => Math.round(v * 1.5));
    default:
      return mockData;
  }
};

// 计算统计信息
const calculateStatistics = (data) => {
  if (!data || data.length === 0) return;
  
  // 计算平均使用量
  const sum = data.reduce((acc, val) => acc + val, 0);
  averageUsage.value = Math.round(sum / data.length);
  
  // 找出高峰时段
  const peakThreshold = Math.max(...data) * 0.7; // 高峰定义为至少达到最大值的70%
  const secondaryThreshold = Math.max(...data) * 0.5; // 次高峰定义为至少达到最大值的50%
  
  const peakHours = [];
  const secondaryPeakHours = [];
  
  for (let i = 0; i < data.length; i++) {
    if (data[i] >= peakThreshold) {
      peakHours.push(i);
    } else if (data[i] >= secondaryThreshold) {
      secondaryPeakHours.push(i);
    }
  }
  
  // 合并连续的小时到时间段
  primaryPeakHours.value = formatHoursToRanges(peakHours);
  secondaryPeakHours.value = formatHoursToRanges(secondaryPeakHours);
};

// 将小时数组格式化为时间范围字符串
const formatHoursToRanges = (hours) => {
  if (!hours || hours.length === 0) return '无';
  
  // 排序小时
  hours.sort((a, b) => a - b);
  
  const ranges = [];
  let start = hours[0];
  let end = hours[0];
  
  for (let i = 1; i < hours.length; i++) {
    if (hours[i] === end + 1) {
      // 连续时间
      end = hours[i];
    } else {
      // 不连续，形成一个范围
      ranges.push(`${start}:00-${end + 1}:00`);
      start = hours[i];
      end = hours[i];
    }
  }
  
  // 添加最后一个范围
  ranges.push(`${start}:00-${end + 1}:00`);
  
  return ranges.join(', ');
};

// 更新预测
const updatePrediction = () => {
  try {
    // 根据历史数据和预测模式生成预测数据
    predictedData.value = generatePrediction(historicalData.value, selectedPredictionMode.value);
    
    // 计算预测统计信息
    calculatePredictionStatistics(predictedData.value);
    
    // 更新建议
    peakSuggestion.value = computedSuggestion.value;
    
    // 渲染预测图表
    renderPredictionChart(historicalData.value, predictedData.value);
  } catch (error) {
    console.error('更新预测失败:', error);
  }
};

// 生成预测数据
const generatePrediction = (historicalData, mode) => {
  if (!historicalData || historicalData.length === 0) {
    return Array(24).fill(0);
  }
  
  // 根据不同预测模式调整预测系数
  let predictionFactor;
  switch (mode) {
    case 'conservative':
      predictionFactor = 0.9;
      break;
    case 'aggressive':
      predictionFactor = 1.3;
      break;
    case 'normal':
    default:
      predictionFactor = 1.1;
      break;
  }
  
  // 生成预测数据
  return historicalData.map(value => {
    // 基于历史值加上一些变动和增长趋势
    let prediction = value * predictionFactor;
    
    // 添加一些随机波动
    prediction *= (0.95 + Math.random() * 0.1);
    
    return Math.round(prediction);
  });
};

// 计算预测统计信息
const calculatePredictionStatistics = (data) => {
  if (!data || data.length === 0) return;
  
  // 预计高峰需求
  predictedPeakDemand.value = Math.max(...data);
  
  // 建议投放量 - 比最大需求高15-30%，取决于预测模式
  let buffer;
  switch (selectedPredictionMode.value) {
    case 'conservative':
      buffer = 1.15;
      break;
    case 'aggressive':
      buffer = 1.3;
      break;
    case 'normal':
    default:
      buffer = 1.2;
      break;
  }
  
  suggestedSupply.value = Math.round(predictedPeakDemand.value * buffer);
  
  // 预测准确度 - 在真实场景中应基于历史预测与实际比较
  // 这里使用模拟数据
  switch (selectedPredictionMode.value) {
    case 'conservative':
      predictionAccuracy.value = Math.round(85 + Math.random() * 10);
      break;
    case 'aggressive':
      predictionAccuracy.value = Math.round(70 + Math.random() * 15);
      break;
    case 'normal':
    default:
      predictionAccuracy.value = Math.round(80 + Math.random() * 12);
      break;
  }
};

// 渲染历史数据图表
const renderHistoryChart = (data) => {
  if (!historyChartRef.value) return;
  
  // 销毁现有图表
  if (historyChartInstance.value) {
    historyChartInstance.value.dispose();
  }
  
  // 创建新图表
  historyChartInstance.value = echarts.init(historyChartRef.value);
  
  // 准备小时标签
  const hours = Array(24).fill(0).map((_, i) => `${i}:00`);
  
  // 图表配置
  const option = {
    title: {
      text: '历史用车分布',
      textStyle: {
        color: '#ddd',
        fontSize: 14
      },
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      formatter: '{b}: {c}辆'
    },
    xAxis: {
      type: 'category',
      data: hours,
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
      data: data,
      type: 'bar',
      name: '历史用车量',
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
      },
      // 标记高峰区域
      markArea: {
        itemStyle: {
          color: 'rgba(255, 173, 177, 0.3)'
        },
        data: generateMarkAreaData(data)
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
  
  // 设置图表
  historyChartInstance.value.setOption(option);
};

// 生成高峰区域标记数据
const generateMarkAreaData = (data) => {
  if (!data || data.length === 0) return [];
  
  const maxValue = Math.max(...data);
  const threshold = maxValue * 0.7; // 高峰定义为最大值的70%以上
  
  const markAreas = [];
  let inPeak = false;
  let peakStart = 0;
  
  for (let i = 0; i < data.length; i++) {
    if (data[i] >= threshold && !inPeak) {
      // 进入高峰
      inPeak = true;
      peakStart = i;
    } else if ((data[i] < threshold || i === data.length - 1) && inPeak) {
      // 离开高峰或到达末尾
      inPeak = false;
      markAreas.push([
        { xAxis: `${peakStart}:00` },
        { xAxis: `${i}:00` }
      ]);
    }
  }
  
  return markAreas;
};

// 渲染预测图表
const renderPredictionChart = (historicalData, predictedData) => {
  if (!predictionChartRef.value) return;
  
  // 销毁现有图表
  if (predictionChartInstance.value) {
    predictionChartInstance.value.dispose();
  }
  
  // 创建新图表
  predictionChartInstance.value = echarts.init(predictionChartRef.value);
  
  // 准备小时标签
  const hours = Array(24).fill(0).map((_, i) => `${i}:00`);
  
  // 图表配置
  const option = {
    title: {
      text: '需求预测比较',
      textStyle: {
        color: '#ddd',
        fontSize: 14
      },
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      formatter: function(params) {
        let result = params[0].name + '<br/>';
        params.forEach(param => {
          result += param.seriesName + ': ' + param.value + '辆<br/>';
        });
        return result;
      }
    },
    legend: {
      data: ['历史数据', '预测需求'],
      textStyle: {
        color: '#ddd'
      },
      bottom: 0
    },
    xAxis: {
      type: 'category',
      data: hours,
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
    series: [
      {
        name: '历史数据',
        type: 'line',
        data: historicalData,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#73c0de'
        },
        lineStyle: {
          width: 2
        }
      },
      {
        name: '预测需求',
        type: 'line',
        data: predictedData,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#5470c6'
        },
        lineStyle: {
          width: 2
        },
        // 预测线设置为虚线
        lineStyle: {
          type: 'dashed'
        }
      }
    ],
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
  
  // 设置图表
  predictionChartInstance.value.setOption(option);
};

// 处理窗口大小变化
const handleResize = () => {
  if (historyChartInstance.value) {
    historyChartInstance.value.resize();
  }
  if (predictionChartInstance.value) {
    predictionChartInstance.value.resize();
  }
};

// 监听可见性变化
watch(() => props.visible, (newVal) => {
  if (newVal) {
    nextTick(() => {
      refreshAnalysis();
    });
  }
});

// 组件挂载时
onMounted(() => {
  if (props.visible) {
    nextTick(() => {
      refreshAnalysis();
    });
  }
  
  // 监听窗口大小变化
  window.addEventListener('resize', handleResize);
});

// 组件卸载时
onUnmounted(() => {
  if (historyChartInstance.value) {
    historyChartInstance.value.dispose();
  }
  if (predictionChartInstance.value) {
    predictionChartInstance.value.dispose();
  }
  window.removeEventListener('resize', handleResize);
});

// 导出函数给父组件
defineExpose({
  refreshAnalysis
});
</script>

<style scoped lang="scss">
.peak-analysis-container {
  position: absolute;
  top: 70px;
  right: 20px;
  width: 360px;
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

.peak-header {
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

.peak-content {
  padding: 10px;
  max-height: 600px;
  overflow-y: auto;
}

.time-selector,
.prediction-mode-selector {
  margin-bottom: 15px;
  
  .time-label,
  .mode-label {
    font-size: 14px;
    margin-bottom: 5px;
  }
  
  .time-options,
  .mode-options {
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

.peak-chart-section,
.prediction-section {
  margin-bottom: 20px;
  background: rgba(40, 60, 80, 0.5);
  padding: 12px;
  border-radius: 4px;
  
  .section-title {
    font-size: 15px;
    margin-bottom: 10px;
    color: #00BFFF;
    font-weight: bold;
    text-align: center;
  }
  
  .chart-container {
    height: 200px;
    background: rgba(30, 50, 70, 0.5);
    border-radius: 4px;
    margin-bottom: 10px;
  }
}

.peak-stats,
.prediction-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  
  .stat-item {
    background: rgba(30, 50, 70, 0.5);
    padding: 8px;
    border-radius: 3px;
    
    .stat-label {
      font-size: 12px;
      color: #aaa;
      margin-bottom: 5px;
    }
    
    .stat-value {
      font-size: 14px;
      font-weight: bold;
      color: #00FFFF;
    }
  }
}

.peak-suggestions {
  margin-top: 10px;
  background: rgba(30, 50, 70, 0.5);
  padding: 10px;
  border-radius: 4px;
  
  .suggestion-title {
    font-size: 14px;
    margin-bottom: 5px;
    color: #FFD700;
  }
  
  .suggestion-content {
    font-size: 13px;
    color: #eee;
    line-height: 1.4;
    
    p {
      margin: 0;
    }
  }
}

.peak-footer {
  padding: 10px;
  display: flex;
  justify-content: space-between;
  border-top: 1px solid var(--cl-border);
  background-color: rgba(30, 60, 90, 0.9);
  
  .action-btn {
    background: var(--cl-primary);
    border: none;
    color: white;
    padding: 6px 16px;
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