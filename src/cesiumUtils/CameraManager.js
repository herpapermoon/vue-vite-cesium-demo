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
   * 计算摄像头覆盖区域
   * @param {Object} camera 摄像头信息
   * @returns {Cesium.Rectangle} 覆盖区域
   */
  calculateCoverageRectangle(camera) {
    const [longitude, latitude, height] = camera.position;
    const [heading, pitch, roll] = camera.direction;
    const { horizontalFOV, verticalFOV, maxDistance } = camera;
    
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
      
      corners.push({ longitude: cornerLon, latitude: cornerLat });
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
    const camera = this.getActiveCamera();
    if (!camera) return null;
    
    const [longitude, latitude, height] = camera.position;
    const [heading, pitch, roll] = camera.direction;
    const { horizontalFOV, verticalFOV } = camera;
    
    // 将像素坐标转换为视场内的角度
    // 图像中心为(videoWidth/2, videoHeight/2)
    const pixelX = x - videoWidth / 2;
    const pixelY = videoHeight / 2 - y; // 反转Y轴，使上为正方向
    
    // 计算角度偏移
    const angleX = (pixelX / videoWidth) * Cesium.Math.toRadians(horizontalFOV);
    const angleY = (pixelY / videoHeight) * Cesium.Math.toRadians(verticalFOV);
    
    // 计算实际方向角度
    const headingRad = Cesium.Math.toRadians(heading) + angleX;
    const pitchRad = Cesium.Math.toRadians(pitch) + angleY;
    
    // 计算3D位置偏移
    const horizontalDistance = estimatedDistance * Math.cos(pitchRad);
    const verticalDistance = estimatedDistance * Math.sin(pitchRad);
    
    // 计算经纬度偏移
    const latFactor = 1.0 / 111000.0; // 大约每111km对应1度纬度
    const lonFactor = 1.0 / (111000.0 * Math.cos(Cesium.Math.toRadians(latitude))); // 经度因子
    
    const endLon = longitude + horizontalDistance * Math.sin(headingRad) * lonFactor;
    const endLat = latitude + horizontalDistance * Math.cos(headingRad) * latFactor;
    const endHeight = height + verticalDistance;
    
    return [endLon, endLat, endHeight];
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
    const camera = this.getActiveCamera();
    if (!camera) return null;
    
    const [camLon, camLat, camHeight] = camera.position;
    const [heading, pitch, roll] = camera.direction;
    const { horizontalFOV, verticalFOV } = camera;
    
    // 计算目标点相对于摄像头的方向
    const latDistance = (latitude - camLat) * 111000.0; // 纬度差转米
    const lonDistance = (longitude - camLon) * 111000.0 * Math.cos(Cesium.Math.toRadians(camLat)); // 经度差转米
    const heightDifference = altitude - camHeight;
    
    // 计算水平距离和方位角
    const horizontalDistance = Math.sqrt(latDistance * latDistance + lonDistance * lonDistance);
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
    
    return [pixelX, pixelY];
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