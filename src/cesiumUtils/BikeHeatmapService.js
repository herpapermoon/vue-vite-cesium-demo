/**
 * 单车热力图服务
 * 提供基于单车分布数据生成实时热力图的功能
 */
import Cesium from '@/cesiumUtils/cesium';
import bikeStore from '@/cesiumUtils/BikeStore';

class BikeHeatmapService {
  constructor() {
    // 热力图状态
    this.isActive = false;
    this.viewer = null;
    this.updateInterval = 10000; // 10秒更新一次
    this.updateTimer = null;
    
    // 热力图实体
    this.heatmapEntity = null;
    
    // 道路边界数据
    this.roadBoundary = null;
    this.roadGeojson = null;
  }
  
  /**
   * 初始化热力图服务
   * @param {Cesium.Viewer} viewer Cesium查看器实例
   */
  initialize(viewer) {
    this.viewer = viewer;
    return this;
  }
  
  /**
   * 激活热力图显示
   * @returns {Promise<boolean>} 是否成功激活
   */
  async activate() {
    if (this.isActive) return true;
    
    if (!this.viewer) {
      console.error('热力图服务未初始化，请先调用 initialize 方法');
      return false;
    }
    
    try {
      // 加载道路边界数据
      await this.loadRoadBoundary();
      
      // 生成初始热力图
      await this.generateHeatmap();
      
      // 设置定时更新
      this.updateTimer = setInterval(() => {
        this.updateHeatmap();
      }, this.updateInterval);
      
      this.isActive = true;
      return true;
    } catch (error) {
      console.error('激活热力图失败:', error);
      this.deactivate();
      return false;
    }
  }
  
  /**
   * 停用热力图显示
   */
  deactivate() {
    // 清除更新定时器
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    
    // 移除热力图实体
    this.removeHeatmap();
    
    this.isActive = false;
  }
  
  /**
   * 加载道路边界数据
   * @returns {Promise<Object>} 边界数据
   */
  async loadRoadBoundary() {
    if (this.roadBoundary) return this.roadBoundary;
    
    try {
      const response = await fetch('/src/assets/ships/wlcroad.geojson');
      const data = await response.json();
      
      this.roadGeojson = data;
      
      // 提取所有坐标点，用于确定边界
      const allCoords = [];
      data.features.forEach(feature => {
        if (feature.geometry && feature.geometry.coordinates) {
          const coords = feature.geometry.coordinates;
          if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
            // MultiLineString
            coords.forEach(line => {
              line.forEach(coord => {
                allCoords.push(coord);
              });
            });
          } else if (Array.isArray(coords[0]) && !Array.isArray(coords[0][0])) {
            // LineString
            coords.forEach(coord => {
              allCoords.push(coord);
            });
          }
        }
      });
      
      // 计算边界
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
      
      allCoords.forEach(coord => {
        minLon = Math.min(minLon, coord[0]);
        maxLon = Math.max(maxLon, coord[0]);
        minLat = Math.min(minLat, coord[1]);
        maxLat = Math.max(maxLat, coord[1]);
      });
      
      // 扩展边界以覆盖周边区域
      const extendFactor = 0.001; // 约100米
      this.roadBoundary = {
        west: minLon - extendFactor,
        south: minLat - extendFactor,
        east: maxLon + extendFactor,
        north: maxLat + extendFactor,
        center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2]
      };
      
      return this.roadBoundary;
    } catch (error) {
      console.error('加载道路边界数据失败:', error);
      throw error;
    }
  }
  
  /**
   * 生成热力图
   * @returns {Promise<void>}
   */
  async generateHeatmap() {
    if (!this.viewer || !this.roadBoundary) {
      console.error('缺少必要数据，无法生成热力图');
      return;
    }
    
    // 清除现有热力图
    this.removeHeatmap();
    
    // 获取单车数据
    const bikeData = this.prepareBikeData();
    if (bikeData.length === 0) {
      console.log('没有单车数据，不生成热力图');
      return;
    }
    
    // 创建热力图材质
    const heatmapMaterial = this.createHeatmapMaterial(bikeData);
    
    // 创建矩形实体
    const rectangle = Cesium.Rectangle.fromDegrees(
      this.roadBoundary.west,
      this.roadBoundary.south,
      this.roadBoundary.east,
      this.roadBoundary.north
    );
    
    // 创建热力图实体
    this.heatmapEntity = this.viewer.entities.add({
      name: 'bike-heatmap',
      rectangle: {
        coordinates: rectangle,
        material: heatmapMaterial,
        height: 50, // 在地面上方50米处
        outline: true,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.2)
      }
    });
    
    // 飞行到热力图位置
    this.flyToHeatmap();
  }
  
  /**
   * 更新热力图
   */
  updateHeatmap() {
    if (!this.viewer || !this.heatmapEntity || !this.roadBoundary) {
      return;
    }
    
    // 获取最新单车数据
    const bikeData = this.prepareBikeData();
    if (bikeData.length === 0) {
      console.log('没有单车数据，不更新热力图');
      return;
    }
    
    // 创建新的热力图材质
    const heatmapMaterial = this.createHeatmapMaterial(bikeData);
    
    // 更新热力图材质
    this.heatmapEntity.rectangle.material = heatmapMaterial;
  }
  
  /**
   * 准备单车数据
   * @returns {Array} 单车数据点
   */
  prepareBikeData() {
    // 获取所有单车
    const bikes = bikeStore.getAllBikes();
    
    // 过滤在边界范围内的单车，并且确保坐标有效
    return bikes.filter(bike => {
      // 检查坐标是否存在且为有效数字
      if (!bike || typeof bike.longitude !== 'number' || typeof bike.latitude !== 'number' ||
          isNaN(bike.longitude) || isNaN(bike.latitude)) {
        return false;
      }
      
      // 检查是否在边界范围内
      return bike.longitude >= this.roadBoundary.west &&
             bike.longitude <= this.roadBoundary.east &&
             bike.latitude >= this.roadBoundary.south &&
             bike.latitude <= this.roadBoundary.north;
    }).map(bike => {
      return {
        longitude: bike.longitude,
        latitude: bike.latitude,
        weight: 1
      };
    });
  }
  
  /**
   * 创建热力图材质
   * @param {Array} bikeData 单车数据
   * @returns {Cesium.ImageMaterialProperty} 热力图材质
   */
  createHeatmapMaterial(bikeData) {
    // 创建画布
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // 清除画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 如果没有数据，返回空材质
    if (bikeData.length === 0) {
      return new Cesium.ImageMaterialProperty({
        image: canvas,
        transparent: true
      });
    }
    
    // 使用更简单的颜色方案替代彩虹色
    const heatColor = 'rgba(255, 0, 0, 0.8)'; // 热点中心颜色
    const fadeColor = 'rgba(255, 0, 0, 0)';   // 热点边缘颜色
    
    // 转换坐标并筛选有效点
    const points = bikeData.map(bike => {
      // 计算画布坐标
      const x = ((bike.longitude - this.roadBoundary.west) / (this.roadBoundary.east - this.roadBoundary.west)) * canvas.width;
      const y = ((bike.latitude - this.roadBoundary.south) / (this.roadBoundary.north - this.roadBoundary.south)) * canvas.height;
      
      // 确保坐标在画布范围内
      return { 
        x: Math.max(0, Math.min(canvas.width, x)), 
        y: Math.max(0, Math.min(canvas.height, y)), 
        weight: bike.weight 
      };
    }).filter(point => {
      // 过滤无效点
      return !isNaN(point.x) && !isNaN(point.y);
    });
    
    // 在画布上绘制热力点
    points.forEach(point => {
      // 根据数据密度调整半径
      const radius = 20; // 调整热点大小
      const intensity = 0.5; // 固定热点强度以避免过度透明
      
      // 创建径向渐变
      const radialGradient = ctx.createRadialGradient(
        point.x, point.y, 0,
        point.x, point.y, radius
      );
      
      // 简化渐变，只使用红色到透明
      radialGradient.addColorStop(0, heatColor);
      radialGradient.addColorStop(1, fadeColor);
      
      // 绘制热点
      ctx.beginPath();
      ctx.fillStyle = radialGradient;
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // 后处理 - 增强对比度和清晰度
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 增强对比度并移除可能的噪点
    for (let i = 0; i < data.length; i += 4) {
      // 如果红色通道很低（<10），则完全清除像素，避免低强度噪点
      if (data[i] < 10) {
        data[i] = 0;     // R
        data[i + 1] = 0; // G
        data[i + 2] = 0; // B
        data[i + 3] = 0; // A
      }
      // 否则增强对比度
      else if (data[i + 3] > 0) {
        // 保持红色为主色调
        data[i] = Math.min(255, data[i] * 1.2);    // 增强红色
        data[i + 1] = Math.min(255, data[i + 1] * 0.8); // 降低绿色
        data[i + 2] = Math.min(255, data[i + 2] * 0.8); // 降低蓝色
      }
    }
    
    // 将处理后的图像数据放回画布
    ctx.putImageData(imageData, 0, 0);
    
    // 创建材质
    return new Cesium.ImageMaterialProperty({
      image: canvas,
      transparent: true
    });
  }
  
  /**
   * 移除热力图
   */
  removeHeatmap() {
    if (this.viewer && this.heatmapEntity) {
      this.viewer.entities.remove(this.heatmapEntity);
      this.heatmapEntity = null;
    }
  }
  
  /**
   * 飞行到热力图位置
   */
  flyToHeatmap() {
    if (!this.viewer || !this.roadBoundary) return;
    
    const center = this.roadBoundary.center;
    const destination = Cesium.Cartesian3.fromDegrees(
      center[0], 
      center[1], 
      300 // 高度300米
    );
    
    this.viewer.camera.flyTo({
      destination: destination,
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-50), // 俯视角度
        roll: 0.0
      },
      duration: 2.0
    });
  }
  
  /**
   * 切换热力图显示状态
   * @returns {Promise<boolean>} 最终状态
   */
  async toggle() {
    if (this.isActive) {
      this.deactivate();
      return false;
    } else {
      return await this.activate();
    }
  }
}

// 创建单例实例
const heatmapService = new BikeHeatmapService();

export default heatmapService;