/**
 * 单车可视化工具
 * 提供单车在Cesium地图上的可视化功能
 */
import Cesium from '@/cesiumUtils/cesium';

class BikeVisualizer {
  constructor(viewer) {
    this.viewer = viewer;
    this.highlightedBikes = new Map(); // 存储高亮显示的单车
    this.highlightColor = Cesium.Color.YELLOW.withAlpha(0.7);
    this.statusColors = {
      available: Cesium.Color.GREEN.withAlpha(0.7),
      inUse: Cesium.Color.BLUE.withAlpha(0.7),
      maintenance: Cesium.Color.ORANGE.withAlpha(0.7),
      lowBattery: Cesium.Color.RED.withAlpha(0.7)
    };
  }

  /**
   * 定位到指定的单车
   * @param {Array} bikes - 单车对象数组
   * @returns {Boolean} 是否成功定位
   */
  locateBikes(bikes) {
    if (!this.viewer || !bikes.length) return false;

    // 清除之前的高亮
    this.clearHighlights();
    
    // 计算所有单车的矩形区域
    const positions = bikes.map(bike => 
      Cesium.Cartesian3.fromDegrees(bike.longitude, bike.latitude)
    );
    
    // 创建包围盒
    const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
    
    // 放大系数，确保视野能看到所有单车
    const zoomFactor = bikes.length > 1 ? 1.5 : 1.0;
    
    // 飞行到该区域
    this.viewer.camera.flyToBoundingSphere(boundingSphere, {
      duration: 1.5,
      offset: new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(-45),
        boundingSphere.radius * zoomFactor
      )
    });
    
    // 高亮显示这些单车
    bikes.forEach(bike => this.highlightBike(bike));
    
    return true;
  }
  
  /**
   * 高亮显示单车
   * @param {Object} bike - 单车对象
   * @returns {Boolean} 是否成功高亮
   */
  highlightBike(bike) {
    if (!this.viewer || !bike) return false;
    
    // 如果已经高亮，先移除
    this.removeHighlight(bike.id);
    
    // 创建高亮圆圈
    const position = Cesium.Cartesian3.fromDegrees(bike.longitude, bike.latitude);
    const highlight = this.viewer.entities.add({
      position,
      ellipse: {
        semiMinorAxis: 10,
        semiMajorAxis: 10,
        material: this.highlightColor,
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        height: 0.5
      },
      label: {
        text: `ID: ${bike.id.substring(0, 8)}...\n电量: ${bike.batteryLevel}%`,
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        showBackground: true,
        backgroundColor: new Cesium.Color(0.1, 0.1, 0.1, 0.7)
      },
      bike: bike // 存储单车数据引用以便后续使用
    });
    
    // 保存高亮引用
    this.highlightedBikes.set(bike.id, highlight);
    
    // 添加闪烁动画
    this.addPulseEffect(highlight);
    
    return true;
  }
  
  /**
   * 添加脉冲动画效果
   * @param {Object} entity - 要添加效果的实体
   */
  addPulseEffect(entity) {
    let alpha = 0.7;
    let increasing = false;
    
    // 创建脉冲效果
    const pulseInterval = setInterval(() => {
      if (increasing) {
        alpha += 0.03;
        if (alpha >= 0.8) increasing = false;
      } else {
        alpha -= 0.03;
        if (alpha <= 0.4) increasing = true;
      }
      
      if (entity && entity.ellipse) {
        entity.ellipse.material = this.highlightColor.withAlpha(alpha);
      } else {
        clearInterval(pulseInterval);
      }
    }, 50);
    
    // 存储脉冲效果引用
    entity.pulseInterval = pulseInterval;
  }
  
  /**
   * 移除单车高亮
   * @param {String} bikeId - 单车ID
   * @returns {Boolean} 是否成功移除
   */
  removeHighlight(bikeId) {
    if (!this.viewer || !bikeId) return false;
    
    const entity = this.highlightedBikes.get(bikeId);
    if (entity) {
      // 清除脉冲效果
      if (entity.pulseInterval) {
        clearInterval(entity.pulseInterval);
      }
      
      // 移除实体
      this.viewer.entities.remove(entity);
      this.highlightedBikes.delete(bikeId);
      return true;
    }
    
    return false;
  }
  
  /**
   * 清除所有高亮
   */
  clearHighlights() {
    if (!this.viewer) return;
    
    // 清除脉冲效果
    this.highlightedBikes.forEach(entity => {
      if (entity.pulseInterval) {
        clearInterval(entity.pulseInterval);
      }
    });
    
    // 移除所有高亮实体
    this.highlightedBikes.forEach(entity => {
      this.viewer.entities.remove(entity);
    });
    
    this.highlightedBikes.clear();
  }
  
  /**
   * 根据状态可视化单车
   * @param {Array} bikes - 单车数组
   * @param {String} status - 状态（可选）
   * @returns {Number} 可视化的单车数量
   */
  visualizeByStatus(bikes, status = null) {
    if (!this.viewer || !bikes.length) return 0;
    
    // 清除之前的高亮
    this.clearHighlights();
    
    // 过滤特定状态的单车
    const filteredBikes = status ? 
      bikes.filter(bike => bike.status === status) : 
      bikes;
    
    // 高亮显示这些单车
    filteredBikes.forEach(bike => {
      const position = Cesium.Cartesian3.fromDegrees(bike.longitude, bike.latitude);
      const statusColor = this.statusColors[bike.status] || Cesium.Color.WHITE.withAlpha(0.7);
      
      const entity = this.viewer.entities.add({
        position,
        ellipse: {
          semiMinorAxis: 8,
          semiMajorAxis: 8,
          material: statusColor,
          height: 0.5
        },
        bike
      });
      
      this.highlightedBikes.set(bike.id, entity);
    });
    
    // 调整视图以显示所有单车
    if (filteredBikes.length > 0) {
      const positions = filteredBikes.map(bike => 
        Cesium.Cartesian3.fromDegrees(bike.longitude, bike.latitude)
      );
      
      const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
      this.viewer.camera.flyToBoundingSphere(boundingSphere, {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(
          0,
          Cesium.Math.toRadians(-45),
          boundingSphere.radius * 2.0
        )
      });
    }
    
    return filteredBikes.length;
  }
}

// 创建单例
let instance = null;

export default {
  /**
   * 获取BikeVisualizer实例
   * @param {Object} viewer - Cesium viewer对象
   * @returns {BikeVisualizer} 实例对象
   */
  getInstance(viewer) {
    if (!instance && viewer) {
      instance = new BikeVisualizer(viewer);
    }
    return instance;
  }
};
