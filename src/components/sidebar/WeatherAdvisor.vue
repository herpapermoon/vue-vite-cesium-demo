<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import * as echarts from 'echarts'

// 状态变量
const loading = ref(true)
const error = ref(null)
const chartInstance = ref(null)

// 天气和建议数据
const currentWeather = ref(null) // 当前天气
const hourlyForecast = ref([]) // 小时预报
const travelAdvice = ref([]) // 出行建议

// 新增：日期相关变量
const forecastDays = ref([]) // 预报的日期列表
const selectedDateIndex = ref(0) // 当前选择的日期索引

// 滑动相关变量
const touchStartX = ref(0)
const touchEndX = ref(0)
const isSwiping = ref(false)

// API密钥
const API_KEY = 'f74ef7b45f150da2b0d68a0c2d37b848'
// 中国地质大学未来城校区的经纬度
const CITY = '中国地质大学(武汉)未来城校区'
const LAT = 30.4589
const LON = 114.6190

// 获取天气图标URL
const getIconUrl = (iconCode) => {
  return `https://openweathermap.org/img/wn/${iconCode}@2x.png`
}

// 格式化时间
const formatTime = (timestamp) => {
  const date = new Date(timestamp * 1000)
  return date.getHours().toString().padStart(2, '0') + ':00'
}

// 格式化日期
const formatDate = (timestamp) => {
  const date = new Date(timestamp * 1000)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

// 获取星期几
const getWeekDay = (timestamp) => {
  const date = new Date(timestamp * 1000)
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return weekDays[date.getDay()]
}

// 格式化带星期的日期
const formatDateWithWeekday = (timestamp) => {
  return `${formatDate(timestamp)} ${getWeekDay(timestamp)}`
}

// 格式化温度
const formatTemp = (temp) => {
  return Math.round(temp) + '°C'
}

// 获取天气描述
const getWeatherDesc = (weather) => {
  const typeMap = {
    'Clear': '晴',
    'Clouds': '多云',
    'Rain': '雨',
    'Drizzle': '小雨',
    'Thunderstorm': '雷雨',
    'Snow': '雪',
    'Mist': '雾',
    'Fog': '雾',
    'Haze': '霾',
    'Dust': '浮尘',
    'Sand': '沙尘',
    'Ash': '火山灰',
    'Squall': '狂风',
    'Tornado': '龙卷风'
  }
  return typeMap[weather] || weather
}

// 按日期分组预报数据
const groupForecastByDay = (forecast) => {
  const days = {}
  
  forecast.forEach(hour => {
    const date = new Date(hour.dt * 1000)
    date.setHours(0, 0, 0, 0)
    const dateKey = date.getTime() / 1000
    
    if (!days[dateKey]) {
      days[dateKey] = {
        date: dateKey,
        hours: []
      }
    }
    
    days[dateKey].hours.push(hour)
  })
  
  // 转换为数组并排序
  return Object.values(days).sort((a, b) => a.date - b.date)
}

// 根据天气生成出行建议
const generateTravelAdvice = (forecast) => {
  // 选择当前选定日期的预报数据
  const selectedDay = forecastDays.value[selectedDateIndex.value]
  if (!selectedDay) return []
  
  const dayForecast = selectedDay.hours
  
  // 将预报按照时间段分组：早上(6-12)、下午(12-18)、晚上(18-23)、深夜(23-6)
  const periods = {
    earlyMorning: { name: '凌晨', hours: [], hasExtreme: false },
    morning: { name: '早上', hours: [], hasExtreme: false },
    afternoon: { name: '下午', hours: [], hasExtreme: false },
    evening: { name: '晚上', hours: [], hasExtreme: false }
  }
  
  // 将预报按时间段分组
  dayForecast.forEach(hour => {
    const date = new Date(hour.dt * 1000)
    const h = date.getHours()
    
    // 判断属于哪个时间段
    if (h >= 0 && h < 6) {
      periods.earlyMorning.hours.push(hour)
    } else if (h >= 6 && h < 12) {
      periods.morning.hours.push(hour)
    } else if (h >= 12 && h < 18) {
      periods.afternoon.hours.push(hour)
    } else if (h >= 18) {
      periods.evening.hours.push(hour)
    }
    
    // 检查极端天气
    const weatherType = hour.weather[0].main
    const extremeConditions = ['Thunderstorm', 'Snow', 'Tornado', 'Squall']
    if (extremeConditions.includes(weatherType) || 
        hour.wind.speed > 10.8 || // 大于5级风
        hour.rain?.['1h'] > 8 || // 大雨
        hour.snow?.['1h'] > 3) { // 大雪      
      if (h >= 0 && h < 6) periods.earlyMorning.hasExtreme = true
      else if (h >= 6 && h < 12) periods.morning.hasExtreme = true
      else if (h >= 12 && h < 18) periods.afternoon.hasExtreme = true
      else if (h >= 18) periods.evening.hasExtreme = true
    }
  })
  
  // 生成每个时段的建议
  const advice = []
  
  for (const [key, period] of Object.entries(periods)) {
    if (period.hours.length === 0) continue
    
    // 检查是否有雨雪天气
    const hasRain = period.hours.some(h => ['Rain', 'Drizzle', 'Thunderstorm'].includes(h.weather[0].main))
    const hasSnow = period.hours.some(h => h.weather[0].main === 'Snow')
    
    let recommendation
    if (period.hasExtreme) {
      recommendation = '不建议外出，请留在室内确保安全'
    } else if (hasSnow) {
      recommendation = '不建议骑行，请选择步行出行'
    } else if (hasRain) {
      recommendation = '建议带伞，最好选择步行出行'
    } else {
      // 检查温度和风速
      const avgTemp = period.hours.reduce((acc, h) => acc + h.main.temp, 0) / period.hours.length
      const maxWind = Math.max(...period.hours.map(h => h.wind.speed))
      
      if (avgTemp > 32) {
        recommendation = '气温较高，建议骑行时带好防暑物品'
      } else if (avgTemp < 5) {
        recommendation = '气温较低，建议穿暖和点，可以适度骑行'
      } else if (maxWind > 8) { // 约4级风
        recommendation = '有一定风力，骑行时请注意安全'
      } else {
        recommendation = '天气适宜，非常适合骑行出行'
      }
    }
    
    // 整理时段内的主要天气类型
    const weatherTypes = period.hours.map(h => h.weather[0].main)
    const mainWeather = findMostFrequent(weatherTypes)
    
    // 获取时段内的平均温度
    const avgTemp = Math.round(period.hours.reduce((acc, h) => acc + h.main.temp, 0) / period.hours.length)
    
    advice.push({
      period: period.name,
      time: `${formatTime(period.hours[0].dt)}-${formatTime(period.hours[period.hours.length - 1].dt)}`,
      weather: getWeatherDesc(mainWeather),
      icon: period.hours[Math.floor(period.hours.length / 2)].weather[0].icon,
      temperature: avgTemp + '°C',
      recommendation
    })
  }
  
  return advice
}

// 获取当前时段的索引
const currentPeriodIndex = computed(() => {
  if (!travelAdvice.value || travelAdvice.value.length === 0) return -1;
  
  // 只有当选择的是今天时，才高亮显示当前时段
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const selectedDate = new Date(forecastDays.value[selectedDateIndex.value]?.date * 1000)
  
  if (today.getTime() !== selectedDate.getTime()) {
    return -1;
  }
  
  const now = new Date();
  const currentHour = now.getHours();
  
  if (currentHour >= 0 && currentHour < 6) {
    return travelAdvice.value.findIndex(advice => advice.period === '凌晨');
  } else if (currentHour >= 6 && currentHour < 12) {
    return travelAdvice.value.findIndex(advice => advice.period === '早上');
  } else if (currentHour >= 12 && currentHour < 18) {
    return travelAdvice.value.findIndex(advice => advice.period === '下午');
  } else {
    return travelAdvice.value.findIndex(advice => advice.period === '晚上');
  }
});

// 辅助函数，找出数组中出现次数最多的元素
const findMostFrequent = (arr) => {
  const frequency = {}
  let maxFreq = 0
  let mostFrequent
  
  arr.forEach(item => {
    frequency[item] = (frequency[item] || 0) + 1
    if (frequency[item] > maxFreq) {
      maxFreq = frequency[item]
      mostFrequent = item
    }
  })
  
  return mostFrequent
}

// 获取日期摘要信息
const getDateSummary = (dayData) => {
  if (!dayData || !dayData.hours || dayData.hours.length === 0) return null;
  
  // 获取白天的温度范围和主要天气
  const dayHours = dayData.hours.filter(h => {
    const hour = new Date(h.dt * 1000).getHours();
    return hour >= 8 && hour <= 20;
  });
  
  if (dayHours.length === 0) return null;
  
  // 获取温度范围
  const temps = dayHours.map(h => h.main.temp);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  
  // 获取主要天气
  const weatherTypes = dayHours.map(h => h.weather[0].main);
  const mainWeather = findMostFrequent(weatherTypes);
  
  // 获取一个合适的图标（优先选择白天图标）
  const weatherIcons = dayHours.map(h => h.weather[0].icon);
  const dayIcons = weatherIcons.filter(icon => icon.includes('d'));
  const icon = dayIcons.length > 0 ? dayIcons[0] : weatherIcons[0];
  
  return {
    date: dayData.date,
    minTemp: Math.round(minTemp),
    maxTemp: Math.round(maxTemp),
    weather: getWeatherDesc(mainWeather),
    icon
  };
};

// 初始化天气图表
const initWeatherChart = () => {
  // 选择当前选定日期的预报数据
  const selectedDay = forecastDays.value[selectedDateIndex.value]
  if (!selectedDay) return
  
  const chartData = prepareChartData(selectedDay.hours)
  if (!chartData || chartData.hours.length === 0) return
  
  const chartEl = document.getElementById('hourly-weather-chart')
  if (!chartEl) return
  
  if (chartInstance.value) {
    chartInstance.value.dispose()
  }
  
  chartInstance.value = echarts.init(chartEl)
  
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const idx = params[0].dataIndex
        return `${chartData.hours[idx]}<br/>
                温度: ${chartData.temps[idx]}°C<br/>
                天气: ${chartData.weatherTypes[idx]}<br/>
                ${chartData.rains[idx] ? '降水量: ' + chartData.rains[idx] + 'mm<br/>' : ''}
                风速: ${chartData.winds[idx]}m/s`
      }
    },
    grid: {
      left: '10%',
      right: '10%',
      top: 30,
      bottom: 80
    },
    xAxis: {
      type: 'category',
      data: chartData.hours,
      axisLabel: {
        color: '#fff',
        rotate: 45,
        interval: 'auto',
        fontSize: 10
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.3)'
        }
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '温度(°C)',
        nameTextStyle: {
          color: '#fff',
          fontSize: 10
        },
        axisLabel: {
          color: '#fff',
          fontSize: 10
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.3)'
          }
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        }
      }
    ],
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100
      },
      {
        start: 0,
        end: 100
      }
    ],
    series: [
      {
        name: '温度',
        type: 'line',
        data: chartData.temps,
        smooth: true,
        itemStyle: {
          color: '#ffc107'
        },
        lineStyle: {
          width: 2,
          color: '#ffc107'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 193, 7, 0.5)' },
            { offset: 1, color: 'rgba(255, 193, 7, 0.0)' }
          ])
        },
        z: 10
      },
      {
        name: '降水量',
        type: 'bar',
        yAxisIndex: 0,
        data: chartData.rains,
        itemStyle: {
          color: '#13c2c2',
          opacity: 0.7
        },
        z: 9
      }
    ]
  }
  
  chartInstance.value.setOption(option)
}

// 准备图表数据
const prepareChartData = (forecast) => {
  const hours = []
  const temps = []
  const rains = []
  const winds = []
  const weatherTypes = []
  
  forecast.forEach(hour => {
    hours.push(formatTime(hour.dt))
    temps.push(Math.round(hour.main.temp))
    winds.push(hour.wind.speed)
    weatherTypes.push(getWeatherDesc(hour.weather[0].main))
    rains.push((hour.rain?.['1h'] || hour.snow?.['1h'] || 0))
  })
  
  return { hours, temps, rains, winds, weatherTypes }
}

// 获取武汉洪山区天气数据
const fetchWeatherData = async () => {
  loading.value = true
  error.value = null
  
  try {
    // 获取当前天气
    const currentResponse = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&appid=${API_KEY}&units=metric&lang=zh_cn`
    )
    if (!currentResponse.ok) {
      throw new Error('获取当前天气数据失败')
    }
    currentWeather.value = await currentResponse.json()
    
    // 获取未来5天预报
    const hourlyResponse = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${LAT}&lon=${LON}&appid=${API_KEY}&units=metric&lang=zh_cn`
    )
    if (!hourlyResponse.ok) {
      throw new Error('获取小时预报数据失败')
    }
    
    const hourlyData = await hourlyResponse.json()
    hourlyForecast.value = hourlyData.list
    
    // 按日期分组预报数据
    forecastDays.value = groupForecastByDay(hourlyForecast.value)
    
    // 设置初始选择为今天(或最近的一天)
    selectedDateIndex.value = 0
    
    // 生成出行建议
    travelAdvice.value = generateTravelAdvice(hourlyForecast.value)
    
  } catch (err) {
    console.error('天气数据获取失败:', err)
    error.value = '无法获取天气数据，请稍后再试'
  } finally {
    loading.value = false
    
    // 初始化图表
    nextTick(() => {
      initWeatherChart()
    })
  }
}

// 切换到前一天
const previousDay = () => {
  if (selectedDateIndex.value > 0) {
    selectedDateIndex.value -= 1
    updateDayView()
  }
}

// 切换到后一天
const nextDay = () => {
  if (selectedDateIndex.value < forecastDays.value.length - 1) {
    selectedDateIndex.value += 1
    updateDayView()
  }
}

// 选择特定日期
const selectDay = (index) => {
  if (index >= 0 && index < forecastDays.value.length) {
    selectedDateIndex.value = index
    updateDayView()
  }
}

// 更新日期视图
const updateDayView = () => {
  travelAdvice.value = generateTravelAdvice(hourlyForecast.value)
  nextTick(() => {
    initWeatherChart()
  })
}

// 刷新天气数据
const refreshWeatherData = () => {
  fetchWeatherData()
}

// 触摸开始事件处理
const handleTouchStart = (event) => {
  touchStartX.value = event.touches[0].clientX
  isSwiping.value = true
}

// 触摸移动事件处理
const handleTouchMove = (event) => {
  if (!isSwiping.value) return
  touchEndX.value = event.touches[0].clientX
}

// 触摸结束事件处理
const handleTouchEnd = () => {
  if (!isSwiping.value) return
  
  const swipeDistance = touchEndX.value - touchStartX.value
  
  // 判断是否为有效滑动
  if (Math.abs(swipeDistance) > 50) {
    if (swipeDistance > 0) {
      // 向右滑动，显示前一天
      previousDay()
    } else {
      // 向左滑动，显示后一天
      nextDay()
    }
  }
  
  isSwiping.value = false
}

// 监听窗口大小变化
const handleResize = () => {
  if (chartInstance.value) {
    chartInstance.value.resize()
  }
}

// 生命周期钩子
onMounted(() => {
  fetchWeatherData()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (chartInstance.value) {
    chartInstance.value.dispose()
  }
})
</script>

<template>
  <div class="weather-advisor"
       @touchstart="handleTouchStart"
       @touchmove="handleTouchMove"
       @touchend="handleTouchEnd">
    <h4>{{ CITY }}天气出行指南</h4>
    
    <div v-if="loading" class="advisor-loading">
      <div class="loading-spinner"></div>
      <p>正在获取最新天气数据...</p>
    </div>
    
    <div v-else-if="error" class="advisor-error">
      <p>{{ error }}</p>
      <button class="refresh-btn" @click="refreshWeatherData">重试</button>
    </div>
    
    <div v-else class="advisor-content">
      <!-- 日期选择器 -->
      <div class="date-selector">
        <button class="date-nav-btn" @click="previousDay" :disabled="selectedDateIndex === 0">
          &lt;
        </button>
        <div class="date-tabs">
          <div 
            v-for="(day, index) in forecastDays" 
            :key="day.date" 
            class="date-tab" 
            :class="{ 'active': index === selectedDateIndex }"
            @click="selectDay(index)"
          >
            <div class="tab-date">{{ formatDate(day.date) }}</div>
            <div class="tab-weekday">{{ getWeekDay(day.date) }}</div>
          </div>
        </div>
        <button class="date-nav-btn" @click="nextDay" :disabled="selectedDateIndex === forecastDays.length - 1">
          &gt;
        </button>
      </div>
      
      <!-- 当前天气信息 -->
      <div v-if="selectedDateIndex === 0" class="current-weather">
        <div class="weather-main">
          <img 
            :src="getIconUrl(currentWeather.weather[0].icon)" 
            :alt="currentWeather.weather[0].description"
            class="weather-icon"
          >
          <div class="weather-info">
            <div class="weather-temp">{{ formatTemp(currentWeather.main.temp) }}</div>
            <div class="weather-desc">{{ getWeatherDesc(currentWeather.weather[0].main) }}</div>
          </div>
        </div>
        <div class="weather-details">
          <div class="detail-item">
            <span>体感温度</span>
            <span>{{ formatTemp(currentWeather.main.feels_like) }}</span>
          </div>
          <div class="detail-item">
            <span>湿度</span>
            <span>{{ currentWeather.main.humidity }}%</span>
          </div>
          <div class="detail-item">
            <span>风速</span>
            <span>{{ currentWeather.wind.speed }}m/s</span>
          </div>
        </div>
      </div>
      
      <div v-else class="daily-summary">
        <div class="day-summary" v-if="forecastDays[selectedDateIndex]">
          <div class="summary-date">
            {{ formatDateWithWeekday(forecastDays[selectedDateIndex].date) }}天气概况
          </div>
          <div class="summary-content" v-if="getDateSummary(forecastDays[selectedDateIndex])">
            <img 
              :src="getIconUrl(getDateSummary(forecastDays[selectedDateIndex]).icon)" 
              :alt="getDateSummary(forecastDays[selectedDateIndex]).weather"
              class="summary-icon"
            >
            <div class="summary-info">
              <div class="summary-temp">
                {{ getDateSummary(forecastDays[selectedDateIndex]).minTemp }}°C ~ 
                {{ getDateSummary(forecastDays[selectedDateIndex]).maxTemp }}°C
              </div>
              <div class="summary-desc">
                {{ getDateSummary(forecastDays[selectedDateIndex]).weather }}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 天气趋势图表 -->
      <div class="chart-container">
        <h5>{{ formatDateWithWeekday(forecastDays[selectedDateIndex]?.date) }}天气趋势</h5>
        <div id="hourly-weather-chart" class="hourly-chart"></div>
      </div>
      
      <!-- 出行建议 -->
      <div class="travel-advice">
        <h5>{{ formatDateWithWeekday(forecastDays[selectedDateIndex]?.date) }}出行建议</h5>
        <div class="advice-container">
          <div 
            v-for="(advice, index) in travelAdvice" 
            :key="index" 
            class="advice-item"
            :class="{ 
              'warning': advice.recommendation.includes('不建议'),
              'caution': advice.recommendation.includes('注意'),
              'good': advice.recommendation.includes('适宜'),
              'current-period': index === currentPeriodIndex
            }"
          >
            <div class="advice-header">
              <span class="advice-period">{{ advice.period }} ({{ advice.time }})</span>
              <div class="advice-weather">
                <img :src="getIconUrl(advice.icon)" :alt="advice.weather" class="advice-icon">
                <span>{{ advice.weather }} {{ advice.temperature }}</span>
              </div>
            </div>
            <div class="advice-content">
              <span class="advice-icon-label">出行建议:</span>
              <span class="recommendation">{{ advice.recommendation }}</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 滑动提示 -->
      <div class="swipe-hint" v-if="forecastDays.length > 1">
        <div class="swipe-icon">⟺</div>
        <div class="swipe-text">左右滑动查看不同日期</div>
      </div>
      
      <div class="data-source">
        <span>数据来源: OpenWeatherMap (更新于 {{ new Date().toLocaleString() }})</span>
        <button class="refresh-btn" @click="refreshWeatherData">刷新</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.weather-advisor {
  color: var(--cl-text);
  padding: 10px;
  touch-action: pan-y;
  position: relative;
}

.weather-advisor h4 {
  margin: 0 0 15px 0;
  color: var(--cl-primary);
}

.weather-advisor h5 {
  margin: 0 0 10px 0;
  color: var(--cl-secondary);
  font-size: 14px;
}

.advisor-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.loading-spinner {
  width: 30px;
  height: 30px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: var(--cl-primary);
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 15px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.advisor-error {
  text-align: center;
  padding: 30px;
  color: #ff4757;
}

/* 日期选择器样式 */
.date-selector {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  background-color: rgba(37, 61, 98, 0.3);
  border-radius: 8px;
  padding: 5px;
}

.date-tabs {
  display: flex;
  overflow-x: auto;
  flex: 1;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.date-tabs::-webkit-scrollbar {
  display: none; /* Chrome/Safari/Opera */
}

.date-tab {
  flex: 0 0 60px;
  text-align: center;
  padding: 5px 0;
  cursor: pointer;
  border-radius: 4px;
  margin: 0 2px;
}

.date-tab.active {
  background-color: var(--cl-primary);
}

.tab-date {
  font-size: 12px;
  white-space: nowrap;
}

.tab-weekday {
  font-size: 10px;
  opacity: 0.8;
  margin-top: 2px;
}

.date-nav-btn {
  background: transparent;
  border: none;
  color: var(--cl-text);
  font-size: 18px;
  cursor: pointer;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.date-nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 当前天气样式 */
.current-weather {
  display: flex;
  background-color: rgba(37, 61, 98, 0.5);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 15px;
  align-items: center;
}

/* 每日概要样式 */
.daily-summary {
  background-color: rgba(37, 61, 98, 0.5);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 15px;
}

.day-summary {
  display: flex;
  flex-direction: column;
}

.summary-date {
  font-size: 14px;
  margin-bottom: 8px;
  font-weight: bold;
  color: var(--cl-secondary);
}

.summary-content {
  display: flex;
  align-items: center;
}

.summary-icon {
  width: 50px;
  height: 50px;
}

.summary-info {
  margin-left: 10px;
}

.summary-temp {
  font-size: 18px;
  font-weight: bold;
}

.summary-desc {
  font-size: 14px;
  opacity: 0.9;
}

.weather-main {
  display: flex;
  align-items: center;
  flex: 1;
}

.weather-icon {
  width: 50px;
  height: 50px;
}

.weather-info {
  margin-left: 10px;
}

.weather-temp {
  font-size: 24px;
  font-weight: bold;
}

.weather-desc {
  font-size: 14px;
  opacity: 0.9;
}

.weather-details {
  display: flex;
  flex-wrap: wrap;
  flex: 1;
}

.detail-item {
  display: flex;
  flex-direction: column;
  margin-right: 15px;
  min-width: 60px;
}

.detail-item span:first-child {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 3px;
}

.detail-item span:last-child {
  font-size: 14px;
  font-weight: 500;
}

.chart-container {
  background-color: rgba(37, 61, 98, 0.5);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 15px;
}

.hourly-chart {
  height: 180px;
  width: 100%;
}

.travel-advice {
  background-color: rgba(37, 61, 98, 0.5);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 15px;
}

.advice-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.advice-item {
  background-color: rgba(50, 75, 112, 0.5);
  border-radius: 6px;
  padding: 10px;
  transition: transform 0.2s, background-color 0.3s;
  border-left: 3px solid var(--cl-primary);
}

.advice-item:hover {
  transform: translateY(-2px);
}

.advice-item.warning {
  border-left-color: #ff5252;
}

.advice-item.caution {
  border-left-color: #ffc107;
}

.advice-item.good {
  border-left-color: #4caf50;
}

.advice-item.current-period {
  background-color: rgba(65, 100, 150, 0.7);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  border-width: 4px;
  transform: translateY(-2px);
}

.advice-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.advice-period {
  font-weight: bold;
  font-size: 14px;
}

.advice-weather {
  display: flex;
  align-items: center;
}

.advice-icon {
  width: 25px;
  height: 25px;
  margin-right: 5px;
}

.advice-content {
  display: flex;
  align-items: flex-start;
}

.advice-icon-label {
  flex-shrink: 0;
  color: var(--cl-secondary);
  margin-right: 8px;
  font-size: 13px;
}

.recommendation {
  font-size: 13px;
  line-height: 1.4;
}

.swipe-hint {
  text-align: center;
  margin: 15px 0;
  opacity: 0.6;
  animation: fade 2s infinite alternate;
}

@keyframes fade {
  from { opacity: 0.4; }
  to { opacity: 0.8; }
}

.swipe-icon {
  font-size: 20px;
}

.swipe-text {
  font-size: 12px;
  margin-top: 5px;
}

.data-source {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 10px;
}

.refresh-btn {
  background-color: var(--cl-primary);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.refresh-btn:hover {
  background-color: var(--cl-hover);
}

/* 美化滚动条 */
.weather-advisor::-webkit-scrollbar {
  width: 5px;
}

.weather-advisor::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
}

.weather-advisor::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}
</style>
