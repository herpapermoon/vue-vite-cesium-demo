// 通视分析
import Cesium from '@/cesiumUtils/cesium'

/**
 * 通视度分析类
 * 提供交互式点选进行通视分析功能
 */
export class VisionAnalysis {
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.visionLines = []; // 存储创建的线实体
    this.markerEntities = []; // 存储创建的点标记实体
    this.startPoint = null; // 起始点
    this.endPoint = null; // 终点
    this.interactive = (typeof options.interactive === 'boolean') ? options.interactive : false; // 是否允许交互式选点
    this.pointSelectionHandler = null; // 点选事件处理器
    
    // 如果启用了交互模式，初始化点选功能
    if (this.interactive) {
      this.enablePointSelection();
    }
  }
  
  /**
   * 启用交互式点选功能
   */
  enablePointSelection() {
    // 清除已有的处理器
    this.disablePointSelection();
    
    // 状态变量
    let selectionMode = 'startpoint'; // 'startpoint' 或 'endpoint'
    
    // 创建新的事件处理器
    this.pointSelectionHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    
    // 处理左键点击事件
    this.pointSelectionHandler.setInputAction((click) => {
      const ray = this.viewer.camera.getPickRay(click.position);
      const position = this.viewer.scene.globe.pick(ray, this.viewer.scene);
      
      if (Cesium.defined(position)) {
        if (selectionMode === 'startpoint') {
          // 设置起始点
          this.startPoint = position;
          
          // 添加起始点标记
          this.addMarker(position, Cesium.Color.BLUE, '起始点');
          
          // 提示用户选择终点
          this.showInfoMessage('请点击选择终点位置');
          selectionMode = 'endpoint';
        } else {
          // 设置终点
          this.endPoint = position;
          
          // 添加终点标记
          this.addMarker(position, Cesium.Color.YELLOW, '终点');
          
          // 执行通视度分析
          this.performAnalysis();
          
          // 重置选择模式，允许用户继续添加新的分析线
          selectionMode = 'startpoint';
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }
  
  /**
   * 禁用交互式点选功能
   */
  disablePointSelection() {
    if (this.pointSelectionHandler) {
      this.pointSelectionHandler.destroy();
      this.pointSelectionHandler = null;
    }
  }
  
  /**
   * 添加标记点
   * @param {Cesium.Cartesian3} position 点位置
   * @param {Cesium.Color} color 点颜色
   * @param {String} label 标签文本
   * @returns {Cesium.Entity} 创建的实体
   */
  addMarker(position, color, label) {
    const entity = this.viewer.entities.add({
      position: position,
      point: {
        pixelSize: 10,
        color: color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2
      },
      label: label ? {
        text: label,
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10)
      } : undefined
    });
    
    // 将标记添加到数组以便后续清理
    this.markerEntities.push(entity);
    
    return entity;
  }
  
  /**
   * 显示信息提示
   * @param {String} message 提示消息
   */
  showInfoMessage(message) {
    // 如果在实际环境中，可以使用更友好的UI提示
    // 这里使用简单的alert作为示例
    alert(message);
  }
  
  /**
   * 执行通视度分析
   */
  performAnalysis() {
    if (!this.startPoint || !this.endPoint) {
      return;
    }
    
    // 计算射线的方向
    const direction = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(
        this.endPoint,
        this.startPoint,
        new Cesium.Cartesian3()
      ),
      new Cesium.Cartesian3()
    );
    
    // 建立射线
    const ray = new Cesium.Ray(this.startPoint, direction);
    const result = this.viewer.scene.globe.pick(ray, this.viewer.scene); // 计算交互点，返回第一个
    
    if (result !== undefined && result !== null) {
      // 有交点，说明存在不可见区域
      this.drawLine(result, this.startPoint, Cesium.Color.GREEN); // 可视区域
      this.drawLine(result, this.endPoint, Cesium.Color.RED); // 不可视区域
      
      // 在交点添加标记
      this.addMarker(result, Cesium.Color.WHITE, '遮挡点');
    } else {
      // 无交点，全程可见
      this.drawLine(this.startPoint, this.endPoint, Cesium.Color.GREEN);
    }
  }
  
  /**
   * 绘制线
   * @param {Cesium.Cartesian3} startPos 起始位置
   * @param {Cesium.Cartesian3} endPos 终止位置
   * @param {Cesium.Color} color 线颜色
   */
  drawLine(startPos, endPos, color = Cesium.Color.GREEN) {
    const line = this.viewer.entities.add({
      polyline: {
        positions: [startPos, endPos],
        width: 2,
        material: color,
        depthFailMaterial: color
      }
    });
    this.visionLines.push(line);
  }
  
  /**
   * 使用指定位置进行通视度分析
   * @param {Array<Array>} positions 坐标数组，格式为 [[lon1, lat1, height1], [lon2, lat2, height2]]
   */
  analysisWithPositions(positions) {
    // 转换为Cartesian3坐标
    this.startPoint = Cesium.Cartesian3.fromDegrees(...positions[0]);
    this.endPoint = Cesium.Cartesian3.fromDegrees(...positions[1]);
    
    // 添加标记
    this.addMarker(this.startPoint, Cesium.Color.BLUE, '起始点');
    this.addMarker(this.endPoint, Cesium.Color.YELLOW, '终点');
    
    // 执行分析
    this.performAnalysis();
  }
  
  /**
   * 清除所有分析结果
   */
  clear() {
    // 清除所有线实体
    if (this.visionLines && this.visionLines.length > 0) {
      for (const entity of this.visionLines) {
        this.viewer.entities.remove(entity);
      }
      this.visionLines = [];
    }
    
    // 清除所有标记实体
    if (this.markerEntities && this.markerEntities.length > 0) {
      for (const entity of this.markerEntities) {
        this.viewer.entities.remove(entity);
      }
      this.markerEntities = [];
    }
    
    this.startPoint = null;
    this.endPoint = null;
  }
  
  /**
   * 销毁实例，清理资源
   */
  destroy() {
    this.clear();
    this.disablePointSelection();
  }
}

// 保持兼容原来的函数式API

const visionLinesArr = [];

/**
 * 进行通视分析 (函数式API，向后兼容)
 * @param {Object} viewer viewer
 * @param {Array<Array>} poss 起点终点的位置数组 [[lon1, lat1, height1], [lon2, lat2, height2]]
 */
export function analysisVisible(viewer, poss) {
  const positions = [Cesium.Cartesian3.fromDegrees(...poss[0]), Cesium.Cartesian3.fromDegrees(...poss[1])];
  // 计算射线的方向
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(
      positions[1],
      positions[0],
      new Cesium.Cartesian3()
    ),
    new Cesium.Cartesian3()
  );
  // 建立射线
  const ray = new Cesium.Ray(positions[0], direction);
  const result = viewer.scene.globe.pick(ray, viewer.scene); // 计算交互点，返回第一个
  if (result !== undefined && result !== null) {
    drawLine(viewer, result, positions[0], Cesium.Color.GREEN); // 可视区域
    drawLine(viewer, result, positions[1], Cesium.Color.RED); // 不可视区域
  } else {
    drawLine(viewer, positions[0], positions[1], Cesium.Color.GREEN);
  }
}

/**
 * 绘制线 (函数式API，向后兼容)
 */
function drawLine(viewer, startPos, endPos, color = Cesium.Color.GREEN) {
  visionLinesArr.push(viewer.entities.add({
    polyline: {
      positions: [startPos, endPos],
      width: 2,
      material: color,
      depthFailMaterial: color
    }
  }));
}

/**
 * 清除所有线 (函数式API，向后兼容)
 */
export function clearLine(viewer) {
  if (visionLinesArr.length) {
    visionLinesArr.forEach((entity) => {
      viewer.entities.remove(entity);
    });
    visionLinesArr.length = 0;
  }
}
