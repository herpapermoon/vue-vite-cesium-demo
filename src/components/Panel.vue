<template>
  <!-- 面板主容器，hide类根据dialogVisible状态决定是否隐藏面板 -->
  <div class="panel-wrap" :class="{ hide: !dialogVisible }">
    <!-- 如果有插槽内容则显示插槽内容，否则显示默认面板 -->
    <slot v-if="$slots.default"></slot>
    <div class="panel" v-else>
      <!-- 面板头部 -->
      <header class="panel-header">
        <span>{{ props.title }}</span>
        <span class="close-btn" @click="toggle">×</span>
      </header>
      <!-- 面板内容区域 -->
      <div class="content">
        <!-- 遍历按钮组 -->
        <div class="content-item" v-for="(btn, i) in btns" :key="i">
          <!-- 按钮组标题 -->
          <header class="item-header">
            {{ btn.label }}
          </header>
          <!-- 按钮组内容区 -->
          <div class="content-wrap">
            <!-- 遍历按钮组中的按钮，active类根据按钮状态切换 -->
            <button :class="{ active: item.active }" v-for="(item, index) in btn.contents" :key="index" @click="clickHandler(item, btn)">{{ item.label }}</button>
          </div>
        </div>
      </div>
    </div>
    <!-- 侧边收缩栏，用于展开/收起面板 -->
    <aside class="bar" @click="toggle">
      <span :class="{ 'slide-in': dialogVisible }">＜</span>
    </aside>
  </div>
</template>

<script setup>
import {
  ref, reactive, watchEffect
} from 'vue'
import { $t } from '@/cesiumUtils/i18n'

// 按钮组数据，使用reactive使其成为响应式数据
// 包含三个主要分组：操作、天气和飞行演示
const btns = reactive([
  {
    label: $t('Operations'), // 使用国际化翻译函数
    contents: [
      {
        id: 'billboard',
        label: $t('Generate nodes')
      },
      {
        id: 'sat',
        label: $t('Satellite display')
      },
      {
        id: 'vision',
        label: $t('Visual field analysis')
      },
      {
        id: 'visionAnalysis',
        label: $t('Intervisibility analysis')
      },
      {
        id: 'spreadWall',
        label: $t('Spread wall')
      },
      {
        id: 'geojson',
        label: $t('Geojson Load')
      },
      {
        id: 'tilesetFlow',
        label: $t('Tileset Flow')
      },
      {
        id: 'terrain',
        label: $t('Terrain')
      },
      {
        id: 'spreadEllipse',
        label: $t('High risk alarm')
      },
      {
        id: 'scan',
        label: $t('Ground radar')
      },
      {
        id: 'flyline',
        label: $t('Line link')
      },
      {
        id: 'radarStatic',
        label: $t('Fresnel zone')
      },
      {
        id: 'radarDynamic',
        label: $t('Air radar')
      },
      {
        id: 'riverFlood',
        label: $t('River inundation')
      },
      {
        id: 'riverDynamic',
        label: $t('Dynamic river')
      },
      {
        id: 'trackPlane',
        label: $t('Tracking scan')
      },
      {
        id: 'whiteBuild',
        label: $t('white build')
      },
      {
        id: 'addEcharts',
        label: $t('combine Echarts')
      }
    ]
  },
  {
    label: $t('Weather'),
    contents: [
      {
        id: 'rain',
        label: $t('Rainy')
      },
      {
        id: 'snow',
        label: $t('Snowy')
      },
      {
        id: 'fog',
        label: $t('Foggy')
      }
    ]
  },
  {
    label: $t('Flight demonstration'),
    exclusive: true, // exclusive标记表示该组内按钮是互斥的，只能同时激活一个
    contents: [
      {
        id: 'direct',
        label: $t('Fly directly')
      },
      {
        id: 'round',
        label: $t('Diversion')
      },
      {
        id: 'circle',
        label: $t('Circle around')
      },
      {
        id: 'drone',
        label: $t('UAV detection (video streaming)')
      }
    ]
  }
])

// 定义组件可触发的事件
const emits = defineEmits(['update:visible', 'btnClick'])

// 定义组件的props（属性）
const props = defineProps({
  title: {
    type: String,
    default: $t('menus') // 默认标题为'menus'的翻译
  },
  width: {
    type: String,
    default: '30%' // 默认宽度为30%
  },
  visible: {
    type: Boolean,
    default: false // 默认不可见
  }
})

// 控制面板是否可见的状态
const dialogVisible = ref(false)

// 监听props.visible的变化，同步更新到dialogVisible
watchEffect(() => {
  dialogVisible.value = props.visible
})

// 切换面板显示/隐藏状态
const toggle = () => {
  dialogVisible.value = !dialogVisible.value
  // 通过update:visible事件实现v-model双向绑定
  emits('update:visible', dialogVisible.value)
}

// 按钮点击处理函数
const clickHandler = (thisBtn, group) => {
  const { exclusive } = group
  if (exclusive) {
    // 如果是互斥组，则只激活当前点击的按钮，其他按钮取消激活
    group.contents.forEach((btn) => {
      if (thisBtn.id === btn.id) {
        btn.active = !btn.active
      } else {
        btn.active = false
      }
    })
  } else {
    // 非互斥组，切换当前按钮的激活状态
    thisBtn.active = !thisBtn.active
  }
  // 触发btnClick事件，传递按钮信息
  emits('btnClick', { ...thisBtn })
}

</script>
<style scoped lang="scss">
.panel-wrap {
  font-size: 14px;
  position: fixed;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 250px;
  height: auto;
  background: rgba(0, 0, 0, 0.4);
  transition: right 0.24s ease-in-out;
  border-radius: 5px;
  border: 1px solid steelblue;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  &.hide {
    right: -250px;
  }
  .panel {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .panel-header {
    padding: 0 0 0 10px;
    line-height: 30px;
    color: #fff;
    display: flex;
    justify-content: space-between;
    .close-btn {
      display: inline-block;
      cursor: pointer;
      width: 30px;
      height: 30px;
      font-size: 18px;
    }
  }
  .item-header {
    font-size: 12px;
    color: steelblue;
    text-align: start;
    line-height: 30px;
    border-top: 1px solid rgba(70, 131, 180, 0.596)
  }
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 10px;
    overflow: auto;
    .content-wrap {
      flex: 1;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      button {
        margin: 0 0 10px;
      }
    }
  }
  .bar {
    width: 20px;
    height: 30px;
    font-size: 18px;
    text-align: center;
    line-height: 30px;
    border-top-left-radius: 10px;
    border-bottom-left-radius: 10px;
    position: absolute;
    left: -21px;
    top: calc(50% - 15px);
    color: #fff;
    background: rgb(70, 131, 180);
    cursor: pointer;
    opacity: 0.6;
    transition: all 0.25s ease-in-out;
    span {
      transition: all 0.25s ease-in-out;
      &.slide-in {
        display: inline-block;
        transform: rotate(0.5turn);
      }
    }
    &:hover {
      opacity: 1;
    }
  }
  button {
    background: transparent;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    padding: 6px 12px;
    color: #fff;
    margin-bottom: 10px;
    border: 1px solid steelblue;
    transition: all 0.1s ease-in-out;
    & + button{
      margin-left: 10px;
    }
    &:hover, &.active {
      background: steelblue;
    }
  }
}
</style>
