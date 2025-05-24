/**
 * 出行规划服务
 * 处理路线规划和行程模拟，使用高德地图API进行路径计算
 */
import Cesium from '@/cesiumUtils/cesium';
import bikeStore from '@/cesiumUtils/BikeStore';

class TripPlanner {
  constructor(viewer) {
    this.viewer = viewer;
    this.routeEntities = [];
    this.simulationTimer = null;
    this.simulationActive = false;
    this.isSelecting = false;
    this.selectCallback = null;
    this.selectType = null;
    this.activeTrip = null;
    this.amapLoaded = false;
    this.amapKey = '181647547113a932e0e0247df2346de8'; // 假设的API密钥，实际使用时需要替换为真实的API密钥
    this.loadAMapAPI();
    
    // 设置地图点击事件处理器
    this.setupMapClickHandler();
  }

  /**
   * 加载高德地图API
   */
loadAMapAPI() {
  if (window.AMap) {
    this.amapLoaded = true;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById('amap-security');
    if (existingScript) {
      return;
    }
    
    // 1. 先加载安全密钥配置
    window._AMapSecurityConfig = {
      securityJsCode: '1427c74aeab8666568ab676bc648c60e', // 替换为您的安全密钥
    };
    
    // 2. 然后加载地图API
    const script = document.createElement('script');
    script.id = 'amap-api';
    script.type = 'text/javascript';
    script.src = `https://webapi.amap.com/maps?v=2.0&key=181647547113a932e0e0247df2346de8`; // 替换为您的API密钥
    script.async = true;
    
    script.onload = () => {
      window.AMap.plugin(['AMap.Driving'], () => {
        this.amapLoaded = true;
        console.log('高德地图API及Driving插件加载成功');
        resolve();
      });
    };
    
    script.onerror = () => {
      console.error('高德地图API加载失败');
      reject(new Error('高德地图API加载失败'));
    };
    
    document.head.appendChild(script);
  });
}

  /**
   * 设置地图点击事件处理
   */
setupMapClickHandler() {
    // 为Cesium地图添加点击事件
    const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.canvas);
    
    handler.setInputAction((click) => {
      if (!this.isSelecting) return;
      
      // 获取点击位置的地理坐标
      const pickedPosition = this.viewer.scene.pickPosition(click.position);
      if (Cesium.defined(pickedPosition)) {
        const cartographic = Cesium.Cartographic.fromCartesian(pickedPosition);
        const longitude = Cesium.Math.toDegrees(cartographic.longitude);
        const latitude = Cesium.Math.toDegrees(cartographic.latitude);
        
        // 获取地址描述（可以调用高德API的逆地理编码）
        this.getAddressFromPosition(longitude, latitude)
          .then(address => {
            const location = {
              address: address || `位置 (${longitude.toFixed(4)}, ${latitude.toFixed(4)})`,
              longitude,
              latitude,
              position: [longitude, latitude]
            };
            
            // 在地图上标记选定位置
            this.addLocationMarker(location, this.selectType);
            
            // 调用回调函数
            if (this.selectCallback) {
              this.selectCallback(location);
            }
            
            // 重置选择状态
            this.isSelecting = false;
            this.selectCallback = null;
            this.selectType = null;
          });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }


  /**
   * 在地图上选择位置
   * @param {Function} callback - 选择后的回调函数
   * @param {String} type - 位置类型（'start'或'end'）
   */
 selectLocationOnMap(callback, type) {
    this.isSelecting = true;
    this.selectCallback = callback;
    this.selectType = type;
    
    // 显示提示消息
    this.dispatchEvent('tripplanner-message', {
      message: `请在地图上点击选择${type === 'start' ? '起点' : '终点'}位置`
    });
  }

  /**
   * 从坐标获取地址描述（使用高德地图API的逆地理编码）
   * @param {Number} longitude - 经度
   * @param {Number} latitude - 纬度
   * @returns {Promise<String>} 地址描述
   */
  getAddressFromPosition(longitude, latitude) {
    return new Promise(async (resolve) => {
      try {
        // 确保高德地图API已加载
        await this.loadAMapAPI();
        
        if (!window.AMap) {
          console.warn('高德地图API未加载，无法获取地址');
          resolve(null);
          return;
        }
        
        // 使用高德地图的逆地理编码功能
        window.AMap.plugin('AMap.Geocoder', () => {
          const geocoder = new window.AMap.Geocoder();
          
          const lnglat = [longitude, latitude];
          geocoder.getAddress(lnglat, (status, result) => {
            if (status === 'complete' && result.info === 'OK') {
              // 获取地址成功
              resolve(result.regeocode.formattedAddress);
            } else {
              // 获取地址失败
              console.warn('逆地理编码获取地址失败', status);
              resolve(null);
            }
          });
        });
      } catch (error) {
        console.error('逆地理编码错误:', error);
        resolve(null);
      }
    });
  }



  /**
   * 在地图上添加位置标记
   * @param {Object} location - 位置对象
   * @param {String} type - 位置类型（'start'或'end'）
   */
addLocationMarker(location, type) {
    // 创建标记的颜色
    const color = type === 'start' ? Cesium.Color.GREEN : Cesium.Color.RED;
    const position = Cesium.Cartesian3.fromDegrees(location.longitude, location.latitude);
    
    // 移除同类型的原有标记
    this.routeEntities = this.routeEntities.filter(entity => {
      if (entity.locationMarkerType === type) {
        this.viewer.entities.remove(entity);
        return false;
      }
      return true;
    });
    
    // 添加新的标记
    const entity = this.viewer.entities.add({
      position,
      point: {
        pixelSize: 12,
        color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2
      },
      label: {
        text: type === 'start' ? '起点' : '终点',
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        showBackground: true,
        backgroundColor: new Cesium.Color(0.1, 0.1, 0.1, 0.7)
      },
      locationMarkerType: type
    });
    
    this.routeEntities.push(entity);
    
    // 调整相机以查看标记
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        location.longitude, 
        location.latitude - 0.005, 
        500
      ),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-30),
        roll: 0
      }
    });
  }
 /**
   * 规划路线
   * @param {Array} startPosition - 起点坐标 [lon, lat]
   * @param {Array} endPosition - 终点坐标 [lon, lat]
   * @param {String} preference - 偏好（'fastest', 'shortest', 'safest', 'scenic'）
   * @returns {Object|null} 路线结果
   */
  async planRoute(startPosition, endPosition, preference = 'fastest') {
    try {
      // 确保高德地图API已加载
      await this.loadAMapAPI();
      
      if (!window.AMap) {
        this.dispatchEvent('tripplanner-message', {
          message: '高德地图API加载失败，请刷新页面重试'
        });
        return null;
      }
      
      this.clearRoute(); // 清除现有路线
      
      // 返回Promise以处理异步结果
      return new Promise((resolve) => {
        try {
          // 创建驾驶规划实例
          const policy = this.mapPreferenceToPolicy(preference);
          const drivingOptions = {
            policy: policy,
            ferry: 0,         // 是否使用轮渡，0表示不使用
            province: '全国'  // 省份
          };
          
          // 确保Driving插件可用
          if (!window.AMap.Driving) {
            window.AMap.plugin(['AMap.Driving'], () => {
              this.processDrivingRequest(startPosition, endPosition, drivingOptions, resolve);
            });
          } else {
            this.processDrivingRequest(startPosition, endPosition, drivingOptions, resolve);
          }
        } catch (error) {
          console.error('路径规划初始化错误:', error);
          this.dispatchEvent('tripplanner-message', {
            message: '路径规划初始化失败'
          });
          resolve(null);
        }
      });
    } catch (error) {
      console.error('高德地图API加载错误:', error);
      this.dispatchEvent('tripplanner-message', {
        message: '地图服务加载失败，请刷新页面重试'
      });
      return null;
    }
  }
  /**
   * 处理驾驶路径请求
   * @param {Array} startPosition - 起点坐标
   * @param {Array} endPosition - 终点坐标
   * @param {Object} options - 驾驶选项
   * @param {Function} resolve - Promise解析函数
   */
  processDrivingRequest(startPosition, endPosition, options, resolve) {
    try {
      const driving = new window.AMap.Driving(options);
      
      // 转换为高德地图坐标格式
      const startLngLat = new window.AMap.LngLat(startPosition[0], startPosition[1]);
      const endLngLat = new window.AMap.LngLat(endPosition[0], endPosition[1]);
      
      // 路径规划
      driving.search(startLngLat, endLngLat, (status, result) => {
        if (status === 'complete' && result.info === 'OK') {
          // 路径规划成功
          const pathData = this.processRouteResult(result);
          this.drawRoutePath(pathData.path);
          
          // 返回路径信息
          resolve({
            duration: Math.ceil(pathData.duration / 60), // 转换为分钟
            distance: pathData.distance,
            cost: this.calculateRouteCost(pathData.distance, pathData.duration),
            path: pathData.path
          });
        } else {
          // 路径规划失败
          console.error('路径规划失败:', status, result);
          this.dispatchEvent('tripplanner-message', {
            message: '无法规划所选路线，请选择其他位置'
          });
          resolve(null);
        }
      });
    } catch (error) {
      console.error('路径规划调用错误:', error);
      this.dispatchEvent('tripplanner-message', {
        message: '路径规划调用失败'
      });
      resolve(null);
    }
  }

  /**
   * 将偏好映射到高德地图策略
   * @param {String} preference - 路线偏好
   * @returns {Number} 高德地图策略代码
   */
  mapPreferenceToPolicy(preference) {
    // 高德地图路径规划策略:
    // LEAST_TIME 10 速度优先，时间最短
    // LEAST_FEE 11 费用优先，不走收费路段
    // LEAST_DISTANCE 12 距离优先，不考虑路况，但是可能存在穿越小路/小区的情况
    // REAL_TRAFFIC 13 考虑实时路况，时间最短
    switch (preference) {
      case 'fastest': return 10; // 最快路线，速度优先
      case 'shortest': return 12; // 最短路线，距离优先
      case 'safest': return 13; // 最安全路线，考虑实时路况
      case 'scenic': return 11; // 风景路线，费用优先，通常会经过更多非主干道
      default: return 10; // 默认最快路线
    }
  }

  /**
   * 处理路径规划结果
   * @param {Object} result - 高德地图路径规划结果
   * @returns {Object} 处理后的路径数据
   */
mapPreferenceToPolicy(preference) {
    // 高德地图路径规划策略:
    // LEAST_TIME 0 速度优先，时间最短 (AMap.DrivingPolicy.LEAST_TIME)
    // LEAST_FEE 1 费用优先，不走收费路段 (AMap.DrivingPolicy.LEAST_FEE)
    // LEAST_DISTANCE 2 距离优先 (AMap.DrivingPolicy.LEAST_DISTANCE)
    // REAL_TRAFFIC 4 考虑实时路况 (AMap.DrivingPolicy.REAL_TRAFFIC)
    // 以上是v2.0 API中的常量值
    switch (preference) {
      case 'fastest': return 0; // 最快路线，速度优先
      case 'shortest': return 2; // 最短路线，距离优先
      case 'safest': return 4; // 最安全路线，考虑实时路况
      case 'scenic': return 1; // 风景路线，费用优先，通常会经过更多非主干道
      default: return 0; // 默认最快路线
    }
  }

  /**
   * 处理路径规划结果
   * @param {Object} result - 高德地图路径规划结果
   * @returns {Object} 处理后的路径数据
   */
  processRouteResult(result) {
    const routes = result.routes || [];
    if (routes.length === 0) {
      return { path: [], distance: 0, duration: 0 };
    }
    
    const firstRoute = routes[0];
    const path = [];
    
    // 处理路径点
    firstRoute.steps.forEach(step => {
      if (step.path && Array.isArray(step.path)) {
        step.path.forEach(point => {
          if (point && typeof point.lng === 'number' && typeof point.lat === 'number') {
            path.push([point.lng, point.lat]);
          }
        });
      }
    });
    
    return {
      path,
      distance: firstRoute.distance, // 单位：米
      duration: firstRoute.time // 单位：秒
    };
  }
  /**
   * 绘制路径线
   * @param {Array} path - 路径点数组，格式为 [[lon1, lat1], [lon2, lat2], ...]
   */
  drawRoutePath(path) {
    if (!path || path.length < 2) return;
    
    // 创建路径实体
    const positions = path.map(point => 
      Cesium.Cartesian3.fromDegrees(point[0], point[1])
    );
    
    // 添加路径线
    const routeLine = this.viewer.entities.add({
      polyline: {
        positions,
        width: 5,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: Cesium.Color.DEEPSKYBLUE
        }),
        clampToGround: true
      },
      isRouteLine: true
    });
    
    this.routeEntities.push(routeLine);
    
    // 调整视图以显示整个路线
    this.viewer.camera.flyToBoundingSphere(
      Cesium.BoundingSphere.fromPoints(positions),
      {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(
          0,
          Cesium.Math.toRadians(-30),
          0
        )
      }
    );
  }

  /**
   * 计算路线费用
   * @param {Number} distance - 距离（米）
   * @param {Number} duration - 时间（秒）
   * @returns {Number} 费用（元）
   */
  calculateRouteCost(distance, duration) {
    const baseFee = 1.5; // 起步价
    const perKmFee = 0.3; // 每公里费用
    const timeAdjustment = (duration / 3600) * 0.5; // 时间调整因子，时间越长费用越高
    
    const distanceKm = distance / 1000;
    const cost = baseFee + distanceKm * perKmFee + timeAdjustment;
    
    return Math.max(1.5, parseFloat(cost.toFixed(1))); // 最低1.5元
  }

  /**
   * 获取附近单车
   * @param {Array} position - 位置坐标 [lon, lat]
   * @param {Number} radius - 搜索半径（米）
   * @returns {Array} 单车列表
   */
  getNearbyBikes(position, radius = 500) {
    // 从单车存储中获取指定范围内的单车
    const bikes = bikeStore.getBikesInRadius(position[0], position[1], radius);
    
    // 过滤出可用的单车
    const availableBikes = bikes.filter(bike => bike.status === 'available');
    
    // 计算每辆单车到指定位置的距离
    const bikesWithDistance = availableBikes.map(bike => {
      const distance = this.calculateDistance(
        position,
        [bike.longitude, bike.latitude]
      );
      
      return {
        ...bike,
        distance: Math.round(distance)
      };
    });
    
    // 按距离排序
    return bikesWithDistance.sort((a, b) => a.distance - b.distance);
  }

  /**
   * 计算两点间的距离（米）
   * @param {Array} point1 - 第一个点 [lon, lat]
   * @param {Array} point2 - 第二个点 [lon, lat]
   * @returns {Number} 距离（米）
   */
  calculateDistance(point1, point2) {
    const lon1 = point1[0] * Math.PI / 180;
    const lon2 = point2[0] * Math.PI / 180;
    const lat1 = point1[1] * Math.PI / 180;
    const lat2 = point2[1] * Math.PI / 180;
    
    // 地球半径（米）
    const R = 6371000;
    
    // Haversine公式
    const dLon = lon2 - lon1;
    const dLat = lat2 - lat1;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance;
  }

  /**
   * 开始行程
   * @param {String} bikeId - 单车ID
   * @returns {Object} 行程信息
   */
  startTrip(bikeId) {
    // 停止可能存在的模拟
    this.stopSimulation();
    
    const bike = bikeStore.getBikeById(bikeId);
    if (!bike) {
      this.dispatchEvent('tripplanner-message', {
        message: '找不到所选单车'
      });
      return null;
    }
    
    if (bike.status !== 'available') {
      this.dispatchEvent('tripplanner-message', {
        message: '所选单车不可用'
      });
      return null;
    }
    
    // 记录用户ID（这里为模拟，实际应用中应该使用用户认证系统）
    const userId = 'user-' + Date.now();
    
    // 记录行程并更新单车状态
    const tripId = bikeStore.startTrip(bikeId, userId, [bike.longitude, bike.latitude]);
    
    // 创建行程对象
    this.activeTrip = {
      id: tripId,
      bikeId,
      startTime: Date.now(),
      route: this.getCurrentRoute(),
      simulationPoints: [], // 存储模拟点
      currentPointIndex: 0
    };
    
    // 开始路线模拟
    this.startSimulation();
    
    return this.activeTrip;
  }

  /**
   * 获取当前路线
   * @returns {Array} 路线点数组
   */
  getCurrentRoute() {
    // 从路径实体中提取路线点
    const routeLine = this.routeEntities.find(entity => entity.isRouteLine);
    if (!routeLine || !routeLine.polyline || !routeLine.polyline.positions) {
      return [];
    }
    
    // 将Cartesian3坐标转换为经纬度
    const positions = routeLine.polyline.positions.getValue();
    if (!positions) return [];
    
    return positions.map(pos => {
      const cartographic = Cesium.Cartographic.fromCartesian(pos);
      return [
        Cesium.Math.toDegrees(cartographic.longitude),
        Cesium.Math.toDegrees(cartographic.latitude)
      ];
    });
  }

  /**
   * 开始行程模拟
   */
  startSimulation() {
    if (!this.activeTrip || !this.activeTrip.route || this.activeTrip.route.length < 2) {
      this.dispatchEvent('tripplanner-message', {
        message: '无路线数据，无法开始行程模拟'
      });
      return;
    }
    
    this.simulationActive = true;
    
    // 获取单车实例
    const bike = bikeStore.getBikeById(this.activeTrip.bikeId);
    if (!bike) return;
    
    // 创建沿路线的平滑点
    this.activeTrip.simulationPoints = this.createSmoothPoints(this.activeTrip.route, 100);
    this.activeTrip.currentPointIndex = 0;
    
    // 添加模拟骑行的实体
    this.addBikeModel(bike, this.activeTrip.simulationPoints[0]);
    
    // 模拟总时间（秒）
    const totalDuration = 60 * 15; // 15分钟
    const totalPoints = this.activeTrip.simulationPoints.length;
    
    // 设置模拟更新间隔（毫秒）
    const updateInterval = (totalDuration * 1000) / totalPoints;
    
    // 启动模拟计时器
    this.simulationTimer = setInterval(() => {
      if (!this.simulationActive) {
        clearInterval(this.simulationTimer);
        return;
      }
      
      // 更新位置索引
      this.activeTrip.currentPointIndex++;
      
      // 检查是否完成
      if (this.activeTrip.currentPointIndex >= totalPoints) {
        this.tripCompleted();
        return;
      }
      
      // 获取当前位置
      const currentPoint = this.activeTrip.simulationPoints[this.activeTrip.currentPointIndex];
      
      // 更新单车位置
      this.updateBikePosition(bike, currentPoint);
      
      // 计算进度百分比
      const progress = (this.activeTrip.currentPointIndex / (totalPoints - 1)) * 100;
      const elapsedSeconds = (Date.now() - this.activeTrip.startTime) / 1000;
      
      // 发送进度事件
      this.dispatchEvent('tripplanner-progress', {
        progress,
        elapsedSeconds,
        totalSeconds: totalDuration,
        position: currentPoint
      });
      
    }, updateInterval);
  }

  /**
   * 创建平滑的路线点
   * @param {Array} originalPoints - 原始路线点
   * @param {Number} count - 平滑后的点数量
   * @returns {Array} 平滑后的点数组
   */
  createSmoothPoints(originalPoints, count) {
    if (originalPoints.length < 2) return originalPoints;
    
    const result = [];
    const totalDistance = this.calculatePathDistance(originalPoints);
    const segmentDistances = [];
    
    // 计算每段距离
    for (let i = 0; i < originalPoints.length - 1; i++) {
      const dist = this.calculateDistance(originalPoints[i], originalPoints[i + 1]);
      segmentDistances.push(dist);
    }
    
    // 归一化每段距离
    const normalizedDistances = segmentDistances.map(d => d / totalDistance);
    
    // 按距离比例分配点
    let pointsAllocated = 0;
    for (let i = 0; i < normalizedDistances.length; i++) {
      const segmentPoints = Math.max(1, Math.round(normalizedDistances[i] * count));
      
      // 插值生成点
      for (let j = 0; j < segmentPoints; j++) {
        const t = j / segmentPoints;
        const start = originalPoints[i];
        const end = originalPoints[i + 1];
        
        const point = [
          start[0] + t * (end[0] - start[0]),
          start[1] + t * (end[1] - start[1])
        ];
        
        result.push(point);
      }
      
      pointsAllocated += segmentPoints;
      
      // 为确保总数不超过count，调整最后一段
      if (i === normalizedDistances.length - 2) {
        const remaining = count - pointsAllocated;
        if (remaining > 0) {
          const lastSegmentPoints = remaining;
          const lastSegment = [originalPoints[i + 1], originalPoints[i + 2]];
          
          for (let j = 1; j <= lastSegmentPoints; j++) {
            const t = j / (lastSegmentPoints + 1);
            const point = [
              lastSegment[0][0] + t * (lastSegment[1][0] - lastSegment[0][0]),
              lastSegment[0][1] + t * (lastSegment[1][1] - lastSegment[0][1])
            ];
            result.push(point);
          }
        }
        break;
      }
    }
    
    // 添加最后一个点
    result.push(originalPoints[originalPoints.length - 1]);
    
    return result;
  }

  /**
   * 计算路径总长度
   * @param {Array} points - 路径点数组
   * @returns {Number} 总长度（米）
   */
  calculatePathDistance(points) {
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      totalDistance += this.calculateDistance(points[i], points[i + 1]);
    }
    return totalDistance;
  }

  /**
   * 添加单车模型
   * @param {Object} bike - 单车对象
   * @param {Array} position - 初始位置 [lon, lat]
   */
  addBikeModel(bike, position) {
    // 创建单车实体
    const bikeEntity = this.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(position[0], position[1]),
      point: {
        pixelSize: 10,
        color: Cesium.Color.LIME,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2
      },
      label: {
        text: '骑行中',
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        showBackground: true,
        backgroundColor: new Cesium.Color(0.1, 0.1, 0.1, 0.7)
      },
      bike: bike,
      simulated: true
    });
    
    this.routeEntities.push(bikeEntity);
    
    // 调整视图以跟随单车
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        position[0], 
        position[1] - 0.002, 
        200
      ),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-30),
        roll: 0
      }
    });
  }

  /**
   * 更新单车位置
   * @param {Object} bike - 单车对象
   * @param {Array} position - 新位置 [lon, lat]
   */
  updateBikePosition(bike, position) {
    // 更新单车位置
    const cartesian = Cesium.Cartesian3.fromDegrees(position[0], position[1]);
    bikeStore.updateBikePosition(bike.id, cartesian);
    
    // 更新单车实体位置
    const bikeEntity = this.routeEntities.find(entity => entity.bike && entity.bike.id === bike.id);
    if (bikeEntity) {
      bikeEntity.position = cartesian;
    }
    
    // 每隔一段时间更新相机位置以跟随单车
    if (this.activeTrip.currentPointIndex % 10 === 0) {
      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          position[0], 
          position[1] - 0.002, 
          200
        ),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-30),
          roll: 0
        },
        duration: 1.0
      });
    }
  }

  /**
   * 行程完成处理
   */
  tripCompleted() {
    this.stopSimulation();
    
    if (this.activeTrip) {
      // 发送完成事件
      this.dispatchEvent('tripplanner-complete', {
        tripId: this.activeTrip.id,
        bikeId: this.activeTrip.bikeId,
        duration: (Date.now() - this.activeTrip.startTime) / 1000
      });
      
      // 更新单车状态
      const lastPosition = this.activeTrip.simulationPoints[this.activeTrip.simulationPoints.length - 1];
      bikeStore.endTrip(this.activeTrip.id, lastPosition);
      
      this.activeTrip = null;
    }
  }

  /**
   * 停止模拟
   */
  stopSimulation() {
    this.simulationActive = false;
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
  }

  /**
   * 清除路线
   */
  clearRoute() {
    // 移除路线实体
    this.routeEntities.forEach(entity => {
      this.viewer.entities.remove(entity);
    });
    this.routeEntities = [];
  }

  /**
   * 发送自定义事件
   * @param {String} eventType - 事件类型
   * @param {Object} detail - 事件详情
   */
  dispatchEvent(eventType, detail) {
    const event = new CustomEvent(eventType, { detail });
    document.dispatchEvent(event);
  }
}

// 单例模式
let instance = null;

export default {
  /**
   * 获取TripPlanner实例
   * @param {Object} viewer - Cesium viewer实例
   * @returns {TripPlanner} 实例对象
   */
  getInstance(viewer) {
    if (!instance && viewer) {
      instance = new TripPlanner(viewer);
    }
    return instance;
  },
  
  /**
   * 清理资源
   */
  cleanup() {
    if (instance) {
      instance.stopSimulation();
      instance.clearRoute();
    }
  }
};
