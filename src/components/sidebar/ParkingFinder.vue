<script setup>
import { ref, watch, onMounted } from 'vue'
import * as Cesium from 'cesium'
import gcoord from 'gcoord'

// 定义props接收终点坐标和Cesium viewer实例
const props = defineProps({
  endPoint: {
    type: Object,
    default: null
  },
  viewer: {
    type: Object,
    default: null
  },
  visible: {
    type: Boolean,
    default: false
  }
})

// 定义emit事件用于向父组件通信
const emit = defineEmits(['parkingFound', 'close'])

// 状态变量
const loading = ref(false)
const error = ref(null)
const searchResults = ref([])
const parkingSpots = ref([])
const parkingEntrances = ref([])
const roadNetwork = ref(null)
const nearestParkingSpot = ref(null)
const nearestParkingEntrance = ref(null)
const parkingEntities = ref([])

// 定义距离阈值（米）
const DISTANCE_THRESHOLD = 300

// 加载停车区数据
const loadParkingData = async () => {
  loading.value = true
  error.value = null
  
  try {
    // 加载停车位数据
    const parkingSpotsResponse = await fetch('/src/assets/ships/车位new.geojson')
    const parkingSpotsData = await parkingSpotsResponse.json()
    
    // 加载车库点数据
    const parkingEntrancesResponse = await fetch('/src/assets/ships/车库点.geojson')
    const parkingEntrancesData = await parkingEntrancesResponse.json()
    
    // 加载道路网络数据
    const roadNetworkResponse = await fetch('/src/assets/ships/wlcroad.geojson')
    const roadNetworkData = await roadNetworkResponse.json()

    // 处理并存储数据
    parkingSpots.value = parkingSpotsData.features.map(feature => {
      // 确保geometry存在且是多边形
      if (!feature.geometry || !feature.geometry.coordinates || !feature.geometry.coordinates[0] || !feature.geometry.coordinates[0][0]) {
        console.warn('无效的停车位几何数据:', feature)
        return null
      }

      // 获取多边形的中心点
      const coordinates = feature.geometry.coordinates[0][0]
      const centerX = coordinates.reduce((sum, point) => sum + point[0], 0) / coordinates.length
      const centerY = coordinates.reduce((sum, point) => sum + point[1], 0) / coordinates.length
      
      // 转换坐标 - 我们假设原始数据已经是WGS84坐标系
      // 如果需要转换，我们可以使用gcoord库
      
      return {
        id: feature.properties.Id || `parking-spot-${Math.random().toString(36).substring(2, 9)}`,
        capacity: feature.properties.many || 0,
        coordinates: coordinates,
        center: { lng: centerX, lat: centerY },
        wgs84Center: { lng: centerX, lat: centerY },
        type: 'spot'
      }
    }).filter(spot => spot !== null) // 过滤掉无效的数据
    
    parkingEntrances.value = parkingEntrancesData.features.map(feature => {
      // 确保geometry和coordinates存在
      if (!feature.geometry || !feature.geometry.coordinates || feature.geometry.coordinates.length < 2) {
        console.warn('无效的停车入口几何数据:', feature)
        return null
      }

      const coords = feature.geometry.coordinates
      
      return {
        id: feature.properties.Number || `parking-entrance-${Math.random().toString(36).substring(2, 9)}`,
        name: feature.properties.Name || '未命名入口',
        remark: feature.properties.Remark || '',
        coordinates: { lng: coords[0], lat: coords[1] },
        wgs84Coordinates: { lng: coords[0], lat: coords[1] },
        type: 'entrance'
      }
    }).filter(entrance => entrance !== null) // 过滤掉无效的数据
    
    roadNetwork.value = roadNetworkData

    loading.value = false
    console.log('停车数据加载成功', parkingSpots.value.length, parkingEntrances.value.length)
  } catch (err) {
    console.error('加载停车数据失败:', err)
    error.value = '加载停车数据失败'
    loading.value = false
  }
}

// 安全地获取坐标值，确保返回数字类型
const safeCoordinate = (location, prop) => {
  if (!location) return null
  const value = location[prop]
  return typeof value === 'number' ? value : null
}

// 计算两点之间的欧几里得距离（米）- 修复版本
const calculateDistance = (point1, point2) => {
  if (!point1 || !point2) return Infinity
  
  // 确保经纬度都是有效的数字
  const lng1 = safeCoordinate(point1, 'lng')
  const lat1 = safeCoordinate(point1, 'lat')
  const lng2 = safeCoordinate(point2, 'lng')
  const lat2 = safeCoordinate(point2, 'lat')
  
  if (lng1 === null || lat1 === null || lng2 === null || lat2 === null) {
    console.warn('计算距离时发现无效坐标:', {point1, point2})
    return Infinity
  }
  
  try {
    // 使用Cesium计算地球表面距离
    const p1 = Cesium.Cartographic.fromDegrees(lng1, lat1)
    const p2 = Cesium.Cartographic.fromDegrees(lng2, lat2)
    const geodesic = new Cesium.EllipsoidGeodesic()
    geodesic.setEndPoints(p1, p2)
    
    return geodesic.surfaceDistance // 返回米为单位的距离
  } catch (error) {
    console.error('计算距离出错:', error, {point1, point2})
    return Infinity
  }
}

// 寻找最近的停车位和入口
const findNearestParking = () => {
  if (!props.endPoint) {
    error.value = '终点位置未定义'
    return
  }

  // 从endPoint中提取WGS84坐标
  let endLocation = null
  if (props.endPoint.wgsLocation) {
    if (Array.isArray(props.endPoint.wgsLocation)) {
      // 如果是数组格式 [lng, lat]
      endLocation = {
        lng: props.endPoint.wgsLocation[0],
        lat: props.endPoint.wgsLocation[1]
      }
    } else {
      // 如果已经是对象格式 {lng, lat}
      endLocation = props.endPoint.wgsLocation
    }
  }

  if (!endLocation || typeof endLocation.lng !== 'number' || typeof endLocation.lat !== 'number') {
    error.value = '终点坐标格式无效'
    console.error('终点坐标格式无效:', props.endPoint)
    return
  }
  
  loading.value = true
  error.value = null
  
  try {
    console.log('查找终点附近停车位:', endLocation)
    
    // 寻找最近的停车位
    let nearestSpot = null
    let minSpotDistance = Infinity
    
    parkingSpots.value.forEach(spot => {
      if (!spot.wgs84Center) {
        console.warn('停车位缺少坐标信息:', spot)
        return
      }
      
      const distance = calculateDistance(endLocation, spot.wgs84Center)
      if (distance < minSpotDistance && distance <= DISTANCE_THRESHOLD) {
        minSpotDistance = distance
        nearestSpot = { ...spot, distance }
      }
    })
    
    // 寻找最近的停车场入口
    let nearestEntrance = null
    let minEntranceDistance = Infinity
    
    parkingEntrances.value.forEach(entrance => {
      if (!entrance.wgs84Coordinates) {
        console.warn('停车入口缺少坐标信息:', entrance)
        return
      }
      
      const distance = calculateDistance(endLocation, entrance.wgs84Coordinates)
      if (distance < minEntranceDistance && distance <= DISTANCE_THRESHOLD) {
        minEntranceDistance = distance
        nearestEntrance = { ...entrance, distance }
      }
    })
    
    nearestParkingSpot.value = nearestSpot
    nearestParkingEntrance.value = nearestEntrance
    
    // 汇总搜索结果
    searchResults.value = []
    
    if (nearestSpot) {
      searchResults.value.push({
        id: nearestSpot.id,
        name: `停车位 (${nearestSpot.capacity || '未知'}个车位)`,
        distance: `${Math.round(nearestSpot.distance)}米`,
        type: 'spot',
        data: nearestSpot
      })
    }
    
    if (nearestEntrance) {
      searchResults.value.push({
        id: nearestEntrance.id,
        name: nearestEntrance.name,
        distance: `${Math.round(nearestEntrance.distance)}米`,
        type: 'entrance',
        data: nearestEntrance
      })
    }
    
    // 在地图上显示结果
    showParkingOnMap()
    
    loading.value = false
    
    if (searchResults.value.length === 0) {
      error.value = '在附近未找到可用停车位'
    } else {
      // 通知父组件已找到停车位
      emit('parkingFound', searchResults.value)
    }
    
  } catch (err) {
    console.error('查找停车位失败:', err)
    error.value = '查找停车位失败'
    loading.value = false
  }
}

// 在地图上显示停车位和入口
const showParkingOnMap = () => {
  if (!props.viewer) {
    console.warn('Cesium viewer未初始化')
    return
  }
  
  // 清除现有实体
  clearParkingEntities()

  // 绘制最近停车位
  if (nearestParkingSpot.value) {
    try {
      // 创建一个多边形实体表示停车位
      const positions = nearestParkingSpot.value.coordinates.map(coord => {
        // 确保坐标是有效数字
        if (!Array.isArray(coord) || coord.length < 2 || 
            typeof coord[0] !== 'number' || typeof coord[1] !== 'number') {
          console.warn('无效的坐标点:', coord)
          return null
        }
        return Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 5)
      }).filter(pos => pos !== null) // 过滤掉无效位置
      
      if (positions.length < 3) {
        console.warn('多边形点数不足:', positions.length)
        return
      }

      const polygonEntity = props.viewer.entities.add({
        name: `最近停车位`,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: new Cesium.ColorMaterialProperty(Cesium.Color.YELLOW.withAlpha(0.5)),
          outline: true,
          outlineColor: Cesium.Color.YELLOW,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        }
      })
      
      parkingEntities.value.push(polygonEntity)
      
      // 添加标签
      const centerPoint = Cesium.Cartesian3.fromDegrees(
        nearestParkingSpot.value.center.lng, 
        nearestParkingSpot.value.center.lat,
        10
      )
      
      const labelEntity = props.viewer.entities.add({
        position: centerPoint,
        label: {
          text: `停车位 (${nearestParkingSpot.value.capacity || '未知'}个车位)`,
          font: '14px sans-serif',
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          showBackground: true,
          backgroundColor: new Cesium.Color(0, 0, 0.5, 0.7)
        }
      })
      
      parkingEntities.value.push(labelEntity)
    } catch (error) {
      console.error('绘制停车位出错:', error)
    }
  }
  
  // 绘制最近停车场入口
  if (nearestParkingEntrance.value) {
    try {
      const lng = nearestParkingEntrance.value.coordinates.lng
      const lat = nearestParkingEntrance.value.coordinates.lat
      
      if (typeof lng !== 'number' || typeof lat !== 'number') {
        console.warn('无效的停车场入口坐标:', nearestParkingEntrance.value.coordinates)
        return
      }

      const position = Cesium.Cartesian3.fromDegrees(lng, lat, 10)
      
      // 检查是否已经有停车场图标，如果没有则创建一个默认标记
      const entranceEntity = props.viewer.entities.add({
        name: nearestParkingEntrance.value.name,
        position: position,
        billboard: {
          image: 'src\assets\blue12.png', // 如果找不到图标，将使用点标记替代
          width: 32,
          height: 32,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM
        },
        point: { // 作为图标的备用
          pixelSize: 15,
          color: Cesium.Color.BLUE,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        },
        label: {
          text: nearestParkingEntrance.value.name,
          font: '14px sans-serif',
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, -36),
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          showBackground: true,
          backgroundColor: new Cesium.Color(0, 0, 0.5, 0.7)
        }
      })
      
      parkingEntities.value.push(entranceEntity)
    } catch (error) {
      console.error('绘制停车场入口出错:', error)
    }
  }
  
  // 飞到显示所有停车实体的位置
  if (parkingEntities.value.length > 0) {
    props.viewer.flyTo(parkingEntities.value, {
      duration: 1.5,
      offset: new Cesium.HeadingPitchRange(
        0, 
        Cesium.Math.toRadians(-45), 
        200
      )
    })
  }
}

// 清除停车相关实体
const clearParkingEntities = () => {
  if (!props.viewer) return
  
  parkingEntities.value.forEach(entity => {
    if (props.viewer.entities.contains(entity)) {
      props.viewer.entities.remove(entity)
    }
  })
  
  parkingEntities.value = []
}

// 监视visible属性变化
watch(() => props.visible, (newValue) => {
  if (newValue) {
    // 如果组件变为可见，则加载数据
    if (parkingSpots.value.length === 0) {
      loadParkingData().then(() => {
        if (props.endPoint) {
          findNearestParking()
        }
      })
    } else if (props.endPoint) {
      findNearestParking()
    }
  } else {
    // 如果组件变为不可见，则清除地图实体
    clearParkingEntities()
  }
})

// 监视endPoint变化
watch(() => props.endPoint, (newValue) => {
  if (newValue && props.visible && parkingSpots.value.length > 0) {
    findNearestParking()
  }
})

// 组件初始化时加载数据
onMounted(() => {
  if (props.visible) {
    loadParkingData()
  }
})

// 组件卸载时清理
const closePanel = () => {
  clearParkingEntities()
  emit('close')
}
</script>

<template>
  <div class="parking-finder" v-if="visible">
    <div class="panel-header">
      <h4>寻找附近停车位</h4>
      <button class="close-btn" @click="closePanel">&times;</button>
    </div>
    
    <div v-if="loading" class="loading-container">
      <div class="loading-spinner"></div>
      <p>查找附近停车位...</p>
    </div>
    
    <div v-else-if="error" class="error-container">
      <p>{{ error }}</p>
      <button class="primary-btn" @click="findNearestParking">重试</button>
    </div>
    
    <div v-else class="parking-results">
      <div v-if="searchResults.length === 0" class="no-results">
        在终点 {{ endPoint?.name }} 附近没有找到停车位
      </div>
      
      <div v-else>
        <p class="result-title">在 {{ endPoint?.name }} 附近找到的停车位:</p>
        
        <div v-for="result in searchResults" :key="result.id" class="result-item">
          <div class="result-icon">
            <span v-if="result.type === 'spot'">🅿️</span>
            <span v-else>🚪</span>
          </div>
          <div class="result-content">
            <div class="result-name">{{ result.name }}</div>
            <div class="result-distance">距离终点: {{ result.distance }}</div>
          </div>
        </div>
        
        <div class="parking-actions">
          <button class="action-btn" @click="findNearestParking">重新查找</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.parking-finder {
  background-color: rgba(37, 61, 98, 0.7);
  border-radius: 8px;
  padding: 15px;
  color: var(--cl-text);
  max-width: 100%;
  margin-bottom: 15px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

h4 {
  margin: 0;
  color: var(--cl-primary);
}

.close-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: var(--cl-text);
  cursor: pointer;
  font-size: 16px;
  padding: 0;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
}

.loading-spinner {
  width: 30px;
  height: 30px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: var(--cl-primary);
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-container {
  padding: 10px;
  background-color: rgba(232, 55, 55, 0.2);
  border-left: 3px solid #e83737;
  border-radius: 4px;
  margin-bottom: 10px;
}

.no-results {
  text-align: center;
  padding: 15px 0;
  color: #ff9800;
}

.result-title {
  margin-bottom: 10px;
  font-weight: 500;
}

.result-item {
  background-color: rgba(50, 75, 112, 0.5);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
}

.result-icon {
  font-size: 24px;
  margin-right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-content {
  flex: 1;
}

.result-name {
  font-weight: 500;
  margin-bottom: 5px;
}

.result-distance {
  font-size: 12px;
  opacity: 0.8;
}

.parking-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.action-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  background-color: var(--cl-primary);
  color: white;
}

.action-btn:hover {
  background-color: var(--cl-hover);
}

.primary-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  background-color: var(--cl-primary);
  color: white;
  margin-top: 10px;
}
</style>
