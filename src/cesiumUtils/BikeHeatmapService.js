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
    
    // 创建密度网格
    const gridSize = 20; // 网格大小
    const rows = Math.ceil(canvas.height / gridSize);
    const cols = Math.ceil(canvas.width / gridSize);
    const densityGrid = Array(rows).fill().map(() => Array(cols).fill(0));
    
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
    
    // 计算每个网格的密度
    points.forEach(point => {
      const gridX = Math.floor(point.x / gridSize);
      const gridY = Math.floor(point.y / gridSize);
      
      if (gridX >= 0 && gridX < cols && gridY >= 0 && gridY < rows) {
        densityGrid[gridY][gridX] += point.weight;
      }
    });
    
    // 找出最大密度值
    let maxDensity = 0;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        maxDensity = Math.max(maxDensity, densityGrid[i][j]);
      }
    }
    
    // 定义颜色分级 - 从蓝色(冷)到红色(热)的渐变
    const getColorForDensity = (density) => {
      const normalizedDensity = density / maxDensity;
      
      // 颜色分级 (5级)
      if (normalizedDensity < 0.2) {
        return 'rgba(0, 0, 255, 0.7)';  // 蓝色 - 非常低密度
      } else if (normalizedDensity < 0.4) {
        return 'rgba(0, 255, 255, 0.7)'; // 青色 - 低密度
      } else if (normalizedDensity < 0.6) {
        return 'rgba(0, 255, 0, 0.7)';   // 绿色 - 中等密度
      } else if (normalizedDensity < 0.8) {
        return 'rgba(255, 255, 0, 0.7)';  // 黄色 - 高密度
      } else {
        return 'rgba(255, 0, 0, 0.7)';    // 红色 - 非常高密度
      }
    };
    
    // 绘制热力点
    points.forEach(point => {
      const gridX = Math.floor(point.x / gridSize);
      const gridY = Math.floor(point.y / gridSize);
      
      if (gridX >= 0 && gridX < cols && gridY >= 0 && gridY < rows) {
        const density = densityGrid[gridY][gridX];
        const radius = 25; // 热点半径
        
        // 根据密度获取颜色
        const centerColor = getColorForDensity(density);
        // 透明版本用于渐变边缘
        const fadeColor = centerColor.replace(/[\d.]+\)$/, '0)');
        
        // 创建径向渐变
        const radialGradient = ctx.createRadialGradient(
          point.x, point.y, 0,
          point.x, point.y, radius
        );
        
        radialGradient.addColorStop(0, centerColor);
        radialGradient.addColorStop(1, fadeColor);
        
        // 绘制热点
        ctx.beginPath();
        ctx.fillStyle = radialGradient;
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    
    // 后处理 - 增强对比度和清晰度
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 增强对比度
    for (let i = 0; i < data.length; i += 4) {
      // 如果透明度很低，则完全清除像素
      if (data[i + 3] < 20) {
        data[i] = 0;     // R
        data[i + 1] = 0; // G
        data[i + 2] = 0; // B
        data[i + 3] = 0; // A
      }
      // 否则增强对比度
      else if (data[i + 3] > 0) {
        data[i] = Math.min(255, data[i] * 1.1);     // R
        data[i + 1] = Math.min(255, data[i + 1] * 1.1); // G
        data[i + 2] = Math.min(255, data[i + 2] * 1.1); // B
      }
    }
    
    // 将处理后的图像数据放回画布
    ctx.putImageData(imageData, 0, 0);
    
    // 绘制颜色图例 (可选)
    this.drawLegend(ctx, canvas.width, canvas.height);
    
    // 创建材质
    return new Cesium.ImageMaterialProperty({
      image: canvas,
      transparent: true
    });
  }
  
  /**
   * 在画布上绘制颜色图例
   * @param {CanvasRenderingContext2D} ctx 画布上下文
   * @param {number} width 画布宽度
   * @param {number} height 画布高度
   */
  drawLegend(ctx, width, height) {
    const legendWidth = 150;
    const legendHeight = 20;
    const legendX = width - legendWidth - 10;
    const legendY = height - legendHeight - 10;
    
    // 绘制图例背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(legendX - 5, legendY - 25, legendWidth + 10, legendHeight + 30);
    
    // 绘制颜色条
    const gradient = ctx.createLinearGradient(legendX, 0, legendX + legendWidth, 0);
    gradient.addColorStop(0, 'rgba(0, 0, 255, 0.7)');    // 蓝色 - 非常低密度
    gradient.addColorStop(0.25, 'rgba(0, 255, 255, 0.7)'); // 青色 - 低密度
    gradient.addColorStop(0.5, 'rgba(0, 255, 0, 0.7)');   // 绿色 - 中等密度
    gradient.addColorStop(0.75, 'rgba(255, 255, 0, 0.7)');  // 黄色 - 高密度
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0.7)');    // 红色 - 非常高密度
    
    ctx.fillStyle = gradient;
    ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
    
    // 添加图例标题
    ctx.fillStyle = 'black';
    ctx.font = '12px Arial';
    ctx.fillText('单车密度', legendX, legendY - 10);
    
    // 添加图例标签
    ctx.fillText('低', legendX, legendY + legendHeight + 15);
    ctx.fillText('高', legendX + legendWidth - 15, legendY + legendHeight + 15);
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