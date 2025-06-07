<template>
  <div class="toolbar-container" :class="{ collapsed: !expanded }">
    <!-- 主工具栏 -->
    <div class="main-toolbar">
      <div 
        v-for="(category, index) in categories" 
        :key="index"
        class="toolbar-category"
        :class="{ active: activeCategory === index }"
        @click="selectCategory(index)">
        <div class="category-icon">{{ category.icon }}</div>
        <div class="category-label">{{ category.label }}</div>
      </div>
      
      <!-- 折叠/展开按钮 -->
      <div class="toggle-btn" @click="toggleExpand">
        {{ expanded ? '▼' : '▲' }}
      </div>
    </div>
    
    <!-- 子菜单面板 -->
    <div class="submenu-panel" v-if="expanded">
      <div class="submenu-header">
        <h3>{{ currentCategory.label }}</h3>
      </div>
      
      <div class="submenu-content">
        <!-- 子类别标签页 -->
        <div class="subcategory-tabs" v-if="currentCategory.subcategories">
          <div 
            v-for="(subcat, idx) in currentCategory.subcategories" 
            :key="idx"
            class="subcategory-tab"
            :class="{ active: activeSubcategory === idx }"
            @click="selectSubcategory(idx)">
            {{ subcat.label }}
          </div>
        </div>
        
        <!-- 功能按钮区域 -->
        <div class="tools-grid">
          <button 
            v-for="(tool, idx) in currentTools" 
            :key="idx"
            class="tool-btn"
            :class="{ active: activeTool === tool.id }"
            @click="activateTool(tool)">
            <div class="tool-icon">{{ tool.icon }}</div>
            <div class="tool-label">{{ tool.label }}</div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const emits = defineEmits(['toolActivated']);

// 工具类别
const categories = [
  {
    label: '基础操作',
    icon: '🛠️',
    subcategories: [
      {
        label: '视图工具',
        tools: [
          { id: 'billboard', label: '生成共享单车', icon: '📍' },
          { id: 'bikeDetection', label: '单车视觉识别', icon: '🚲' },
          { id: 'vision', label: '视域分析', icon: '👁️' },
          { id: 'visionAnalysis', label: '通视度分析', icon: '🔍' },
        ]
      },
      {
        label: '地形工具',
        tools: [
         // { id: 'terrain', label: '地形展示', icon: '⛰️' },
          { id: 'geojson', label: '武汉建筑模型', icon: '🗺️' },
          { id: 'whiteBuild', label: '校园建筑', icon: '🏛️' }
        ]
      }
    ]
  },
  {
    label: '特效功能',
    icon: '✨',
    subcategories: [
      {
        label: '天气特效',
        tools: [
          { id: 'rain', label: '雨天', icon: '🌧️' },
          { id: 'snow', label: '雪天', icon: '❄️' },
          { id: 'fog', label: '雾天', icon: '🌫️' }
        ]
       },
    ]
  },

];

// 状态管理
const expanded = ref(false);
const activeCategory = ref(0);
const activeSubcategory = ref(0);
const activeTool = ref(null);

// 获取当前类别
const currentCategory = computed(() => {
  return categories[activeCategory.value];
});

// 获取当前子类别
const currentSubcategory = computed(() => {
  if (!currentCategory.value.subcategories) return null;
  return currentCategory.value.subcategories[activeSubcategory.value];
});

// 获取当前工具列表
const currentTools = computed(() => {
  if (!currentSubcategory.value) return [];
  return currentSubcategory.value.tools || [];
});

// 选择类别
const selectCategory = (index) => {
  activeCategory.value = index;
  activeSubcategory.value = 0;
  if (!expanded.value) {
    expanded.value = true;
  }
};

// 选择子类别
const selectSubcategory = (index) => {
  activeSubcategory.value = index;
};

// 切换展开/折叠状态
const toggleExpand = () => {
  expanded.value = !expanded.value;
};

// 激活工具
const activateTool = (tool) => {
  // 如果是同一个工具，则切换其激活状态
  if (activeTool.value === tool.id) {
    activeTool.value = null;
    emits('toolActivated', { id: tool.id, active: false });
  } else {
    activeTool.value = tool.id;
    emits('toolActivated', { id: tool.id, active: true });
  }
};

// 重置工具激活状态
const resetTool = (toolId) => {
  if (activeTool.value === toolId) {
    activeTool.value = null;
  }
};

// 暴露方法给父组件
defineExpose({
  resetTool,
  isToolActive: (toolId) => activeTool.value === toolId
});
</script>

<style scoped lang="scss">
.toolbar-container {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.main-toolbar {
  display: flex;
  /* 更不透明的背景 */
  background: rgba(20, 40, 70, 0.95);
  border-top: 1px solid var(--cl-border);
  padding: 0 10px;
  height: 60px;
  align-items: center;
  justify-content: center;
  /* 添加阴影增强深度感 */
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
}

.toolbar-category {
  width: 80px;
  height: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--cl-text);
  transition: all 0.2s;
  
  &:hover {
    background: var(--cl-hover);
  }
  
  &.active {
    background: var(--cl-primary);
    /* 添加文本阴影增强可读性 */
    text-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
  }
  
  .category-icon {
    font-size: 24px;
    margin-bottom: 4px;
  }
  
  .category-label {
    font-size: 12px;
  }
}

.toggle-btn {
  position: absolute;
  right: 20px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cl-primary-dark);
  border-radius: 50%;
  cursor: pointer;
  /* 添加边框增强可见性 */
  border: 1px solid var(--cl-border);
  
  &:hover {
    background: var(--cl-hover);
  }
}

.submenu-panel {
  /* 更不透明的背景 */
  background: var(--cl-submenu-bg);
  border-top: 1px solid var(--cl-border);
  max-height: 200px;
  overflow-y: auto;
  /* 添加阴影增强深度感 */
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
}

.submenu-header {
  padding: 5px 15px;
  background: var(--cl-primary-dark);
  
  h3 {
    margin: 0;
    font-size: 16px;
    color: var(--cl-text);
    /* 添加文本阴影增强可读性 */
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.7);
  }
}

.submenu-content {
  padding: 10px;
}

.subcategory-tabs {
  display: flex;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--cl-border);
}

.subcategory-tab {
  padding: 5px 15px;
  cursor: pointer;
  color: var(--cl-text);
  
  &:hover {
    background: var(--cl-hover);
  }
  
  &.active {
    background: var(--cl-primary);
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
  }
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
  padding: 5px;
}

.tool-btn {
  /* 更不透明的背景 */
  background: rgba(30, 50, 80, 0.95);
  border: 1px solid var(--cl-border);
  color: var(--cl-text);
  border-radius: 4px;
  padding: 8px 5px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: all 0.2s;
  
  &:hover {
    background: var(--cl-hover);
  }
  
  &.active {
    background: var(--cl-primary);
  }
  
  .tool-icon {
    font-size: 20px;
    margin-bottom: 5px;
  }
  
  .tool-label {
    font-size: 12px;
    text-align: center;
    /* 添加文本阴影增强可读性 */
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.7);
  }
}
</style>
