<template>
  <div class="violation-management">
    <!-- 控制面板 -->
    <div class="control-panel">
      <div class="service-status">
        <div class="status-indicator" :class="{ active: serviceStatus.isRunning }">
          {{ serviceStatus.isRunning ? '检测中' : '已停止' }}
        </div>
        <button 
          @click="toggleService" 
          :class="['btn', serviceStatus.isRunning ? 'btn-danger' : 'btn-primary']"
        >
          {{ serviceStatus.isRunning ? '停止检测' : '开始检测' }}
        </button>

         <button @click="saveViolationsToServer" class="btn btn-secondary">
          💾 保存数据
        </button>
     
        
        <!-- 新增可视化控制按钮 -->
        <button @click="toggleVisualization" class="btn btn-info">
          🗺️ {{ showViolationsOnMap ? '隐藏地图' : '显示地图' }}
        </button>
        
        <button @click="clearAllVisualization" class="btn btn-warning">
          🧹 清除所有显示
        </button>
      </div>
    </div>

    <!-- 统计概览 -->
    <div class="statistics-overview">
      <div class="stat-card">
        <div class="stat-number">{{ dashboardData.summary.totalViolations }}</div>
        <div class="stat-label">总违规数</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{{ dashboardData.summary.pendingViolations }}</div>
        <div class="stat-label">待处理</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{{ dashboardData.summary.resolvedViolations }}</div>
        <div class="stat-label">已处理</div>
      </div>
    </div>

    <!-- 实时通知 -->
    <div class="notifications-section">
      <h4>实时通知</h4>
      <div class="notifications-list">
        <div v-for="notification in recentNotifications.slice(0, 5)" 
             :key="notification.id" 
             class="notification-item">
          <div class="notification-content">
            <span class="notification-type">{{ notification.type }}</span>
            <span class="notification-message">{{ notification.message }}</span>
          </div>
          <div class="notification-time">{{ formatTime(notification.timestamp) }}</div>
        </div>
        <div v-if="recentNotifications.length === 0" class="no-notifications">
          暂无通知
        </div>
      </div>
    </div>

    <!-- 违规列表 -->
    <div class="violations-section">
      <div class="section-header">
        <h4>违规记录</h4>
        <select v-model="violationFilter" @change="filterViolations">
          <option value="all">所有违规</option>
          <option value="pending">待处理</option>
          <option value="processing">处理中</option>
          <option value="resolved">已解决</option>
        </select>
      </div>
      
      <div class="violations-list">
        <div 
          v-for="violation in filteredViolations" 
          :key="violation.id"
          class="violation-item"
          :class="violation.status"
          @click="selectViolation(violation)"
        >
          <div class="violation-header">
            <span class="bike-id">{{ violation.bikeId }}</span>
            <span class="violation-type">{{ violation.type }}</span>
            <span class="status-badge" :class="violation.status">
              {{ getStatusText(violation.status) }}
            </span>
          </div>
          
          <div class="violation-details">
            <p><strong>位置:</strong> {{ violation.location }}</p>
            <p><strong>时间:</strong> {{ formatTime(violation.detectedTime) }}</p>
            <p><strong>距离停车区:</strong> {{ violation.distanceFromParkingArea }}m</p>
          </div>

          <div class="violation-actions" v-if="violation.status === 'pending'">
            <button @click.stop="handleViolation(violation.id, 'processing')" class="btn btn-sm btn-primary">
              开始处理
            </button>
            <button @click.stop="openResolveDialog(violation)" class="btn btn-sm btn-success">
              直接解决
            </button>
            <button @click.stop="locateViolationOnMap(violation)" class="btn btn-sm btn-info">
              📍 定位
            </button>
          </div>
          
          <div class="violation-actions" v-if="violation.status === 'processing'">
            <button @click.stop="openResolveDialog(violation)" class="btn btn-sm btn-success">
              标记解决
            </button>
            <button @click.stop="locateViolationOnMap(violation)" class="btn btn-sm btn-info">
              📍 定位
            </button>
          </div>

          <div v-if="violation.adminNotes" class="admin-notes">
            <strong>处理备注:</strong> {{ violation.adminNotes }}
          </div>
        </div>
        
        <div v-if="filteredViolations.length === 0" class="no-violations">
          暂无违规记录
        </div>
      </div>
    </div>

    <!-- 解决违规对话框 -->
    <div v-if="showResolveDialog" class="modal-overlay" @click="closeResolveDialog">
      <div class="modal-content" @click.stop>
        <h3>处理违规记录</h3>
        <div class="modal-body">
          <p><strong>单车ID:</strong> {{ currentViolation?.bikeId }}</p>
          <p><strong>违规类型:</strong> {{ currentViolation?.type }}</p>
          <div class="form-group">
            <label>处理备注:</label>
            <textarea 
              v-model="resolveNotes" 
              placeholder="请输入处理情况说明..."
              rows="3">
            </textarea>
          </div>
        </div>
        <div class="modal-actions">
          <button @click="confirmResolve" class="btn-confirm">确认解决</button>
          <button @click="closeResolveDialog" class="btn-cancel">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import ViolationManagerService from '@/cesiumUtils/ViolationManagerService.js'
import ViolationGeoJSONService from '@/cesiumUtils/ViolationGeoJSONService.js'
import * as Cesium from 'cesium'

// 响应式数据
const serviceStatus = ref({
  isRunning: false,
  lastCheckTime: null,
  totalBikes: 0,
  totalViolations: 0
})

const dashboardData = reactive({
  summary: {
    totalBikes: 0,
    parkedBikes: 0,
    ridingBikes: 0,
    totalViolations: 0,
    pendingViolations: 0,
    resolvedViolations: 0,
    unreadNotifications: 0
  },
  recentViolations: [],
  recentNotifications: []
})

const recentNotifications = ref([])
const violationFilter = ref('all')
const showResolveDialog = ref(false)
const currentViolation = ref(null)
const resolveNotes = ref('')
const showViolationsOnMap = ref(false)

// 服务实例
let violationManager = null
const violationGeoJSONService = new ViolationGeoJSONService()

// 地图可视化相关
const violationEntities = new Map()
const violationLabels = new Map()

// 计算属性
const filteredViolations = computed(() => {
  if (violationFilter.value === 'all') {
    return dashboardData.recentViolations
  }
  return dashboardData.recentViolations.filter(v => v.status === violationFilter.value)
})

// 获取 Cesium viewer 实例
const getCesiumViewer = () => {
  if (window.cesiumViewer) {
    return window.cesiumViewer
  }
  
  if (window.viewer) {
    return window.viewer
  }
  
  const cesiumContainer = document.getElementById('cesiumContainer')
  if (cesiumContainer && cesiumContainer._cesiumViewer) {
    return cesiumContainer._cesiumViewer
  }
  
  console.error('未找到 Cesium viewer 实例')
  return null
}

// 方法
const initializeService = async () => {
  try {
    // 加载违规数据
    await loadViolationsFromGeoJSON()
    
    // 创建违规管理服务实例
    violationManager = new ViolationManagerService()
    
    // 订阅通知
    violationManager.subscribeToNotifications((notification) => {
      recentNotifications.value.unshift(notification)
      console.log('收到新通知:', notification.message)
    })
    
    console.log('违规管理服务初始化完成')
    
  } catch (error) {
    console.error('初始化违规管理服务失败:', error)
    // 如果加载失败，使用模拟数据
    createMockService()
  }
}

// 新增加载GeoJSON违规数据的方法
const loadViolationsFromGeoJSON = async () => {
  try {
    const response = await fetch('/data/violations.geojson')
    if (!response.ok) {
      throw new Error('无法加载违规数据文件')
    }
    
    const geoJsonData = await response.json()
    
    // 转换GeoJSON数据为内部格式
    const violations = geoJsonData.features.map(feature => ({
      id: feature.properties.id,
      bikeId: feature.properties.bikeId,
      type: feature.properties.type,
      status: feature.properties.status,
      location: feature.properties.location,
      coordinates: feature.geometry.coordinates,
      detectedTime: feature.properties.detectedTime,
      distanceFromParkingArea: feature.properties.distanceFromParkingArea,
      nearestParkingArea: { name: feature.properties.nearestParkingArea },
      adminNotes: feature.properties.adminNotes,
      resolvedTime: feature.properties.resolvedTime,
      processedBy: feature.properties.processedBy
    }))
    
    // 更新数据
    dashboardData.recentViolations = violations
    
    // 生成相应的通知
    recentNotifications.value = violations
      .filter(v => v.status !== 'resolved')
      .map(v => ({
        id: `notify_${v.id}`,
        type: 'violation',
        message: `单车 ${v.bikeId} 在 ${v.nearestParkingArea.name} 发生${v.type}`,
        timestamp: v.detectedTime
      }))
    
    // 更新统计数据
    updateStatistics()
    
    console.log(`已加载 ${violations.length} 条违规记录`)
    
  } catch (error) {
    console.error('加载违规数据失败:', error)
    throw error
  }
}

// 新增保存违规数据到GeoJSON文件的方法
const saveViolationsToGeoJSON = async () => {
  try {
    // 转换为GeoJSON格式
    const geoJsonData = {
      type: "FeatureCollection",
      name: "违规车辆数据",
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
      features: dashboardData.recentViolations.map(violation => ({
        type: "Feature",
        properties: {
          id: violation.id,
          bikeId: violation.bikeId,
          type: violation.type,
          status: violation.status,
          location: violation.location,
          detectedTime: violation.detectedTime,
          distanceFromParkingArea: violation.distanceFromParkingArea,
          nearestParkingArea: violation.nearestParkingArea?.name || '',
          adminNotes: violation.adminNotes,
          resolvedTime: violation.resolvedTime,
          processedBy: violation.processedBy
        },
        geometry: {
          type: "Point",
          coordinates: violation.coordinates
        }
      }))
    }
    
    // 使用违规GeoJSON服务保存
    const success = await violationGeoJSONService.saveViolationsGeoJSON(geoJsonData.features)
    
    if (success) {
      console.log('违规数据已保存到GeoJSON文件')
      return true
    } else {
      console.error('保存违规数据失败')
      return false
    }
    
  } catch (error) {
    console.error('保存违规数据到GeoJSON时发生错误:', error)
    return false
  }
}

// 新增保存违规数据到服务器的方法
const saveViolationsToServer = async () => {
  try {
    console.log('=== 开始保存违规数据到服务器 ===')
    console.log('违规数据数量:', dashboardData.recentViolations.length)
    console.log('违规数据内容:', dashboardData.recentViolations)
    
    // 检查是否有数据
    if (!dashboardData.recentViolations || dashboardData.recentViolations.length === 0) {
      console.warn('没有违规数据需要保存')
      showNotification('没有违规数据需要保存', 'warning')
      return
    }
    
    // 确保服务实例存在
    if (!violationGeoJSONService) {
      console.error('ViolationGeoJSONService 未初始化')
      showNotification('服务未初始化', 'error')
      return
    }
    
    // 测试服务器连接
    console.log('测试服务器连接...')
    try {
      const testResponse = await fetch('http://localhost:10000/', {
        method: 'GET'
      })
      console.log('服务器连接测试:', testResponse.ok ? '成功' : '失败')
    } catch (testError) {
      console.error('服务器连接失败:', testError)
      showNotification('无法连接到服务器，请确认服务器是否运行在端口10000', 'error')
      return
    }
    
    // 直接传递违规数据数组
    console.log('调用violationGeoJSONService.saveViolationsGeoJSON...')
    const result = await violationGeoJSONService.saveViolationsGeoJSON(dashboardData.recentViolations)
    
    console.log('保存操作完成，结果:', result)
    
    if (result && result.success) {
      showNotification(`违规数据保存成功！共保存 ${result.featuresCount || dashboardData.recentViolations.length} 条记录`, 'success')
    } else {
      showNotification(`保存失败: ${result?.message || '未知错误'}`, 'error')
    }
    
  } catch (error) {
    console.error('保存违规数据失败:', error)
    showNotification(`保存数据时发生错误: ${error.message}`, 'error')
  }
}



// 方法
const toggleService = () => {
  if (!violationManager) {
    console.warn('违规管理服务未初始化')
    return
  }
  
  if (serviceStatus.value.isRunning) {
    violationManager.stop()
    serviceStatus.value.isRunning = false
    console.log('停止违规检测服务')
    
    // 停止时清除定时器
    if (window.dashboardUpdateInterval) {
      clearInterval(window.dashboardUpdateInterval)
      window.dashboardUpdateInterval = null
    }
  } else {
    violationManager.start()
    serviceStatus.value.isRunning = true
    console.log('开始违规检测服务')
    
    // 避免重复创建定时器
    if (!window.dashboardUpdateInterval) {
      // 定期更新面板数据（降低频率，避免闪烁）
      window.dashboardUpdateInterval = setInterval(() => {
        if (serviceStatus.value.isRunning) {
          updateDashboard()
        }
      }, 10000) // 改为10秒更新一次
    }
  }
  
  updateServiceStatus()
}

const updateServiceStatus = () => {
  if (violationManager) {
    const status = violationManager.getStatus()
    serviceStatus.value.lastCheckTime = status.lastCheckTime
    serviceStatus.value.totalBikes = status.totalBikes
    serviceStatus.value.totalViolations = status.totalViolations
  }
}

const updateDashboard = () => {
  if (!violationManager) return
  
  try {
    const data = violationManager.getAdminDashboard()
    
    // 只有数据真正变化时才更新
    const hasChanges = 
      dashboardData.summary.totalViolations !== data.summary.totalViolations ||
      dashboardData.summary.pendingViolations !== data.summary.pendingViolations ||
      dashboardData.summary.resolvedViolations !== data.summary.resolvedViolations
    
    if (hasChanges) {
      // 更新汇总数据
      Object.assign(dashboardData.summary, data.summary)
      
      // 合并新的违规记录，避免重复
      const existingIds = new Set(dashboardData.recentViolations.map(v => v.id))
      const newViolations = data.recentViolations.filter(v => !existingIds.has(v.id))
      
      if (newViolations.length > 0) {
        dashboardData.recentViolations.push(...newViolations)
        console.log(`新增 ${newViolations.length} 条违规记录`)
      }
      
      // 更新通知列表
      const existingNotificationIds = new Set(recentNotifications.value.map(n => n.id))
      const newNotifications = data.recentNotifications.filter(n => !existingNotificationIds.has(n.id))
      
      if (newNotifications.length > 0) {
        recentNotifications.value.unshift(...newNotifications)
        console.log(`新增 ${newNotifications.length} 条通知`)
      }
      
      console.log('仪表板数据已更新')
      
      // 如果地图显示开启，更新可视化（只添加新的）
      if (showViolationsOnMap.value) {
        newViolations.forEach(violation => {
          if (violation.status === 'pending' || violation.status === 'processing') {
            addViolationToMap(violation)
          }
        })
      }
    }
    
  } catch (error) {
    console.error('更新面板数据失败:', error)
  }
}

const handleViolation = async (violationId, action, notes = '') => {
  console.log(`开始处理违规: ${violationId}, 动作: ${action}`)
  
  try {
    // 查找违规记录
    const violationIndex = dashboardData.recentViolations.findIndex(v => v.id === violationId)
    
    if (violationIndex === -1) {
      console.error(`未找到违规记录: ${violationId}`)
      showNotification('未找到违规记录', 'error')
      return false
    }

    // 更新违规状态
    const violation = dashboardData.recentViolations[violationIndex]
    const oldStatus = violation.status
    
    violation.status = action
    if (notes) {
      violation.adminNotes = notes
    }
    
    // 添加处理时间戳和处理人
    if (action === 'resolved') {
      violation.resolvedTime = new Date().toISOString()
      violation.processedBy = 'admin001'
    } else if (action === 'processing') {
      violation.processedBy = 'admin001'
    }
    
    console.log(`违规 ${violationId} 状态从 ${oldStatus} 更新为 ${action}`)
    
    // 立即保存到GeoJSON文件
    await saveViolationsToGeoJSON()
    
    // 如果是解决违规，从地图上移除
    if (action === 'resolved') {
      removeViolationFromMap(violationId)
    } else if (showViolationsOnMap.value) {
      // 更新地图上的显示（重新添加以更新颜色）
      removeViolationFromMap(violationId)
      setTimeout(() => {
        addViolationToMap(violation)
      }, 100)
    }
    
    // 更新统计数据
    updateStatistics()
    
    // 添加通知
    showNotification(`违规 ${violationId} 已${getStatusText(action)}`, 'success')
    
    return true
  } catch (error) {
    console.error('处理违规时发生错误:', error)
    showNotification('处理违规失败', 'error')
    return false
  }
}

// 新增统计更新方法
const updateStatistics = () => {
  const pending = dashboardData.recentViolations.filter(v => v.status === 'pending').length
  const processing = dashboardData.recentViolations.filter(v => v.status === 'processing').length
  const resolved = dashboardData.recentViolations.filter(v => v.status === 'resolved').length
  
  dashboardData.summary.pendingViolations = pending
  dashboardData.summary.resolvedViolations = resolved
  dashboardData.summary.totalViolations = pending + processing + resolved
}

// 修复确认解决方法
const confirmResolve = () => {
  if (currentViolation.value && resolveNotes.value.trim()) {
    const success = handleViolation(
      currentViolation.value.id, 
      'resolved', 
      resolveNotes.value.trim()
    )
    
    if (success) {
      closeResolveDialog()
      console.log(`违规 ${currentViolation.value.id} 已解决`)
      
      // 显示成功提示
      showNotification('违规处理成功', 'success')
    } else {
      showNotification('违规处理失败', 'error')
    }
  } else if (!resolveNotes.value.trim()) {
    showNotification('请输入处理备注', 'warning')
  }
}

// 添加通知提示方法
const showNotification = (message, type = 'info') => {
  const notification = {
    id: `notify_${Date.now()}`,
    type: type,
    message: message,
    timestamp: new Date().toISOString()
  }
  
  recentNotifications.value.unshift(notification)
  
  // 限制通知数量
  if (recentNotifications.value.length > 20) {
    recentNotifications.value = recentNotifications.value.slice(0, 20)
  }
}

const openResolveDialog = (violation) => {
  currentViolation.value = violation
  resolveNotes.value = ''
  showResolveDialog.value = true
}

const closeResolveDialog = () => {
  showResolveDialog.value = false
  currentViolation.value = null
  resolveNotes.value = ''
}

const selectViolation = (violation) => {
  console.log('选择违规:', violation)
  highlightViolationOnMap(violation.id)
}

const filterViolations = () => {
  console.log('过滤违规:', violationFilter.value)
}

// 地图可视化相关方法
const toggleVisualization = () => {
  console.log('切换可视化状态:', !showViolationsOnMap.value)
  
  showViolationsOnMap.value = !showViolationsOnMap.value
  
  if (showViolationsOnMap.value) {
    displayViolationsOnMap()
  } else {
    hideViolationsFromMap()
  }
}

const displayViolationsOnMap = () => {
  const viewer = getCesiumViewer()
  if (!viewer) {
    console.error('地图未初始化')
    showNotification('地图未初始化', 'error')
    return
  }

  console.log('在地图上显示违规车辆，总数:', dashboardData.recentViolations.length)
  
  // 只显示未解决的违规（pending和processing状态）
  const activeViolations = dashboardData.recentViolations
    .filter(v => v.status === 'pending' || v.status === 'processing')
  
  console.log('活跃违规数量:', activeViolations.length)
  
  // 清除已解决的违规点
  const resolvedViolations = dashboardData.recentViolations
    .filter(v => v.status === 'resolved')
  
  resolvedViolations.forEach(violation => {
    removeViolationFromMap(violation.id)
  })
  
  if (activeViolations.length === 0) {
    showNotification('没有待处理的违规记录', 'info')
    return
  }
  
  // 添加所有活跃违规点到地图
  activeViolations.forEach((violation, index) => {
    // 检查是否已存在
    if (!violationEntities.has(violation.id)) {
      // 添加延迟以确保所有实体都能正确添加
      setTimeout(() => {
        addViolationToMap(violation)
      }, index * 50)
    }
  })
  
  // 飞行到第一个违规位置（只在首次显示时）
  if (activeViolations.length > 0) {
    const firstViolation = activeViolations[0]
    if (firstViolation.coordinates) {
      const [lon, lat] = firstViolation.coordinates
      setTimeout(() => {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat, 800),
          duration: 3.0
        })
        console.log(`飞行到违规位置: ${lon}, ${lat}`)
      }, 1000)
    }
  }
  
  showNotification(`已显示 ${activeViolations.length} 个违规点`, 'success')
}

const hideViolationsFromMap = () => {
  const viewer = getCesiumViewer()
  if (!viewer) return

  console.log('隐藏地图上的违规显示')
  
  // 清除所有违规实体
  clearViolationEntities()
  
  showNotification('已隐藏地图显示', 'info')
}



// 改进 addViolationToMap 函数
const addViolationToMap = (violation) => {
  const viewer = getCesiumViewer()
  if (!viewer || !violation.coordinates) {
    console.warn('Viewer 或坐标信息缺失')
    return
  }

  try {
    const entityId = `violation_${violation.id}`
    
    // 检查实体是否已存在，如果存在则先移除
    const existingEntity = viewer.entities.getById(entityId)
    if (existingEntity) {
      viewer.entities.remove(existingEntity)
      violationEntities.delete(violation.id)
      console.log(`移除已存在的违规实体: ${entityId}`)
    }

    const [lon, lat, height = 10] = violation.coordinates
    
    // 验证坐标有效性
    if (isNaN(lon) || isNaN(lat)) {
      console.error('无效的坐标:', violation.coordinates)
      return
    }
    
    const position = Cesium.Cartesian3.fromDegrees(lon, lat, height)
    
    const color = violation.status === 'pending' ? 
      Cesium.Color.RED : 
      Cesium.Color.ORANGE

    const violationEntity = viewer.entities.add({
      id: entityId,
      name: `违规-${violation.bikeId}`,
      position: position,
      point: {
        pixelSize: 8,
        color: color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scaleByDistance: new Cesium.NearFarScalar(1.0e2, 1.5, 1.0e6, 0.5)
      },
      label: {
        text: `🚲 ${violation.bikeId}\n${violation.type}`,
        font: '12pt sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -40),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('rgba(0, 0, 0, 0.7)'),
        backgroundPadding: new Cesium.Cartesian2(8, 4)
      }
    })

    violationEntities.set(violation.id, violationEntity)
    console.log(`已添加违规点到地图: ${violation.bikeId} at ${lon}, ${lat}`)

  } catch (error) {
    console.error('添加违规点到地图失败:', error)
  }
}

const clearViolationEntities = () => {
  const viewer = getCesiumViewer()
  if (!viewer) return

  // 更安全的清除方式
  const entitiesToRemove = []
  violationEntities.forEach((entity, id) => {
    entitiesToRemove.push(entity)
  })
  
  entitiesToRemove.forEach(entity => {
    try {
      viewer.entities.remove(entity)
    } catch (error) {
      console.warn('移除实体时发生错误:', error)
    }
  })
  
  violationEntities.clear()
  violationLabels.clear()
  
  console.log('已清除所有违规实体')
}

const removeViolationFromMap = (violationId) => {
  const viewer = getCesiumViewer()
  if (!viewer) return

  const entity = violationEntities.get(violationId)
  if (entity) {
    viewer.entities.remove(entity)
    violationEntities.delete(violationId)
    console.log(`已从地图移除违规点: ${violationId}`)
  }
}

const highlightViolationOnMap = (violationId) => {
  const entity = violationEntities.get(violationId)
  if (entity) {
    const originalColor = entity.point.color
    entity.point.color = Cesium.Color.YELLOW
    
    setTimeout(() => {
      entity.point.color = originalColor
    }, 2000)
  }
}

const locateViolationOnMap = (violation) => {
  const viewer = getCesiumViewer()
  if (!viewer || !violation.coordinates) return

  try {
    const [lon, lat, height = 10] = violation.coordinates
    const position = Cesium.Cartesian3.fromDegrees(lon, lat, height + 200)
    
    viewer.camera.flyTo({
      destination: position,
      duration: 2.0
    })
    
    highlightViolationOnMap(violation.id)
    console.log(`定位到违规位置: ${violation.bikeId}`)
    
  } catch (error) {
    console.error('定位违规失败:', error)
  }
}

const clearAllVisualization = () => {
  hideViolationsFromMap()
  showViolationsOnMap.value = false
  console.log('已清除所有地图显示')
}

const updateVisualization = () => {
  if (showViolationsOnMap.value) {
    displayViolationsOnMap()
  }
}

// 工具方法
const formatTime = (timestamp) => {
  if (!timestamp) return '未知时间'
  try {
    return new Date(timestamp).toLocaleString('zh-CN')
  } catch {
    return '时间格式错误'
  }
}

const getStatusText = (status) => {
  const statusMap = {
    'pending': '待处理',
    'processing': '处理中',
    'resolved': '已解决'
  }
  return statusMap[status] || status
}

// 生命周期
onMounted(() => {
  console.log('BikeScan组件已挂载')
  initializeService()
})

onUnmounted(() => {
  if (violationManager) {
    violationManager.stop()
  }
  
  if (window.dashboardUpdateInterval) {
    clearInterval(window.dashboardUpdateInterval)
    window.dashboardUpdateInterval = null
  }
  
  clearViolationEntities()
})
</script>

<style scoped>
.violation-management {
  background: transparent;
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: #e8f4fd;
}

.control-panel {
  background: #1e3a5f;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid #2d4a73;
}

.service-status {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.status-indicator {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  background: #2d4a73;
  color: #b3d4fc;
  border: 1px solid #3d5a83;
}

.status-indicator.active {
  background: #52c41a;
  color: white;
}

.btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  color: white;
}

.btn-primary { background: #1890ff; }
.btn-danger { background: #ff4d4f; }
.btn-info { background: #17a2b8; }
.btn-warning { background: #ffc107; color: #333; }
.btn-success { background: #52c41a; }
.btn-secondary {
  background: #6c757d;
}

.btn-secondary:hover {
  background: #5a6268;
}

.btn:hover {
  opacity: 0.8;
  transform: translateY(-1px);
}

.statistics-overview {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  flex: 1;
  background: #1e3a5f;
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  border: 1px solid #2d4a73;
}

.stat-number {
  font-size: 24px;
  font-weight: bold;
  color: #4dabf7;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #93c5fd;
}

.notifications-section, .violations-section {
  background: #1e3a5f;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid #2d4a73;
}

.notifications-section h4, .violations-section h4 {
  margin: 0 0 12px 0;
  color: #4dabf7;
  font-size: 14px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-header select {
  padding: 4px 8px;
  border: 1px solid #3d5a83;
  border-radius: 4px;
  background: #264a73;
  color: #e8f4fd;
  font-size: 12px;
}

.violation-item {
  background: #264a73;
  border: 1px solid #3d5a83;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.violation-item:hover {
  background: #2d5080;
  border-color: #4dabf7;
}

.violation-item.pending {
  border-left: 4px solid #ff4d4f;
}

.violation-item.processing {
  border-left: 4px solid #ffc107;
}

.violation-item.resolved {
  border-left: 4px solid #52c41a;
  opacity: 0.7;
}

.violation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.bike-id {
  font-weight: bold;
  color: #4dabf7;
}

.violation-type {
  color: #93c5fd;
  font-size: 12px;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: bold;
}

.status-badge.pending {
  background: #ff4d4f;
  color: white;
}

.status-badge.processing {
  background: #ffc107;
  color: #333;
}

.status-badge.resolved {
  background: #52c41a;
  color: white;
}

.violation-details p {
  margin: 4px 0;
  font-size: 12px;
  color: #b3d4fc;
}

.violation-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 11px;
}

.admin-notes {
  margin-top: 8px;
  padding: 8px;
  background: #1e3a5f;
  border-radius: 4px;
  border-left: 3px solid #4dabf7;
  font-size: 11px;
  color: #b3d4fc;
}

.notification-item {
  background: #264a73;
  border: 1px solid #3d5a83;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 6px;
}

.notification-content {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.notification-type {
  font-weight: bold;
  color: #4dabf7;
  font-size: 11px;
}

.notification-message {
  color: #b3d4fc;
  font-size: 11px;
}

.notification-time {
  font-size: 10px;
  color: #93c5fd;
}

.no-notifications, .no-violations {
  text-align: center;
  color: #93c5fd;
  font-style: italic;
  padding: 20px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-content {
  background: #1e3a5f;
  border-radius: 8px;
  padding: 20px;
  max-width: 400px;
  width: 90%;
  border: 1px solid #2d4a73;
}

.modal-content h3 {
  margin: 0 0 15px 0;
  color: #4dabf7;
}

.modal-body p {
  margin: 8px 0;
  color: #b3d4fc;
}

.form-group {
  margin: 15px 0;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  color: #93c5fd;
  font-size: 14px;
}

.form-group textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #3d5a83;
  border-radius: 4px;
  background: #264a73;
  color: #e8f4fd;
  font-size: 12px;
  resize: vertical;
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}

.btn-confirm {
  background: #52c41a;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-cancel {
  background: #666;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-confirm:hover, .btn-cancel:hover {
  opacity: 0.8;
}
</style>