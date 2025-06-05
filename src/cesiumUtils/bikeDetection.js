import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import BikePositionManager from './BikePositionManager';
import CameraManager from './CameraManager';
// 导入BikeStore单例
import bikeStore from './BikeStore';

class BikeDetection {
  constructor(viewer) {
    this.viewer = viewer;
    this.model = null;
    this.isRunning = false;
    this.videoElement = null;
    this.canvas = null;
    this.ctx = null;
    
    // 初始化摄像头管理器和单车位置管理器
    this.cameraManager = new CameraManager(viewer);
    this.bikePositionManager = new BikePositionManager(viewer, this.cameraManager);
    
    this.detectInterval = null;
    
    // 使用bikeStore替代本地存储
    // detectedBikes、previousBikes、bikeTrackingInfo将通过bikeStore处理
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
      
      // 将BikePositionManager的事件转发
      this.bikePositionManager.on('positionUpdate', (data) => {
        this.emit('positionUpdate', data);
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
    
    // 重置检测状态
    this.nextTrackingId = 1;
    // 清除BikeStore中与视觉检测相关的临时数据
    bikeStore.clearDetectionData();
    // 发送初始值0
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
    
    // 清除临时检测数据，但不清除历史记录
    bikeStore.clearTemporaryDetectionData();
    
    // 发送检测停止事件
    this.emit('detection', { count: 0, bikes: [] });
    this.emit('stopped', true);
    
    console.log('单车检测已停止');
    return true;
  }

  // 只停止检测过程，但保留已检测到的数据
  pauseDetection() {
    if (!this.isRunning) return true;
    
    this.isRunning = false;
    
    if (this.detectInterval) {
      clearInterval(this.detectInterval);
      this.detectInterval = null;
    }
    
    // 清除检测画布结果
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    // 不清除任何数据或实体，保持地图上的单车可见
    
    // 发送检测停止事件，但不清除数据
    this.emit('stopped', true);
    
    console.log('单车检测已暂停（数据保留）');
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

  // 检查值是否为有效数字
  isValidNumber(value) {
    return typeof value === 'number' && isFinite(value) && !isNaN(value);
  }

  // 安全地计算两个点之间的欧几里得距离
  calculateDistance(x1, y1, x2, y2) {
    // 验证所有输入是否为有效数字
    if (!this.isValidNumber(x1) || !this.isValidNumber(y1) || 
        !this.isValidNumber(x2) || !this.isValidNumber(y2)) {
      console.warn('计算距离时遇到无效数字:', { x1, y1, x2, y2 });
      return Number.MAX_VALUE; // 返回一个特殊值表示无效
    }
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  // 计算两个矩形的IoU (Intersection over Union)
  calculateIoU(box1, box2) {
    // 获取两个矩形的坐标
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;
    
    // 验证所有输入
    if (!this.isValidNumber(x1) || !this.isValidNumber(y1) || !this.isValidNumber(w1) || !this.isValidNumber(h1) ||
        !this.isValidNumber(x2) || !this.isValidNumber(y2) || !this.isValidNumber(w2) || !this.isValidNumber(h2)) {
      console.warn('计算IoU时遇到无效数字:', { box1, box2 });
      return 0;
    }
    
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
    
    // 从BikeStore获取之前检测到的单车数据
    const previousBikes = bikeStore.getPreviousDetectedBikes();
    const trackingInfo = bikeStore.getBikeTrackingInfo();
    
    // 如果是第一帧或前一帧没有单车，则所有单车都是新的
    if (previousBikes.size === 0) {
      return { matchedBikes, unmatched };
    }
    
    // 优先考虑位置连续的单车，改进匹配逻辑
    // 1. 首先基于位置相似性进行粗匹配
    // 2. 然后基于大小和外观特征进行精细匹配
    
    // 对当前帧中的每辆单车，找出最佳匹配
    for (let i = unmatched.length - 1; i >= 0; i--) {
      const currentBike = unmatched[i];
      
      // 验证当前单车坐标是否有效
      if (!this.isValidNumber(currentBike.x) || !this.isValidNumber(currentBike.y) ||
          !this.isValidNumber(currentBike.width) || !this.isValidNumber(currentBike.height)) {
        console.warn('遇到无效的单车坐标:', currentBike);
        unmatched.splice(i, 1); // 移除无效单车
        continue;
      }
      
      const currentBox = [currentBike.x - currentBike.width/2, currentBike.y - currentBike.height/2, 
                          currentBike.width, currentBike.height];
      
      let bestMatch = null;
      let bestScore = -1;
      let bestTrackingId = null;
      
      // 遍历已追踪的单车
      for (const [trackingId, prevBike] of trackingInfo.entries()) {
        // 如果单车已经消失了设定的帧数或已经被匹配，则不再考虑
        if (prevBike.missedFrames > this.bikeDisappearTimeout || 
            matchedBikes.has(trackingId)) continue;
        
        // 获取最近一次位置
        const lastPosition = prevBike.positions[prevBike.positions.length - 1];
        if (!lastPosition) continue;
        
        // 验证历史位置坐标是否有效
        if (!this.isValidNumber(lastPosition.x) || !this.isValidNumber(lastPosition.y) ||
            !this.isValidNumber(lastPosition.width) || !this.isValidNumber(lastPosition.height)) {
          console.warn('遇到无效的历史单车坐标:', lastPosition);
          continue;
        }
        
        // 计算距离分数
        const distance = this.calculateDistance(
          currentBike.x, currentBike.y, 
          lastPosition.x, lastPosition.y
        );
        
        // 如果距离无效或太远，不考虑匹配
        if (distance === Number.MAX_VALUE || distance > this.maxTrackingDistance) continue;
        
        // 计算尺寸相似度(0-1)
        const widthRatio = Math.min(currentBike.width, lastPosition.width) / 
                          Math.max(currentBike.width, lastPosition.width);
        const heightRatio = Math.min(currentBike.height, lastPosition.height) / 
                           Math.max(currentBike.height, lastPosition.height);
        const sizeScore = (widthRatio + heightRatio) / 2;
        
        // 计算IoU分数(0-1)
        const prevBox = [lastPosition.x - lastPosition.width/2, lastPosition.y - lastPosition.height/2, 
                        lastPosition.width, lastPosition.height];
        const iou = this.calculateIoU(currentBox, prevBox);
        
        // 计算类型匹配分数(0 or 1)
        const typeScore = (prevBike.type === currentBike.type) ? 1.0 : 0.7;
        
        // 计算速度连续性分数(基于历史位置)
        let velocityScore = 1.0; // 默认值
        if (prevBike.positions.length >= 2) {
          const secondLastPos = prevBike.positions[prevBike.positions.length - 2];
          if (secondLastPos && this.isValidNumber(secondLastPos.x) && this.isValidNumber(secondLastPos.y)) {
            // 计算前一段移动向量
            const prevDx = lastPosition.x - secondLastPos.x;
            const prevDy = lastPosition.y - secondLastPos.y;
            
            // 计算当前段移动向量
            const currDx = currentBike.x - lastPosition.x;
            const currDy = currentBike.y - lastPosition.y;
            
            // 计算向量夹角余弦值
            const dotProduct = prevDx * currDx + prevDy * currDy;
            const mag1 = Math.sqrt(prevDx * prevDx + prevDy * prevDy);
            const mag2 = Math.sqrt(currDx * currDx + currDy * currDy);
            
            if (mag1 > 1 && mag2 > 1) { // 避免静止物体的干扰
              const cosTheta = dotProduct / (mag1 * mag2);
              // 将夹角余弦值映射到0-1分数范围，余弦值越接近1说明方向越一致
              velocityScore = (cosTheta + 1) / 2;
            }
          }
        }
        
        // 综合评分，优化权重
        const distanceScore = 1 - Math.min(distance / this.maxTrackingDistance, 1);
        // 调整各因素权重以获得更稳定的跟踪
        // 距离应该是最重要的因素，其次是IoU和尺寸相似度
        const score = distanceScore * 0.5 + iou * 0.2 + sizeScore * 0.15 + typeScore * 0.1 + velocityScore * 0.05;
        
        // 更新最佳匹配
        if (score > bestScore && score > 0.3) { // 使用更高的阈值0.3以减少误匹配
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
        
        // 验证坐标
        if (!this.isValidNumber(bikeA.x) || !this.isValidNumber(bikeA.y) ||
            !this.isValidNumber(bikeB.x) || !this.isValidNumber(bikeB.y)) {
          continue;
        }
        
        // 计算两辆单车中心点距离
        const distance = this.calculateDistance(bikeA.x, bikeA.y, bikeB.x, bikeB.y);
        
        // 如果距离无效或小于阈值，认为是同一辆单车的多次检测，移除其中一个
        if (distance !== Number.MAX_VALUE && distance < mergeDistance) {
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
    const trackingInfo = bikeStore.getBikeTrackingInfo();
    const now = Date.now();
    
    // 记录当前帧活动的单车ID，用于后续识别不再活动的单车
    const activeBikeIds = new Set();
    
    // 更新已匹配单车的信息
    for (const [trackingId, bikeData] of matchedBikes.entries()) {
      activeBikeIds.add(trackingId);
      
      const trackInfo = trackingInfo.get(trackingId);
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
        trackInfo.lastSeen = now;
        
        // 更新BikeStore中的跟踪信息
        bikeStore.updateBikeTrackingInfo(trackingId, trackInfo);
      }
    }
    
    // 为未匹配的单车创建新的跟踪信息
    for (const newBike of newBikes) {
      // 验证新单车数据
      if (!this.isValidNumber(newBike.x) || !this.isValidNumber(newBike.y) ||
          !this.isValidNumber(newBike.width) || !this.isValidNumber(newBike.height)) {
        console.warn('忽略无效的新单车数据:', newBike);
        continue;
      }
      
      const trackingId = `bike-${this.nextTrackingId++}`;
      activeBikeIds.add(trackingId);
      
      const newTrackInfo = {
        positions: [{...newBike}],
        firstSeen: now,
        lastSeen: now,
        missedFrames: 0,
        type: newBike.type || 'unknown',
        confidence: newBike.confidence || 0
      };
      
      // 将新的跟踪信息保存到BikeStore
      bikeStore.updateBikeTrackingInfo(trackingId, newTrackInfo);
      
      // 添加到匹配结果中
      matchedBikes.set(trackingId, newBike);
    }
    
    // 更新未在当前帧中出现的单车的消失计数
    for (const [trackingId, trackInfo] of trackingInfo.entries()) {
      if (!activeBikeIds.has(trackingId)) {
        // 增加消失计数
        trackInfo.missedFrames += 1;
        
        // 如果连续消失的帧数超过阈值，根据置信度决定是否保留
        if (trackInfo.missedFrames > this.bikeDisappearTimeout) {
          // 高置信度的单车保留更长时间（避免闪烁）
          const extendedTimeout = trackInfo.confidence > 0.8 ? 
                this.bikeDisappearTimeout * 1.5 : this.bikeDisappearTimeout;
          
          if (trackInfo.missedFrames > extendedTimeout) {
            // 单车已经消失太久，从跟踪列表中移除
            bikeStore.removeBikeTracking(trackingId);
            continue; // 跳过更新
          }
        }
        
        bikeStore.updateBikeTrackingInfo(trackingId, trackInfo);
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
        
        // 验证检测框坐标是否有效
        if (!this.isValidNumber(x) || !this.isValidNumber(y) || 
            !this.isValidNumber(width) || !this.isValidNumber(height) ||
            !this.isValidNumber(confidence)) {
          console.warn('跳过无效的检测结果:', prediction.bbox);
          return;
        }
        
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
      
      // 清除当前帧的检测结果并保存到BikeStore中
      bikeStore.clearCurrentDetections();
      
      // 绘制检测结果并更新检测到的单车
      const detectedItems = [];
      
      for (const [trackingId, bikeData] of trackedBikes.entries()) {
        // 再次验证数据有效性
        if (!this.isValidNumber(bikeData.x) || !this.isValidNumber(bikeData.y) ||
            !this.isValidNumber(bikeData.width) || !this.isValidNumber(bikeData.height)) {
          console.warn('跳过无效的追踪单车:', trackingId, bikeData);
          continue;
        }
        
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
        
        // 将检测到的单车保存到BikeStore
        bikeStore.updateDetectedBike(trackingId, bikeDataWithId);
      }
      
      // 保存本次检测结果到BikeStore中，用于下一帧的匹配
      bikeStore.savePreviousDetections();
      
      // 更新单车在地图上的位置
      if (this.cameraManager.getActiveCamera()) {
        try {
          // 确保视频尺寸有效
          const videoWidth = this.videoElement.videoWidth;
          const videoHeight = this.videoElement.videoHeight;
          
          if (this.isValidNumber(videoWidth) && this.isValidNumber(videoHeight) && 
              videoWidth > 0 && videoHeight > 0) {
            this.bikePositionManager.updateFromDetection(
              detectedItems,
              videoWidth,
              videoHeight
            );
          } else {
            console.warn('视频尺寸无效:', videoWidth, videoHeight);
          }
        } catch (error) {
          console.error('更新单车位置时出错:', error);
          this.emit('error', { type: 'position', message: error.message });
        }
      }
      
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

  // 更新单车位置信息方法现在直接使用BikeStore存储
  updateBikePosition(id, bikeData) {
    try {
      // 验证单车数据
      if (!this.isValidNumber(bikeData.x) || !this.isValidNumber(bikeData.y) ||
          !this.isValidNumber(bikeData.width) || !this.isValidNumber(bikeData.height)) {
        console.warn('无法更新单车位置，数据无效:', id, bikeData);
        return;
      }
      
      // 存储检测到的单车信息到BikeStore中
      bikeStore.updateDetectedBike(id, bikeData);
      console.log('检测到单车:', id, bikeData.type, `置信度: ${Math.round(bikeData.confidence * 100)}%`);
    } catch (error) {
      console.error('更新单车位置时出错:', error);
      this.emit('error', { type: 'position', message: error.message });
    }
  }

  /**
   * 添加固定摄像头
   * @param {Object} options 摄像头配置
   * @returns {string} 摄像头ID
   */
  addCamera(options) {
    return this.cameraManager.addCamera(options);
  }
  
  /**
   * 移除摄像头
   * @param {string} cameraId 摄像头ID
   */
  removeCamera(cameraId) {
    this.cameraManager.removeCamera(cameraId);
  }
  
  /**
   * 激活摄像头
   * @param {string} cameraId 摄像头ID
   */
  activateCamera(cameraId) {
    return this.cameraManager.activateCamera(cameraId);
  }
  
  /**
   * 获取统计数据
   * @returns {Object} 统计信息
   */
  getStats() {
    return this.bikePositionManager.getStats();
  }
  
  /**
   * 显示单车轨迹
   * @param {string} bikeId 单车ID
   * @param {boolean} show 是否显示
   */
  showBikeTrail(bikeId, show = true) {
    return this.bikePositionManager.showBikeTrail(bikeId, show);
  }
  
  /**
   * 启用/禁用热力图
   * @param {boolean} enabled 是否启用
   */
  setHeatmapEnabled(enabled) {
    this.bikePositionManager.setHeatmapEnabled(enabled);
  }
  
  /**
   * 清除所有资源
   */
  destroy() {
    this.stopDetection();
    this.cameraManager.clear();
    this.bikePositionManager.clearAllBikes();
    
    if (this.canvas) {
      window.removeEventListener('resize', this.resizeCanvas);
    }
    
    this.eventListeners.clear();
  }
}

export default BikeDetection; 