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
  <LeftSidebar 
    ref="leftSidebarRef" 
    :visionActive="detectionActive" 
    @toggle-vision="toggleDetection" 
    @open-camera-setup="openCameraSetup" 
  />
  
  <!-- 底部工具栏 - 功能和工具集合 -->
  <BottomToolbar @toolActivated="btnClickHandler" ref="toolbarRef" />
  
  <!-- 右侧通知面板 -->
  <Notifications ref="notificationsRef" />
  
  <!-- 摄像头设置面板 -->
  <CameraSetup 
    :bike-detector="bikeDetector" 
    :visible="cameraSetupVisible" 
    @close="cameraSetupVisible = false"
    @camera-added="onCameraAdded"
    @camera-activated="onCameraActivated"
  />
  
  <!-- 实时视频流容器，精简UI -->
  <div id="videoContainer" class="h5videodiv" v-show="videoShow" ref="videoContainerRef">
    <div class="video-header">
      <span>监控视频</span>
      <div class="video-controls">
        <button @click="toggleDetection" :class="{ active: detectionActive }">{{ detectionActive ? '暂停识别' : '启动识别' }}</button>
        <button @click="cameraSetupVisible = !cameraSetupVisible" :class="{ active: cameraSetupVisible }">摄像头管理</button>
        <button @click="closeVideoContainer" class="close-btn">✕</button>
      </div>
    </div>
    <div class="video-wrapper">
      <video 
        id="h5sVideo1" 
        class="h5video" 
        autoplay 
        muted
        controls
        preload="auto"
        crossorigin="anonymous"
        webkit-playsinline 
        playsinline
        width="320" 
        height="240"
        @loadeddata="onVideoLoaded"
        @loadedmetadata="onVideoMetadata"
        @canplay="onVideoCanPlay"
        @error="onVideoError"
      ></video>
      <!-- 检测画布直接在这里创建，不通过JS动态创建 -->
      <canvas id="detectionCanvas" class="detection-canvas"></canvas>
    </div>
    <!-- 状态与统计合并为一行 -->
    <div class="detection-status-bar">
      <span class="status-label" :class="{active: detectionActive}">
        {{ detectionActive ? '识别中' : '已暂停' }}
      </span>
      <span class="camera-status-label" v-if="activeCameraName">
        | 摄像头: <span class="camera-name">{{ activeCameraName }}</span>
      </span>
      <span class="stat-label">| 当前帧单车: <span class="stat-value" :class="{ 'has-bikes': detectedBikesCount > 0 }">{{ detectedBikesCount }}</span></span>
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
import CameraSetup from '@/components/CameraSetup.vue'

// 导入单车视觉识别模块
import BikeDetection from '@/cesiumUtils/bikeDetection'

// 导入各种Cesium功能模块
import { initCesium } from '@/cesiumUtils/initCesium'
import { setRain, setSnow, setFog } from '@/cesiumUtils/cesiumEffects'
import { setScan } from '@/cesiumUtils/scan'
import { randomGenerateBillboards, destroyBillboard } from '@/cesiumUtils/randomPoints'
import ViewShed from '@/cesiumUtils/ViewShed'
import * as paths from '@/assets/paths'
import ImportPlane from '@/cesiumUtils/importPlane'
import DrawLines from '@/cesiumUtils/drawLines'
import { addGeojson, removeGeojson } from '@/cesiumUtils/addGeojson'
import gerateSatelliteLines from '@/mocks/satellitePath'
import { VisionAnalysis, analysisVisible, clearLine } from '@/cesiumUtils/visionAnalysis'
import { setWhiteBuild } from '@/cesiumUtils/whiteBuild'
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
let bikeDetector = null // 单车视觉识别模块实例

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
const detectionActive = ref(false) // 单车检测是否激活
const detectedBikesCount = ref(0) // 检测到的单车数量
const autoStartDetection = ref(true) // 是否自动启动检测
const cameraSetupVisible = ref(false) // 控制摄像头设置面板的显示
const activeCameraName = ref('') // 当前激活的摄像头名称

// 摄像头相关方法
const onCameraAdded = (cameraId) => {
  showNotification('摄像头管理', '摄像头添加成功', 'info');
  // 如果没有激活的摄像头，自动激活新添加的
  if (!bikeDetector.cameraManager.getActiveCamera()) {
    bikeDetector.activateCamera(cameraId);
    updateActiveCameraName();
  }
}

const onCameraActivated = async (cameraId) => {
  updateActiveCameraName();
  const camera = bikeDetector.cameraManager.cameras.get(cameraId);
  if (camera && camera.videoUrl) {
    await bikeDetector.switchCamera(camera);
  }
  showNotification('摄像头管理', `已激活摄像头: ${activeCameraName.value}`, 'info');
}

const updateActiveCameraName = () => {
  const activeCamera = bikeDetector?.cameraManager?.getActiveCamera();
  activeCameraName.value = activeCamera ? activeCamera.name : '';
}

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

// 注册bikeDetector事件的函数，确保只注册一次
function registerBikeDetectorEvents() {
  if (!bikeDetector || bikeDetector._eventsRegistered) return;
  bikeDetector.on('detection', (data) => {
    detectedBikesCount.value = data?.count || 0;
  });
  bikeDetector.on('error', (error) => {
    showNotification('视觉识别', `检测错误: ${error.message}`, 'error');
  });
  bikeDetector.on('positionUpdate', (data) => {
    if (leftSidebarRef.value && typeof leftSidebarRef.value.updateBikeStats === 'function') {
      leftSidebarRef.value.updateBikeStats(data.stats);
    }
  });
  bikeDetector._eventsRegistered = true;
}

// 打开摄像头管理前确保bikeDetector已初始化
const openCameraSetup = async () => {
  if (!bikeDetector) {
    bikeDetector = new BikeDetection(viewer3D);
    await bikeDetector.initialize('h5sVideo1');
    registerBikeDetectorEvents();
  }
  cameraSetupVisible.value = true;
};

// 切换单车视觉识别的开关
const toggleDetection = async () => {
  try {
    console.log('触发toggleDetection');
    
    // 检查Cesium查看器是否已初始化
    if (!viewer3D || !viewer3D.scene) {
      console.error('Cesium查看器尚未初始化，请稍后再试');
      showNotification('视觉识别', 'Cesium地图尚未加载完成，请稍后再试', 'error');
      return;
    }
    
    // 只要入口触发，未显示视频窗口时都自动显示
    if (!videoShow.value) {
      videoShow.value = true;
      // 给Vue一点时间更新DOM
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 确保视频元素存在
    const videoElement = document.getElementById('h5sVideo1');
    if (!videoElement) {
      showNotification('视觉识别', '未找到视频元素', 'error');
      return;
    }
    
    // 如果已有检测数据，显示通知提醒用户
    if (bikeDetector && !detectionActive.value) {
      const stats = bikeDetector.getStats();
      if (stats && stats.total > 0) {
        showNotification('视觉识别', `检测到已有${stats.total}辆单车数据，继续检测将保留这些数据`, 'info');
      }
    }
    
    // 如果视频未加载或播放错误，确保加载测试视频
    if (videoElement.readyState < 2 || videoElement.error) {
      console.log('当前视频状态:', videoElement.readyState);
      
      try {
        // 使用正确的public路径
        const videoUrl = window.location.hostname === 'localhost' 
          ? '/assets/VCG2214050653.mp4'  // 开发环境
          : './assets/VCG2214050653.mp4'; // 生产环境
          
        // 配置视频元素
        videoElement.src = videoUrl;
        videoElement.preload = 'auto';
        videoElement.muted = true; // 确保静音以支持自动播放
        videoElement.load();
        
        console.log('视频路径设置为:', videoElement.currentSrc || videoElement.src);
        showNotification('视频加载', '正在加载测试视频...', 'info');
        
        // 等待视频加载
        await new Promise((resolve, reject) => {
          const onReady = () => {
            videoElement.removeEventListener('canplaythrough', onReady);
            videoElement.removeEventListener('loadeddata', onReady);
            videoElement.removeEventListener('error', onError);
            resolve();
          };
          
          const onError = (e) => {
            videoElement.removeEventListener('canplaythrough', onReady);
            videoElement.removeEventListener('loadeddata', onReady);
            videoElement.removeEventListener('error', onError);
            reject(new Error('视频加载失败: ' + (e.message || '未知错误')));
          };
          
          videoElement.addEventListener('canplaythrough', onReady, { once: true });
          videoElement.addEventListener('loadeddata', onReady, { once: true });
          videoElement.addEventListener('error', onError, { once: true });
          
          // 5秒超时
          setTimeout(() => {
            if (videoElement.videoWidth > 0) {
              resolve();
            } else {
              reject(new Error('视频加载超时'));
            }
          }, 5000);
        });
      } catch (err) {
        console.error('加载视频失败:', err);
        showNotification('视频加载', `加载测试视频失败: ${err.message}`, 'error');
        return;
      }
    }
     
    // 初始化或切换检测
    if (detectionActive.value) {
      // 已在检测中，停止检测
      console.log('停止单车检测...');
      if (bikeDetector) {
        bikeDetector.pauseDetection(); // 使用pauseDetection保留数据
      }
      detectionActive.value = false;
      showNotification('视觉识别', '单车视觉识别已暂停', 'info');
    } else {
      // 未在检测，开始检测
      console.log('准备启动单车检测...');
      
      // 确保视频正在播放
      if (videoElement.paused) {
        try {
          await videoElement.play();
        } catch (e) {
          console.warn('需要用户交互才能播放视频:', e);
        }
      }
      
      // 启动检测
      console.log('启动检测...');
      const success = await bikeDetector.startDetection();
      
      if (success) {
        detectionActive.value = true;
        showNotification('视觉识别', '单车视觉识别已启动', 'info');
        
        // 更新当前激活的摄像头名称
        updateActiveCameraName();
      } else {
        showNotification('视觉识别', '启动单车检测失败', 'error');
      }
    }
  } catch (error) {
    console.error('切换检测状态时发生错误:', error);
    showNotification('视觉识别', `操作失败: ${error.message}`, 'error');
  }
}

// 切换视频播放暂停
const toggleVideoPlay = () => {
  const video = document.getElementById('h5sVideo1');
  if (!video) return;
  
  if (video.paused) {
    video.play().catch(err => {
      console.error('视频播放失败:', err);
      showNotification('视频播放', '启动视频失败，请检查视频源', 'error');
    });
  } else {
    video.pause();
  }
}

// 视频加载成功事件
const onVideoLoaded = (event) => {
  console.log('视频数据已加载:', event.target.videoWidth, 'x', event.target.videoHeight);
  showNotification('视频加载', '监控视频加载成功', 'info');
  
}

// 视频元数据加载完成事件
const onVideoMetadata = (event) => {
  console.log('视频元数据已加载:', 
    '时长=', event.target.duration, 
    '尺寸=', event.target.videoWidth, 'x', event.target.videoHeight);
  
}

// 视频可以播放事件
const onVideoCanPlay = (event) => {
  console.log('视频可以播放了');
  

}

// 视频加载失败事件
const onVideoError = (error) => {
}

// 关闭视频容器
const closeVideoContainer = () => {
  console.log('关闭视频容器');
  // 不再暂停检测，识别继续后台运行
  // 清理视频元素
  const videoElement = document.getElementById('h5sVideo1');
  if (videoElement) {
    videoElement.pause();
    videoElement.src = '';
    videoElement.load();
  }
  // 隐藏视频容器和摄像头设置面板
  videoShow.value = false;
  cameraSetupVisible.value = false;
  // 重置工具栏状态（可选）
  if (toolbarRef.value?.isToolActive('bikeDetection')) {
    toolbarRef.value.resetTool('bikeDetection');
  }
  showNotification('单车管理', '已关闭检测窗口（识别仍在后台运行）', 'info');
};

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


// 设置路线函数
const setRoutes = (type = 'direct') => {
  const pathArr = paths[type]
  addresses.push(1)
  return setPlanePath(viewer3D, pathArr[0], (addresses.length - 1), addresses)
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
        await randomGenerateBillboards(viewer3D, 1000)
        showNotification('地图更新', '已生成1000个随机节点', 'info')
        
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
  width: 320px;
  background-color: rgba(0, 0, 0, 0.85);
  border: 2px solid var(--cl-border);
  border-radius: 4px;
  overflow: hidden;
  z-index: 1100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  transition: transform 0.3s ease-in-out;
  
  .video-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--cl-secondary);
    padding: 6px 10px;
    color: var(--cl-text);
    border-bottom: 1px solid var(--cl-border);
    
    span {
      font-weight: bold;
      font-size: 14px;
    }
    
    .video-controls {
      display: flex;
      gap: 8px;
      
      button {
        background: var(--cl-primary);
        border: none;
        border-radius: 3px;
        padding: 3px 8px;
        color: white;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        
        &:hover {
          background: var(--cl-hover);
        }
        
        &.active {
          background: #e74c3c; // 红色表示停止
        }
        
        img {
          width: 12px;
          height: 12px;
        }
      }
    }
  }
  
  .video-wrapper {
    position: relative;
    width: 100%;
    height: 240px; /* 确保有足够的高度 */
    overflow: hidden;
  }
  
  
  video {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain; /* 保持视频比例 */
    z-index: 1;
  }
  
  .detection-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2; /* 确保canvas在视频上层 */
    pointer-events: none; /* 确保不会捕获鼠标事件 */
  }
  
  .detection-stats {
    background: rgba(0, 0, 0, 0.7);
    padding: 8px 12px;
    color: white;
    font-size: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    
    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
    }
    
    .stat-label {
      font-weight: bold;
      color: #00FFFF;
    }
    
    .stat-value {
      background: rgba(0, 255, 255, 0.2);
      border-radius: 3px;
      padding: 1px 6px;
      min-width: 20px;
      text-align: center;
      font-weight: bold;
      transition: all 0.3s ease;
      
      &.has-bikes {
        background: rgba(0, 255, 100, 0.5);
        color: #FFFFFF;
        text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
        transform: scale(1.1);
        box-shadow: 0 0 5px rgba(0, 255, 100, 0.7);
      }
    }
    
    .stat-note {
      font-size: 10px;
      color: #aaa;
      text-align: center;
      margin-top: 2px;
      font-style: italic;
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

/* 添加摄像头状态样式 */
.camera-status {
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.7);
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  font-size: 12px;
  color: white;
}

.camera-status-label {
  font-weight: bold;
  color: #00FFFF;
  margin-right: 8px;
}

.camera-status-value {
  background: rgba(0, 255, 255, 0.2);
  padding: 2px 6px;
  border-radius: 3px;
}

/* 修改视频控制按钮样式，支持3个按钮 */
.video-controls {
  display: flex;
  gap: 5px;
  
  button {
    background: var(--cl-primary);
    border: none;
    border-radius: 3px;
    padding: 3px 6px;
    color: white;
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    
    &:hover {
      background: var(--cl-hover);
    }
    
    &.active {
      background: #e74c3c; // 红色表示停止/关闭
    }
    
    &.close-btn {
      background: #e74c3c;
      font-weight: bold;
      font-size: 14px;
      padding: 0 6px;
      
      &:hover {
        background: #c0392b;
      }
    }
    
    img {
      width: 12px;
      height: 12px;
    }
  }
}

.detection-status-bar {
  background: rgba(0,0,0,0.7);
  color: #fff;
  font-size: 13px;
  padding: 6px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-top: 1px solid rgba(255,255,255,0.15);
}
.status-label {
  color: #888;
}
.status-label.active {
  color: #00c48f;
  font-weight: bold;
}
.camera-status-label {
  color: #00bfff;
}
.camera-name {
  font-weight: bold;
  color: #fff;
}
.stat-label {
  color: #aaa;
}
.stat-value {
  font-weight: bold;
  color: #fff;
  margin-left: 2px;
}
.stat-value.has-bikes {
  color: #00ff64;
  text-shadow: 0 0 3px #00ff64;
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
