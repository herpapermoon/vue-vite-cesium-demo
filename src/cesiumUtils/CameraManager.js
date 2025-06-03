/**
 * 摄像头管理器
 * 管理摄像头参数和坐标转换
 */
import * as Cesium from 'cesium';

class CameraManager {
  constructor(viewer) {
    this.viewer = viewer;
    this.cameras = new Map(); // 存储摄像头信息
    this.activeCameraId = null; // 当前激活的摄像头ID
    
    // 用于在地图上显示摄像头和视锥体
    this.cameraEntities = new Map();
    this.frustumEntities = new Map();
  }
  
  /**
   * 添加摄像头
   * @param {Object} options 摄像头参数
   * @param {string} options.id 摄像头唯一ID
   * @param {Array} options.position 摄像头位置[经度,纬度,高度]
   * @param {Array} options.direction 摄像头朝向[heading,pitch,roll]，单位：度
   * @param {number} options.horizontalFOV 水平视场角，单位：度
   * @param {number} options.verticalFOV 垂直视场角，单位：度
   * @param {number} options.maxDistance 最大可视距离，单位：米
   * @param {string} options.name 摄像头名称
   * @returns {string} 摄像头ID
   */
  addCamera(options) {
    const id = options.id || `camera-${Date.now()}`;
    
    // 存储摄像头信息
    this.cameras.set(id, {
      id,
      position: options.position || [0, 0, 0],
      direction: options.direction || [0, 0, 0], // [heading, pitch, roll]
      horizontalFOV: options.horizontalFOV || 60,
      verticalFOV: options.verticalFOV || 45,
      maxDistance: options.maxDistance || 100,
      name: options.name || `摄像头 ${id}`,
      active: false
    });
    
    // 在地图上添加摄像头实体
    this.addCameraEntity(id);
    
    return id;
  }
  
  /**
   * 移除摄像头
   * @param {string} id 摄像头ID
   */
  removeCamera(id) {
    if (!this.cameras.has(id)) return;
    
    // 移除实体
    if (this.cameraEntities.has(id)) {
      this.viewer.entities.remove(this.cameraEntities.get(id));
      this.cameraEntities.delete(id);
    }
    
    if (this.frustumEntities.has(id)) {
      this.viewer.entities.remove(this.frustumEntities.get(id));
      this.frustumEntities.delete(id);
    }
    
    // 移除摄像头信息
    this.cameras.delete(id);
    
    // 如果移除的是当前激活的摄像头，清除激活状态
    if (this.activeCameraId === id) {
      this.activeCameraId = null;
    }
  }
  
  /**
   * 激活摄像头
   * @param {string} id 摄像头ID
   */
  activateCamera(id) {
    if (!this.cameras.has(id)) return false;
    
    // 先将所有摄像头设置为非激活
    for (const [cameraId, camera] of this.cameras.entries()) {
      camera.active = false;
      
      // 更新视锥体显示
      if (this.frustumEntities.has(cameraId)) {
        const entity = this.frustumEntities.get(cameraId);
        if (entity.rectangle) {
          entity.rectangle.material = Cesium.Color.YELLOW.withAlpha(0.3);
        }
      }
    }
    
    // 设置当前摄像头为激活状态
    const camera = this.cameras.get(id);
    camera.active = true;
    this.activeCameraId = id;
    
    // 更新视锥体显示
    if (this.frustumEntities.has(id)) {
      const entity = this.frustumEntities.get(id);
      if (entity.rectangle) {
        entity.rectangle.material = Cesium.Color.GREEN.withAlpha(0.3);
      }
    }
    
    return true;
  }
  
  /**
   * 在地图上添加摄像头实体
   * @param {string} id 摄像头ID
   */
  addCameraEntity(id) {
    if (!this.cameras.has(id)) return;
    
    const camera = this.cameras.get(id);
    const [longitude, latitude, height] = camera.position;
    const [heading, pitch, roll] = camera.direction;
    
    // 创建摄像头实体
    const cameraEntity = this.viewer.entities.add({
      name: camera.name,
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
      billboard: {
        image: Cesium.buildModuleUrl('Assets/Textures/cctv-camera.png'), // 使用Cesium内置图标
        width: 32,
        height: 32,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: camera.name,
        font: '14px sans-serif',
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -36),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    
    this.cameraEntities.set(id, cameraEntity);
    
    // 创建视锥体实体
    this.updateFrustumEntity(id);
  }
  
  /**
   * 更新或创建视锥体实体
   * @param {string} id 摄像头ID
   */
  updateFrustumEntity(id) {
    if (!this.cameras.has(id)) return;
    
    const camera = this.cameras.get(id);
    const [longitude, latitude, height] = camera.position;
    const [heading, pitch, roll] = camera.direction;
    
    // 计算视锥体覆盖区域
    const coverageRect = this.calculateCoverageRectangle(camera);
    
    // 移除旧的视锥体实体
    if (this.frustumEntities.has(id)) {
      this.viewer.entities.remove(this.frustumEntities.get(id));
    }
    
    // 创建新的视锥体实体
    const frustumEntity = this.viewer.entities.add({
      name: `${camera.name} 覆盖区域`,
      rectangle: {
        coordinates: coverageRect,
        material: camera.active 
          ? Cesium.Color.GREEN.withAlpha(0.3) 
          : Cesium.Color.YELLOW.withAlpha(0.3),
        outline: true,
        outlineColor: Cesium.Color.WHITE
      }
    });
    
    this.frustumEntities.set(id, frustumEntity);
    
    // 添加视线方向
    const directionEntity = this.viewer.entities.add({
      name: `${camera.name} 方向`,
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
      orientation: Cesium.Transforms.headingPitchRollQuaternion(
        Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
        new Cesium.HeadingPitchRoll(
          Cesium.Math.toRadians(heading),
          Cesium.Math.toRadians(pitch),
          Cesium.Math.toRadians(roll)
        )
      ),
      polyline: {
        positions: this.calculateViewDirection(camera),
        width: 2,
        material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.RED)
      }
    });
    
    // 将方向实体与视锥体实体关联
    this.frustumEntities.set(`${id}-direction`, directionEntity);
  }
  
  /**
   * 计算摄像头视线方向点
   * @param {Object} camera 摄像头信息
   * @returns {Array} 方向线的点
   */
  calculateViewDirection(camera) {
    const [longitude, latitude, height] = camera.position;
    const [heading, pitch, roll] = camera.direction;
    const distance = camera.maxDistance * 0.5; // 使用一半的最大距离作为方向线长度
    
    // 计算方向终点
    const headingRad = Cesium.Math.toRadians(heading);
    const pitchRad = Cesium.Math.toRadians(pitch);
    
    // 计算水平偏移
    const horizontalDistance = distance * Math.cos(pitchRad);
    const verticalDistance = distance * Math.sin(pitchRad);
    
    // 计算经纬度偏移（简化计算，不考虑地球曲率）
    const latFactor = 1.0 / 111000.0; // 大约每111km对应1度纬度
    const lonFactor = 1.0 / (111000.0 * Math.cos(Cesium.Math.toRadians(latitude))); // 经度因子随纬度变化
    
    const endLon = longitude + horizontalDistance * Math.sin(headingRad) * lonFactor;
    const endLat = latitude + horizontalDistance * Math.cos(headingRad) * latFactor;
    const endHeight = height + verticalDistance;
    
    return [
      Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
      Cesium.Cartesian3.fromDegrees(endLon, endLat, endHeight)
    ];
  }
  
  /**
   * 检查值是否为有效数字
   * @param {any} value 要检查的值
   * @returns {boolean} 是否为有效数字
   */
  isValidNumber(value) {
    return typeof value === 'number' && isFinite(value) && !isNaN(value);
  }
  
  /**
   * 计算摄像头覆盖区域
   * @param {Object} camera 摄像头信息
   * @returns {Cesium.Rectangle} 覆盖区域
   */
  calculateCoverageRectangle(camera) {
    const [longitude, latitude, height] = camera.position;
    const [heading, pitch, roll] = camera.direction;
    const { horizontalFOV, verticalFOV, maxDistance } = camera;
    
    // 验证数据有效性
    if (!this.isValidNumber(longitude) || !this.isValidNumber(latitude) ||
        !this.isValidNumber(heading) || !this.isValidNumber(maxDistance)) {
      console.warn('计算摄像头覆盖区域时遇到无效值:', { 
        position: [longitude, latitude, height],
        direction: [heading, pitch, roll]
      });
      // 返回默认很小的矩形
      return Cesium.Rectangle.fromDegrees(longitude - 0.001, latitude - 0.001, longitude + 0.001, latitude + 0.001);
    }
    
    // 计算视锥体四个角点
    const headingRad = Cesium.Math.toRadians(heading);
    const halfHFOV = Cesium.Math.toRadians(horizontalFOV / 2);
    
    // 简化计算，假设摄像头指向地面
    const latFactor = 1.0 / 111000.0; // 大约每111km对应1度纬度
    const lonFactor = 1.0 / (111000.0 * Math.cos(Cesium.Math.toRadians(latitude))); // 经度因子随纬度变化
    
    // 计算四个角点
    const corners = [];
    for (let i = 0; i < 4; i++) {
      const angle = headingRad + (i < 2 ? -halfHFOV : halfHFOV);
      const distance = maxDistance;
      
      const dx = distance * Math.sin(angle);
      const dy = distance * Math.cos(angle);
      
      const cornerLon = longitude + dx * lonFactor;
      const cornerLat = latitude + dy * latFactor;
      
      // 确保计算结果有效
      if (this.isValidNumber(cornerLon) && this.isValidNumber(cornerLat)) {
        corners.push({ longitude: cornerLon, latitude: cornerLat });
      } else {
        console.warn('计算摄像头覆盖角点时出现无效值:', { cornerLon, cornerLat, angle, dx, dy });
      }
    }
    
    // 如果没有有效角点，返回默认矩形
    if (corners.length === 0) {
      return Cesium.Rectangle.fromDegrees(longitude - 0.001, latitude - 0.001, longitude + 0.001, latitude + 0.001);
    }
    
    // 计算边界矩形
    let west = Number.POSITIVE_INFINITY;
    let south = Number.POSITIVE_INFINITY;
    let east = Number.NEGATIVE_INFINITY;
    let north = Number.NEGATIVE_INFINITY;
    
    corners.forEach(corner => {
      west = Math.min(west, corner.longitude);
      south = Math.min(south, corner.latitude);
      east = Math.max(east, corner.longitude);
      north = Math.max(north, corner.latitude);
    });
    
    // 加入摄像头位置点
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
    
    // 确保矩形有效
    if (!this.isValidNumber(west) || !this.isValidNumber(south) || 
        !this.isValidNumber(east) || !this.isValidNumber(north) ||
        west === Number.POSITIVE_INFINITY || south === Number.POSITIVE_INFINITY ||
        east === Number.NEGATIVE_INFINITY || north === Number.NEGATIVE_INFINITY) {
      console.warn('计算摄像头覆盖矩形时出现无效值:', { west, south, east, north });
      return Cesium.Rectangle.fromDegrees(longitude - 0.001, latitude - 0.001, longitude + 0.001, latitude + 0.001);
    }
    
    return Cesium.Rectangle.fromDegrees(west, south, east, north);
  }
  
  /**
   * 获取当前激活的摄像头
   * @returns {Object|null} 摄像头信息
   */
  getActiveCamera() {
    if (!this.activeCameraId) return null;
    return this.cameras.get(this.activeCameraId);
  }
  
  /**
   * 将视频中的像素坐标转换为地理坐标
   * @param {number} x 像素X坐标
   * @param {number} y 像素Y坐标
   * @param {number} videoWidth 视频宽度
   * @param {number} videoHeight 视频高度
   * @param {number} estimatedDistance 估计距离（米）
   * @returns {Array|null} [经度, 纬度, 高度] 或 null
   */
  pixelToGeographic(x, y, videoWidth, videoHeight, estimatedDistance = 10) {
    try {
      const camera = this.getActiveCamera();
      if (!camera) return null;
      
      // 验证输入参数
      if (!this.isValidNumber(x) || !this.isValidNumber(y) || 
          !this.isValidNumber(videoWidth) || !this.isValidNumber(videoHeight) ||
          !this.isValidNumber(estimatedDistance) ||
          videoWidth <= 0 || videoHeight <= 0 || estimatedDistance <= 0) {
        console.warn('像素坐标转换参数无效:', { x, y, videoWidth, videoHeight, estimatedDistance });
        return null;
      }
      
      const [longitude, latitude, height] = camera.position;
      const [heading, pitch, roll] = camera.direction;
      const { horizontalFOV, verticalFOV } = camera;
      
      // 验证摄像头参数
      if (!this.isValidNumber(longitude) || !this.isValidNumber(latitude) ||
          !this.isValidNumber(height) || !this.isValidNumber(heading) ||
          !this.isValidNumber(pitch) || !this.isValidNumber(roll) ||
          !this.isValidNumber(horizontalFOV) || !this.isValidNumber(verticalFOV) ||
          Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
        console.warn('摄像头参数无效:', { 
          position: [longitude, latitude, height],
          direction: [heading, pitch, roll],
          fov: [horizontalFOV, verticalFOV]
        });
        return null;
      }
      
      // 将像素坐标转换为视场内的角度
      // 图像中心为(videoWidth/2, videoHeight/2)
      const pixelX = x - videoWidth / 2;
      const pixelY = videoHeight / 2 - y; // 反转Y轴，使上为正方向
      
      // 安全检查：确保像素坐标不会导致除以零
      if (Math.abs(videoWidth) < 0.001 || Math.abs(videoHeight) < 0.001) {
        console.warn('视频尺寸太小,无法计算:', { videoWidth, videoHeight });
        return null;
      }
      
      // 计算角度偏移
      const angleX = (pixelX / videoWidth) * Cesium.Math.toRadians(horizontalFOV);
      const angleY = (pixelY / videoHeight) * Cesium.Math.toRadians(verticalFOV);
      
      // 验证角度有效
      if (!this.isValidNumber(angleX) || !this.isValidNumber(angleY)) {
        console.warn('计算角度偏移无效:', { angleX, angleY, pixelX, pixelY });
        return null;
      }
      
      // 计算实际方向角度
      const headingRad = Cesium.Math.toRadians(heading) + angleX;
      const pitchRad = Cesium.Math.toRadians(pitch) + angleY;
      
      // 验证角度有效
      if (!this.isValidNumber(headingRad) || !this.isValidNumber(pitchRad)) {
        console.warn('计算方向角度无效:', { headingRad, pitchRad });
        return null;
      }
      
      // 计算3D位置偏移
      const horizontalDistance = estimatedDistance * Math.cos(pitchRad);
      const verticalDistance = estimatedDistance * Math.sin(pitchRad);
      
      // 验证计算结果
      if (!this.isValidNumber(horizontalDistance) || !this.isValidNumber(verticalDistance)) {
        console.warn('计算距离无效:', { horizontalDistance, verticalDistance, pitchRad });
        return null;
      }
      
      // 计算经纬度偏移
      const cosLat = Math.cos(Cesium.Math.toRadians(latitude));
      // 避免除以零或非常小的值
      if (Math.abs(cosLat) < 0.001) {
        console.warn('纬度接近极点，无法准确计算经度偏移:', latitude);
        return null;
      }
      
      const latFactor = 1.0 / 111000.0; // 大约每111km对应1度纬度
      const lonFactor = 1.0 / (111000.0 * cosLat); // 经度因子
      
      // 验证因子
      if (!this.isValidNumber(latFactor) || !this.isValidNumber(lonFactor) || 
          Math.abs(lonFactor) > 1.0) { // 经度因子在极点附近会变得非常大
        console.warn('坐标换算因子无效:', { latFactor, lonFactor, cosLat });
        return null;
      }
      
      const endLon = longitude + horizontalDistance * Math.sin(headingRad) * lonFactor;
      const endLat = latitude + horizontalDistance * Math.cos(headingRad) * latFactor;
      const endHeight = height + verticalDistance;
      
      // 最终验证计算结果并确保在合理范围内
      if (!this.isValidNumber(endLon) || !this.isValidNumber(endLat) || !this.isValidNumber(endHeight) ||
          Math.abs(endLon) > 180 || Math.abs(endLat) > 90) {
        console.warn('计算结果无效或超出地球范围:', { endLon, endLat, endHeight });
        return null;
      }
      
      return [endLon, endLat, endHeight];
    } catch (error) {
      console.error('像素坐标转换出错:', error);
      return null;
    }
  }
  
  /**
   * 将地理坐标转换为视频中的像素坐标
   * @param {number} longitude 经度
   * @param {number} latitude 纬度
   * @param {number} altitude 高度
   * @param {number} videoWidth 视频宽度
   * @param {number} videoHeight 视频高度
   * @returns {Array|null} [x, y] 像素坐标 或 null（如果不在视场内）
   */
  geographicToPixel(longitude, latitude, altitude, videoWidth, videoHeight) {
    try {
      const camera = this.getActiveCamera();
      if (!camera) return null;
      
      // 验证输入参数
      if (!this.isValidNumber(longitude) || !this.isValidNumber(latitude) || 
          !this.isValidNumber(altitude) || !this.isValidNumber(videoWidth) || 
          !this.isValidNumber(videoHeight) || videoWidth <= 0 || videoHeight <= 0) {
        console.warn('地理坐标转换参数无效:', { longitude, latitude, altitude, videoWidth, videoHeight });
        return null;
      }
      
      const [camLon, camLat, camHeight] = camera.position;
      const [heading, pitch, roll] = camera.direction;
      const { horizontalFOV, verticalFOV } = camera;
      
      // 验证摄像头参数
      if (!this.isValidNumber(camLon) || !this.isValidNumber(camLat) || 
          !this.isValidNumber(camHeight) || !this.isValidNumber(heading) ||
          !this.isValidNumber(pitch) || !this.isValidNumber(roll) ||
          !this.isValidNumber(horizontalFOV) || !this.isValidNumber(verticalFOV)) {
        console.warn('摄像头参数无效:', { 
          position: [camLon, camLat, camHeight],
          direction: [heading, pitch, roll],
          fov: [horizontalFOV, verticalFOV]
        });
        return null;
      }
      
      // 计算目标点相对于摄像头的方向
      const latDistance = (latitude - camLat) * 111000.0; // 纬度差转米
      const lonDistance = (longitude - camLon) * 111000.0 * Math.cos(Cesium.Math.toRadians(camLat)); // 经度差转米
      const heightDifference = altitude - camHeight;
      
      // 验证计算结果
      if (!this.isValidNumber(latDistance) || !this.isValidNumber(lonDistance) || !this.isValidNumber(heightDifference)) {
        console.warn('距离计算无效:', { latDistance, lonDistance, heightDifference });
        return null;
      }
      
      // 计算水平距离和方位角
      const horizontalDistance = Math.sqrt(latDistance * latDistance + lonDistance * lonDistance);
      
      // 避免除以零错误
      if (horizontalDistance === 0) {
        // 目标点在摄像头正上方或正下方
        const pixelX = videoWidth / 2;
        const pixelY = heightDifference > 0 ? videoHeight / 4 : videoHeight * 3 / 4; // 粗略估计
        return [pixelX, pixelY];
      }
      
      const targetHeading = Cesium.Math.toDegrees(Math.atan2(lonDistance, latDistance));
      
      // 计算俯仰角
      const targetPitch = Cesium.Math.toDegrees(Math.atan2(heightDifference, horizontalDistance));
      
      // 计算相对于摄像头视场的角度差
      const headingDiff = Cesium.Math.toRadians(targetHeading - heading);
      const pitchDiff = Cesium.Math.toRadians(targetPitch - pitch);
      
      // 检查是否在视场内
      if (Math.abs(headingDiff) > Cesium.Math.toRadians(horizontalFOV / 2) ||
          Math.abs(pitchDiff) > Cesium.Math.toRadians(verticalFOV / 2)) {
        return null; // 不在视场内
      }
      
      // 转换为像素坐标
      const pixelX = (headingDiff / Cesium.Math.toRadians(horizontalFOV)) * videoWidth + videoWidth / 2;
      const pixelY = videoHeight / 2 - (pitchDiff / Cesium.Math.toRadians(verticalFOV)) * videoHeight;
      
      // 验证计算结果
      if (!this.isValidNumber(pixelX) || !this.isValidNumber(pixelY)) {
        console.warn('像素坐标计算无效:', { pixelX, pixelY });
        return null;
      }
      
      return [pixelX, pixelY];
    } catch (error) {
      console.error('地理坐标转换出错:', error);
      return null;
    }
  }
  
  /**
   * 清除所有摄像头
   */
  clear() {
    // 移除所有实体
    for (const id of this.cameraEntities.keys()) {
      this.viewer.entities.remove(this.cameraEntities.get(id));
    }
    
    for (const id of this.frustumEntities.keys()) {
      this.viewer.entities.remove(this.frustumEntities.get(id));
    }
    
    // 清空集合
    this.cameras.clear();
    this.cameraEntities.clear();
    this.frustumEntities.clear();
    this.activeCameraId = null;
  }
}

export default CameraManager; 