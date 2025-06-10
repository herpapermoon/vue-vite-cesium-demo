<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as Cesium from 'cesium'
import gcoord from 'gcoord'  // 引入gcoord库替代自定义转换函数
import ParkingFinder from './ParkingFinder.vue' // 导入停车位查找组件

// 地图API相关配置
const API_KEY = '1f739688561b38fbe82ebc0bbf2eef2b'
const UNIVERSITY_CENTER = [114.6190, 30.4589] // 中国地质大学未来城校区中心点
const UNIVERSITY_BOUNDS = { // 地大未来城校区的大致范围 - 稍微放宽范围
  minLon: 114.6050, 
  maxLon: 114.6350,
  minLat: 30.4450,
  maxLat: 30.4730
}

// 校园内预设POI数据 - 这些坐标是GCJ02坐标系
const CAMPUS_POIS_GCJ02 = [
  { name: '中国地质大学未来城校区', location: { lng: 114.6190, lat: 30.4589 }, address: '未来城校区' },
  
  // 教学区域
  { name: '公共教学楼1号楼', location: { lng: 114.618464, lat: 30.457854 }, address: '未来城校区教学区' },
  { name: '公共教学楼2号楼', location: { lng: 114.618342, lat: 30.458525 }, address: '未来城校区教学区' },
  { name: '科教楼3号楼', location: { lng: 114.617717, lat: 30.45778 }, address: '未来城校区教学区' },
  { name: '科教楼2号楼', location: { lng: 114.617673, lat: 30.458544 }, address: '未来城校区教学区' },
  { name: '地理与信息工程学院', location: { lng: 114.619642, lat: 30.4594 }, address: '未来城校区教学区' },
  { name: '计算机学院', location: { lng: 114.618904, lat: 30.459332 }, address: '未来城校区教学区' },
  { name: '材料与化学学院', location: { lng: 114.616199, lat: 30.458432}, address: '未来城校区教学区' },
  { name: '环境学院', location: { lng: 114.615596, lat: 30.457559}, address: '未来城校区教学区' },
  { name: '教学服务中心', location: { lng: 114.616913, lat: 30.45956}, address: '未来城校区教学区' },
  { name: '科教楼7号楼', location: { lng: 114.61502, lat: 30.457818}, address: '未来城校区教学区' },
  { name: '经济管理学院', location: { lng: 114.614577, lat: 30.458567}, address: '未来城校区教学区' },

  // 宿舍区域
  { name: '学生宿舍一组团', location: { lng: 114.616794, lat: 30.455605 }, address: '未来城校区宿舍区' },
  { name: '学生宿舍二组团', location: { lng: 114.619628, lat: 30.455444 }, address: '未来城校区宿舍区' },
  { name: '学生宿舍三组团', location: { lng: 114.620861, lat: 30.456034 }, address: '未来城校区宿舍区' },
  { name: '学生宿舍五组团', location: { lng: 114.621992, lat: 30.456444 }, address: '未来城校区宿舍区' },
  { name: '留学生公寓', location: { lng: 114.614807, lat: 30.456091 }, address: '未来城校区宿舍区' },
  { name: '博士后生公寓', location: { lng:114.621822, lat: 30.457152}, address: '未来城校区宿舍区' },

  // 食堂和服务区
  { name: '一食堂', location: { lng: 114.618374, lat:30.45493 }, address: '未来城校区' },
  { name: '二食堂', location: { lng: 114.615641, lat:30.455968}, address: '未来城校区' },
  { name: '地大未来城露天广场', location: { lng:114.620167, lat: 30.457052 }, address: '未来城校区' },
  { name: '校医院', location: { lng: 114.614766, lat:30.45686 }, address: '未来城校区' },
  { name: '学生活动中心', location: { lng:114.619907, lat:30.456456}, address: '未来城校区商业区' },
  { name: '弘雅堂', location: { lng: 114.619851, lat:30.456287}, address: '未来城校区商业区' },
  { name: '地球广场', location: { lng:114.616752, lat:30.456426}, address: '未来城校区商业区' },
  { name: '菜鸟驿站', location: { lng: 114.621836, lat:30.457207}, address: '未来城校区商业区' },
  { name: '教职工食堂', location: { lng:114.620959, lat:30.457037 }, address: '未来城校区' },

  // 文体区域
  { name: '体育馆', location: { lng: 114.621442, lat:30.457896}, address: '未来城校区体育区' },
  { name: '田径场', location: { lng: 114.621347, lat:30.459547}, address: '未来城校区体育区' },
  { name: '北篮球场', location: { lng: 114.620547, lat:30.459292}, address: '未来城校区体育区' },
  { name: '南足球场', location: { lng: 114.620661, lat:30.455117}, address: '未来城校区体育区' },
  { name: '南排球场', location: { lng:114.621703, lat:30.455414}, address: '未来城校区体育区' },
  { name: '南网球场', location: { lng:114.622018, lat:30.455788}, address: '未来城校区体育区' },

  { name: '图书馆', location: { lng:114.618251, lat:30.456342}, address: '未来城校区图书馆' },
  
  // 出入口
  { name: '东门', location: { lng: 114.621933, lat:30.45741}, address: '未来城校区东门' },
  { name: '北门', location: { lng: 114.6190, lat: 30.4630 }, address: '未来城校区北门' },
  { name: '西北门', location: { lng:114.614529, lat: 30.459704 }, address: '未来城校区西门' },
  { name: '南门', location: { lng:114.615687, lat:30.455371}, address: '未来城校区南门' }
]

// 使用gcoord预先转换所有POI坐标到WGS84
const CAMPUS_POIS = CAMPUS_POIS_GCJ02.map(poi => {
  // 深拷贝避免引用问题
  const newPoi = {...poi};
  // 转换坐标并存储WGS84坐标
  const wgsLocation = gcoord.transform(
    [poi.location.lng, poi.location.lat],  // 输入坐标
    gcoord.GCJ02,                          // 输入坐标系
    gcoord.WGS84                           // 输出坐标系
  );
  newPoi.wgsLocation = { lng: wgsLocation[0], lat: wgsLocation[1] };
  return newPoi;
});

// 判断点是否在校区边界内
const isInUniversityBounds = (location) => {
  if (!location || !location.lng || !location.lat) return false;
  
  return (
    location.lng >= UNIVERSITY_BOUNDS.minLon &&
    location.lng <= UNIVERSITY_BOUNDS.maxLon &&
    location.lat >= UNIVERSITY_BOUNDS.minLat &&
    location.lat <= UNIVERSITY_BOUNDS.maxLat
  );
}

// 状态变量
const loading = ref(false)
const error = ref(null)
const searchType = ref('start') // 'start' 或 'end'
const startPoint = ref(null)
const endPoint = ref(null)
const searchKeyword = ref('')
const searchResults = ref([])
const routePath = ref(null)
const distanceInfo = ref(null)
const durationInfo = ref(null)
const showResults = ref(false)
const searchDebounceTimeout = ref(null)
const routeEntities = ref([])

// ====== 模型动画相关变量 ======
const modelEntity = ref(null)
const modelAnimating = ref(false)
const modelPaused = ref(false)
const modelProgress = ref(0)
const modelSpeed = ref(12) // 米/秒
let animationFrameId = null
// 添加第一人称视角控制变量
const isFirstPerson = ref(false)
const cameraOffset = ref({x: -10.0, y: 10, z: 1.02}) // x:前后(-为后), y:左右, z:上下

// 获取全局Cesium viewer实例
const viewer = ref(null)
onMounted(() => {
  // 等待Cesium实例加载完成
  const checkViewer = () => {
    if (window.viewer3D) {
      viewer.value = window.viewer3D
      console.log('Cesium viewer loaded successfully')
      
      // 加载高德地图API
      loadAMapAPI()
    } else {
      console.log('Waiting for Cesium viewer to initialize...')
      setTimeout(checkViewer, 500)
    }
  }
  
  // 开始检查
  checkViewer()
})

let AMap = null
let AMapUI = null

// 加载高德地图API
const loadAMapAPI = () => {
  loading.value = true
  error.value = null
  
  // 如果已经加载了API，直接返回
  if (window.AMap) {
    AMap = window.AMap
    loading.value = false
    return
  }
  
  // 加载高德地图API脚本
  const script = document.createElement('script')
  script.type = 'text/javascript'
  script.src = `https://webapi.amap.com/maps?v=2.0&key=${API_KEY}&plugin=AMap.Autocomplete,AMap.PlaceSearch,AMap.Walking`
  script.async = true
  
  script.onload = () => {
    AMap = window.AMap
    
    // 加载高德地图UI库
    const uiScript = document.createElement('script')
    uiScript.type = 'text/javascript'
    uiScript.src = 'https://webapi.amap.com/ui/1.1/main.js'
    uiScript.async = true
    
    uiScript.onload = () => {
      window.AMapUI.loadUI(['misc/PoiPicker'], (PoiPicker) => {
        AMapUI = window.AMapUI
        loading.value = false
      })
    }
    
    document.head.appendChild(uiScript)
  }
  
  script.onerror = () => {
    error.value = '无法加载高德地图API'
    loading.value = false
  }
  
  document.head.appendChild(script)
}

// 监听搜索关键词变化，实现实时搜索
watch(searchKeyword, (newValue) => {
  // 清除之前的定时器
  if (searchDebounceTimeout.value) {
    clearTimeout(searchDebounceTimeout.value)
  }
  
  // 如果输入为空，清空结果
  if (!newValue.trim()) {
    searchResults.value = []
    showResults.value = false
    return
  }
  
  // 设置防抖定时器，300ms后执行搜索
  searchDebounceTimeout.value = setTimeout(() => {
    searchPOI()
  }, 200) // 降低延迟，提高响应速度
})

// 搜索POI
const searchPOI = async () => {
  if (!searchKeyword.value.trim()) {
    return
  }
  
  loading.value = true
  error.value = null
  searchResults.value = []
  
  try {
    // 先搜索预设的校内POI - 优先显示校内精确POI
    const keyword = searchKeyword.value.toLowerCase()
    const matchedCampusPOIs = CAMPUS_POIS.filter(poi => 
      poi.name.toLowerCase().includes(keyword) || 
      poi.address.toLowerCase().includes(keyword)
    )
    
    // 如果校内POI已经匹配到结果，无需调用高德API
    if (matchedCampusPOIs.length > 0) {
      searchResults.value = matchedCampusPOIs.slice(0, 10)
      showResults.value = true
      loading.value = false
      return
    }
    
    // 使用高德地图API进行地点搜索
    const MSearch = new AMap.PlaceSearch({
      city: '武汉', // 限定在武汉市范围内
      citylimit: true,
      pageSize: 30, // 获取更多结果以便过滤
      extensions: 'all'
    })
    
    return new Promise((resolve, reject) => {
      MSearch.search(searchKeyword.value, (status, result) => {
        // 合并预设POI和搜索结果
        if (status === 'complete' && result.info === 'OK') {
          // 过滤位于校区范围内的POI
          let filteredPOIs = result.poiList.pois
            .filter(poi => isInUniversityBounds(poi.location))
          
          // 将预设POI和搜索到的POI合并，移除重复项
          const allPOIs = [...matchedCampusPOIs]
          
          filteredPOIs.forEach(poi => {
            // 检查是否已经存在于预设POI中
            const exists = allPOIs.some(existingPoi => 
              existingPoi.name === poi.name && 
              Math.abs(existingPoi.location.lng - poi.location.lng) < 0.001 && 
              Math.abs(existingPoi.location.lat - poi.location.lat) < 0.001
            )
            
            if (!exists) {
              // 使用gcoord转换高德API返回的GCJ02坐标到WGS84
              const wgsLocation = gcoord.transform(
                [poi.location.lng, poi.location.lat], 
                gcoord.GCJ02, 
                gcoord.WGS84
              );
              poi.wgsLocation = { lng: wgsLocation[0], lat: wgsLocation[1] };
              allPOIs.push(poi);
            }
          })
          
          // 最多显示10个结果
          searchResults.value = allPOIs.slice(0, 10)
          showResults.value = searchResults.value.length > 0
          resolve(allPOIs)
        } else {
          // 即使API搜索失败，也返回预设POI
          searchResults.value = matchedCampusPOIs.slice(0, 10)
          showResults.value = searchResults.value.length > 0
          
          if (searchResults.value.length === 0) {
            error.value = '未找到校内相关地点'
          }
          resolve(matchedCampusPOIs)
        }
        loading.value = false
      })
    })
    
  } catch (err) {
    console.error('POI搜索失败:', err)
    // 使用预设POI作为备选
    const keyword = searchKeyword.value.toLowerCase()
    const matchedCampusPOIs = CAMPUS_POIS.filter(poi => 
      poi.name.toLowerCase().includes(keyword) || 
      poi.address.toLowerCase().includes(keyword)
    )
    
    searchResults.value = matchedCampusPOIs.slice(0, 10)
    showResults.value = searchResults.value.length > 0
    
    if (searchResults.value.length === 0) {
      error.value = '搜索失败，请稍后再试'
    }
    loading.value = false
  }
}

// 选择搜索结果
const selectSearchResult = (poi) => {
  // 确保poi.location存在
  if (!poi.location) {
    console.error('POI位置信息不完整:', poi)
    error.value = '位置信息不完整，无法添加'
    return
  }

  // 获取WGS84坐标 - 使用gcoord库转换或使用已转换的坐标
  let wgsLng, wgsLat;
  if (poi.wgsLocation) {
    // 已有转换好的WGS84坐标
    wgsLng = poi.wgsLocation.lng;
    wgsLat = poi.wgsLocation.lat;
  } else {
    // 需要转换坐标
    const wgsLocation = gcoord.transform(
      [poi.location.lng, poi.location.lat],
      gcoord.GCJ02,
      gcoord.WGS84
    );
    wgsLng = wgsLocation[0];
    wgsLat = wgsLocation[1];
  }
  
  if (searchType.value === 'start') {
    startPoint.value = {
      name: poi.name,
      location: [poi.location.lng, poi.location.lat], // 保留原始GCJ02坐标用于API调用
      wgsLocation: [wgsLng, wgsLat] // WGS84坐标用于地图显示
    }
  } else {
    endPoint.value = {
      name: poi.name,
      location: [poi.location.lng, poi.location.lat],
      wgsLocation: [wgsLng, wgsLat]
    }
  }
  
  // 清空搜索并隐藏结果
  searchKeyword.value = ''
  showResults.value = false
  
  // 飞行到选择的位置 - 使用WGS84坐标
  flyToLocation([wgsLng, wgsLat], poi.name)
  
  // 如果起点和终点都已选择，自动计算路径
  if (startPoint.value && endPoint.value) {
    calculateRoute()
  }
}

// 飞行到指定位置 - 确保使用WGS84坐标
const flyToLocation = (location, name) => {
  if (!viewer.value) return
  
  // 创建临时点位标记
  const entityId = `temp-highlight-${Date.now()}`
  const position = Cesium.Cartesian3.fromDegrees(location[0], location[1], 50)
  
  const entity = viewer.value.entities.add({
    id: entityId,
    position: position,
    point: {
      pixelSize: 12,
      color: Cesium.Color.BLUE,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
    },
    label: {
      text: name,
      font: '14px sans-serif',
      fillColor: Cesium.Color.WHITE,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      outlineWidth: 2,
      outlineColor: Cesium.Color.BLACK,
      verticalOrigin: Cesium.VerticalOrigin.TOP,
      pixelOffset: new Cesium.Cartesian2(0, -20),
      heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
      showBackground: true,
      backgroundColor: new Cesium.Color(0, 0, 0.5, 0.7)
    }
  })
  
  // 飞行到该位置
  viewer.value.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      location[0], 
      location[1],
      300 // 视角高度（米）
    ),
    orientation: {
      heading: 0.0,
      pitch: Cesium.Math.toRadians(-45),
      roll: 0.0
    },
    duration: 1.5,
    complete: function() {
      // 5秒后移除临时标记
      setTimeout(() => {
        viewer.value.entities.removeById(entityId)
      }, 5000) // 增加临时点位显示时间
    }
  })
}

// 设置搜索类型（起点或终点）
const setSearchType = (type) => {
  searchType.value = type
  showResults.value = false
}

// 清除所有Cesium实体
const clearCesiumEntities = () => {
  // 检查viewer是否已初始化
  if (!viewer.value) {
    console.warn('Viewer not initialized, unable to clear entities')
    return
  }
  
  // 删除现有路径实体
  if (routeEntities.value.length > 0) {
    routeEntities.value.forEach(entity => {
      if (viewer.value.entities.contains(entity)) {
        viewer.value.entities.remove(entity)
      }
    })
    routeEntities.value = []
  }
}

// 计算路线 - 使用高德API获取路径
const calculateRoute = async () => {
  if (!startPoint.value || !endPoint.value) {
    error.value = '请先选择起点和终点'
    return
  }
  
  // 检查viewer是否已初始化
  if (!viewer.value) {
    error.value = '地图未准备好，请刷新页面重试'
    console.warn('Viewer not initialized, unable to calculate route')
    return
  }
  
  loading.value = true
  error.value = null
  
  try {
    clearCesiumEntities()
    
    const startCoord = startPoint.value.location
    const endCoord = endPoint.value.location
    
    // 使用高德地图API获取步行路径
    const routeUrl = `https://restapi.amap.com/v3/direction/walking?origin=${startCoord.join(',')}&destination=${endCoord.join(',')}&key=${API_KEY}`
    const response = await fetch(routeUrl)
    const data = await response.json()
    
    if (data.status !== '1' || data.route.paths.length === 0) {
      throw new Error('路径规划失败')
    }
    
    // 提取路径坐标点 - 使用gcoord库进行坐标转换
    const path = []
    data.route.paths[0].steps.forEach(step => {
      step.polyline.split(';').forEach(p => {
        const [lng, lat] = p.split(',').map(Number)
        // 转换GCJ02坐标到WGS84
        const wgsCoord = gcoord.transform(
          [lng, lat],
          gcoord.GCJ02,
          gcoord.WGS84
        );
        path.push(wgsCoord)
      })
    })
    
    // 存储路径信息
    routePath.value = path
    
    // 提取距离和时间信息
    distanceInfo.value = formatDistance(data.route.paths[0].distance)
    durationInfo.value = formatDuration(data.route.paths[0].duration)
    
    // 在Cesium中绘制路径
    drawPathInCesium(path)
    
    // 路径计算完成后，显示停车位查找面板
    showParkingFinder.value = true

    loading.value = false
    return path
  } catch (err) {
    console.error('路径规划失败:', err)
    error.value = '路径规划失败，请稍后再试'
    loading.value = false
  }
}

// 在Cesium中绘制路径
const drawPathInCesium = (path) => {
  // 检查viewer是否初始化
  if (!viewer.value) {
    console.warn('Viewer not initialized, unable to draw path')
    error.value = '地图未准备好，请刷新页面重试'
    return
  }
  
  try {
    // 首先清除之前的绘制
    clearCesiumEntities()
    
    // 转换坐标为Cesium可用格式 - 路径中已是WGS84坐标
    const positions = path.map(point => 
      Cesium.Cartesian3.fromDegrees(point[0], point[1], 5) // 5米高度
    )
    
    // 添加起点实体 - 使用WGS84坐标
    const startEntity = viewer.value.entities.add({
      position: positions[0],
      point: {
        pixelSize: 10,
        color: Cesium.Color.GREEN,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      },
      label: {
        text: '起点',
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE
      }
    })
    routeEntities.value.push(startEntity)
    
    // 添加终点实体 - 使用WGS84坐标
    const endEntity = viewer.value.entities.add({
      position: positions[positions.length - 1],
      point: {
        pixelSize: 10,
        color: Cesium.Color.RED,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      },
      label: {
        text: '终点',
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE
      }
    })
    routeEntities.value.push(endEntity)
    
    // 添加路径线
    const pathEntity = viewer.value.entities.add({
      name: 'path',
      polyline: {
        positions: positions,
        width: 4,
        material: Cesium.Color.CYAN,
        clampToGround: true// 路径贴地
      }
    })
    routeEntities.value.push(pathEntity)
    
    // 飞行到路径
    viewer.value.flyTo(pathEntity)
  } catch (err) {
    console.error('绘制路径出错:', err)
    error.value = '路径显示失败，请刷新页面重试'
  }
}

// 格式化距离
const formatDistance = (meters) => {
  const m = parseInt(meters)
  if (m < 1000) {
    return `${m}米`
  } else {
    return `${(m / 1000).toFixed(2)}公里`
  }
}

// 格式化时间
const formatDuration = (seconds) => {
  // 将步行时间除以3来模拟骑行时间
  const s = parseInt(seconds) / 3
  if (s < 60) {
    return `${Math.round(s)}秒`
  } else if (s < 3600) {
    return `${Math.floor(s / 60)}分钟${s % 60 > 0 ? Math.round(s % 60) + '秒' : ''}`
  } else {
    const hours = Math.floor(s / 3600)
    const minutes = Math.floor((s % 3600) / 60)
    return `${hours}小时${minutes > 0 ? minutes + '分钟' : ''}`
  }
}

// 停车位查找相关变量
const showParkingFinder = ref(false)
const parkingResults = ref([])

// 处理停车位查找结果
const handleParkingFound = (results) => {
  parkingResults.value = results
  console.log('找到停车位:', results)
}

// 关闭停车查找面板
const closeParkingFinder = () => {
  showParkingFinder.value = false
}

// 清空所有选择
const clearAll = () => {
  clearCesiumEntities()
  clearModel()
  startPoint.value = null
  endPoint.value = null
  routePath.value = null
  distanceInfo.value = null
  durationInfo.value = null
  searchKeyword.value = ''
  searchResults.value = []
  showResults.value = false
  error.value = null
  showParkingFinder.value = false
  parkingResults.value = []
}

// 交换起点和终点
const swapPoints = () => {
  if (startPoint.value && endPoint.value) {
    const temp = startPoint.value
    startPoint.value = endPoint.value
    endPoint.value = temp
    
    // 重新计算路径前检查viewer是否已初始化
    if (viewer.value) {
      // 重新计算路径
      nextTick(() => {
        calculateRoute()
      })
    } else {
      error.value = '地图未准备好，请稍后再试'
    }
  }
}

// 直接选择POI点作为起点或终点
const selectPOI = (poi, type = null) => {
  // 如果指定了类型，则设置搜索类型
  if (type) {
    searchType.value = type
  }
  
  // 调用选择搜索结果方法
  selectSearchResult(poi)
}

// 组件销毁前清理
onBeforeUnmount(() => {
  clearCesiumEntities()
  clearModel()
  if (searchDebounceTimeout.value) {
    clearTimeout(searchDebounceTimeout.value)
  }
})

// 计算两点间地表距离
function calcDistance(p1, p2) {
  const c1 = Cesium.Cartographic.fromDegrees(p1[0], p1[1])
  const c2 = Cesium.Cartographic.fromDegrees(p2[0], p2[1])
  const geodesic = new Cesium.EllipsoidGeodesic()
  geodesic.setEndPoints(c1, c2)
  return geodesic.surfaceDistance
}

// 计算路径总长
function calcTotalDistance(path) {
  let d = 0
  for (let i = 1; i < path.length; i++) d += calcDistance(path[i-1], path[i])
  return d
}

// 计算当前heading
function calcHeading(p1, p2) {
  const c1 = Cesium.Cartographic.fromDegrees(p1[0], p1[1])
  const c2 = Cesium.Cartographic.fromDegrees(p2[0], p2[1])
  const geodesic = new Cesium.EllipsoidGeodesic()
  geodesic.setEndPoints(c1, c2)
  return geodesic.startHeading
}

// 动画主循环
function animateModel() {
  if (!routePath.value || routePath.value.length < 2 || !modelEntity.value) return
  if (modelPaused.value) return
  const path = routePath.value
  const total = calcTotalDistance(path)
  let remain = modelProgress.value * total
  let segIdx = 0
  while (segIdx < path.length - 1) {
    const segLen = calcDistance(path[segIdx], path[segIdx+1])
    if (remain < segLen) break
    remain -= segLen
    segIdx++
  }
  if (segIdx >= path.length - 1) {
    // 到达终点
    modelAnimating.value = false
    modelProgress.value = 1
    return
  }
  // 插值
  const p1 = path[segIdx], p2 = path[segIdx+1]
  const segLen = calcDistance(p1, p2)
  const t = segLen === 0 ? 0 : remain / segLen
  const lng = p1[0] + (p2[0] - p1[0]) * t
  const lat = p1[1] + (p2[1] - p1[1]) * t
  const pos = Cesium.Cartesian3.fromDegrees(lng, lat, 15) // 修改高度为20米
  modelEntity.value.position = pos
  // 朝向
  const heading = calcHeading(p1, p2)
  modelEntity.value.orientation = Cesium.Transforms.headingPitchRollQuaternion(
    pos, new Cesium.HeadingPitchRoll(heading, 0, 0)
  )
  
  // 相机跟随 - 根据视角模式决定相机位置
  if (viewer.value.trackedEntity !== modelEntity.value || isFirstPerson.value) {
    // 如果是第一人称视角，手动设置相机位置和朝向
    if (isFirstPerson.value) {
      const bikePosition = modelEntity.value.position.getValue(Cesium.JulianDate.now())
      const bikeOrientation = modelEntity.value.orientation.getValue(Cesium.JulianDate.now())
      
      if (bikePosition && bikeOrientation) {
        // 从四元数获取自行车的方向矩阵
        const transform = Cesium.Matrix4.fromTranslationQuaternionRotationScale(
          bikePosition,
          bikeOrientation,
          new Cesium.Cartesian3(1.0, 1.0, 1.0)
        )
        
        // 获取自行车的前进方向（X轴）
        const forwardDirection = Cesium.Matrix4.getColumn(transform, 0, new Cesium.Cartesian3())
        // 获取自行车的上方向（Z轴）
        const upDirection = Cesium.Matrix4.getColumn(transform, 2, new Cesium.Cartesian3())
        // 计算右方向（Y轴）- 叉乘得到
        const rightDirection = Cesium.Cartesian3.cross(forwardDirection, upDirection, new Cesium.Cartesian3())
        const leftDirection = Cesium.Cartesian3.negate(rightDirection, new Cesium.Cartesian3())
        // 归一化所有方向向量
        Cesium.Cartesian3.normalize(forwardDirection, forwardDirection)
        Cesium.Cartesian3.normalize(upDirection, upDirection)
        Cesium.Cartesian3.normalize(rightDirection, rightDirection)
        
        // 计算相机位置 - 在自行车位置基础上进行偏移
        const cameraPosition = Cesium.Cartesian3.clone(bikePosition)
        
        // 应用Z轴偏移（上方）
        const upOffset = Cesium.Cartesian3.multiplyByScalar(upDirection, cameraOffset.value.z, new Cesium.Cartesian3())
        Cesium.Cartesian3.add(cameraPosition, upOffset, cameraPosition)
        
        // 设置相机 - 将direction设为rightDirection实现90度顺时针旋转
        viewer.value.scene.camera.setView({
          destination: cameraPosition,
          orientation: {
            direction: leftDirection, // 使用右方向作为视线方向，实现90度顺时针旋转
            up: upDirection // 保持上方向不变
          }
        })
      }
    } else {
      // 第三人称视角，使用默认的跟随模式
      viewer.value.trackedEntity = modelEntity.value
    }
  }

  // 下一帧
  animationFrameId = requestAnimationFrame(() => {
    if (!modelAnimating.value) return
    // 速度换算: 路径进度 = (速度*dt)/总长
    modelProgress.value += (modelSpeed.value / total) * (1/60) // 约60fps
    if (modelProgress.value >= 1) {
      modelProgress.value = 1
      modelAnimating.value = false
      return
    }
    animateModel()
  })
}

// 切换视角模式
function toggleViewMode() {
  isFirstPerson.value = !isFirstPerson.value
  
  if (!isFirstPerson.value && modelEntity.value) {
    // 切换回第三人称视角
    viewer.value.trackedEntity = modelEntity.value
  }
}

// 启动模型动画
function startModelAnimation() {
  if (!routePath.value || routePath.value.length < 2) return
  // 清理旧模型
  if (modelEntity.value && viewer.value) {
    viewer.value.entities.remove(modelEntity.value)
    viewer.value.trackedEntity = undefined
  }
  // 起点
  const start = routePath.value[0]
  // 加载本地glb模型（假设模型放在public/models/bike.glb）
  modelEntity.value = viewer.value.entities.add({
    name: 'bike-model',
    position: Cesium.Cartesian3.fromDegrees(start[0], start[1], 20), // 修改高度为20米
    model: {
      uri: 'src/assets/bike.glb', // 本地glb模型路径，注意路径以public为根
      scale: 0.8,
      minimumPixelSize: 64
    },
    orientation: Cesium.Transforms.headingPitchRollQuaternion(
      Cesium.Cartesian3.fromDegrees(start[0], start[1], 17), // 修改高度为20米
      new Cesium.HeadingPitchRoll(calcHeading(start, routePath.value[1]), 0, 0)
    )
  })
  modelProgress.value = 0
  modelAnimating.value = true
  modelPaused.value = false
  animateModel()
}

// 暂停/继续
function toggleModelPause() {
  if (!modelAnimating.value && modelProgress.value < 1) {
    modelAnimating.value = true
    modelPaused.value = false
    animateModel()
  } else {
    modelPaused.value = !modelPaused.value
    if (!modelPaused.value) animateModel()
  }
}

// 清除模型
function clearModel() {
  if (modelEntity.value && viewer.value) {
    viewer.value.entities.remove(modelEntity.value)
    viewer.value.trackedEntity = undefined
    modelEntity.value = null
  }
  modelAnimating.value = false
  modelPaused.value = false
  modelProgress.value = 0
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
}
</script>

<template>
  <div class="bike-navigation">
    <h4>单车校园导航</h4>
    
    <div v-if="loading && !startPoint && !endPoint" class="loading-container">
      <div class="loading-spinner"></div>
      <p>正在加载导航服务...</p>
    </div>
    
    <div v-else-if="error && !startPoint && !endPoint" class="error-container">
      <p>{{ error }}</p>
      <button class="primary-btn" @click="loadAMapAPI">重试</button>
    </div>
    
    <div v-else class="navigation-container">
      <!-- 停车位查找组件 -->
      <ParkingFinder
        :end-point="endPoint"
        :viewer="viewer"
        :visible="showParkingFinder"
        @parking-found="handleParkingFound"
        @close="closeParkingFinder"
      />
      
      <!-- 路线搜索表单 -->
      <div class="search-form">
        <div class="location-field">
          <div class="location-label" 
               :class="{ active: searchType === 'start' }"
               @click="setSearchType('start')">
            <div class="icon">🚩</div>
            <span>起点：</span>
          </div>
          
          <div class="location-content" @click="setSearchType('start')">
            <template v-if="startPoint">
              {{ startPoint.name }}
              <span class="clear-btn" @click.stop="startPoint = null">&times;</span>
            </template>
            <span v-else class="placeholder">选择起点</span>
          </div>
        </div>
        
        <button class="swap-btn" @click="swapPoints" 
                :disabled="!startPoint || !endPoint">⇅</button>
        
        <div class="location-field">
          <div class="location-label"
               :class="{ active: searchType === 'end' }"
               @click="setSearchType('end')">
            <div class="icon">📍</div>
            <span>终点：</span>
          </div>
          
          <div class="location-content" @click="setSearchType('end')">
            <template v-if="endPoint">
              {{ endPoint.name }}
              <span class="clear-btn" @click.stop="endPoint = null">&times;</span>
            </template>
            <span v-else class="placeholder">选择终点</span>
          </div>
        </div>
      </div>
      
      <!-- 搜索框 -->
      <div class="search-box">
        <input 
          type="text" 
          v-model="searchKeyword" 
          :placeholder="`搜索${searchType === 'start' ? '起点' : '终点'}位置...`"
        >
        <button class="search-btn" @click="searchPOI">
          <span v-if="!loading">🔍</span>
          <span v-else class="mini-spinner"></span>
        </button>
      </div>
      
      <!-- 搜索结果列表 -->
      <div v-if="showResults && searchResults.length > 0" class="search-results">
        <div 
          v-for="(poi, index) in searchResults" 
          :key="index" 
          class="result-item"
          @click="selectSearchResult(poi)"
        >
          <div class="result-title">{{ poi.name }}</div>
          <div class="result-address">{{ poi.address || '中国地质大学(武汉)未来城校区' }}</div>
        </div>
      </div>
      
      <div v-if="showResults && searchResults.length === 0 && !loading" class="no-results">
        未找到校内相关地点，请尝试其他关键词
      </div>
      
      <!-- 路线信息 -->
      <div v-if="routePath && distanceInfo && durationInfo" class="route-info">
        <div class="route-summary">
          <div class="summary-title">路线信息</div>
          <div class="summary-content">
            <div class="summary-item">
              <span class="item-label">距离:</span>
              <span class="item-value">{{ distanceInfo }}</span>
            </div>
            <div class="summary-item">
              <span class="item-label">预计骑行时间:</span>
              <span class="item-value">{{ durationInfo }}</span>
            </div>
            <!-- 添加停车信息显示 -->
            <div class="summary-item" v-if="parkingResults.length > 0">
              <span class="item-label">最近停车位:</span>
              <span class="item-value">{{ parkingResults[0].distance }}</span>
            </div>
          </div>
        </div>
        
        <div class="route-actions">
          <button class="action-btn clear-btn" @click="clearAll">
            重新选择
          </button>
          <button class="action-btn" 
            :disabled="modelAnimating || !routePath || routePath.length<2"
            @click="startModelAnimation">
            <span v-if="!modelAnimating && modelProgress<1">模拟骑行</span>
            <span v-else-if="modelAnimating && !modelPaused">骑行中...</span>
            <span v-else-if="modelPaused">继续</span>
          </button>
          <button v-if="!showParkingFinder" class="action-btn" @click="showParkingFinder = true">
            寻找停车位
          </button>
          <button v-if="modelAnimating || modelPaused" class="action-btn" @click="toggleViewMode">
            {{ isFirstPerson ? '第三人称' : '第一人称' }}
          </button>
          <button v-if="modelAnimating || modelPaused" class="action-btn" @click="toggleModelPause">
            {{ modelPaused ? '继续' : '暂停' }}
          </button>
        </div>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="error-tip">
        {{ error }}
      </div>
      
      <!-- 快速选择校内地点 - 增强的UI和功能 -->
      <div v-if="(!startPoint || !endPoint) && !showResults" class="quick-select">
        <div class="quick-select-title">校内热门地点:</div>
        
        <div class="quick-select-nav">
          <button 
            @click="setSearchType('start')" 
            :class="['quick-tab', {'active': searchType === 'start'}]"
          >
            选为起点
          </button>
          <button 
            @click="setSearchType('end')" 
            :class="['quick-tab', {'active': searchType === 'end'}]"
          >
            选为终点
          </button>
        </div>
        
        <div class="quick-select-category">教学区</div>
        <div class="quick-select-items">
          <span 
            v-for="(poi, index) in CAMPUS_POIS.filter(p => p.address.includes('教学'))" 
            :key="`edu-${index}`"
            class="quick-select-item"
            @click="selectPOI(poi)"
          >
            {{ poi.name }}
          </span>
        </div>
        
        <div class="quick-select-category">生活区</div>
        <div class="quick-select-items">
          <span 
            v-for="(poi, index) in CAMPUS_POIS.filter(p => p.address.includes('宿舍') || p.address.includes('食堂') || p.address.includes('服务') || p.address.includes('超市'))" 
            :key="`life-${index}`"
            class="quick-select-item"
            @click="selectPOI(poi)"
          >
            {{ poi.name }}
          </span>
        </div>
        
        <div class="quick-select-category">其他区域</div>
        <div class="quick-select-items">
          <span 
            v-for="(poi, index) in CAMPUS_POIS.filter(p => p.address.includes('体育') || p.address.includes('门') || p.address.includes('图书馆') || p.address.includes('行政'))" 
            :key="`other-${index}`"
            class="quick-select-item small"
            @click="selectPOI(poi)"
          >
            {{ poi.name }}
          </span>
        </div>
      </div>
      
      <!-- POI双栏选择器 (同时选择起点和终点) -->
      <div v-if="!routePath && !showResults" class="dual-selector">
        <div class="dual-selector-header">
          <h5>快速规划路线</h5>
          <p>直接选择起点和终点</p>
        </div>
        
        <div class="dual-selector-columns">
          <div class="dual-column">
            <div class="dual-column-header">
              <div class="icon">🚩</div>
              <span>选择起点</span>
            </div>
            <div class="dual-column-content">
              <div 
                v-for="(poi, index) in CAMPUS_POIS.slice(0, 7)" 
                :key="`start-${index}`"
                class="dual-item"
                @click="selectPOI(poi, 'start')"
              >
                {{ poi.name }}
              </div>
            </div>
          </div>
          
          <div class="dual-column">
            <div class="dual-column-header">
              <div class="icon">📍</div>
              <span>选择终点</span>
            </div>
            <div class="dual-column-content">
              <div 
                v-for="(poi, index) in CAMPUS_POIS.slice(0, 7)" 
                :key="`end-${index}`"
                class="dual-item"
                @click="selectPOI(poi, 'end')"
              >
                {{ poi.name }}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 帮助提示 -->
      <div v-if="!startPoint || !endPoint" class="help-tip">
        <p>提示: 输入关键词可实时搜索校内地点</p>
        <p class="buildings-tip">点击地点可直接添加为{{ searchType === 'start' ? '起点' : '终点' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bike-navigation {
  color: var(--cl-text);
  height: 100%;
  display: flex;
  flex-direction: column;
}

h4 {
  margin: 0 0 15px 0;
  color: var(--cl-primary);
}

.loading-container, .error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
}

.loading-spinner {
  width: 30px;
  height: 30px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: var(--cl-primary);
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 15px;
}

.mini-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: var(--cl-text);
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.navigation-container {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.search-form {
  background-color: rgba(37, 61, 98, 0.5);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 15px;
  position: relative;
}

.location-field {
  display: flex;
  margin-bottom: 10px;
  padding: 8px;
  background-color: rgba(50, 75, 112, 0.5);
  border-radius: 6px;
  border-left: 3px solid var(--cl-secondary);
  cursor: pointer;
}

.location-field:last-child {
  margin-bottom: 0;
}

.location-label {
  display: flex;
  align-items: center;
  min-width: 60px;
  font-weight: 500;
}

.location-label.active {
  color: var(--cl-primary);
}

.icon {
  margin-right: 5px;
  font-size: 18px;
}

.location-content {
  flex: 1;
  padding-left: 5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.clear-btn {
  margin-left: 5px;
  width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.2);
  cursor: pointer;
  font-size: 14px;
}

.clear-btn:hover {
  background-color: rgba(255, 255, 255, 0.3);
}

.placeholder {
  opacity: 0.6;
}

.swap-btn {
  position: absolute;
  right: 15px;
  top: 50%;
  transform: translateY(-50%);
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background-color: var(--cl-secondary);
  border: none;
  color: var(--cl-text);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.swap-btn:hover {
  background-color: var(--cl-primary);
}

.swap-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-box {
  display: flex;
  margin-bottom: 15px;
}

.search-box input {
  flex: 1;
  background-color: rgba(50, 75, 112, 0.5);
  border: 1px solid var(--cl-border);
  border-radius: 4px 0 0 4px;
  color: var(--cl-text);
  padding: 8px 12px;
  font-size: 14px;
}

.search-box input:focus {
  outline: none;
  border-color: var(--cl-primary);
}

.search-btn {
  width: 40px;
  background-color: var(--cl-primary);
  border: none;
  border-radius: 0 4px 4px 0;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-btn:hover {
  background-color: var(--cl-hover);
}

.search-results {
  background-color: rgba(37, 61, 98, 0.9);
  border-radius: 8px;
  max-height: 250px;
  overflow-y: auto;
  margin-bottom: 15px;
  border: 1px solid var(--cl-border);
}

.result-item {
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
}

.result-item:hover {
  background-color: rgba(50, 75, 112, 0.7);
}

.result-item:last-child {
  border-bottom: none;
}

.result-title {
  font-weight: 500;
  margin-bottom: 3px;
}

.result-address {
  font-size: 12px;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.no-results {
  text-align: center;
  padding: 10px;
  color: #ff6b6b;
  font-size: 14px;
  background-color: rgba(37, 61, 98, 0.5);
  border-radius: 4px;
  margin-bottom: 15px;
}

.route-info {
  background-color: rgba(37, 61, 98, 0.5);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 15px;
}

.route-summary {
  margin-bottom: 10px;
}

.summary-title {
  font-weight: bold;
  margin-bottom: 8px;
  color: var(--cl-secondary);
}

.summary-item {
  margin-bottom: 5px;
  display: flex;
  justify-content: space-between;
}

.item-value {
  font-weight: 500;
  color: var(--cl-primary);
}

.route-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.action-btn {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-btn {
  background-color: rgba(255, 255, 255, 0.2);
  color: var(--cl-text);
}

.clear-btn:hover {
  background-color: rgba(255, 255, 255, 0.3);
}

.error-tip {
  background-color: rgba(232, 55, 55, 0.2);
  border-left: 3px solid #e83737;
  padding: 10px;
  margin-bottom: 15px;
  border-radius: 4px;
  font-size: 14px;
}

.quick-select {
  background-color: rgba(37, 61, 98, 0.5);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 15px;
  max-height: 300px;
  overflow-y: auto;
}

.quick-select-title {
  font-weight: 500;
  margin-bottom: 10px;
  font-size: 14px;
  color: var(--cl-secondary);
}

.quick-select-nav {
  display: flex;
  margin-bottom: 10px;
}

.quick-tab {
  flex: 1;
  padding: 6px 0;
  background-color: rgba(50, 75, 112, 0.4);
  border: none;
  color: var(--cl-text);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.quick-tab:first-child {
  border-radius: 4px 0 0 4px;
}

.quick-tab:last-child {
  border-radius: 0 4px 4px 0;
}

.quick-tab.active {
  background-color: var(--cl-primary);
  color: white;
}

.quick-select-category {
  font-weight: 500;
  margin-top: 8px;
  margin-bottom: 5px;
  font-size: 12px;
  color: var(--cl-primary);
  border-left: 3px solid var(--cl-secondary);
  padding-left: 5px;
}

.quick-select-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.quick-select-item {
  background-color: rgba(50, 75, 112, 0.6);
  border-radius: 16px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.quick-select-item.small {
  font-size: 11px;
}

.quick-select-item:hover {
  background-color: var(--cl-primary);
}

.dual-selector {
  background-color: rgba(37, 61, 98, 0.5);
  border-radius: 8px;
  padding: 10px;
  margin: 15px 0;
}

.dual-selector-header {
  text-align: center;
  margin-bottom: 10px;
}

.dual-selector-header h5 {
  margin: 0 0 5px 0;
  color: var(--cl-secondary);
}

.dual-selector-header p {
  margin: 0;
  font-size: 12px;
  opacity: 0.8;
}

.dual-selector-columns {
  display: flex;
  gap: 8px;
}

.dual-column {
  flex: 1;
  border-radius: 6px;
  overflow: hidden;
  background-color: rgba(50, 75, 112, 0.3);
}

.dual-column-header {
  padding: 8px;
  background-color: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  font-weight: 500;
  font-size: 13px;
}

.dual-column-header .icon {
  margin-right: 5px;
}

.dual-column-content {
  max-height: 180px;
  overflow-y: auto;
}

.dual-item {
  padding: 8px;
  font-size: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
}

.dual-item:hover {
  background-color: rgba(var(--cl-primary-rgb), 0.3);
}

.dual-item:last-child {
  border-bottom: none;
}

/* 自定义滚动条 */
::-webkit-scrollbar {
  width: 5px;
}

::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}
</style>
