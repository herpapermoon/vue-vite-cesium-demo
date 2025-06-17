<template>
  <div class="bike-management">
    <!-- 单车状态管理 -->
    <div class="management-section">
      <h4>单车状态管理</h4>
      <div class="status-control">
        <div class="control-item">
          <div class="item-label">状态筛选:</div>
          <select v-model="selectedStatus" class="status-select" @change="filterBikes">
            <option value="all">全部单车</option>
            <option value="available">可用单车</option>
            <option value="inUse">使用中</option>
            <option value="maintenance">维护中</option>
            <!--<option value="lowBattery">低电量</option>-->
          </select>
        </div>
        <div class="control-item">
          <button class="action-btn" @click="markForMaintenance" :disabled="!selectedBikes.length">
            标记为维护
          </button>
          <button class="action-btn" @click="markAsAvailable" :disabled="!selectedBikes.length">
            标记为可用
          </button>
        </div>
      </div>
    </div>
    
    <!-- 单车列表 -->
    <div class="bikes-list-section">
      <h4>单车列表 ({{ filteredBikes.length }})</h4>
      <div class="search-box">
        <input type="text" v-model="searchQuery" placeholder="搜索单车ID..." class="search-input" @input="filterBikes">
      </div>
      
      <div class="bikes-table-container">
        <table class="bikes-table">
          <thead>
            <tr>
              <th class="checkbox-col">
                <input type="checkbox" @change="toggleSelectAll" :checked="isAllSelected">
              </th>
              <th>单车ID</th>
              <th>状态</th>
              <!--<th>电量</th>-->
              <th>最后更新</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="bike in displayedBikes" :key="bike.id" :class="bike.status">
              <td>
                <input type="checkbox" v-model="selectedBikes" :value="bike.id">
              </td>
              <td>{{ bike.id.substring(0, 8) }}...</td>
              <td>{{ getStatusLabel(bike.status) }}</td>
              <td>{{ bike.batteryLevel }}%</td>
              <td>{{ formatTime(bike.lastUpdated) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div class="pagination">
        <button @click="prevPage" :disabled="currentPage === 1">上一页</button>
        <span>{{ currentPage }} / {{ totalPages }}</span>
        <button @click="nextPage" :disabled="currentPage === totalPages">下一页</button>
      </div>
    </div>
    
    <!-- 批量操作 -->
    <div class="batch-operations" v-if="selectedBikes.length">
      <h4>已选择 {{ selectedBikes.length }} 辆单车</h4>
      <div class="operations-buttons">
        <button class="primary-btn" @click="locateBikes">在地图上定位</button>
       <!-- <button class="warning-btn" @click="rechargeBikes">发起充电</button>-->
      </div>
    </div>

    <!-- 地图可视化控制 -->
    <div class="map-visualization">
      <h4>地图可视化</h4>
      <div class="vis-buttons">
        <button 
          v-for="status in statusOptions" 
          :key="status.value"
          class="vis-btn"
          :class="{ active: mapVisStatus === status.value }"
          @click="visualizeBikesByStatus(status.value)">
          {{ status.label }}
        </button>
        <button class="vis-btn clear" @click="clearVisualization">清除</button>
      </div>
    </div>

    <!-- 批处理任务 -->
    <div class="background-tasks" v-if="runningTasks.length > 0">
      <h4>正在进行的任务</h4>
      <div class="task-list">
        <div v-for="(task, index) in runningTasks" :key="index" class="task-item">
          <div class="task-info">
            <span class="task-name">{{ task.name }}</span>
            <span class="task-status">{{ task.progress }}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress" :style="{width: `${task.progress}%`}"></div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 通知消息 -->
    <div class="notification-container" v-if="notification">
      <div :class="['notification', notification.type]">
        <span class="notification-message">{{ notification.message }}</span>
        <span class="close-btn" @click="dismissNotification">×</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import bikeStore from '@/cesiumUtils/BikeStore';
import bikeVisualizer from '@/cesiumUtils/bikeVisualizer';

// 状态管理
const selectedStatus = ref('all');
const searchQuery = ref('');
const filteredBikes = ref([]);
const selectedBikes = ref([]);
const currentPage = ref(1);
const itemsPerPage = 8;
const notification = ref(null);
const runningTasks = ref([]);
const mapVisStatus = ref(null); // 当前地图可视化状态

// 状态选项
const statusOptions = [
  { label: '可用单车', value: 'available' },
  { label: '使用中', value: 'inUse' },
  { label: '维护中', value: 'maintenance' },
 // { label: '低电量', value: 'lowBattery' }
];

// Cesium viewer引用
let viewer = null;

// 获取单车列表
const loadBikes = () => {
  const allBikes = bikeStore.getAllBikes();
  filteredBikes.value = [...allBikes];
  filterBikes();
};

// 筛选单车
const filterBikes = () => {
  const allBikes = bikeStore.getAllBikes();
  
  // 基于状态筛选
  let filtered = allBikes;
  if (selectedStatus.value !== 'all') {
    filtered = bikeStore.getBikesByStatus(selectedStatus.value);
  }
  
  // 基于搜索词筛选
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(bike => 
      bike.id.toLowerCase().includes(query)
    );
  }
  
  filteredBikes.value = filtered;
  currentPage.value = 1; // 重置到第一页
};

// 计算分页
const totalPages = computed(() => Math.ceil(filteredBikes.value.length / itemsPerPage));

const displayedBikes = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  return filteredBikes.value.slice(start, end);
});

const isAllSelected = computed(() => {
  return displayedBikes.value.length > 0 && 
    displayedBikes.value.every(bike => selectedBikes.value.includes(bike.id));
});

// 分页控制
const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
  }
};

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--;
  }
};

// 选择控制
const toggleSelectAll = (event) => {
  if (event.target.checked) {
    // 全选当前页
    displayedBikes.value.forEach(bike => {
      if (!selectedBikes.value.includes(bike.id)) {
        selectedBikes.value.push(bike.id);
      }
    });
  } else {
    // 取消选择当前页
    selectedBikes.value = selectedBikes.value.filter(id => 
      !displayedBikes.value.find(bike => bike.id === id)
    );
  }
};

// 批量操作函数
const markForMaintenance = () => {
  if (selectedBikes.value.length === 0) return;
  
  // 创建任务进度
  const taskId = addTask(`标记${selectedBikes.value.length}辆单车为维护状态`);
  
  // 开始处理
  const totalBikes = selectedBikes.value.length;
  let processedCount = 0;
  
  selectedBikes.value.forEach((id, index) => {
    // 模拟分批处理
    setTimeout(() => {
      bikeStore.updateBike(id, { status: 'maintenance' });
      processedCount++;
      
      // 更新进度
      updateTaskProgress(taskId, Math.floor((processedCount / totalBikes) * 100));
      
      // 当所有单车处理完毕
      if (processedCount === totalBikes) {
        filterBikes();
        selectedBikes.value = [];
        showNotification('success', `已成功将${totalBikes}辆单车标记为维护状态`);
        completeTask(taskId);
      }
    }, index * 150); // 每辆单车处理延迟150毫秒
  });
};

const markAsAvailable = () => {
  if (selectedBikes.value.length === 0) return;
  
  // 创建任务进度
  const taskId = addTask(`标记${selectedBikes.value.length}辆单车为可用状态`);
  
  // 开始处理
  const totalBikes = selectedBikes.value.length;
  let processedCount = 0;
  
  selectedBikes.value.forEach((id, index) => {
    // 模拟分批处理
    setTimeout(() => {
      bikeStore.updateBike(id, { status: 'available' });
      processedCount++;
      
      // 更新进度
      updateTaskProgress(taskId, Math.floor((processedCount / totalBikes) * 100));
      
      // 当所有单车处理完毕
      if (processedCount === totalBikes) {
        filterBikes();
        selectedBikes.value = [];
        showNotification('success', `已成功将${totalBikes}辆单车标记为可用状态`);
        completeTask(taskId);
      }
    }, index * 150); // 每辆单车处理延迟150毫秒
  });
};

const locateBikes = () => {
  if (selectedBikes.value.length === 0) return;
  
  try {
    // 获取Cesium viewer实例
    const visualizer = getCesiumVisualizer();
    if (!visualizer) {
      showNotification('error', '无法获取地图可视化工具');
      return;
    }
    
    // 获取选中的单车数据
    const bikesToLocate = selectedBikes.value.map(id => bikeStore.getBikeById(id)).filter(bike => bike);
    
    if (bikesToLocate.length === 0) {
      showNotification('warning', '未找到选中的单车数据');
      return;
    }
    
    // 定位单车
    if (visualizer.locateBikes(bikesToLocate)) {
      showNotification('info', `已在地图上定位${bikesToLocate.length}辆单车`);
    }
  } catch (error) {
    console.error('定位单车时发生错误:', error);
    showNotification('error', '定位单车失败，请刷新页面后重试');
  }
};

const rechargeBikes = () => {
  if (selectedBikes.value.length === 0) return;
  
  // 创建任务进度
  const taskId = addTask(`为${selectedBikes.value.length}辆单车充电`);
  
  // 开始处理
  const totalBikes = selectedBikes.value.length;
  let processedCount = 0;
  
  selectedBikes.value.forEach((id, index) => {
    // 模拟分批处理
    setTimeout(() => {
      bikeStore.updateBike(id, { 
        batteryLevel: 100,
        status: 'available' 
      });
      processedCount++;
      
      // 更新进度
      updateTaskProgress(taskId, Math.floor((processedCount / totalBikes) * 100));
      
      // 当所有单车处理完毕
      if (processedCount === totalBikes) {
        filterBikes();
        selectedBikes.value = [];
        showNotification('success', `已成功为${totalBikes}辆单车充满电`);
        completeTask(taskId);
      }
    }, index * 200); // 每辆单车处理延迟200毫秒
  });
};

// 地图可视化控制
const visualizeBikesByStatus = (status) => {
  try {
    const visualizer = getCesiumVisualizer();
    if (!visualizer) {
      showNotification('error', '无法获取地图可视化工具');
      return;
    }
    
    // 获取特定状态的单车
    const bikes = bikeStore.getBikesByStatus(status);
    
    if (bikes.length === 0) {
      showNotification('warning', `当前没有${getStatusLabel(status)}的单车`);
      return;
    }
    
    // 可视化单车
    const count = visualizer.visualizeByStatus(bikes, status);
    
    // 更新当前可视化状态
    mapVisStatus.value = status;
    
    showNotification('info', `已在地图上显示${count}辆${getStatusLabel(status)}`);
  } catch (error) {
    console.error('可视化单车时发生错误:', error);
    showNotification('error', '可视化单车失败，请刷新页面后重试');
  }
};

// 清除可视化
const clearVisualization = () => {
  try {
    const visualizer = getCesiumVisualizer();
    if (visualizer) {
      visualizer.clearHighlights();
      mapVisStatus.value = null;
      showNotification('info', '已清除地图上的单车标记');
    }
  } catch (error) {
    console.error('清除可视化时发生错误:', error);
  }
};

// 任务管理
const addTask = (name) => {
  const taskId = Date.now().toString();
  runningTasks.value.push({
    id: taskId,
    name,
    progress: 0
  });
  return taskId;
};

const updateTaskProgress = (taskId, progress) => {
  const task = runningTasks.value.find(t => t.id === taskId);
  if (task) {
    task.progress = progress;
  }
};

const completeTask = (taskId) => {
  setTimeout(() => {
    runningTasks.value = runningTasks.value.filter(t => t.id !== taskId);
  }, 2000);
};

// 通知管理
const showNotification = (type, message) => {
  notification.value = { type, message };
  
  // 自动关闭通知
  setTimeout(() => {
    if (notification.value && notification.value.message === message) {
      dismissNotification();
    }
  }, 4000);
};

const dismissNotification = () => {
  notification.value = null;
};

// 辅助函数
const getStatusLabel = (status) => {
  const labels = {
    'available': '可用',
    'inUse': '使用中',
    'maintenance': '维护中',
    'lowBattery': '低电量'
  };
  return labels[status] || status;
};

const formatTime = (timestamp) => {
  if (!timestamp) return '未知';
  
  const date = new Date(timestamp);
  const today = new Date();
  
  if (date.toDateString() === today.toDateString()) {
    // 今天，只显示时间
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  } else {
    // 不是今天，显示日期
    return `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
};

// 获取Cesium可视化工具
const getCesiumVisualizer = () => {
  if (!viewer) {
    // 尝试从全局获取Cesium viewer实例
    if (window.viewer3D) {
      viewer = window.viewer3D;
    } else {
      console.error('无法获取Cesium viewer实例');
      return null;
    }
  }
  
  return bikeVisualizer.getInstance(viewer);
};

// 初始化
onMounted(() => {
  // 由于Cesium可能在父组件中初始化，这里做一些延迟处理
  setTimeout(() => {
    if (window.viewer3D) {
      viewer = window.viewer3D;
      console.log('成功获取Cesium viewer实例');
    }
  }, 1000);
  
  loadBikes();
});

// 组件卸载前清理
onUnmounted(() => {
  try {
    // 清除所有可视化
    const visualizer = getCesiumVisualizer();
    if (visualizer) {
      visualizer.clearHighlights();
    }
  } catch (error) {
    console.error('清理可视化时发生错误:', error);
  }
});
</script>

<style scoped lang="scss">
.bike-management {
  color: var(--cl-text);
}

.management-section, .bikes-list-section, .batch-operations, .map-visualization, .background-tasks {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  
  h4 {
    margin: 0 0 10px 0;
    font-size: 16px;
    color: var(--cl-primary);
  }
}

.status-control {
  .control-item {
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    
    .item-label {
      min-width: 80px;
      margin-right: 10px;
    }
    
    .status-select {
      flex: 1;
      padding: 6px;
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
}

.search-box {
  margin-bottom: 10px;
  
  .search-input {
    width: 100%;
    padding: 6px 10px;
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

.bikes-table-container {
  max-height: 240px;
  overflow-y: auto;
  margin-bottom: 10px;
  
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

.bikes-table {
  width: 100%;
  border-collapse: collapse;
  
  th, td {
    padding: 6px 8px;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  th {
    font-weight: bold;
    background: rgba(20, 40, 70, 0.8);
  }
  
  tr {
    &:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    
    &.maintenance {
      color: #f39c12;
    }
    
    &.lowBattery {
      color: #e74c3c;
    }
    
    &.inUse {
      color: #3498db;
    }
    
    &.available {
      color: #2ecc71;
    }
  }
  
  .checkbox-col {
    width: 30px;
  }
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  
  button {
    padding: 5px 10px;
    margin: 0 5px;
    background: var(--cl-primary-dark);
    border: none;
    border-radius: 4px;
    color: var(--cl-text);
    cursor: pointer;
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    &:hover:not(:disabled) {
      background: var(--cl-primary);
    }
  }
  
  span {
    margin: 0 10px;
  }
}

.action-btn {
  padding: 6px 12px;
  background: var(--cl-secondary);
  border: none;
  border-radius: 4px;
  color: var(--cl-text);
  cursor: pointer;
  margin-right: 10px;
  
  &:hover:not(:disabled) {
    background: var(--cl-hover);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.operations-buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  
  button {
    flex: 1;
    padding: 8px;
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    margin: 0 5px;
    
    &.primary-btn {
      background: #3498db;
      
      &:hover {
        background: #2980b9;
      }
    }
    
    &.warning-btn {
      background: #e74c3c;
      
      &:hover {
        background: #c0392b;
      }
    }
  }
}

.vis-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
  
  .vis-btn {
    padding: 6px 8px;
    background: var(--cl-secondary);
    border: none;
    border-radius: 4px;
    color: var(--cl-text);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
    
    &:hover {
      background: var(--cl-hover);
    }
    
    &.active {
      background: var(--cl-primary);
      box-shadow: 0 0 5px rgba(100, 200, 255, 0.5);
    }
    
    &.clear {
      background: #7f8c8d;
      
      &:hover {
        background: #95a5a6;
      }
    }
  }
}

.task-list {
  .task-item {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    padding: 8px;
    margin-bottom: 8px;
    
    .task-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
      
      .task-name {
        font-size: 13px;
      }
      
      .task-status {
        font-weight: bold;
        color: var(--cl-primary);
      }
    }
    
    .progress-bar {
      height: 6px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 3px;
      overflow: hidden;
      
      .progress {
        height: 100%;
        background: var(--cl-primary);
        transition: width 0.3s ease;
      }
    }
  }
}

.notification-container {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 90%;
  max-width: 300px;
  z-index: 1000;
  
  .notification {
    padding: 10px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.8);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    animation: slideIn 0.3s ease;
    
    &.info {
      border-left: 4px solid #3498db;
    }
    
    &.success {
      border-left: 4px solid #2ecc71;
    }
    
    &.warning {
      border-left: 4px solid #f39c12;
    }
    
    &.error {
      border-left: 4px solid #e74c3c;
    }
    
    .notification-message {
      flex: 1;
    }
    
    .close-btn {
      margin-left: 10px;
      cursor: pointer;
      opacity: 0.7;
      
      &:hover {
        opacity: 1;
      }
    }
  }
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
