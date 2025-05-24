<template>
  <div class="trip-planner">
    <!-- 出行规划表单 -->
    <div class="planner-section" v-if="!activeTrip">
      <h4>规划单车出行</h4>
      
      <div class="plan-form">
        <div class="form-item">
          <label>出发地点</label>
          <div class="location-input">
            <input v-model="startLocation.address" placeholder="输入起点..." />
            <button class="location-btn primary" @click="useCurrentLocation">
              <span class="btn-icon">📍</span>
            </button>
            <button class="location-btn" @click="selectLocationOnMap('start')">
              <span class="btn-icon">🗺️</span>
            </button>
          </div>
        </div>
        
        <div class="form-item">
          <label>目的地点</label>
          <div class="location-input">
            <input v-model="endLocation.address" placeholder="输入终点..." />
            <button class="location-btn" @click="selectLocationOnMap('end')">
              <span class="btn-icon">🗺️</span>
            </button>
          </div>
        </div>
        
        <div class="form-item time-selection">
          <div class="time-option">
            <input type="radio" id="now" v-model="timeOption" value="now" />
            <label for="now">立即出发</label>
          </div>
          <div class="time-option">
            <input type="radio" id="scheduled" v-model="timeOption" value="scheduled" />
            <label for="scheduled">计划出发</label>
          </div>
        </div>
        
        <div class="form-item" v-if="timeOption === 'scheduled'">
          <label>出发时间</label>
          <input type="time" v-model="departureTime" />
        </div>
        
        <div class="form-item">
          <label>骑行偏好</label>
          <select v-model="routePreference">
            <option value="fastest">最快路线</option>
            <option value="shortest">最短路线</option>
            <option value="safest">最安全路线</option>
            <option value="scenic">风景路线</option>
          </select>
        </div>
        
        <div class="form-actions">
          <button class="plan-btn" @click="planTrip" :disabled="!canPlanTrip">规划路线</button>
        </div>
      </div>
    </div>
    
    <!-- 规划结果 -->
    <div class="results-section" v-if="showResults && !activeTrip">
      <h4>规划结果</h4>
      
      <div class="trip-summary">
        <div class="summary-item">
          <div class="item-label">预计用时</div>
          <div class="item-value">{{ tripSummary.duration }}分钟</div>
        </div>
        <div class="summary-item">
          <div class="item-label">骑行距离</div>
          <div class="item-value">{{ tripSummary.distance }}公里</div>
        </div>
        <div class="summary-item">
          <div class="item-label">预计费用</div>
          <div class="item-value">¥{{ tripSummary.cost }}</div>
        </div>
        <div class="summary-item">
          <div class="item-label">路线类型</div>
          <div class="item-value">{{ getRouteTypeName() }}</div>
        </div>
      </div>
      
      <div class="nearby-bikes">
        <h5>附近可用单车 ({{ nearbyBikes.length }})</h5>
        <div v-if="nearbyBikes.length === 0" class="no-bikes-message">
          附近无可用单车，请尝试其他位置或刷新
        </div>
        <div v-else class="bikes-list">
          <div 
            v-for="bike in nearbyBikes" 
            :key="bike.id" 
            class="bike-item"
            @click="selectBike(bike)"
            :class="{ selected: selectedBikeId === bike.id }">
            <div class="bike-id">{{ bike.id.substring(0, 8) }}...</div>
            <div class="bike-info">
                            <div class="bike-distance">{{ bike.distance }}米</div>
              <div class="bike-battery">🔋 {{ bike.batteryLevel }}%</div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="trip-actions">
        <button class="start-btn" @click="startTrip" :disabled="!selectedBikeId">开始骑行</button>
        <button class="cancel-btn" @click="cancelPlan">取消规划</button>
      </div>
    </div>
    
    <!-- 进行中的行程 -->
    <div class="active-trip-section" v-if="activeTrip">
      <h4>进行中的行程</h4>
      
      <div class="trip-info">
        <div class="info-item">
          <div class="item-label">骑行时间</div>
          <div class="item-value">{{ formatDuration(activeTrip.elapsedTime) }}</div>
        </div>
        <div class="info-item">
          <div class="item-label">当前速度</div>
          <div class="item-value">{{ activeTrip.speed }} km/h</div>
        </div>
        <div class="info-item">
          <div class="item-label">已骑距离</div>
          <div class="item-value">{{ activeTrip.distanceTraveled }} km</div>
        </div>
        <div class="info-item">
          <div class="item-label">剩余距离</div>
          <div class="item-value">{{ activeTrip.distanceRemaining }} km</div>
        </div>
        <div class="info-item">
          <div class="item-label">预计费用</div>
          <div class="item-value">¥{{ calculateCost(activeTrip) }}</div>
        </div>
      </div>
      
      <div class="trip-progress">
        <div class="progress-bar">
          <div class="progress" :style="{width: `${activeTrip.progressPercentage}%`}"></div>
        </div>
        <div class="progress-labels">
          <div>{{ startLocation.address }}</div>
          <div>{{ endLocation.address }}</div>
        </div>
      </div>
      
      <div class="trip-actions">
        <button class="end-btn" @click="endTrip">结束骑行</button>
      </div>
    </div>
    
    <!-- 行程结束摘要 -->
    <div class="trip-summary-modal" v-if="showTripSummary">
      <div class="modal-content">
        <h4>行程已完成</h4>
        
        <div class="summary-item">
          <div class="item-label">骑行时间</div>
          <div class="item-value">{{ formatDuration(completedTrip.duration) }}</div>
        </div>
        <div class="summary-item">
          <div class="item-label">骑行距离</div>
          <div class="item-value">{{ completedTrip.distance }}公里</div>
        </div>
        <div class="summary-item">
          <div class="item-label">消耗卡路里</div>
          <div class="item-value">{{ completedTrip.calories }}千卡</div>
        </div>
        <div class="summary-item">
          <div class="item-label">骑行费用</div>
          <div class="item-value">¥{{ completedTrip.cost }}</div>
        </div>
        
        <div class="trip-rating">
          <div class="rating-label">为本次出行评分：</div>
          <div class="stars">
            <span 
              v-for="i in 5" 
              :key="i" 
              class="star" 
              :class="{ active: i <= tripRating }"
              @click="tripRating = i">
              ★
            </span>
          </div>
        </div>
        
        <button class="close-btn" @click="closeTripSummary">完成</button>
      </div>
    </div>
    
    <!-- 通知消息 -->
    <div class="notification-container" v-if="notification">
      <div class="notification">
        <span class="notification-message">{{ notification }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import bikeStore from '@/cesiumUtils/BikeStore';
import tripPlanner from '@/cesiumUtils/tripPlanner';

// 地点状态
const startLocation = ref({
  address: '',
  longitude: null,
  latitude: null,
  position: null
});

const endLocation = ref({
  address: '',
  longitude: null,
  latitude: null,
  position: null
});

// 表单状态
const timeOption = ref('now');
const departureTime = ref('');
const routePreference = ref('fastest');

// 规划结果状态
const showResults = ref(false);
const tripSummary = ref({
  duration: 0,
  distance: 0,
  cost: 0,
  routeType: 'fastest'
});

// 附近单车
const nearbyBikes = ref([]);
const selectedBikeId = ref('');

// 进行中的行程
const activeTrip = ref(null);
const tripEventListeners = ref([]);

// 行程结束摘要
const showTripSummary = ref(false);
const completedTrip = ref(null);
const tripRating = ref(3);

// 通知
const notification = ref('');

// Cesium viewer引用
let viewer = null;
let plannerInstance = null;

// 计算属性
const canPlanTrip = computed(() => {
  return startLocation.value.address && endLocation.value.address;
});

// 获取当前位置
const useCurrentLocation = () => {
  // 模拟获取当前位置
  // 在实际应用中，可以使用浏览器的地理位置API
  
  // 随机位置，以北京天安门为中心点
  const centerLon = 116.397;
  const centerLat = 39.908;
  const offsetRange = 0.01;
  
  const longitude = centerLon + (Math.random() - 0.5) * offsetRange;
  const latitude = centerLat + (Math.random() - 0.5) * offsetRange;
  
  startLocation.value = {
    address: '当前位置',
    longitude,
    latitude,
    position: [longitude, latitude]
  };
  
  // 通知
  showNotification('已获取当前位置');
};

// 在地图上选择位置
const selectLocationOnMap = (type) => {
  if (!plannerInstance) {
    showNotification('地图初始化中，请稍后再试');
    return;
  }
  
  plannerInstance.selectLocationOnMap((location) => {
    if (location) {
      if (type === 'start') {
        startLocation.value = location;
      } else {
        endLocation.value = location;
      }
    }
  }, type);
};

// 规划行程
// 规划行程
const planTrip = async () => {
  if (!canPlanTrip.value) {
    showNotification('请输入起点和终点');
    return;
  }
  
  if (!plannerInstance) {
    showNotification('地图初始化中，请稍后再试');
    return;
  }
  
  try {
    // 规划路线
    const routeResult = await plannerInstance.planRoute(
      [startLocation.value.longitude, startLocation.value.latitude],
      [endLocation.value.longitude, endLocation.value.latitude],
      routePreference.value
    );
    
    if (!routeResult) {
      showNotification('路线规划失败，请重试');
      return;
    }
    
    // 更新路线摘要
    tripSummary.value = {
      duration: routeResult.duration,
      distance: (routeResult.distance / 1000).toFixed(2),
      cost: routeResult.cost,
      routeType: routePreference.value
    };
    
    // 获取附近单车
    findNearbyBikes();
    
    // 显示结果
    showResults.value = true;
    
  } catch (error) {
    console.error('规划路线失败:', error);
    showNotification('规划路线时发生错误，请重试');
  }
};

// 查找附近单车
const findNearbyBikes = () => {
  if (!plannerInstance) return;
  
  try {
    // 获取起点附近的单车
    const bikes = plannerInstance.getNearbyBikes(
      [startLocation.value.longitude, startLocation.value.latitude],
      500 // 500米范围内
    );
    
    nearbyBikes.value = bikes;
    
    if (bikes.length === 0) {
      showNotification('附近没有可用单车');
    }
  } catch (error) {
    console.error('获取附近单车失败:', error);
  }
};

// 选择单车
const selectBike = (bike) => {
  selectedBikeId.value = bike.id;
};

// 开始骑行
const startTrip = () => {
  if (!selectedBikeId.value) {
    showNotification('请先选择一辆单车');
    return;
  }
  
  if (!plannerInstance) {
    showNotification('地图初始化中，请稍后再试');
    return;
  }
  
  try {
    // 开始行程
    const trip = plannerInstance.startTrip(selectedBikeId.value);
    
    if (!trip) {
      showNotification('开始行程失败，请重试');
      return;
    }
    
    // 创建活动行程对象
    activeTrip.value = {
      id: trip.id,
      bikeId: selectedBikeId.value,
      startTime: trip.startTime,
      elapsedTime: 0,
      speed: 0,
      distanceTraveled: 0,
      distanceRemaining: parseFloat(tripSummary.value.distance),
      progressPercentage: 0,
      route: trip.route
    };
    
    // 隐藏规划结果
    showResults.value = false;
    
    // 设置进度监听器
    setupProgressListener();
    
    showNotification('骑行开始');
  } catch (error) {
    console.error('开始行程失败:', error);
    showNotification('开始行程时发生错误，请重试');
  }
};

// 设置进度监听器
const setupProgressListener = () => {
  // 进度更新事件
  const progressHandler = (event) => {
    const { progress, elapsedSeconds, totalSeconds } = event.detail;
    
    if (activeTrip.value) {
      // 更新进度
      activeTrip.value.progressPercentage = progress;
      activeTrip.value.elapsedTime = Math.round(elapsedSeconds / 60); // 转为分钟
      
      // 计算速度 (km/h)
      const totalDistance = parseFloat(tripSummary.value.distance);
      activeTrip.value.speed = ((totalDistance * progress / 100) / (elapsedSeconds / 3600)).toFixed(1);
      
      // 计算已行驶距离 (km)
      activeTrip.value.distanceTraveled = ((totalDistance * progress) / 100).toFixed(2);
      
      // 计算剩余距离 (km)
      activeTrip.value.distanceRemaining = (totalDistance - activeTrip.value.distanceTraveled).toFixed(2);
    }
  };
  
  // 行程完成事件
  const completeHandler = (event) => {
    // 结束行程
    endTrip(true);
  };
  
  // 消息通知事件
  const messageHandler = (event) => {
    const { message } = event.detail;
    showNotification(message);
  };
  
  // 添加事件监听器
  document.addEventListener('tripplanner-progress', progressHandler);
  document.addEventListener('tripplanner-complete', completeHandler);
  document.addEventListener('tripplanner-message', messageHandler);
  
  // 保存引用以便后续移除
  tripEventListeners.value = [
    { type: 'tripplanner-progress', handler: progressHandler },
    { type: 'tripplanner-complete', handler: completeHandler },
    { type: 'tripplanner-message', handler: messageHandler }
  ];
};

// 清除事件监听器
const clearEventListeners = () => {
  tripEventListeners.value.forEach(listener => {
    document.removeEventListener(listener.type, listener.handler);
  });
  tripEventListeners.value = [];
};

// 结束骑行
const endTrip = (isAutoComplete = false) => {
  if (!activeTrip.value) return;
  
  try {
    // 停止模拟
    if (plannerInstance) {
      plannerInstance.stopSimulation();
    }
    
    // 移除事件监听器
    clearEventListeners();
    
    // 创建完成的行程摘要
    completedTrip.value = {
      id: activeTrip.value.id,
      bikeId: activeTrip.value.bikeId,
      duration: activeTrip.value.elapsedTime || 1,
      distance: activeTrip.value.distanceTraveled || tripSummary.value.distance,
      calories: Math.round((activeTrip.value.elapsedTime || 1) * 8), // 假设每分钟消耗8千卡
      cost: calculateCost(activeTrip.value),
      isCompleted: isAutoComplete
    };
    
    // 清除活动行程
    activeTrip.value = null;
    
    // 显示行程摘要
    showTripSummary.value = true;
    
  } catch (error) {
    console.error('结束行程失败:', error);
    showNotification('结束行程时发生错误');
    
    // 清除活动行程
    activeTrip.value = null;
  }
};

// 关闭行程摘要
const closeTripSummary = () => {
  showTripSummary.value = false;
  completedTrip.value = null;
  tripRating.value = 3;
  
  // 清除规划
  cancelPlan();
};

// 取消规划
const cancelPlan = () => {
  showResults.value = false;
  selectedBikeId.value = '';
  
  // 清除路线
  if (plannerInstance) {
    plannerInstance.clearRoute();
  }
};

// 计算费用
const calculateCost = (trip) => {
  if (!trip) return 0;
  
  const baseFee = 1.5; // 起步价
  const perHourFee = 3; // 每小时费用
  
  const hours = (trip.elapsedTime || 0) / 60;
  const cost = baseFee + hours * perHourFee;
  return cost.toFixed(1);
};

// 格式化时间
const formatDuration = (minutes) => {
  if (!minutes) return '0分钟';
  
  if (minutes < 60) {
    return `${minutes}分钟`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}小时${mins}分钟`;
  }
};

// 获取路线类型名称
const getRouteTypeName = () => {
  const types = {
    'fastest': '最快路线',
    'shortest': '最短路线',
    'safest': '最安全路线',
    'scenic': '风景路线'
  };
  
  return types[tripSummary.value.routeType] || tripSummary.value.routeType;
};

// 显示通知
const showNotification = (message) => {
  notification.value = message;
  
  // 3秒后自动关闭
  setTimeout(() => {
    if (notification.value === message) {
      notification.value = '';
    }
  }, 3000);
};

// 获取Cesium实例
const getCesiumViewer = () => {
  if (!viewer) {
    // 尝试从全局获取Cesium viewer实例
    if (window.viewer3D) {
      viewer = window.viewer3D;
      return viewer;
    }
  }
  return viewer;
};

// 初始化
onMounted(() => {
  // 延迟初始化，确保Cesium已加载
  setTimeout(() => {
    const viewer = getCesiumViewer();
    if (viewer) {
      plannerInstance = tripPlanner.getInstance(viewer);
      console.log('出行规划器已初始化');
    } else {
      console.error('无法获取Cesium viewer实例');
    }
  }, 1000);
});

// 组件卸载前清理
onUnmounted(() => {
  // 清除事件监听器
  clearEventListeners();
  
  // 清理路线规划器
  tripPlanner.cleanup();
});
</script>

<style scoped lang="scss">
.trip-planner {
  color: var(--cl-text);
  position: relative;
}

.planner-section, .results-section, .active-trip-section {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  
  h4 {
    margin: 0 0 10px 0;
    font-size: 16px;
    color: var(--cl-primary);
  }
  
  h5 {
    margin: 10px 0 5px 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
  }
}

.plan-form {
  .form-item {
    margin-bottom: 12px;
    
    label {
      display: block;
      margin-bottom: 5px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.7);
    }
    
    input, select {
      width: 100%;
      padding: 8px;
      background: rgba(20, 40, 70, 0.9);
      border: 1px solid var(--cl-border);
      color: var(--cl-text);
      border-radius: 4px;
      
      &:focus {
        outline: none;
        border-color: var(--cl-primary);
      }
    }
  }
  
  .location-input {
    display: flex;
    
    input {
      flex: 1;
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
    
    .location-btn {
      width: 36px;
      background: var(--cl-secondary);
      border: 1px solid var(--cl-border);
      border-left: none;
      color: var(--cl-text);
      cursor: pointer;
      
      &:hover {
        background: var(--cl-hover);
      }
      
      &.primary {
        background: var(--cl-primary-dark);
        
        &:hover {
          background: var(--cl-primary);
        }
      }
      
      &:first-of-type {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
      }
      
      &:last-of-type {
        border-top-right-radius: 4px;
        border-bottom-right-radius: 4px;
      }
      
      .btn-icon {
        font-size: 16px;
      }
    }
  }
  
  .time-selection {
    display: flex;
    
    .time-option {
      margin-right: 15px;
      display: flex;
      align-items: center;
      
      input {
        width: auto;
        margin-right: 5px;
      }
    }
  }
}

.form-actions, .trip-actions {
  margin-top: 15px;
  
  button {
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 14px;
    
    &.plan-btn, &.start-btn {
      background: #2ecc71;
      
      &:hover {
        background: #27ae60;
      }
      
      &:disabled {
        background: #95a5a6;
        cursor: not-allowed;
      }
    }
    
    &.cancel-btn {
      background: #7f8c8d;
      margin-left: 10px;
      
      &:hover {
        background: #95a5a6;
      }
    }
    
    &.end-btn {
      background: #e74c3c;
      
      &:hover {
        background: #c0392b;
      }
    }
  }
}

.trip-summary {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 15px;
  
  .summary-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    
    &:last-child {
      margin-bottom: 0;
    }
    
    .item-label {
      color: rgba(255, 255, 255, 0.7);
    }
    
    .item-value {
      font-weight: bold;
    }
  }
}

.nearby-bikes {
  .no-bikes-message {
    padding: 10px;
    text-align: center;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    font-style: italic;
    color: rgba(255, 255, 255, 0.7);
  }
  
  .bikes-list {
    max-height: 150px;
    overflow-y: auto;
    
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
    
    .bike-item {
      display: flex;
      justify-content: space-between;
      padding: 8px;
      border-radius: 4px;
      margin-bottom: 5px;
      background: rgba(0, 0, 0, 0.2);
      cursor: pointer;
      
      &:hover {
        background: rgba(255, 255, 255, 0.05);
      }
      
      &.selected {
        background: var(--cl-primary-dark);
      }
      
      .bike-id {
        font-weight: bold;
      }
      
      .bike-info {
        display: flex;
        
        .bike-distance {
          margin-right: 10px;
          color: rgba(255, 255, 255, 0.7);
        }
        
        .bike-battery {
          color: #2ecc71;
        }
      }
    }
  }
}

.trip-info {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 15px;
  
  .info-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    
    &:last-child {
      margin-bottom: 0;
    }
    
    .item-label {
      color: rgba(255, 255, 255, 0.7);
    }
    
    .item-value {
      font-weight: bold;
    }
  }
}

.trip-progress {
  margin-bottom: 15px;
  
  .progress-bar {
    height: 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 5px;
    
    .progress {
      height: 100%;
      background: #2ecc71;
      transition: width 0.3s ease;
    }
  }
  
  .progress-labels {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }
}

.trip-summary-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  z-index: 2000;
  
  .modal-content {
    width: 90%;
    max-width: 350px;
    background: var(--cl-panel-bg);
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
    
    h4 {
      text-align: center;
      margin: 0 0 20px 0;
      font-size: 18px;
      color: var(--cl-primary);
    }
    
    .summary-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
      
      .item-label {
        color: rgba(255, 255, 255, 0.7);
      }
      
      .item-value {
        font-weight: bold;
      }
    }
    
    .trip-rating {
      margin: 20px 0;
      
      .rating-label {
        margin-bottom: 10px;
        text-align: center;
      }
      
      .stars {
        display: flex;
        justify-content: center;
        
        .star {
          font-size: 24px;
          cursor: pointer;
          color: rgba(255, 255, 255, 0.3);
          margin: 0 5px;
          transition: color 0.2s;
          
          &.active {
            color: #f1c40f;
          }
          
          &:hover {
            color: #f39c12;
          }
        }
      }
    }
    
    .close-btn {
      display: block;
      width: 100%;
      padding: 10px;
      margin-top: 20px;
      background: var(--cl-primary);
      border: none;
      border-radius: 4px;
      color: white;
      font-size: 16px;
      cursor: pointer;
      
      &:hover {
        background: var(--cl-hover);
      }
    }
  }
}

.notification-container {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  z-index: 1000;
  
  .notification {
    background: rgba(0, 0, 0, 0.8);
    color: white;
    text-align: center;
    padding: 8px;
    border-radius: 4px;
    margin-top: 10px;
    animation: fadeIn 0.3s ease;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
