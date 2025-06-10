import Cesium from '@/cesiumUtils/cesium'

// 禁停区管理类
export default class NoParkingManager {
  constructor(viewer) {
    this.viewer = viewer
    this.parkingAreas = [] // 存储所有停车区
    this.noParkingAreas = [] // 存储禁停区
    this.selectedEntity = null // 当前选中实体
    this.eventHandler = null // Cesium事件处理器
    this.heightOffset = 10.0 // 增加默认高度偏移
    this.timeCheckIntervalId = null // 定时检查禁停时间的interval ID
    this.dataSource = null // 存储数据源引用
    
    this.initEventHandler()
    this.startTimeCheck() // 启动时间检查
  }

  // 添加 destroy 方法
  destroy() {
    try {
      // 清理事件处理器
      if (this.eventHandler) {
        this.eventHandler.destroy()
        this.eventHandler = null
      }
      
      // 停止时间检查
      if (this.timeCheckIntervalId) {
        clearInterval(this.timeCheckIntervalId)
        this.timeCheckIntervalId = null
      }
      
      // 清除所有停车区数据
      this.clearParkingAreas()
      
      // 清空数组
      this.parkingAreas = []
      this.noParkingAreas = []
      this.selectedEntity = null
      
      console.log('NoParkingManager 已成功销毁')
    } catch (error) {
      console.error('销毁 NoParkingManager 时出错:', error)
    }
  }

  // 修复 startTimeCheck 方法
  startTimeCheck() {
    // 如果已经有一个检查正在运行，先停止它
    if (this.timeCheckIntervalId) {
      clearInterval(this.timeCheckIntervalId)
    }
    
    // 每分钟检查一次禁停区的时间状态
    this.timeCheckIntervalId = setInterval(() => {
      try {
        const now = new Date()
        
        // 检查所有禁停区
        this.noParkingAreas.forEach(entity => {
          if (!entity || !entity.properties) return
          
          // 获取开始和结束时间
          const startTimeStr = entity.properties?.noParkingStartTime?._value
          const endTimeStr = entity.properties?.noParkingEndTime?._value
          
          if (endTimeStr) {
            const endTime = new Date(endTimeStr)
            
            // 如果当前时间已超过结束时间，自动取消禁停状态
            if (now > endTime) {
              console.log(`禁停时间已到期，自动取消禁停区: ${entity.id}`)
              this.unsetNoParkingArea(entity)
            }
          }
          
          if (startTimeStr) {
            const startTime = new Date(startTimeStr)
            
            // 如果当前时间已达到开始时间但尚未到结束时间，确保显示为禁停状态
            if (now >= startTime && (!endTimeStr || now <= new Date(endTimeStr))) {
              // 确保显示为禁停状态
              if (entity.polygon && entity.polygon.material) {
                entity.polygon.material = Cesium.Color.RED.withAlpha(0.6)
                entity.polygon.outlineColor = Cesium.Color.RED
              }
            }
          }
        })
      } catch (error) {
        console.error('时间检查过程中出错:', error)
      }
    }, 60000) // 每60秒检查一次
  }
  
  // 初始化事件处理器
  initEventHandler() {
    // 原有右键点击事件代码保持不变
    this.eventHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas)
    
    this.eventHandler.setInputAction((click) => {
      const pickedObject = this.viewer.scene.pick(click.position)
      
      if (Cesium.defined(pickedObject) && 
          pickedObject.id && 
          pickedObject.id.properties) {
        
        this.selectedEntity = pickedObject.id
        
        // 触发自定义事件，通知Vue组件显示上下文菜单
        // 传递是否已是禁停区的信息，便于展示不同的菜单选项
        const isNoParking = pickedObject.id.properties.isNoParking ? 
                           pickedObject.id.properties.isNoParking._value : false
        
        const event = new CustomEvent('parkingAreaRightClicked', {
          detail: {
            entity: this.selectedEntity,
            position: click.position,
            isNoParking: isNoParking
          }
        })
        document.dispatchEvent(event)
      }
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
  }

  // 优化加载停车区方法
  async loadParkingAreas(url) {
    try {
      // 清除之前加载的数据
      this.clearParkingAreas()
      
      // 加载GeoJSON数据，不使用默认样式
      this.dataSource = await Cesium.GeoJsonDataSource.load(url)
      
      // 手动设置每个实体的样式
      const entities = this.dataSource.entities.values
      console.log(`开始处理 ${entities.length} 个停车区实体`)
      
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]
        
        // 确保实体有多边形
        if (entity.polygon) {
          // 重新配置多边形属性
          entity.polygon.height = this.heightOffset
          entity.polygon.extrudedHeight = this.heightOffset + 2.0 // 增加挤出高度使其更明显
          entity.polygon.heightReference = Cesium.HeightReference.RELATIVE_TO_GROUND
          
          // 设置材质和边框
          entity.polygon.material = Cesium.Color.BLUE.withAlpha(0.7)
          entity.polygon.outline = true
          entity.polygon.outlineColor = Cesium.Color.BLUE
          entity.polygon.outlineWidth = 2
          
          // 确保在3D Tiles之上渲染
          entity.polygon.classificationType = Cesium.ClassificationType.BOTH
          entity.polygon.zIndex = 1000
          
          // 添加描述信息方便调试
          entity.description = `停车区: ${entity.properties?.name?._value || entity.id}`
          
          console.log(`配置停车区 ${entity.id}:`, {
            height: this.heightOffset,
            extrudedHeight: this.heightOffset + 2.0,
            material: 'BLUE with alpha 0.7'
          })
        } else {
          console.warn(`实体 ${entity.id} 没有多边形几何`)
        }
        
        // 初始化属性
        if (!entity.properties) {
          entity.properties = new Cesium.PropertyBag()
        }
        
        // 检查是否已标记为禁停区
        const isNoParking = entity.properties.isNoParking && 
                          entity.properties.isNoParking._value === true
        
        if (isNoParking) {
          // 设置为禁停区样式
          entity.polygon.material = Cesium.Color.RED.withAlpha(0.7)
          entity.polygon.outlineColor = Cesium.Color.RED
          
          // 添加到禁停区列表
          this.noParkingAreas.push(entity)
        }
        
        // 标记为停车区
        entity.properties.isParkingArea = true
        
        // 存储停车区引用
        this.parkingAreas.push(entity)
      }
      
      // 添加数据源到viewer
      await this.viewer.dataSources.add(this.dataSource)
      
      // 强制刷新场景
      this.viewer.scene.requestRender()
      
      console.log(`成功加载并配置 ${entities.length} 个停车区`)
      
      // 可选：飞到所有停车区的边界
      if (entities.length > 0) {
        setTimeout(() => {
          this.viewer.flyTo(this.dataSource, {
            duration: 2.0,
            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 500)
          })
        }, 1000)
      }
      
      return {
        success: true,
        count: entities.length
      }
    } catch (error) {
      console.error('加载停车区数据失败:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // 优化清除方法
  clearParkingAreas() {
    try {
      // 如果有数据源，单独移除它
      if (this.dataSource) {
        this.viewer.dataSources.remove(this.dataSource)
        this.dataSource = null
      }
      
      // 清空数组
      this.parkingAreas = []
      this.noParkingAreas = []
      
      // 停止时间检查
      if (this.timeCheckIntervalId) {
        clearInterval(this.timeCheckIntervalId)
        this.timeCheckIntervalId = null
      }
    } catch (error) {
      console.error('清除停车区时出错:', error)
    }
  }

  // 设置禁停区域（添加开始时间和结束时间参数）
  setNoParkingArea(entity, reason, startTime, endTime) {
    if (!entity || !entity.properties) return false
    
    // 更新实体属性
    entity.properties.isNoParking = true
    entity.properties.noParkingReason = reason
    entity.properties.noParkingDate = new Date().toISOString()
    
    // 设置禁停时间段
    entity.properties.noParkingStartTime = startTime || null // 如果未指定，设为null表示立即生效
    entity.properties.noParkingEndTime = endTime || null // 如果未指定，设为null表示永久禁停
    
    // 更改样式为红色
    if (entity.polygon) {
      entity.polygon.material = Cesium.Color.RED.withAlpha(0.6)
      entity.polygon.outlineColor = Cesium.Color.RED
      entity.polygon.outlineWidth = 3
      
      // 确保高度设置正确
      entity.polygon.height = this.heightOffset
      entity.polygon.extrudedHeight = this.heightOffset + 2.0
    }
    
    // 添加到禁停区列表
    if (!this.noParkingAreas.includes(entity)) {
      this.noParkingAreas.push(entity)
    }
    
    // 如果有结束时间，确保时间检查已开启
    if (endTime && !this.timeCheckIntervalId) {
      this.startTimeCheck()
    }
    
    return true
  }

  // 取消禁停区设置
  unsetNoParkingArea(entity) {
    if (!entity || !entity.properties) return false;
    
    // 更新实体属性
    entity.properties.isNoParking = false;
    entity.properties.noParkingReason = undefined;
    entity.properties.noParkingDate = undefined;
    entity.properties.noParkingStartTime = undefined;
    entity.properties.noParkingEndTime = undefined;
    
    // 更改样式为蓝色（普通停车区）
    if (entity.polygon) {
      entity.polygon.material = Cesium.Color.BLUE.withAlpha(0.5);
      entity.polygon.outlineColor = Cesium.Color.BLUE;
    }
    
    // 从禁停区列表中删除
    const index = this.noParkingAreas.findIndex(area => area.id === entity.id);
    if (index !== -1) {
      this.noParkingAreas.splice(index, 1);
    }
    
    return true;
  }

  // 获取所有禁停区
  getNoParkingAreas() {
    return this.noParkingAreas.map(entity => {
      // 获取属性值，处理Cesium Property对象
      const getPropertyValue = (property) => {
        if (!property) return undefined
        return property._value !== undefined ? property._value : property
      }
      
      return {
        id: entity.id,
        name: entity.name || `区域 ${entity.id}`,
        reason: getPropertyValue(entity.properties.noParkingReason),
        date: getPropertyValue(entity.properties.noParkingDate),
        startTime: getPropertyValue(entity.properties.noParkingStartTime),
        endTime: getPropertyValue(entity.properties.noParkingEndTime),
        entity: entity
      }
    })
  }

  // 飞到指定禁停区
  async flyToNoParkingArea(entity) {
    console.log('尝试定位到禁停区:', entity?.id);
    
    if (!entity || !entity.id) {
      console.warn('无法定位：实体对象为空或没有ID');
      return false;
    }
    
    try {
      let coordinates = null;
      
      // 方法1：尝试从实体的多边形中获取坐标
      if (entity.polygon && entity.polygon.hierarchy) {
        try {
          const positions = entity.polygon.hierarchy.getValue().positions;
          if (positions && positions.length > 0) {
            console.log('从实体多边形获取到位置数据');
            
            // 计算多边形的中心点
            const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
            const center = boundingSphere.center;
            
            if (center) {
              const cartographic = Cesium.Cartographic.fromCartesian(center);
              this.flyToPosition(cartographic, entity);
              return true;
            }
          }
        } catch (err) {
          console.warn('从实体获取位置失败:', err);
        }
      }
      
      // 方法2：尝试从GeoJSON文件获取位置
      console.log('尝试从GeoJSON文件获取位置数据');
      
      // 使用fetch获取GeoJSON文件
      // 注意：替换为您实际的GeoJSON文件URL
      const geoJsonUrl = 'http://localhost:10000/api/parking-data';
      const response = await fetch(geoJsonUrl);
      
      if (!response.ok) {
        throw new Error(`无法加载GeoJSON数据: ${response.status}`);
      }
      
      const geoJsonData = await response.json();
      
      // 在GeoJSON中查找对应ID的要素
      const feature = geoJsonData.features.find(f => f.properties.id === entity.id);
      
      if (!feature || !feature.geometry || !feature.geometry.coordinates || 
          !feature.geometry.coordinates[0] || feature.geometry.coordinates[0].length === 0) {
        console.warn('在GeoJSON中未找到有效的特征数据');
        return false;
      }
      
      // 获取多边形坐标
      coordinates = feature.geometry.coordinates[0];
      
      // 计算多边形中心点
      let sumLon = 0;
      let sumLat = 0;
      
      for (const coord of coordinates) {
        sumLon += coord[0];
        sumLat += coord[1];
      }
      
      const centerLon = sumLon / coordinates.length;
      const centerLat = sumLat / coordinates.length;
      
      console.log('计算的中心点:', { longitude: centerLon, latitude: centerLat });
      
      // 创建一个笛卡尔坐标
      const cartographic = Cesium.Cartographic.fromDegrees(centerLon, centerLat);
      
      // 执行飞行
      this.flyToPosition(cartographic, entity);
      return true;
      
    } catch (error) {
      console.error('飞行到禁停区时出错:', error);
      return false;
    }
  }

  // 飞行到指定位置（提取为单独的方法便于复用）
  flyToPosition(cartographic, entity) {
    // 默认高度值（如果未提供）
    const height = cartographic.height || 0;
    
    // 飞行到中心点上方
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        height + 300 // 在地面上方300米处
      ),
      orientation: {
        heading: 0.0,
        pitch: Cesium.Math.toRadians(-60), // 俯视角度
        roll: 0.0
      },
      duration: 2.0, // 飞行时间2秒
      complete: () => {
        console.log('相机飞行完成，高亮显示禁停区');
        this.highlightNoParkingArea(entity);
      }
    });
  }

  // 突出显示禁停区（临时效果）
  highlightNoParkingArea(entity) {
    if (!entity || !entity.polygon) return;
    
    // 保存原始材质
    const originalMaterial = entity.polygon.material;
    
    // 应用高亮效果
    entity.polygon.material = Cesium.Color.YELLOW.withAlpha(0.8);
    entity.polygon.extrudedHeight = this.heightOffset + 5; // 临时增加高度
    
    // 2秒后恢复原样
    setTimeout(() => {
      entity.polygon.material = originalMaterial;
      entity.polygon.extrudedHeight = this.heightOffset + 0.2;
    }, 2000);
  }

  // 添加保存功能
  async saveNoParkingData() {
    try {
      // 构建保存数据 - 保存所有停车区（无论是否为禁停区）
      const allParkingData = this.parkingAreas.map(entity => {
        // 获取属性值
        const getPropertyValue = (property) => {
          if (!property) return undefined;
          return property._value !== undefined ? property._value : property;
        };
        
        // 获取多边形坐标
        let coordinates = [];
        if (entity.polygon && entity.polygon.hierarchy) {
          // 获取多边形坐标
          const positions = entity.polygon.hierarchy.getValue().positions;
          coordinates = positions.map(position => {
            const cartographic = Cesium.Cartographic.fromCartesian(position);
            return [
              Cesium.Math.toDegrees(cartographic.longitude),
              Cesium.Math.toDegrees(cartographic.latitude)
            ];
          });
        }
        
        // 判断是否为禁停区
        const isNoParking = getPropertyValue(entity.properties.isNoParking) || false;
        
        // 返回GeoJSON格式的要素
        return {
          type: "Feature",
          properties: {
            id: entity.id,
            name: entity.name || `停车区 ${entity.id}`,
            isNoParking: isNoParking,
            noParkingReason: isNoParking ? getPropertyValue(entity.properties.noParkingReason) : null,
            noParkingDate: isNoParking ? getPropertyValue(entity.properties.noParkingDate) : null,
            noParkingStartTime: isNoParking ? getPropertyValue(entity.properties.noParkingStartTime) : null,
            noParkingEndTime: isNoParking ? getPropertyValue(entity.properties.noParkingEndTime) : null
          },
          geometry: {
            type: "Polygon",
            coordinates: [coordinates]
          }
        };
      });
      
      // 构建GeoJSON对象
      const geoJsonData = {
        type: "FeatureCollection",
        name: "停车区数据",
        crs: { 
          type: "name", 
          properties: { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" } 
        },
        features: allParkingData
      };
      
      // 使用API保存数据
      const response = await fetch('http://localhost:10000/api/save-parking-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geoJsonData)
      });
      
      // 检查响应状态
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP错误: ${response.status}, ${errorText}`);
      }
      
      // 尝试解析JSON响应
      let responseData;
      try {
        // 检查响应是否为空
        const text = await response.text();
        if (!text || text.trim() === '') {
          throw new Error('服务器返回了空响应');
        }
        responseData = JSON.parse(text);
      } catch (parseError) {
        throw new Error(`解析响应失败: ${parseError.message}`);
      }
      
      return {
        success: true,
        message: responseData.message || '保存成功'
      };
    } catch (error) {
      console.error('保存禁停数据失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 添加设置高度偏移的方法
  setHeightOffset(height) {
    if (typeof height === 'number' && height >= 0) {
      this.heightOffset = height
      
      console.log(`更新高度偏移为: ${height}米`)
      
      // 更新所有已加载的停车区高度
      this.parkingAreas.forEach((entity, index) => {
        if (entity.polygon) {
          entity.polygon.height = this.heightOffset
          entity.polygon.extrudedHeight = this.heightOffset + 2.0
          
          console.log(`更新停车区 ${entity.id} 高度: ${this.heightOffset}米`)
        }
      })
      
      // 强制刷新场景
      this.viewer.scene.requestRender()
      
      return true
    } else {
      console.warn('无效的高度值，高度必须是一个非负数')
      return false
    }
  }

  // 添加调试方法
  debugParkingAreas() {
    console.log('=== 停车区调试信息 ===')
    console.log(`总停车区数量: ${this.parkingAreas.length}`)
    console.log(`数据源: `, this.dataSource)
    console.log(`viewer数据源数量: `, this.viewer.dataSources.length)
    
    this.parkingAreas.forEach((entity, index) => {
      console.log(`停车区 ${index + 1}:`, {
        id: entity.id,
        hasPolygon: !!entity.polygon,
        height: entity.polygon?.height,
        extrudedHeight: entity.polygon?.extrudedHeight,
        material: entity.polygon?.material,
        show: entity.show
      })
    })
  }
}