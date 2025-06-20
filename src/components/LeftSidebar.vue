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
        <!-- 视觉识别控制区，仅在单车数据和单车管理Tab显示 -->
        <template v-if="['bikes','bikeManage'].includes(currentTab.id)">
          <div class="vision-control-bar">
            <button class="vision-btn" :class="{active: visionActive}" @click="$emit('toggle-vision')">
              <span v-if="!visionActive">🚲 启动视觉识别</span>
              <span v-else>⏸️ 暂停视觉识别</span>
            </button>
            <span class="vision-status" :class="{active: visionActive}">
              {{ visionActive ? '识别中' : '已暂停' }}
            </span>
            <button class="camera-setup-btn" @click="$emit('open-camera-setup')">📷 摄像头管理</button>
          </div>
        </template>
        <component :is="currentTab.component" />
      </div>
    </div>
    
    <!-- 折叠状态下的展开按钮 -->
    <div class="expand-btn" @click="toggleExpand" v-if="!expanded">▶</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
// import CityData from './sidebar/CityData.vue';
// import Statistics from './sidebar/Statistics.vue';
// import Resources from './sidebar/Resources.vue';
import BikeStats from './sidebar/BikeStats.vue';
import BikeManagement from './sidebar/BikeManagement.vue';
import TripPlanner from './sidebar/TripPlanner.vue';
import MetroStationQuery from './sidebar/MetroStationQuery.vue';
import ParkingManagement from './sidebar/ParkingManagement.vue'; // 新增

import NoParking from './sidebar/NoParking.vue';// 导入禁停区管理组件
import AnomalyDetection from './sidebar/AnomalyDetection.vue';//导入异常检测组件
import BikeScan from './sidebar/BikeScan.vue';//导入单车扫描组件
import WeatherAdvisor from './sidebar/WeatherAdvisor.vue';
import BikeNavigation from './sidebar/BikeNavigation.vue';

// 状态管理
const expanded = ref(true);
const activeTab = ref('city');

// 获取当前标签页信息
const currentTab = computed(() => {
  return tabs.find(tab => tab.id === activeTab.value) || tabs[0];
});

// 标签页定义
const tabs = [
 // { id: 'city', label: '城市数据', icon: '🏙️', component: CityData },
  //{ id: 'stats', label: '统计视图', icon: '📊', component: Statistics },
 // { id: 'bikes', label: '单车数据', icon: '🚲', component: BikeStats },
  { id: 'bikeManage', label: '单车管理', icon: '🔧', component: BikeManagement },
  { id: 'parking', label: '车位车库', icon: '🅿️', component: ParkingManagement }, // 新增
  { id: 'weather', label: '天气顾问', icon: '🌤️', component: WeatherAdvisor },
  { id: 'bikeNav', label: '单车导航', icon: '🧭', component: BikeNavigation },
  { id: 'tripPlanner', label: '出行规划', icon: '🗺️', component: TripPlanner },
  //{ id: 'metroQuery', label: '地铁站查询', icon: '🚇', component: MetroStationQuery },
  { id: 'noParking', label: '禁停区管理', icon: '🚫', component: NoParking }, // 新增禁停区管理
  { id: 'anomalyDetection', label: '异常检测', icon: '⚠️', component: AnomalyDetection }, // 新增异常检测
  { id: 'bikeScan', label: '单车扫描', icon: '🔍', component: BikeScan } // 新增单车扫描
  //{ id: 'resources', label: '资源管理', icon: '📦', component: Resources }
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

// 新增方法以便外部调用天气顾问
const showWeatherAdvisor = () => {
  activeTab.value = 'weather';
  expanded.value = true;
};

// 新增方法以便外部调用单车导航
const showBikeNavigation = () => {
  activeTab.value = 'bikeNav';
  expanded.value = true;
};

// 新增props用于视觉识别状态和控制
const props = defineProps({
  visionActive: Boolean
});

defineExpose({
  showBikeStats,
  showWeatherAdvisor,
  showBikeNavigation
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

.vision-control-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding: 6px 0 6px 0;
  border-bottom: 1px solid var(--cl-border);
}
.vision-btn {
  background: var(--cl-primary);
  color: #fff;
  border: none;
  border-radius: 3px;
  padding: 4px 12px;
  font-size: 14px;
  cursor: pointer;
  font-weight: bold;
  transition: background 0.2s;
}
.vision-btn.active {
  background: #e74c3c;
}
.vision-status {
  font-size: 13px;
  color: #888;
  padding: 0 8px;
}
.vision-status.active {
  color: #00c48f;
  font-weight: bold;
}
.camera-setup-btn {
  background: var(--cl-secondary);
  color: var(--cl-text);
  border: 1px solid var(--cl-border);
  border-radius: 3px;
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}
.camera-setup-btn:hover {
  background: var(--cl-hover);
}
</style>
