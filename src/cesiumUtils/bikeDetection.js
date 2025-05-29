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
    this.emit('detection', { count: 0, bikes: [] });
    
    // 开始定期检测
    this.detectInterval = setInterval(() => {
      if (this.videoElement.readyState >= 2) {
        this.detectFrame();
      }
    }, 200); // 每200ms检测一次，平衡性能与响应速度
    
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
      
      // 清除历史数据，只保留当前帧的检测结果
      this.detectedBikes.clear();
      
      
      
      // 绘制检测结果
      const detectedItems = [];
      
      bikePredictions.forEach((prediction, idx) => {
        const [x, y, width, height] = prediction.bbox;
        const id = `bike-${Date.now()}-${idx}`;
        const confidence = prediction.score;
        
        // 绘制边界框
        this.ctx.strokeStyle = '#00FFFF';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);
        
        // 绘制标签
        this.ctx.fillStyle = 'rgba(0, 255, 255, 0.7)';
        this.ctx.fillRect(x, y - 20, 80, 20);
        this.ctx.fillStyle = '#000000';
        this.ctx.font = '16px Arial';
        this.ctx.fillText(`单车: ${Math.round(confidence * 100)}%`, x, y - 5);
        
        // 记录检测到的单车数据
        const bikeData = {
          id,
          x: x + width / 2,
          y: y + height / 2,
          width,
          height,
          confidence,
          type: prediction.class
        };
        
        detectedItems.push(bikeData);
        
        // 更新单车位置
        this.updateBikePosition(id, bikeData);
      });
      
      // 发送检测结果事件
      this.emit('detection', {
        count: bikePredictions.length,
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