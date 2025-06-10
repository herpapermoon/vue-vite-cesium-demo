<template>
  <div class="no-parking-container">
    <!-- 加载停车区按钮 -->
    <div class="action-button">
      <button @click="loadParkingAreas" :disabled="loading">
        {{ loading ? '加载中...' : '加载停车区' }}
      </button>
    </div>
    
    <!-- 调试按钮
    <div class="action-button" v-if="noParkingManager">
      <button @click="debugParkingAreas" style="background-color: #ff9800;">
        调试停车区
      </button>
      <button @click="flyToAllParkingAreas" style="background-color: #4caf50;">
        查看所有停车区
      </button>
    </div> -->
    
    <!-- 高度调整滑块 -->
    <div class="height-adjustment">
      <label for="heightOffset">停车区高度偏移: {{ heightOffset }}米</label>
      <input 
        type="range" 
        id="heightOffset" 
        v-model="heightOffset" 
        min="0" 
        max="100" 
        step="1"
        @input="updateHeightOffset"
      />
    </div>
    
    <!-- 加载状态和提示 -->
    <div v-if="statusMessage" class="status-message" :class="{ error: isError }">
      {{ statusMessage }}
    </div>

    <!-- 禁停区列表 -->
    <div class="no-parking-list">
      <h4>禁停区列表</h4>
      <div v-if="noParkingAreas.length === 0" class="empty-list">
        暂无禁停区设置
      </div>
      <div v-else class="list-items">
        <div 
          v-for="(area, index) in noParkingAreas" 
          :key="index"
          class="list-item"
        >
          <div class="item-header">
            <span class="item-name">{{ area.name }}</span>
            <div class="item-actions">
              <button @click="flyToArea(area)" title="定位">🔍</button>
              <button @click="deleteNoParkingArea(area)" title="删除">❌</button>
            </div>
          </div>
          <div class="item-reason">
            <strong>原因:</strong> {{ area.reason }}
          </div>
          <div class="item-time" v-if="area.startTime || area.endTime">
            <strong>禁停时间:</strong>
            <span v-if="area.startTime">{{ formatDate(area.startTime) }}</span>
            <span v-else>立即</span>
            <span> 至 </span>
            <span v-if="area.endTime">{{ formatDate(area.endTime) }}</span>
            <span v-else>永久</span>
          </div>
          <div class="item-date">
            <small>设置时间: {{ formatDate(area.date) }}</small>
          </div>
        </div>
      </div>
    </div>

    <!-- 设置禁停区对话框 -->
    <div v-if="showNoParkingDialog" class="dialog-overlay">
      <div class="dialog">
        <h3>设置禁停区</h3>
        <div class="dialog-content">
          <label for="reason">禁停原因:</label>
          <textarea id="reason" v-model="noParkingReason" placeholder="请输入禁停原因"></textarea>
          
          <div class="time-selection">
            <h4>禁停时间段</h4>
            
            <div class="time-group">
              <label for="startTime">开始时间:</label>
              <input 
                type="datetime-local" 
                id="startTime" 
                v-model="noParkingStartTime"
                :min="minStartDate"
              />
              <small>不填则立即生效</small>
            </div>
            
            <div class="time-group">
              <label for="endTime">结束时间:</label>
              <input 
                type="datetime-local" 
                id="endTime" 
                v-model="noParkingEndTime"
                :min="minEndDate"
              />
              <small>不填则永久禁停</small>
            </div>
          </div>
        </div>
        <div class="dialog-actions">
          <button @click="confirmSetNoParking">确认</button>
          <button @click="cancelSetNoParking">取消</button>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div 
      v-if="contextMenu.visible" 
      class="context-menu"
      :style="{left: `${contextMenu.x}px`, top: `${contextMenu.y}px`}"
    >
      <div class="menu-item" @click="toggleNoParkingStatus">
        {{ contextMenu.isNoParking ? '取消禁停' : '设置禁停' }}
      </div>
      <div class="menu-item" @click="closeContextMenu">取消</div>
    </div>

    <!-- 保存禁停数据按钮 -->
    <div class="action-button" style="margin-top: 15px;">
      <button @click="saveNoParkingData" :disabled="loading || noParkingAreas.length === 0">
        {{ loading ? '保存中...' : '保存禁停数据' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import NoParkingManager from '@/cesiumUtils/noParkingManager';

// 状态变量
const loading = ref(false);
const statusMessage = ref('');
const isError = ref(false);
const noParkingAreas = ref([]);
const showNoParkingDialog = ref(false);
const noParkingReason = ref('');
const selectedEntity = ref(null);
const heightOffset = ref(10.0) // 增加默认高度偏移值
const isSelectedEntityNoParking = ref(false); // 当前选中实体是否是禁停区
const noParkingStartTime = ref(''); // 禁停开始时间
const noParkingEndTime = ref(''); // 禁停结束时间

// 右键菜单状态
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  isNoParking: false,
  selectedEntity: null
});

// 计算最小日期时间值，确保选择的日期时间不早于当前时间
const minStartDate = computed(() => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 16);
});

// 确保结束时间不早于开始时间
const minEndDate = computed(() => {
  if (noParkingStartTime.value) {
    return noParkingStartTime.value;
  }
  return minStartDate.value;
});

// NoParkingManager实例
let noParkingManager = null;

// 获取Cesium Viewer实例
const getCesiumViewer = () => {
  return window.cesiumViewer;
};

// 初始化禁停区管理器
const initNoParkingManager = () => {
  const viewer = getCesiumViewer();
  if (viewer) {
    noParkingManager = new NoParkingManager(viewer);
  } else {
    console.error('Cesium viewer not available');
  }
};

// 更新高度偏移
const updateHeightOffset = () => {
  if (!noParkingManager) return
  console.log(`用户调整高度偏移到: ${heightOffset.value}米`)
  noParkingManager.setHeightOffset(parseFloat(heightOffset.value))
}

// 加载停车区数据
const loadParkingAreas = async () => {
  if (!noParkingManager) {
    initNoParkingManager()
  }
  
  if (!noParkingManager) {
    console.error('无法初始化NoParkingManager')
    return
  }
  
  loading.value = true
  statusMessage.value = '正在加载停车区数据...'
  isError.value = false
  
  console.log('开始加载停车区，当前高度偏移:', heightOffset.value)
  
  // 设置初始高度偏移
  noParkingManager.setHeightOffset(parseFloat(heightOffset.value))
  
  // 加载GeoJSON文件
  const result = await noParkingManager.loadParkingAreas('/data/CUG-station.geojson')
  
  loading.value = false
  
  if (result.success) {
    statusMessage.value = `成功加载 ${result.count} 个停车区`
    updateNoParkingList()
    
    // 加载完成后调用调试方法
    setTimeout(() => {
      noParkingManager.debugParkingAreas()
    }, 1000)
  } else {
    statusMessage.value = `加载失败: ${result.error}`;
    isError.value = true;
  }
}

// 调试停车区
const debugParkingAreas = () => {
  if (!noParkingManager) return
  noParkingManager.debugParkingAreas()
}

// 飞到所有停车区
const flyToAllParkingAreas = () => {
  if (!noParkingManager || !noParkingManager.dataSource) return
  
  const viewer = getCesiumViewer()
  if (viewer) {
    viewer.flyTo(noParkingManager.dataSource, {
      duration: 3.0,
      offset: new Cesium.HeadingPitchRange(
        0, 
        Cesium.Math.toRadians(-45), 
        1000 // 距离地面1000米
      )
    })
  }
}

// 加载禁停区数据
const loadNoParkingData = async () => {
  if (!noParkingManager) return;
  
  loading.value = true;
  statusMessage.value = '正在加载禁停区数据...';
  isError.value = false;
  
  // 加载数据
  const result = await noParkingManager.loadNoParkingData();
  
  loading.value = false;
  
  if (result.success) {
    statusMessage.value = '禁停区数据加载成功';
    updateNoParkingList();
  } else {
    statusMessage.value = `加载失败: ${result.error}`;
    isError.value = true;
  }
};

// 更新禁停区列表
const updateNoParkingList = () => {
  if (!noParkingManager) return;
  
  // 获取最新的禁停区列表
  noParkingAreas.value = noParkingManager.getNoParkingAreas();
  
  // 如果列表为空，显示提示
  if (noParkingAreas.value.length === 0) {
    console.log('当前没有禁停区');
  }
};

// 飞到指定区域
const flyToArea = (area) => {
  if (!noParkingManager) return;
  noParkingManager.flyToNoParkingArea(area.entity);
};

// 删除禁停区设置
const deleteNoParkingArea = (area) => {
  if (!noParkingManager) return;
  
  if (confirm(`确定要删除此禁停区吗?\n原因: ${area.reason}`)) {
    noParkingManager.unsetNoParkingArea(area.entity);
    updateNoParkingList();
  }
};

// 打开设置禁停区对话框
const openNoParkingDialog = () => {
  if (!selectedEntity.value) {
    alert("未选中有效区域");
    closeContextMenu(); // 修改这里，使用正确的函数名
    return;
  }
  
  closeContextMenu(); // 修改这里，使用正确的函数名
  showNoParkingDialog.value = true;
  noParkingReason.value = '';
  noParkingStartTime.value = '';
  noParkingEndTime.value = '';
};

// 确认设置禁停区
const confirmSetNoParking = () => {
  if (!noParkingManager || !selectedEntity.value) return;
  
  if (noParkingReason.value.trim() === '') {
    alert('请输入禁停原因');
    return;
  }
  
  // 获取时间值
  const startTimeValue = noParkingStartTime.value ? new Date(noParkingStartTime.value).toISOString() : null;
  const endTimeValue = noParkingEndTime.value ? new Date(noParkingEndTime.value).toISOString() : null;
  
  // 如果设置了结束时间，但没有设置开始时间，则自动设置开始时间为当前时间
  let effectiveStartTime = startTimeValue;
  if (!startTimeValue && endTimeValue) {
    effectiveStartTime = new Date().toISOString();
  }
  
  // 如果设置了开始时间和结束时间，确保结束时间晚于开始时间
  if (startTimeValue && endTimeValue && new Date(startTimeValue) >= new Date(endTimeValue)) {
    alert('结束时间必须晚于开始时间');
    return;
  }
  
  noParkingManager.setNoParkingArea(
    selectedEntity.value, 
    noParkingReason.value,
    effectiveStartTime,
    endTimeValue
  );
  updateNoParkingList();
  
  showNoParkingDialog.value = false;
  selectedEntity.value = null;
};

// 取消设置禁停区
const cancelSetNoParking = () => {
  showNoParkingDialog.value = false;
  selectedEntity.value = null;
};

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN');
};

// 右键菜单相关
const handleParkingAreaRightClick = (event) => {
  console.log('右键点击停车区', event.detail);
  
  // 更新菜单状态和位置
  contextMenu.value.visible = true;
  contextMenu.value.x = event.detail.position.x;
  contextMenu.value.y = event.detail.position.y;
  contextMenu.value.isNoParking = event.detail.isNoParking;
  contextMenu.value.selectedEntity = event.detail.entity;
};

// 关闭菜单
const closeContextMenu = () => {
  contextMenu.value.visible = false;
};

// 设置/取消禁停区
const toggleNoParkingStatus = () => {
  if (!contextMenu.value.selectedEntity) return;
  
  // 获取实际的禁停状态
  const isNoParking = contextMenu.value.selectedEntity.properties.isNoParking;
  const actualIsNoParking = isNoParking && 
    (isNoParking._value !== undefined ? isNoParking._value : isNoParking) === true;
  
  if (actualIsNoParking) {
    // 取消禁停
    const result = noParkingManager.unsetNoParkingArea(contextMenu.value.selectedEntity);
    console.log('取消禁停结果:', result);
    
    // 立即更新禁停区列表
    updateNoParkingList();
  } else {
    // 打开设置禁停对话框
    selectedEntity.value = contextMenu.value.selectedEntity;
    showNoParkingDialog.value = true;
    noParkingReason.value = '';
    noParkingStartTime.value = '';
    noParkingEndTime.value = '';
  }
  
  closeContextMenu();
};

// 保存禁停数据
const saveNoParkingData = async () => {
  if (!noParkingManager) return;
  
  loading.value = true;
  statusMessage.value = '正在保存禁停数据...';
  isError.value = false;
  
  const result = await noParkingManager.saveNoParkingData();
  
  loading.value = false;
  
  if (result.success) {
    statusMessage.value = '禁停数据保存成功';
  } else {
    statusMessage.value = `保存失败: ${result.error}`;
    isError.value = true;
  }
};

// 组件挂载时
onMounted(() => {
  // 初始化禁停区管理器
  initNoParkingManager();
  
  // 添加右键事件监听
  document.addEventListener('parkingAreaRightClicked', handleParkingAreaRightClick);
  
  // 点击页面其他位置关闭上下文菜单
  document.addEventListener('click', closeContextMenu);
});

// 组件卸载时
onUnmounted(() => {
  document.removeEventListener('parkingAreaRightClicked', handleParkingAreaRightClick);
  document.removeEventListener('click', closeContextMenu);
  
  if (noParkingManager) {
    noParkingManager.destroy();
    noParkingManager = null;
  }
});
</script>

<style scoped>
.no-parking-container {
  padding: 10px;
  position: relative;
  background-color: #0d1b2a; /* 深蓝色背景 */
  color: white; /* 白色文字 */
  height: 100%;
}

h4 {
  color: white; /* 确保标题为白色 */
}

.action-button {
  margin-bottom: 15px;
}

button {
  padding: 8px 12px;
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #0b7dda;
}

button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.status-message {
  padding: 8px;
  margin-bottom: 15px;
  background-color: rgba(33, 150, 243, 0.2); /* 半透明蓝色背景 */
  border-left: 4px solid #2196f3;
  border-radius: 2px;
  color: white; /* 白色文字 */
}

.status-message.error {
  background-color: rgba(244, 67, 54, 0.2); /* 半透明红色背景 */
  border-left-color: #f44336;
}

.height-adjustment {
  margin: 15px 0;
}

.height-adjustment label {
  display: block;
  margin-bottom: 5px;
}

.height-adjustment input {
  width: 100%;
  margin: 10px 0;
}

/* 优化滑块样式 */
.height-adjustment input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: #d7dcdf;
  outline: none;
}

.height-adjustment input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #2196F3;
  cursor: pointer;
  transition: background .15s ease-in-out;
}

.height-adjustment input[type="range"]::-webkit-slider-thumb:hover {
  background: #0d8aee;
}

.no-parking-list {
  margin-top: 20px;
}

.empty-list {
  color: #bdc3c7; /* 浅灰色文本 */
  font-style: italic;
  text-align: center;
  padding: 15px 0;
}

.list-items {
  max-height: 300px;
  overflow-y: auto;
}

.list-item {
  background-color: rgba(245, 245, 245, 0.1); /* 半透明浅灰背景 */
  margin-bottom: 10px;
  padding: 10px;
  border-radius: 4px;
  border-left: 4px solid #f44336;
  color: white;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
}

.item-name {
  font-weight: bold;
  color: white;
}

.item-actions button {
  padding: 2px 6px;
  margin-left: 5px;
  background-color: transparent;
  color: #333;
}

.item-reason, .item-time {
  margin-bottom: 5px;
  color: white;
}

.item-date {
  color: #bdc3c7; /* 浅灰色 */
  font-size: 0.8em;
}

/* 对话框背景修改为深色 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7); /* 深色半透明背景 */
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1020;
}

.dialog {
  background-color: #1a2736; /* 深蓝色背景 */
  border-radius: 4px;
  padding: 20px;
  width: 400px;
  max-width: 90%;
  color: white; /* 白色文字 */
}

.dialog h3 {
  margin-top: 0;
  margin-bottom: 15px;
}

.dialog-content {
  margin-bottom: 20px;
}

.dialog-content label {
  display: block;
  margin-bottom: 5px;
}

.dialog-content textarea {
  width: 100%;
  height: 80px;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-bottom: 15px;
}

.time-selection h4 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 14px;
}

.time-group {
  margin-bottom: 10px;
}

.time-group small {
  display: block;
  color: #bdc3c7; /* 浅灰色 */
  margin-top: 3px;
}

.time-group input {
  width: 100%;
  padding: 5px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
}

.dialog-actions button {
  margin-left: 10px;
}

/* 右键菜单样式 */
.context-menu {
  position: fixed;
  background: white;
  border: 1px solid #ccc;
  box-shadow: 2px 2px 8px rgba(0,0,0,0.1);
  border-radius: 4px;
  padding: 5px 0;
  z-index: 1000;
}

.menu-item {
  padding: 8px 15px;
  cursor: pointer;
  color: black;
}

.menu-item:hover {
  background-color: #eeebeb;
}
</style>