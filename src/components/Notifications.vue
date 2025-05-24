<template>
  <div class="notifications-container" :class="{ expanded: expanded }">
    <!-- 折叠/展开按钮 -->
    <div class="toggle-btn" @click="toggleExpand">
      {{ expanded ? '▶' : '◀' }}
    </div>
    
    <!-- 通知面板 -->
    <div class="notifications-panel" v-if="expanded">
      <div class="panel-header">
        <h3>通知中心</h3>
        <div class="clear-btn" @click="clearAll">清除全部</div>
      </div>
      
      <div class="notifications-list">
        <div v-if="notifications.length === 0" class="empty-notice">
          暂无通知
        </div>
        <div 
          v-for="(notice, index) in notifications" 
          :key="index" 
          class="notification-item"
          :class="notice.type">
          <div class="notice-icon">{{ getIcon(notice.type) }}</div>
          <div class="notice-content">
            <div class="notice-title">{{ notice.title }}</div>
            <div class="notice-message">{{ notice.message }}</div>
            <div class="notice-time">{{ notice.time }}</div>
          </div>
          <div class="dismiss-btn" @click="dismiss(index)">×</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

// 示例通知数据
const notifications = ref([
  {
    type: 'info',
    title: '系统提示',
    message: '欢迎使用城市地图系统！',
    time: '刚刚'
  },
  {
    type: 'warning',
    title: '警告',
    message: '区域拥堵指数较高',
    time: '2分钟前'
  },
  {
    type: 'error',
    title: '错误',
    message: '无法加载地形数据',
    time: '5分钟前'
  }
]);

const expanded = ref(false);

const toggleExpand = () => {
  expanded.value = !expanded.value;
};

const dismiss = (index) => {
  notifications.value.splice(index, 1);
};

const clearAll = () => {
  notifications.value = [];
};

const getIcon = (type) => {
  switch (type) {
    case 'info': return 'ℹ️';
    case 'warning': return '⚠️';
    case 'error': return '❌';
    default: return '📢';
  }
};

// 添加新通知的方法（可以暴露给父组件）
const addNotification = (notification) => {
  notifications.value.unshift({
    ...notification,
    time: '刚刚'
  });
};

// 暴露方法给父组件
defineExpose({
  addNotification
});
</script>

<style scoped lang="scss">
.notifications-container {
  position: fixed;
  right: 0;
  top: 50px;
  bottom: 80px;
  z-index: 1000;
  display: flex;
  transition: all 0.3s ease;
}

.toggle-btn {
  width: 24px;
  height: 40px;
  background: var(--cl-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--cl-text);
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
  /* 添加边框增强可见性 */
  border: 1px solid var(--cl-border);
  border-right: none;
  /* 添加阴影增强深度感 */
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.3);
  
  &:hover {
    background: var(--cl-hover);
  }
}

.notifications-panel {
  width: 300px;
  /* 更不透明的背景 */
  background: var(--cl-panel-bg);
  border-left: 1px solid var(--cl-border);
  border-top: 1px solid var(--cl-border);
  border-bottom: 1px solid var(--cl-border);
  display: flex;
  flex-direction: column;
  /* 添加阴影增强深度感 */
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.3);
}

.panel-header {
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
  
  .clear-btn {
    font-size: 12px;
    cursor: pointer;
    padding: 4px 8px;
    background: var(--cl-secondary);
    border-radius: 4px;
    /* 添加边框增强可见性 */
    border: 1px solid rgba(255, 255, 255, 0.2);
    
    &:hover {
      background: var(--cl-hover);
    }
  }
}

.notifications-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.empty-notice {
  padding: 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
}

.notification-item {
  margin-bottom: 10px;
  padding: 10px;
  /* 更不透明的背景 */
  background: rgba(15, 30, 45, 0.95);
  border-radius: 4px;
  display: flex;
  position: relative;
  
  &.info {
    border-left: 4px solid #3498db;
  }
  
  &.warning {
    border-left: 4px solid #f39c12;
  }
  
  &.error {
    border-left: 4px solid #e74c3c;
  }
  
  .notice-icon {
    margin-right: 10px;
    font-size: 20px;
  }
  
  .notice-content {
    flex: 1;
  }
  
  .notice-title {
    color: rgba(179, 224, 232, 0.6);
    font-weight: bold;
    margin-bottom: 4px;
    /* 添加文本阴影增强可读性 */
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  
  .notice-message {
    margin-bottom: 4px;
    font-size: 14px;
    color: rgba(146, 202, 219, 0.6);
  }
  
  .notice-time {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }
  
  .dismiss-btn {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;
    border-radius: 50%;
    
    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }
}
</style>
