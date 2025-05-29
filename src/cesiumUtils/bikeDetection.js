import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
class BikeDetection {
  constructor(viewer) {
    this.viewer = viewer;
    this.model = null;
    this.isRunning = false;
    this.videoElement = null;
    this.canvas = null;
    this.ctx = null;
    // this.bikePositionManager = new BikePositionManager(viewer); // 暂时禁用位置管理
    this.detectInterval = null;
    this.detectedBikes = new Map(); // 存储检测到的单车ID和位置
    this.previousBikes = new Map(); // 存储上一帧检测到的单车
    this.bikeTrackingInfo = new Map(); // 存储单车追踪信息，包括ID和历史位置
    this.nextTrackingId = 1; // 跟踪ID计数器
    this.bikeDisappearTimeout = 10; // 单车消失多少帧后移除跟踪，单位：帧数，放宽到10帧
    this.maxTrackingDistance = 150; // 最大追踪距离，单位：像素，放宽到150像素
    this.eventListeners = new Map(); // 存储事件监听器
  }

  // 添加事件监听器
  on(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName).push(callback);
  }

  // 触发事件
  emit(eventName, data) {
    if (this.eventListeners.has(eventName)) {
      this.eventListeners.get(eventName).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`事件处理出错 (${eventName}):`, error);
        }
      });
    }
  }

  // 初始化检测器
  async initialize(videoElementId) {
    try {
      // 加载COCO-SSD模型
      console.log('正在加载目标检测模型...');
      this.model = await cocossd.load({
        base: 'lite_mobilenet_v2' // 使用轻量级模型以提高性能
      });
      console.log('目标检测模型加载完成');

      // 设置视频元素
      this.videoElement = document.getElementById(videoElementId);
      if (!this.videoElement) {
        console.error('找不到视频元素:', videoElementId);
        return false;
      }
      
      // 使用HTML中已定义的canvas
      this.canvas = document.getElementById('detectionCanvas');
      if (!this.canvas) {
        console.error('找不到检测画布元素');
        return false;
      }
      
      // 设置2D上下文
      this.ctx = this.canvas.getContext('2d');
      
      // 调整canvas尺寸以匹配视频
      this.resizeCanvas();
      
      // 添加窗口大小变化事件监听器
      window.addEventListener('resize', () => {
        this.resizeCanvas();
      });
      
      console.log('检测器初始化完成');
      this.emit('initialized', true);
      return true;
    } catch (error) {
      console.error('初始化单车检测失败:', error);
      this.emit('error', { type: 'init', message: error.message });
      return false;
    }
  }

  // 开始检测
  async startDetection() {
    if (!this.model) {
      console.error('模型未加载，无法开始检测');
      this.emit('error', { type: 'model', message: '模型未加载' });
      return false;
    }
    
    if (!this.videoElement) {
      console.error('视频元素未找到，无法开始检测');
      this.emit('error', { type: 'video', message: '视频元素未找到' });
      return false;
    }
    
    if (this.isRunning) {
      console.log('检测已在运行中');
      return true;
    }

    // 确保视频已准备好
    if (this.videoElement.readyState < 2) { // HAVE_CURRENT_DATA
      console.log('视频尚未准备好，等待视频数据...');
      
      try {
        await new Promise((resolve, reject) => {
          const loadHandler = () => {
            console.log('视频数据已加载');
            cleanup();
            resolve();
          };
          
          const errorHandler = (e) => {
            console.error('视频加载出错:', e);
            cleanup();
            reject(new Error('视频加载失败'));
          };
          
          const cleanup = () => {
            this.videoElement.removeEventListener('loadeddata', loadHandler);
            this.videoElement.removeEventListener('canplay', loadHandler);
            this.videoElement.removeEventListener('error', errorHandler);
          };
          
          this.videoElement.addEventListener('loadeddata', loadHandler, { once: true });
          this.videoElement.addEventListener('canplay', loadHandler, { once: true });
          this.videoElement.addEventListener('error', errorHandler, { once: true });
          
          // 设置超时，防止无限等待
          setTimeout(() => {
            if (this.videoElement.readyState >= 2 || this.videoElement.videoWidth > 0) {
              cleanup();
              resolve();
            } else {
              cleanup();
              reject(new Error('视频加载超时'));
            }
          }, 5000);
        });
      } catch (error) {
        console.warn('等待视频就绪出错:', error);
        // 如果视频确实有尺寸，我们仍然继续尝试
        if (!(this.videoElement.videoWidth > 0)) {
          this.emit('error', { type: 'video', message: '视频未准备好' });
          return false;
        }
      }
    }
    
    // 启动检测
    this.isRunning = true;
    this.resizeCanvas();
    
    // 先清空检测结果，并发送初始值0
    this.detectedBikes.clear();
    this.previousBikes.clear();
    this.bikeTrackingInfo.clear();
    this.nextTrackingId = 1;
    this.emit('detection', { count: 0, bikes: [] });
    
    // 开始定期检测
    this.detectInterval = setInterval(() => {
      if (this.videoElement.readyState >= 2) {
        this.detectFrame();
      }
    }, 1000); // 每1000ms检测一次，降低频率提高稳定性
    
    this.emit('started', true);
    console.log('单车检测已启动');
    return true;
  }

  // 停止检测
  stopDetection() {
    if (!this.isRunning) return true;
    
    this.isRunning = false;
    
    if (this.detectInterval) {
      clearInterval(this.detectInterval);
      this.detectInterval = null;
    }
    
    // 清除检测结果
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    // 清除地图上的实体
    this.detectedBikes.clear();
    this.previousBikes.clear();
    this.bikeTrackingInfo.clear();
    // this.bikePositionManager.clearAllBikes();
    
    // 发送检测停止事件
    this.emit('detection', { count: 0, bikes: [] });
    this.emit('stopped', true);
    
    console.log('单车检测已停止');
    return true;
  }

  // 调整canvas大小
  resizeCanvas() {
    if (!this.canvas || !this.videoElement) return;
    
    // 获取视频容器的尺寸
    const videoWrapper = this.videoElement.closest('.video-wrapper');
    if (!videoWrapper) return;
    
    const wrapperWidth = videoWrapper.clientWidth;
    const wrapperHeight = videoWrapper.clientHeight;
    
    // 更新canvas尺寸
    this.canvas.width = wrapperWidth;
    this.canvas.height = wrapperHeight;
  }

  // 计算两个点之间的欧几里得距离
  calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  // 计算两个矩形的IoU (Intersection over Union)
  calculateIoU(box1, box2) {
    // 获取两个矩形的坐标
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;
    
    // 计算矩形的右下角坐标
    const x1_right = x1 + w1;
    const y1_bottom = y1 + h1;
    const x2_right = x2 + w2;
    const y2_bottom = y2 + h2;
    
    // 计算交集的坐标
    const x_overlap = Math.max(0, Math.min(x1_right, x2_right) - Math.max(x1, x2));
    const y_overlap = Math.max(0, Math.min(y1_bottom, y2_bottom) - Math.max(y1, y2));
    
    // 计算交集面积
    const intersectionArea = x_overlap * y_overlap;
    
    // 计算两个矩形的面积
    const box1Area = w1 * h1;
    const box2Area = w2 * h2;
    
    // 计算并集面积
    const unionArea = box1Area + box2Area - intersectionArea;
    
    // 计算IoU
    return unionArea > 0 ? intersectionArea / unionArea : 0;
  }

  // 匹配当前帧和前一帧的单车
  matchBikes(currentBikes) {
    // 创建匹配结果存储
    const matchedBikes = new Map();
    const unmatched = [...currentBikes];
    
    // 如果是第一帧或前一帧没有单车，则所有单车都是新的
    if (this.previousBikes.size === 0) {
      return { matchedBikes, unmatched };
    }
    
    // 对于每个当前帧中的单车，尝试匹配前一帧中的单车
    for (let i = unmatched.length - 1; i >= 0; i--) {
      const currentBike = unmatched[i];
      const currentBox = [currentBike.x - currentBike.width/2, currentBike.y - currentBike.height/2, 
                           currentBike.width, currentBike.height];
      
      let bestMatch = null;
      let bestScore = -1;
      let bestTrackingId = null;
      
      // 遍历前一帧中的所有单车
      for (const [trackingId, prevBike] of this.bikeTrackingInfo.entries()) {
        // 如果单车已经消失了设定的帧数，则不再考虑匹配
        if (prevBike.missedFrames > this.bikeDisappearTimeout) continue;
        
        // 获取最近一次位置
        const lastPosition = prevBike.positions[prevBike.positions.length - 1];
        if (!lastPosition) continue;
        
        // 计算距离分数
        const distance = this.calculateDistance(
          currentBike.x, currentBike.y, 
          lastPosition.x, lastPosition.y
        );
        
        // 如果距离太远，不考虑匹配
        if (distance > this.maxTrackingDistance) continue;
        
        // 计算IoU分数
        const prevBox = [lastPosition.x - lastPosition.width/2, lastPosition.y - lastPosition.height/2, 
                          lastPosition.width, lastPosition.height];
        const iou = this.calculateIoU(currentBox, prevBox);
        
        // 综合考虑距离和IoU进行评分，为推车场景优化权重
        // 为距离给予更高权重，因为推车时形状可能会变化但位置相对接近
        const distanceScore = 1 - Math.min(distance / this.maxTrackingDistance, 1);
        const score = iou * 0.3 + distanceScore * 0.7; // 调整权重，距离因素权重更高
        
        // 更新最佳匹配，降低阈值，更容易匹配
        if (score > bestScore && score > 0.2) { // 降低阈值到0.2
          bestScore = score;
          bestMatch = prevBike;
          bestTrackingId = trackingId;
        }
      }
      
      // 如果找到匹配，更新匹配结果
      if (bestMatch && bestTrackingId) {
        matchedBikes.set(bestTrackingId, currentBike);
        unmatched.splice(i, 1); // 从未匹配列表中移除
      }
    }
    
    // 特殊处理：如果同一区域检测到多辆单车，可能是因为推车造成的多重检测
    // 尝试合并非常接近的未匹配单车
    this.mergeCloseBikes(unmatched);
    
    return { matchedBikes, unmatched };
  }

  // 合并非常接近的单车检测结果，解决推车问题
  mergeCloseBikes(bikes) {
    const mergeDistance = 30; // 合并阈值，单位：像素
    
    for (let i = bikes.length - 1; i >= 0; i--) {
      for (let j = i - 1; j >= 0; j--) {
        const bikeA = bikes[i];
        const bikeB = bikes[j];
        
        // 计算两辆单车中心点距离
        const distance = this.calculateDistance(bikeA.x, bikeA.y, bikeB.x, bikeB.y);
        
        // 如果距离小于阈值，认为是同一辆单车的多次检测，移除其中一个
        if (distance < mergeDistance) {
          // 保留置信度更高的检测结果
          if (bikeA.confidence < bikeB.confidence) {
            bikes.splice(i, 1);
          } else {
            bikes.splice(j, 1);
          }
          break; // 跳出内层循环，外层循环会自动调整i值
        }
      }
    }
  }

  // 更新跟踪信息
  updateTrackingInfo(matchedBikes, newBikes) {
    // 更新已匹配单车的信息
    for (const [trackingId, bikeData] of matchedBikes.entries()) {
      const trackInfo = this.bikeTrackingInfo.get(trackingId);
      if (trackInfo) {
        // 更新位置历史
        trackInfo.positions.push({...bikeData});
        // 限制历史位置数量，避免内存占用过大
        if (trackInfo.positions.length > 20) { // 增加历史位置数量到20，提高追踪稳定性
          trackInfo.positions.shift();
        }
        // 重置消失计数
        trackInfo.missedFrames = 0;
        // 更新最后出现时间
        trackInfo.lastSeen = Date.now();
      }
    }
    
    // 为未匹配的单车创建新的跟踪信息
    for (const newBike of newBikes) {
      const trackingId = `bike-${this.nextTrackingId++}`;
      this.bikeTrackingInfo.set(trackingId, {
        positions: [{...newBike}],
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        missedFrames: 0,
        type: newBike.type
      });
      // 添加到匹配结果中
      matchedBikes.set(trackingId, newBike);
    }
    
    // 更新未在当前帧中出现的单车的消失计数
    for (const [trackingId, trackInfo] of this.bikeTrackingInfo.entries()) {
      if (!matchedBikes.has(trackingId)) {
        trackInfo.missedFrames += 1;
      }
    }
    
    // 清理长时间未被检测到的单车
    for (const [trackingId, trackInfo] of this.bikeTrackingInfo.entries()) {
      if (trackInfo.missedFrames > this.bikeDisappearTimeout) {
        // 单车已经消失太久，从跟踪列表中移除
        this.bikeTrackingInfo.delete(trackingId);
      }
    }
    
    return matchedBikes;
  }

  // 检测视频帧中的单车
  async detectFrame() {
    if (!this.isRunning || !this.model || !this.videoElement) return;
    
    // 检查视频状态
    if (this.videoElement.readyState < 2 || 
        this.videoElement.videoWidth === 0 || 
        this.videoElement.videoHeight === 0) {
      return;
    }
    
    try {
      // 确保canvas尺寸与视频容器匹配
      this.resizeCanvas();
      
      // 检查必要组件是否就绪
      if (!this.ctx || !this.canvas || this.canvas.width === 0 || this.canvas.height === 0) {
        console.warn('Canvas未准备好，跳过当前帧检测');
        return;
      }
      
      // 使用模型预测当前视频帧中的对象
      const predictions = await this.model.detect(this.videoElement);
      
      // 只保留 bicycle 和 motorcycle
      const bikePredictions = predictions.filter(
        p => p.class === 'bicycle' || p.class === 'motorcycle'
      );
      
      // 清除上一帧的绘制结果
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      // 保存当前检测到的单车数据，用于匹配
      const currentFrameBikes = [];
      
      // 处理当前帧检测到的单车
      bikePredictions.forEach((prediction) => {
        const [x, y, width, height] = prediction.bbox;
        const confidence = prediction.score;
        
        // 记录检测到的单车数据
        currentFrameBikes.push({
          x: x + width / 2,
          y: y + height / 2,
          width,
          height,
          confidence,
          type: prediction.class
        });
      });
      
      // 匹配当前帧和前一帧的单车
      const { matchedBikes, unmatched } = this.matchBikes(currentFrameBikes);
      
      // 更新跟踪信息
      const trackedBikes = this.updateTrackingInfo(matchedBikes, unmatched);
      
      // 清除当前帧的检测结果，准备更新
      this.detectedBikes.clear();
      
      // 绘制检测结果并更新检测到的单车
      const detectedItems = [];
      
      for (const [trackingId, bikeData] of trackedBikes.entries()) {
        const x = bikeData.x - bikeData.width / 2;
        const y = bikeData.y - bikeData.height / 2;
        const width = bikeData.width;
        const height = bikeData.height;
        const confidence = bikeData.confidence;
        
        // 绘制边界框
        this.ctx.strokeStyle = '#00FFFF';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);
        
        // 绘制标签背景
        this.ctx.fillStyle = 'rgba(0, 255, 255, 0.7)';
        this.ctx.fillRect(x, y - 20, width > 100 ? width : 100, 20);
        this.ctx.fillStyle = '#000000';
        this.ctx.font = '16px Arial';
        
        // 显示ID和置信度
        const shortId = trackingId.split('-')[1]; // 只显示数字部分
        this.ctx.fillText(`ID:${shortId} ${Math.round(confidence * 100)}%`, x, y - 5);
        
        // 记录检测到的单车数据
        const bikeDataWithId = {
          id: trackingId,
          x: bikeData.x,
          y: bikeData.y,
          width,
          height,
          confidence,
          type: bikeData.type
        };
        
        detectedItems.push(bikeDataWithId);
        
        // 更新单车位置
        this.updateBikePosition(trackingId, bikeDataWithId);
      }
      
      // 保存本次检测结果，用于下一帧的匹配
      this.previousBikes = new Map(this.detectedBikes);
      
      // 发送检测结果事件
      this.emit('detection', {
        count: detectedItems.length,
        bikes: detectedItems
      });
      
    } catch (error) {
      console.error('单车检测过程中发生错误:', error);
      this.emit('error', { type: 'detection', message: error.message });
      
      // 如果出现纹理错误，尝试重置canvas
      if (error.message && error.message.includes('texture')) {
        setTimeout(() => this.resizeCanvas(), 500);
      }
    }
  }

  // 更新单车位置信息
  updateBikePosition(id, bikeData) {
    try {
      // 存储检测到的单车信息
      this.detectedBikes.set(id, bikeData); 
      
      // TODO: 将来在此处添加位置管理功能
      console.log('检测到单车:', id, bikeData.type, `置信度: ${Math.round(bikeData.confidence * 100)}%`);
    } catch (error) {
      console.error('更新单车位置时出错:', error);
      this.emit('error', { type: 'position', message: error.message });
    }
  }

  // 在canvas上绘制检测状态
  // drawDetectionStatus(text) {
  //   if (!this.ctx || !this.canvas) return;
    
  //   // 设置文字样式
  //   this.ctx.font = '20px Arial';
  //   this.ctx.textAlign = 'center';
    
  //   // 绘制文字背景
  //   this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  //   const textWidth = this.ctx.measureText(text).width;
  //   this.ctx.fillRect(
  //     this.canvas.width / 2 - textWidth / 2 - 10,
  //     10,
  //     textWidth + 20,
  //     30
  //   );
    
  //   // 绘制边框
  //   this.ctx.strokeStyle = '#00FFFF';
  //   this.ctx.lineWidth = 2;
  //   this.ctx.strokeRect(
  //     this.canvas.width / 2 - textWidth / 2 - 10,
  //     10,
  //     textWidth + 20,
  //     30
  //   );
    
  //   // 绘制文字
  //   this.ctx.fillStyle = '#FFFFFF';
  //   this.ctx.fillText(text, this.canvas.width / 2, 30);
  // }
}

export default BikeDetection; 