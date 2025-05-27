<template>
   <!-- 应用标题 - 添加在顶部 -->
  <div class="app-title">这是标题111</div>
  <!-- Cesium 的主容器 -->
  <div id="cesiumContainer"></div>
  
  <!-- 基础图层选择器容器 -->
  <div id="baseLayerPickerContainer"></div>
  
  <!-- 测量工具容器 -->
  <div class="measure-div">
    <div id="measure"></div>
  </div>
  
  <!-- 左侧边栏 - 城市数据和统计视图 -->
  <LeftSidebar ref="leftSidebarRef" />
  
  <!-- 底部工具栏 - 功能和工具集合 -->
  <BottomToolbar @toolActivated="btnClickHandler" ref="toolbarRef" />
  
  <!-- 右侧通知面板 -->
  <Notifications ref="notificationsRef" />
  
  <!-- 实时视频流容器，根据videoShow状态显示/隐藏 -->
  <div class="h5videodiv" :class="{ show: videoShow }">
    <video id="h5sVideo1" class="h5video" autoplay webkit-playsinline playsinline></video>
    <div class="playpause">
      <img :src="play" alt="">
    </div>
  </div>
  
  <!-- 语言选择下拉框 -->
  <select v-model="langModel" class="lang-selector">
    <option v-for="l in Object.keys(lang)" :key="l" :value="l">{{ l }}</option>
  </select>
</template>

<script setup>
// 导入Vue相关功能
import { onMounted, ref } from 'vue'

// 导入Cesium及相关资源
import Cesium from '@/cesiumUtils/cesium'
import play from '@/assets/play.png'

// 导入新的UI组件
import LeftSidebar from '@/components/LeftSidebar.vue'
import BottomToolbar from '@/components/BottomToolbar.vue'
import Notifications from '@/components/Notifications.vue'

// 导入各种Cesium功能模块
import { initCesium } from '@/cesiumUtils/initCesium'
import '@/cesiumUtils/flowLine'
import '@/cesiumUtils/waveMaterial'
import '@/cesiumUtils/wallDiffuse'
import { setRain, setSnow, setFog } from '@/cesiumUtils/cesiumEffects'
import SatRoaming from '@/cesiumUtils/satelliteRoaming'
import { setScan } from '@/cesiumUtils/scan'
//import { setFlyline, flyLineDestroy } from '@/cesiumUtils/flyline'
import { setSpreadEllipse, destroy as SpreadDestroy } from '@/cesiumUtils/spreadEllipse'
import { randomGenerateBillboards, destroyBillboard } from '@/cesiumUtils/randomPoints'
//import { setEmitter } from '@/cesiumUtils/emitter'
import { setRadarStaticScan } from '@/cesiumUtils/radarStaticScan'
import { setRadarDynamicScan } from '@/cesiumUtils/radarDynamicScan'
import ViewShed from '@/cesiumUtils/ViewShed'
import TilesetFlow from '@/cesiumUtils/tilesetFlow'
import * as paths from '@/assets/paths'
import ImportPlane from '@/cesiumUtils/importPlane'
import DrawLines from '@/cesiumUtils/drawLines'
//import { drawLinesAndAirplane, settleBaseRadarCarRadio, destoryDrone } from '@/cesiumUtils/planeRoam'
import { addGeojson, removeGeojson } from '@/cesiumUtils/addGeojson'
import { WallRegularDiffuse, removeWall } from '@/cesiumUtils/wallRegularDiffuse'
import gerateSatelliteLines from '@/mocks/satellitePath'
import { initVedeo, toggleVideo } from '@/cesiumUtils/rtsp'
import { VisionAnalysis, analysisVisible, clearLine } from '@/cesiumUtils/visionAnalysis'
import { setRiverFlood } from '@/cesiumUtils/riverFlood'
import { setRiverDynamic } from '@/cesiumUtils/riverDynamic'
import { setTrackPlane } from '@/cesiumUtils/trackPalne'
import { setWhiteBuild } from '@/cesiumUtils/whiteBuild'
//import { addEcharts } from '@/cesiumUtils/addEcharts'
import { langRef, lang } from '@/cesiumUtils/i18n'

// 导入测量工具
import Measure from '@/cesiumUtils/cesiumMeasure'

// 声明各种功能模块的实例变量
let sat                 // 卫星漫游实例
let rain                // 雨效果实例
let snow                // 雪效果实例
let fog                 // 雾效果实例
let shed                // 视域分析实例
let tileset             // 3D模型流动效果实例
let direct              // 直线飞行路径实例
let round               // 迂回飞行路径实例
let circle              // 环绕飞行路径实例
let measureTool         // 测量工具实例

let viewer3D = null     // Cesium查看器实例

// 创建引用
const toolbarRef = ref(null)
const notificationsRef = ref(null)
const leftSidebarRef = ref(null) // 引用LeftSidebar组件
// 存储地址的数组，用于飞行路径
const addresses = []

// 语言模型引用，用于实现多语言
const langModel = langRef

// 响应式状态变量
const videoShow = ref(false)     // 控制视频显示
const clickedDrone = ref(false)  // 是否点击了无人机按钮

// 初始化测量工具
const showMeasure = () => {
  // 先销毁之前的测量工具实例
  measureTool?.destroy()
  // 创建新的测量工具实例
  measureTool = new Measure({
    viewer: viewer3D,
    target: 'measure'
  })
}

// 通用功能调用函数，根据按钮激活状态决定执行成功或失败的回调
const caller = (isActive, resolve, reject) => {
  if (isActive) {
    resolve()
  } else {
    reject()
  }
}

// 返回初始视图
const back2Home = () => {
  document.querySelector('.cesium-home-button').click()
}

// 设置飞机路径
const setPlanePath = (viewer, arr, pos, addr) => {
  // 创建飞机模型
  const plane = new ImportPlane(viewer, {
    uri: `${import.meta.env.VITE_BUILD_PATH_PREFIX}/models/CesiumAir.glb`,
    position: arr,
    addr,
    arrPos: pos,
    maxLength: (arr.length - 1),
    reduce: pos + 1
  })
  // 创建飞行线路
  const line = new DrawLines(viewer, {
    lines: arr,
    model: plane.entity
  })
  return {
    plane,
    line
  }
}

// 设置路线函数
const setRoutes = (type = 'direct') => {
  const pathArr = paths[type]
  addresses.push(1)
  return setPlanePath(viewer3D, pathArr[0], (addresses.length - 1), addresses)
}

// 销毁飞机和路线
const destroyPlaneLine = (flyObj) => {
  if (flyObj) {
    const { plane, line } = flyObj
    plane.destroy()
    line.removeLine()
  }
}

// 销毁所有飞行路线和无人机
const destroyOther = () => {
  destroyPlaneLine(direct)
  destroyPlaneLine(round)
  destroyPlaneLine(circle)
  if (clickedDrone.value) {
    videoShow.value = false
    toggleVideo('h5sVideo1')
    destoryDrone(viewer3D)
  }
}

// 显示通知消息
const showNotification = (title, message, type = 'info') => {
  notificationsRef.value?.addNotification({
    type,
    title,
    message
  })
}

// 按钮点击处理函数，根据按钮ID执行不同功能
const btnClickHandler = (btn) => {
  const { id, active } = btn
  
  // 重置工具栏上的工具状态
  if (!active) {
    toolbarRef.value?.resetTool(id)
  }
  
  switch (id) {
    case 'billboard': {
      // 随机生成点标记
      caller(active, async () => {
        // 生成随机单车数据
        await randomGenerateBillboards(viewer3D, 10000)
        showNotification('地图更新', '已生成10000个随机节点', 'info')
        
        // 显示共享单车统计视图
        // 必须使用 nextTick 确保 UI 更新后再显示侧边栏
        setTimeout(() => {
          if (leftSidebarRef.value) {
            leftSidebarRef.value.showBikeStats()
            console.log('已打开共享单车统计视图')
          } else {
            console.warn('无法获取左侧边栏引用')
          }
        }, 500) // 短暂延迟确保组件已挂载

      }, () => {
        destroyBillboard()
        back2Home()
        showNotification('操作完成', '已清除所有节点', 'info')
      })
      break
    }
    case 'sat': {
      // 卫星显示
      caller(active, () => {
        back2Home()
        sat = new SatRoaming(viewer3D, {
          uri: `${import.meta.env.VITE_BUILD_PATH_PREFIX}/models/Satellite.glb`,
          Lines: gerateSatelliteLines(0, 0)
        })
        showNotification('卫星漫游', '已启动卫星模拟', 'info')
      }, () => {
        sat?.EndRoaming()
        showNotification('卫星漫游', '已停止卫星模拟', 'info')
      })
      break
    }
    case 'vision': {
  // 视域分析
  caller(active, () => {
    // 创建ViewShed实例，不加载模型，启用交互模式
    shed = new ViewShed(viewer3D, {
      loadModel: false,     // 不加载默认建筑模型
      interactive: true     // 启用交互式点选
    });
    showNotification('视域分析', '请在地图上选择观测点(第一次点击)和目标点(第二次点击)', 'info');
  }, () => {
    back2Home();
    shed.clear();
    showNotification('视域分析', '已清除视域分析', 'info');
  });
  break;
}

    case 'tilesetFlow': {
      // 3D模型流动效果
      caller(active, () => {
        tileset = new TilesetFlow(viewer3D)
        showNotification('3D模型流', '已启动模型流动效果', 'info')
      }, () => {
        back2Home()
        tileset.clear()
        showNotification('3D模型流', '已清除模型流动效果', 'info')
      })
      break
    }
    // 替换visionAnalysis的处理逻辑
case 'visionAnalysis': {
  // 可视性分析
  let visionAnalysisInstance = null; // 修改变量名避免与导入的类名冲突
  caller(active, () => {
    // 创建交互式通视度分析实例
    visionAnalysisInstance = new VisionAnalysis(viewer3D, {
      interactive: true // 启用交互式点选
    });
    showNotification('通视度分析', '请在地图上点击选择起始点位置', 'info');
  }, () => {
    if (visionAnalysisInstance) {
      visionAnalysisInstance.destroy();
      visionAnalysisInstance = null;
    } else {
      // 兼容旧代码，确保清理
      clearLine(viewer3D);
    }
    showNotification('通视度分析', '已清除通视度分析', 'info');
  });
  break;
}

    case 'geojson': {
      // 加载GeoJSON数据
      caller(active, () => {
        addGeojson(viewer3D)
        showNotification('数据加载', '已加载GeoJSON数据', 'info')
      }, () => {
        back2Home()
        removeGeojson(viewer3D)
        showNotification('数据加载', '已移除GeoJSON数据', 'info')
      })
      break
    }
    case 'spreadWall': {
      // 扩散墙效果
      caller(active, () => {
        const viewPosition = [116.390646, 39.9126084]
        viewer3D.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            viewPosition[0], viewPosition[1] - 0.04,
            1000
          ),
          orientation: {
            heading: Cesium.Math.toRadians(0, 0),
            pitch: Cesium.Math.toRadians(-20),
            roll: 0.0
          }
        })
        WallRegularDiffuse({
          viewer: viewer3D,
          center: viewPosition,
          radius: 400.0,
          edge: 50,
          height: 50.0,
          speed: 15,
          minRidus: 100
        })
        showNotification('特效', '已启用扩散墙效果', 'info')
      }, () => {
        back2Home()
        removeWall(viewer3D)
        showNotification('特效', '已移除扩散墙效果', 'info')
      })
      break
    }
    case 'terrain': {
      // 地形展示
      if (active) {
        viewer3D.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(99.5, 25.2, 10000),
          orientation: {
            heading: Cesium.Math.toRadians(0, 0),
            pitch: Cesium.Math.toRadians(-25),
            roll: 0.0
          }
        })
        showNotification('地形展示', '已切换到地形视图', 'info')
      } else {
        back2Home()
        showNotification('地形展示', '已返回默认视图', 'info')
      }
      break
    }
    case 'direct': {
      // 直线飞行
      destroyOther()
      caller(active, () => {
        direct = setRoutes('direct')
        showNotification('飞行路径', '已启动直线飞行路径', 'info')
      }, () => {
        back2Home()
        showNotification('飞行路径', '已清除飞行路径', 'info')
      })
      break
    }
    case 'round': {
      // 迂回飞行
      destroyOther()
      caller(active, () => {
        round = setRoutes('round')
        showNotification('飞行路径', '已启动迂回飞行路径', 'info')
      }, () => {
        back2Home()
        showNotification('飞行路径', '已清除飞行路径', 'info')
      })
      break
    }
    case 'circle': {
      // 环绕飞行
      destroyOther()
      caller(active, () => {
        circle = setRoutes('circle')
        showNotification('飞行路径', '已启动环绕飞行路径', 'info')
      }, () => {
        back2Home()
        showNotification('飞行路径', '已清除飞行路径', 'info')
      })
      break
    }
    case 'drone': {
      // 无人机检测（视频流）
      caller(active, () => {
        destroyOther()
        settleBaseRadarCarRadio(viewer3D)
        drawLinesAndAirplane(viewer3D)
        initVedeo('h5sVideo1')
        videoShow.value = !videoShow.value
        clickedDrone.value = true
        showNotification('无人机侦察', '已启动无人机视频流', 'info')
      }, () => {
        destroyOther()
        back2Home()
        showNotification('无人机侦察', '已关闭无人机视频流', 'info')
      })
      break
    }
    case 'scan': {
      // 地面雷达扫描
      back2Home()
      setScan(viewer3D, !active)
      if (active) {
        showNotification('雷达扫描', '已启动地面雷达扫描', 'info')
      } else {
        showNotification('雷达扫描', '已关闭地面雷达扫描', 'info')
      }
      break
    }
    case 'rain': {
      // 雨天效果
      caller(active, () => {
        rain = setRain(viewer3D)
        showNotification('天气效果', '已启动雨天效果', 'info')
      }, () => {
        viewer3D?.scene?.postProcessStages.remove(rain.rainStage)
        showNotification('天气效果', '已关闭雨天效果', 'info')
      })
      break
    }
    case 'snow': {
      // 雪天效果
      caller(active, () => {
        snow = setSnow(viewer3D)
        showNotification('天气效果', '已启动雪天效果', 'info')
      }, () => {
        viewer3D?.scene?.postProcessStages.remove(snow.snowStage)
        showNotification('天气效果', '已关闭雪天效果', 'info')
      })
      break
    }
    case 'fog': {
      // 雾天效果
      caller(active, () => {
        fog = setFog(viewer3D)
        showNotification('天气效果', '已启动雾天效果', 'info')
      }, () => {
        viewer3D?.scene?.postProcessStages.remove(fog.fogStage)
        showNotification('天气效果', '已关闭雾天效果', 'info')
      })
      break
    }
    case 'flyline': {
      // 飞线效果
      if (active) {
        back2Home()
        setFlyline(viewer3D)
        showNotification('特效', '已启动飞线效果', 'info')
      } else {
        flyLineDestroy(viewer3D)
        showNotification('特效', '已关闭飞线效果', 'info')
      }
      break
    }
    case 'spreadEllipse': {
      // 高风险警报（扩散椭圆）
      if (active) {
        back2Home()
        setSpreadEllipse(viewer3D)
        showNotification('警报', '已激活高风险警报', 'warning')
      } else {
        SpreadDestroy(viewer3D)
        showNotification('警报', '已解除高风险警报', 'info')
      }
      break
    }
    case 'radarStatic': {
      // 菲涅尔区（静态雷达）
      back2Home()
      setRadarStaticScan(viewer3D, active)
      setEmitter(viewer3D, active)
      if (active) {
        showNotification('雷达', '已启动菲涅尔区展示', 'info')
      } else {
        showNotification('雷达', '已关闭菲涅尔区展示', 'info')
      }
      break
    }
    case 'radarDynamic': {
      // 空中雷达
      back2Home()
      setRadarDynamicScan(viewer3D, active)
      if (active) {
        showNotification('雷达', '已启动空中雷达展示', 'info')
      } else {
        showNotification('雷达', '已关闭空中雷达展示', 'info')
      }
      break
    }
    case 'riverFlood': {
      // 河流洪水效果
      back2Home()
      setRiverFlood(viewer3D, active)
      if (active) {
        showNotification('水文模拟', '已启动河流淹没效果', 'warning')
      } else {
        showNotification('水文模拟', '已关闭河流淹没效果', 'info')
      }
      break
    }
    case 'riverDynamic': {
      // 动态河流效果
      back2Home()
      setRiverDynamic(viewer3D, active)
           if (active) {
        showNotification('水文模拟', '已启动动态河流效果', 'info')
      } else {
        showNotification('水文模拟', '已关闭动态河流效果', 'info')
      }
      break
    }
    case 'trackPlane': {
      // 跟踪扫描
      back2Home()
      setTrackPlane(viewer3D, active)
      if (active) {
        showNotification('跟踪系统', '已启动跟踪扫描功能', 'info')
      } else {
        showNotification('跟踪系统', '已关闭跟踪扫描功能', 'info')
      }
      break
    }
    case 'whiteBuild': {
      // 校园建筑效果
      setWhiteBuild(viewer3D, active)
      if (active) {
        showNotification('建筑展示', '已启用白模建筑效果', 'info')
      } else {
        showNotification('建筑展示', '已关闭白模建筑效果', 'info')
      }
      break
    }
    case 'addEcharts': {
      // 结合ECharts
      addEcharts(viewer3D, active)
      if (active) {
        showNotification('数据可视化', '已添加Echarts图表', 'info')
      } else {
        showNotification('数据可视化', '已移除Echarts图表', 'info')
      }
      break
    }
    default: break
  }
}

// 组件挂载后执行的逻辑
onMounted(() => {
  // 设置延时是为了确保DOM已完全渲染
  setTimeout(() => { 
    // 初始化Cesium查看器
    viewer3D = initCesium('3d')
    
    // 将viewer3D暴露为全局变量以便其他组件使用
    window.viewer3D = viewer3D
    
    // 显示测量工具
    showMeasure()
    // 显示欢迎通知
    showNotification('系统启动', '欢迎使用城市天际线风格的Cesium地图系统', 'info')
  })
})
</script>

<style scoped lang="scss">
#cesiumContainer {
  width: 100%;
  height: 100%;
}

#baseLayerPickerContainer {
  position: fixed;
  right: 80px;
  top: 5px;
}

.h5videodiv {
  position: fixed;
  left: 70px;
  top: 60px;
  width: 250px;
  background-color: #000000;
  border: 2px solid var(--cl-border);
  border-radius: 4px;
  overflow: hidden;
  z-index: 1100;
  
  /* 修改这里：添加display属性并调整transform */
  display: none; /* 默认完全隐藏 */
  transform: translateX(-350px); /* 确保移出更远 */
  transition: all 0.3s ease-in-out;
  
  &.show {
    display: block; /* 显示时改为block */
    transform: translateX(0);
  }
  
  video {
    width: 100%;
    height: 100%;
  }
  
  .playpause {
    position: absolute;
    left: calc(50% - 10px);
    top: calc(50% - 10px);
    
    img {
      cursor: pointer;
      width: 20px;
    }
  }
}

.app-title {
  position: fixed;
  left: 50%;
  transform: translateX(-50%); // 水平居中
  top: 15px;
  z-index: 1100;
  font-size: 22px;
  font-weight: bold;
  color: white;
  text-shadow: 0 0 5px rgba(0, 0, 0, 0.7);
  background-color: rgba(20, 40, 70, 0.8);
  padding: 8px 25px;
  border-radius: 4px;
  border-bottom: 3px solid var(--cl-primary, steelblue); // 改为底部边框更适合居中样式
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  white-space: nowrap; // 防止文字换行
}
.lang-selector {
  position: fixed;
  right: 120px;
  top: 7px;
  z-index: 1;
  width: 60px;
  height: 32px;
  border-radius: 4px;
  background: var(--cl-secondary);
  border: 1px solid var(--cl-border);
  color: var(--cl-text);
  cursor: pointer;
  
  &:hover {
    background: var(--cl-hover);
    border-color: var(--cl-primary);
    box-shadow: 0 0 8px var(--cl-primary);
  }
  
  &:focus-visible {
    outline: 0;
  }
}
</style>

<style lang="scss">
.measure-div {
  position: absolute;
  right: 181px;
  top: 7px;
  z-index: 1;
  
  .op-btn {
    line-height: 32px;
    outline: none;
    border: 1px solid var(--cl-border);
    background-color: var(--cl-secondary);
    padding: 0 5px;
    color: var(--cl-text);
    font-size: 12px;
    border-radius: 2px;
    margin-right: 5px;
    cursor: pointer;
    
    &:hover {
      background: var(--cl-hover);
      border-color: var(--cl-primary);
    }
  }
}
</style>
