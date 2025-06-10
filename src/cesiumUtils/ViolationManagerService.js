import { point, booleanPointInPolygon } from '@turf/turf'

// 违规检测服务
class ViolationDetectionService {
  constructor() {
    this.parkingAreas = []
    this.violations = []
    this.loadParkingAreas()
  }

  // 加载停车区数据
  async loadParkingAreas() {
    try {
      const response = await fetch('/data/cug-station.geojson')
      const data = await response.json()
      this.parkingAreas = data.features
      console.log('已加载停车区数据:', this.parkingAreas.length, '个')
    } catch (error) {
      console.error('加载停车区数据失败:', error)
      // 使用默认数据
      this.parkingAreas = this.getDefaultParkingAreas()
    }
  }

  // 默认停车区数据（防止加载失败）
  getDefaultParkingAreas() {
    return [
      {
        properties: { 
          id: "parking-001", 
          name: "停车区 6", 
          isNoParking: false 
        },
        geometry: {
          type: "MultiPolygon",
          coordinates: [[
            [
              [114.609812479082279, 30.458899941881899],
              [114.609947680793425, 30.458845851452185],
              [114.609939855546216, 30.458827750352963],
              [114.609804681047223, 30.458886614967923],
              [114.609812479082279, 30.458899941881899]
            ]
          ]]
        }
      }
    ]
  }

  // 检查单车是否在合规停车区内
  isInParkingArea(bikeLocation) {
    const bikePoint = point([bikeLocation.longitude, bikeLocation.latitude])
    
    for (const area of this.parkingAreas) {
      // 检查停车区是否可用
      if (area.properties.isNoParking) {
        const now = new Date()
        const startTime = area.properties.noParkingStartTime ? new Date(area.properties.noParkingStartTime) : null
        const endTime = area.properties.noParkingEndTime ? new Date(area.properties.noParkingEndTime) : null
        
        // 如果在禁停时间内，跳过此区域
        if (startTime && endTime && now >= startTime && now <= endTime) {
          continue
        }
      }

      // 检查点是否在多边形内
      if (area.geometry.type === 'MultiPolygon') {
        for (const polygon of area.geometry.coordinates) {
          try {
            if (booleanPointInPolygon(bikePoint, { 
              type: 'Polygon', 
              coordinates: polygon 
            })) {
              return {
                isValid: true,
                parkingArea: area.properties
              }
            }
          } catch (error) {
            console.warn('几何检测错误:', error)
          }
        }
      }
    }
    
    return { isValid: false, parkingArea: null }
  }

  // 找到最近的合规停车区
  findNearestParkingArea(bikeLocation) {
    let nearestArea = null
    let minDistance = Infinity

    this.parkingAreas.forEach(area => {
      if (!area.properties.isNoParking) {
        const areaCenter = this.getPolygonCenter(area.geometry)
        const distance = this.calculateDistance(
          bikeLocation.longitude, bikeLocation.latitude,
          areaCenter.longitude, areaCenter.latitude
        )
        
        if (distance < minDistance) {
          minDistance = distance
          nearestArea = area.properties
        }
      }
    })

    return { area: nearestArea, distance: Math.round(minDistance) }
  }

  // 计算两点间距离（米）
  calculateDistance(lon1, lat1, lon2, lat2) {
    const R = 6371000 // 地球半径（米）
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  // 获取多边形中心点（简化计算）
  getPolygonCenter(geometry) {
    try {
      const coords = geometry.coordinates[0][0]
      const sumLng = coords.reduce((sum, coord) => sum + coord[0], 0)
      const sumLat = coords.reduce((sum, coord) => sum + coord[1], 0)
      
      return {
        longitude: sumLng / coords.length,
        latitude: sumLat / coords.length
      }
    } catch (error) {
      return { longitude: 114.610000, latitude: 30.459000 }
    }
  }

  // 检测违规停车
  detectViolations(bikes) {
    const newViolations = []

    bikes.forEach(bike => {
      if (bike.status === 'available') { // 修改为检测停放状态的单车
        const checkResult = this.isInParkingArea({
          longitude: bike.longitude,
          latitude: bike.latitude
        })
        
        if (!checkResult.isValid) {
          // 检查是否已有相同违规记录
          const existingViolation = this.violations.find(v => 
            v.bikeId === bike.id && v.status === 'pending'
          )

          if (!existingViolation) {
            const nearestArea = this.findNearestParkingArea({
              longitude: bike.longitude,
              latitude: bike.latitude
            })

            const violation = {
              id: `V${Date.now()}`,
              bikeId: bike.id,
              type: '违规停放在非指定区域',
              status: 'pending',
              location: `经度: ${bike.longitude.toFixed(6)}, 纬度: ${bike.latitude.toFixed(6)}`,
              coordinates: [bike.longitude, bike.latitude, 10],
              detectedTime: new Date().toISOString(),
              distanceFromParkingArea: nearestArea.distance,
              nearestParkingArea: { name: nearestArea.area?.name || '未知停车区' },
              severity: this.calculateSeverity(nearestArea.distance)
            }

            this.violations.push(violation)
            newViolations.push(violation)
          }
        }
      }
    })

    return newViolations
  }

  // 计算违规严重程度
  calculateSeverity(distance) {
    if (distance > 100) return 'high'
    if (distance > 50) return 'medium'
    return 'low'
  }

  // 获取所有违规记录
  getViolations(status = null) {
    if (status) {
      return this.violations.filter(v => v.status === status)
    }
    return this.violations
  }

  // 更新违规状态
  updateViolationStatus(violationId, status, adminNotes = '') {
    const violation = this.violations.find(v => v.id === violationId)
    if (violation) {
      violation.status = status
      violation.adminNotes = adminNotes
      violation.updatedTime = new Date().toISOString()
      return true
    }
    return false
  }
}

// 单车模拟服务
class BikeSimulationService {
  constructor() {
    this.bikes = []
    this.initializeBikes()
  }

  // 初始化模拟单车数据
  initializeBikes() {
    const bikeCount = 25
    
    for (let i = 1; i <= bikeCount; i++) {
      const location = this.generateRandomLocation()
      this.bikes.push({
        id: `CUG-BK-${String(i).padStart(3, '0')}`,
        longitude: location.longitude,
        latitude: location.latitude,
        status: Math.random() > 0.7 ? 'inUse' : 'available', // 70%概率可用
        userId: Math.random() > 0.5 ? `2024${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}` : null,
        parkingTime: this.generateRandomParkingTime(),
        batteryLevel: Math.floor(Math.random() * 100),
        lastUpdated: Date.now()
      })
    }
    
    console.log('已生成模拟单车数据:', this.bikes.length, '辆')
  }

  // 生成随机位置（在校园范围内）
  generateRandomLocation() {
    const baseLng = 114.610000
    const baseLat = 30.458500
    const range = 0.008 // 大约800米范围
    
    return {
      longitude: baseLng + (Math.random() - 0.5) * range,
      latitude: baseLat + (Math.random() - 0.5) * range
    }
  }

  // 生成随机停车时间
  generateRandomParkingTime() {
    const now = new Date()
    const hoursAgo = Math.random() * 48 // 0-48小时前
    return new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString()
  }

  // 模拟单车位置更新
  updateBikePositions() {
    this.bikes.forEach(bike => {
      // 随机移动一些单车
      if (Math.random() < 0.05) { // 5%概率移动
        const newLocation = this.generateRandomLocation()
        bike.longitude = newLocation.longitude
        bike.latitude = newLocation.latitude
        bike.lastUpdated = Date.now()
        
        // 随机改变状态
        if (Math.random() < 0.2) {
          bike.status = bike.status === 'available' ? 'inUse' : 'available'
          if (bike.status === 'available') {
            bike.parkingTime = new Date().toISOString()
          }
        }
      }
    })
  }

  // 获取所有单车数据
  getBikes() {
    return this.bikes
  }

  // 获取指定状态的单车
  getBikesByStatus(status) {
    return this.bikes.filter(bike => bike.status === status)
  }
}

// 管理员通知服务
class AdminNotificationService {
  constructor() {
    this.notifications = []
    this.adminSubscribers = []
  }

  // 订阅违规通知
  subscribe(callback) {
    this.adminSubscribers.push(callback)
  }

  // 发送违规通知
  notifyViolations(violations) {
    violations.forEach(violation => {
      const notification = {
        id: `N${Date.now()}`,
        type: 'violation',
        message: `单车 ${violation.bikeId} 违规停放在非指定区域`,
        violation: violation,
        timestamp: new Date().toISOString()
      }

      this.notifications.unshift(notification)
      
      // 通知所有订阅者
      this.adminSubscribers.forEach(callback => {
        try {
          callback(notification)
        } catch (error) {
          console.error('通知回调错误:', error)
        }
      })
    })
  }

  // 获取所有通知
  getNotifications() {
    return this.notifications
  }

  // 获取未读通知数量
  getUnreadCount() {
    return this.notifications.filter(n => !n.read).length
  }
}

// 主要管理服务
class ViolationManagerService {
  constructor() {
    this.detectionService = new ViolationDetectionService()
    this.simulationService = new BikeSimulationService()
    this.notificationService = new AdminNotificationService()
    
    this.isRunning = false
    this.checkInterval = null
    
    // 等待停车区数据加载
    setTimeout(() => {
      this.performInitialCheck()
    }, 2000)
  }

  // 执行初始检测
  performInitialCheck() {
    this.performCheck()
  }

  // 启动违规检测
  start() {
    if (this.isRunning) return
    
    this.isRunning = true
    console.log('违规停车检测服务已启动')
    
    // 立即检测一次
    this.performCheck()
    
    // 每20秒检测一次
    this.checkInterval = setInterval(() => {
      this.performCheck()
    }, 20000)
  }

  // 停止违规检测
  stop() {
    if (!this.isRunning) return
    
    this.isRunning = false
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    console.log('违规停车检测服务已停止')
  }

  // 执行检测
  performCheck() {
    try {
      // 更新单车位置（模拟）
      this.simulationService.updateBikePositions()
      
      // 获取所有单车数据
      const bikes = this.simulationService.getBikes()
      
      // 检测违规
      const newViolations = this.detectionService.detectViolations(bikes)
      
      // 发送通知
      if (newViolations.length > 0) {
        console.log('发现新违规:', newViolations.length, '起')
        this.notificationService.notifyViolations(newViolations)
      }
    } catch (error) {
      console.error('执行检测时出错:', error)
    }
  }

  // 获取管理员面板数据
  getAdminDashboard() {
    try {
      const violations = this.detectionService.getViolations()
      const bikes = this.simulationService.getBikes()
      const notifications = this.notificationService.getNotifications()
      
      return {
        summary: {
          totalBikes: bikes.length,
          parkedBikes: bikes.filter(b => b.status === 'available').length,
          ridingBikes: bikes.filter(b => b.status === 'inUse').length,
          totalViolations: violations.length,
          pendingViolations: violations.filter(v => v.status === 'pending').length,
          resolvedViolations: violations.filter(v => v.status === 'resolved').length,
          unreadNotifications: this.notificationService.getUnreadCount()
        },
        recentViolations: violations.slice(0, 20),
        recentNotifications: notifications.slice(0, 10)
      }
    } catch (error) {
      console.error('获取面板数据时出错:', error)
      return this.getDefaultDashboard()
    }
  }

  // 获取默认面板数据
  getDefaultDashboard() {
    return {
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
    }
  }

  // 处理违规
  handleViolation(violationId, action, notes = '') {
    try {
      const success = this.detectionService.updateViolationStatus(
        violationId, 
        action, 
        notes
      )
      
      if (success) {
        console.log(`违规 ${violationId} 已${action === 'resolved' ? '解决' : '处理'}`)
        return true
      }
      return false
    } catch (error) {
      console.error('处理违规时出错:', error)
      return false
    }
  }

  // 订阅通知
  subscribeToNotifications(callback) {
    this.notificationService.subscribe(callback)
  }

  // 获取服务状态
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastCheckTime: new Date().toISOString(),
      totalBikes: this.simulationService.getBikes().length,
      totalViolations: this.detectionService.getViolations().length
    }
  }
}

export default ViolationManagerService