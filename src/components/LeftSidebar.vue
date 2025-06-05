<template>
  <div class="sidebar-container" :class="{ collapsed: !expanded }">
    <!-- 侧边栏标签页 -->
    <div class="sidebar-tabs">
      <div 
        v-for="tab in tabs" 
        :key="tab.id" 
        class="tab-item" 
        :class="{ active: activeTab === tab.id }"
        @click="selectTab(tab.id)">
        <div class="tab-icon">{{ tab.icon }}</div>
        <div class="tab-label" v-if="expanded">{{ tab.label }}</div>
      </div>
    </div>
    
    <!-- 侧边栏内容 -->
    <div class="sidebar-content" v-if="expanded">
      <div class="content-header">
        <h3>{{ currentTab.label }}</h3>
        <div class="collapse-btn" @click="toggleExpand">◀</div>
      </div>
      <div class="content-body">
        <component :is="currentTab.component" />
      </div>
    </div>
    
    <!-- 折叠状态下的展开按钮 -->
    <div class="expand-btn" @click="toggleExpand" v-if="!expanded">▶</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import BikeStats from './sidebar/BikeStats.vue';
import BikeManagement from './sidebar/BikeManagement.vue';
import TripPlanner from './sidebar/TripPlanner.vue';
import MetroStationQuery from './sidebar/MetroStationQuery.vue';
import ParkingStatus from './sidebar/ParkingStatus.vue'; // 导入新组件

// 状态管理
const expanded = ref(true);
const activeTab = ref('city');

// 获取当前标签页信息
const currentTab = computed(() => {
  return tabs.find(tab => tab.id === activeTab.value) || tabs[0];
});

// 标签页定义
const tabs = [
  { id: 'bikes', label: '单车数据', icon: '🚲', component: BikeStats },
  { id: 'bikeManage', label: '单车管理', icon: '🔧', component: BikeManagement },
  { id: 'parking', label: '车位状态', icon: '🅿️', component: ParkingStatus }, // 添加新标签页
  { id: 'tripPlanner', label: '出行规划', icon: '🗺️', component: TripPlanner },
  { id: 'metroQuery', label: '地铁站查询', icon: '🚇', component: MetroStationQuery }
];

// 选择标签页
const selectTab = (tabId) => {
  activeTab.value = tabId;
  if (!expanded.value) {
    expanded.value = true;
  }
};

// 切换展开/折叠状态
const toggleExpand = () => {
  expanded.value = !expanded.value;
};

// 导出方法以便外部调用
const showBikeStats = () => {
  activeTab.value = 'bikes';
  expanded.value = true;
};

defineExpose({
  showBikeStats
});
</script>

<style scoped lang="scss">
.sidebar-container {
  position: fixed;
  left: 0;
  top: 50px;
  bottom: 80px;
  display: flex;
  z-index: 1000;
  transition: all 0.3s ease;
  
  &.collapsed {
    .sidebar-content {
      display: none;
    }
  }
}

.sidebar-tabs {
  width: 60px;
  /* 更不透明的背景 */
  background: rgba(20, 40, 70, 0.95);
  display: flex;
  flex-direction: column;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
  /* 添加边框增强可见性 */
  border: 1px solid var(--cl-border);
  border-right: none;
}

.tab-item {
  padding: 10px 5px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--cl-text);
  
  &:hover {
    background: var(--cl-hover);
  }
  
  &.active {
    background: var(--cl-primary);
    /* 添加文本阴影增强可读性 */
    text-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
  }
  
  .tab-icon {
    font-size: 24px;
    margin-bottom: 4px;
  }
  
  .tab-label {
    font-size: 12px;
    text-align: center;
  }
}

.sidebar-content {
  width: 300px;
  /* 更不透明的背景 */
  background: var(--cl-panel-bg);
  border-left: 1px solid var(--cl-border);
  border-right: 1px solid var(--cl-border);
  border-top: 1px solid var(--cl-border);
  border-bottom: 1px solid var(--cl-border);
  display: flex;
  flex-direction: column;
  /* 添加阴影增强深度感 */
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.3);
}

.content-header {
  padding: 10px;
  background: var(--cl-primary-dark);
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  h3 {
    margin: 0;
    color: var(--cl-text);
    /* 添加文本阴影增强可读性 */
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.7);
  }
  
  .collapse-btn {
    cursor: pointer;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--cl-secondary);
    
    &:hover {
      background: var(--cl-hover);
    }
  }
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.expand-btn {
  position: absolute;
  left: 60px;
  top: 10px;
  width: 24px;
  height: 24px;
  background: var(--cl-primary);
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--cl-text);
  /* 添加边框和阴影增强可见性 */
  border: 1px solid var(--cl-border);
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
  
  &:hover {
    background: var(--cl-hover);
  }
}
</style>

<style>
:root {
  /* 已有的变量保持不变 */
  
  /* 添加新变量 */
  --cl-success: #4caf50;
  --cl-warning: #ff9800;
  --cl-panel-dark: rgba(20, 40, 70, 0.95);
  --cl-panel-light: rgba(30, 50, 80, 0.95);
  --cl-text-secondary: #a0a0a0;
}
</style>
