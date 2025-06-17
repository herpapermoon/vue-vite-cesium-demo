<template>
  <div class="parking-management">
    <!-- 切换标签 -->
    <div class="tab-switcher">
      <div 
        class="tab-button" 
        :class="{ active: activeTab === 'parking' }"
        @click="activeTab = 'parking'">
        🅿️ 车位管理
      </div>
      <div 
        class="tab-button" 
        :class="{ active: activeTab === 'garage' }"
        @click="activeTab = 'garage'">
        🏢 车库管理
      </div>
      <div 
        class="tab-button" 
        :class="{ active: activeTab === 'analysis' }"
        @click="activeTab = 'analysis'">
        🧠 智能分析
      </div>
    </div>

    <!-- 车位内容 -->
    <div v-if="activeTab === 'parking'" class="parking-content">
      <div class="status-header">
        <h4>校园车位状态</h4>
        <div class="status-summary">
          <div class="status-item available">
            <span class="label">总车位:</span>
            <span class="value">{{ totalSpots }}</span>
          </div>
          <div class="status-item occupied">
            <span class="label">已占用:</span>
            <span class="value">{{ occupiedSpots }}</span>
          </div>
          <div class="status-item free">
            <span class="label">空闲:</span>
            <span class="value">{{ availableSpots }}</span>
          </div>
        </div>
      </div>

      <div class="controls">
        <button 
          class="control-btn" 
          @click="refreshParkingData"
          :disabled="isLoading">
          🔄 刷新数据
        </button>
        <button 
          class="control-btn" 
          @click="toggleVisualization">
          {{ showVisualization ? '🙈 隐藏可视化' : '👁️ 显示可视化' }}
        </button>
      </div>

      <div class="parking-list">
        <div 
          v-for="spot in parkingSpots" 
          :key="spot.id"
          class="parking-item"
          :class="{ 
            occupied: spot.isOccupied,
            full: spot.isFull 
          }"
          :data-occupancy="getOccupancyLevel(spot.occupancyRate)"
          @click="flyToSpot(spot)">
          <div class="spot-info">
            <span class="spot-id">车位 #{{ spot.id }}</span>
            <span class="spot-status" :class="{ 
              'status-full': spot.isFull,
              'status-occupied': spot.isOccupied && !spot.isFull,
              'status-free': !spot.isOccupied 
            }">
              {{ spot.isFull ? '已满' : (spot.isOccupied ? '使用中' : '空闲') }}
            </span>
          </div>
          <div class="spot-details">
            <div class="detail-row">
              <span class="detail-label">位置:</span>
              <span class="detail-value">{{ formatLocation(spot.center) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">占用:</span>
              <span class="detail-value">{{ spot.bikeCount }}/{{ spot.maxCapacity }} ({{ spot.occupancyRate }}%)</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">面积:</span>
              <span class="detail-value">{{ spot.area?.toFixed(2) || 0 }} m²</span>
            </div>
          </div>
          <div class="click-hint">点击跳转到地图位置</div>
        </div>
      </div>
    </div>

    <!-- 车库内容 -->
    <div v-if="activeTab === 'garage'" class="garage-content">
      <div class="status-header">
        <h4>校园车库状态</h4>
        <div class="status-summary">
          <div class="status-item available">
            <span class="label">总车库:</span>
            <span class="value">{{ totalGarages }}</span>
          </div>
          <div class="status-item occupied">
            <span class="label">已占用:</span>
            <span class="value">{{ occupiedGarages }}</span>
          </div>
          <div class="status-item free">
            <span class="label">空闲:</span>
            <span class="value">{{ availableGarages }}</span>
          </div>
        </div>
      </div>

      <div class="controls">
        <button 
          class="control-btn" 
          @click="refreshGarageData"
          :disabled="isLoading">
          🔄 刷新数据
        </button>
        <button 
          class="control-btn" 
          @click="toggleVisualization">
          {{ showVisualization ? '🙈 隐藏可视化' : '👁️ 显示可视化' }}
        </button>
      </div>

      <div class="garage-list">
        <div 
          v-for="garage in garages" 
          :key="garage.id"
          class="garage-item"
          :class="{ 
            occupied: garage.isOccupied,
            full: garage.isFull 
          }"
          :data-occupancy="getOccupancyLevel(garage.occupancyRate)"
          @click="flyToGarage(garage)">
          <div class="garage-info">
            <span class="garage-id">{{ garage.name }}</span>
            <span class="garage-status" :class="{ 
              'status-full': garage.isFull,
              'status-occupied': garage.isOccupied && !garage.isFull,
              'status-free': !garage.isOccupied 
            }">
              {{ garage.isFull ? '已满' : (garage.isOccupied ? '使用中' : '空闲') }}
            </span>
          </div>
          <div class="garage-details">
            <div class="detail-row">
              <span class="detail-label">位置:</span>
              <span class="detail-value">{{ formatLocation(garage.position) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">占用:</span>
              <span class="detail-value">{{ garage.bikeCount }}/{{ garage.maxCapacity }} ({{ garage.occupancyRate }}%)</span>
            </div>
            <div class="garage-actions">
              <button 
                class="reserve-btn" 
                @click.stop="openReservation(garage)"
                :disabled="garage.isFull">
                🚗 预约车位
              </button>
            </div>
          </div>
          <div class="click-hint">点击跳转到地图位置</div>
        </div>
      </div>
    </div>

    <!-- 分析内容 -->
    <div v-if="activeTab === 'analysis'" class="analysis-content">
      <div class="status-header">
        <h4>车位智能分析</h4>
        <div class="status-summary">
          <div class="status-item available">
            <span class="label">总车位:</span>
            <span class="value">{{ totalSpots }}</span>
          </div>
          <div class="status-item occupied">
            <span class="label">已占用:</span>
            <span class="value">{{ occupiedSpots }}</span>
          </div>
          <div class="status-item free">
            <span class="label">空闲:</span>
            <span class="value">{{ availableSpots }}</span>
          </div>
        </div>
      </div>

      
<div class="analysis-controls">
  <button 
    class="control-btn" 
    @click="runAnalysis"
    :disabled="isAnalyzing">
    {{ isAnalyzing ? '分析中...' : '🔍 开始智能分析' }}
  </button>
  <button 
    class="control-btn" 
    :class="{ active: heatmapActive }"
    @click="toggleHeatmap">
    {{ heatmapActive ? '🔥 关闭热力图' : '🔥 生成实时单车热力图' }}
  </button>
  <div class="query-input">
    <input 
      type="text" 
      v-model="userQuery" 
      placeholder="输入分析需求，例如：分析哪些区域需要调配车位"
      @keyup.enter="runAnalysis"
      :disabled="isAnalyzing"
    />
  </div>
</div>

      <div class="analysis-output" ref="outputContainer">
        <div v-if="analysisResults.length === 0 && !isAnalyzing" class="empty-state">
          点击"开始智能分析"按钮，AI将分析当前车位占用情况并提供调配建议
        </div>
        <div v-else-if="isAnalyzing" class="loading-state">
          <div class="loading-spinner"></div>
          <div>正在分析中，请稍候...</div>
        </div>
        <div v-else class="result-container">
          <div v-for="(result, index) in analysisResults" :key="index" class="result-item">
            <div class="result-header">
              <span class="result-title">分析结果 #{{ index + 1 }}</span>
              <span class="result-time">{{ result.timestamp }}</span>
            </div>
            
            <div v-if="result.summary" class="result-summary">
              <h5>摘要</h5>
              <div class="summary-item" v-if="result.summary.highOccupancyAreas">
                <span class="summary-label">高占用区域:</span>
                <span class="summary-value">{{ result.summary.highOccupancyAreas.join(', ') }}</span>
              </div>
              <div class="summary-item" v-if="result.summary.lowOccupancyAreas">
                <span class="summary-label">低占用区域:</span>
                <span class="summary-value">{{ result.summary.lowOccupancyAreas.join(', ') }}</span>
              </div>
              <div class="summary-item" v-if="result.summary.overallStatus">
                <span class="summary-label">总体状态:</span>
                <span class="summary-value">{{ result.summary.overallStatus }}</span>
              </div>
            </div>
            
            <div v-if="result.recommendations && result.recommendations.length" class="result-recommendations">
              <h5>调配建议</h5>
              <div v-for="(rec, recIndex) in result.recommendations" :key="recIndex" class="recommendation-item" :class="rec.type">
                <template v-if="rec.type === 'immediate'">
                  <div class="rec-badge immediate">即时</div>
                  <div class="rec-content">
                    从 <span class="rec-highlight">{{ rec.from }}</span> 
                    向 <span class="rec-highlight">{{ rec.to }}</span> 
                    调配 <span class="rec-highlight">{{ rec.amount }}</span> 辆单车
                    <span class="rec-priority" :class="rec.priority">{{ rec.priority }}优先级</span>
                  </div>
                </template>
                <template v-else-if="rec.type === 'longTerm'">
                  <div class="rec-badge longterm">长期</div>
                  <div class="rec-content">
                    {{ rec.action }} <span class="rec-highlight">{{ rec.location }}</span>
                    <div class="rec-description">{{ rec.description }}</div>
                  </div>
                </template>
              </div>
            </div>
            
            <div class="result-content" v-html="formatAnalysisResult(result.detailedAnalysis)"></div>
            
            <div v-if="result.recommendations && result.recommendations.length" class="result-actions">
              <button 
                class="action-btn" 
                @click="showRecommendationsOnMap(result.recommendations)">
                在地图上显示建议
              </button>
              <button 
                class="action-btn" 
                @click="generateHeatmap()">
                生成占用热力图
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 预约弹窗 -->
    <div v-if="showReservation" class="reservation-modal">
      <div class="reservation-content">
        <div class="modal-header">
          <h3>预约车位</h3>
          <button class="close-btn" @click="closeReservation">×</button>
        </div>
        <div class="modal-body">
          <div class="garage-info-modal">
            <p><strong>车库名称:</strong> {{ selectedGarage?.name }}</p>
            <p><strong>可用车位:</strong> {{ selectedGarage ? (selectedGarage.maxCapacity - selectedGarage.bikeCount) : 0 }}</p>
          </div>
          
          <div class="form-group">
            <label for="userName">姓名</label>
            <input 
              type="text" 
              id="userName" 
              v-model="reservationForm.userName"
              placeholder="请输入您的姓名">
          </div>
          
          <div class="form-group">
            <label for="carNumber">车牌号码</label>
            <input 
              type="text" 
              id="carNumber" 
              v-model="reservationForm.carNumber"
              placeholder="请输入车牌号码">
          </div>
          
          <div class="form-group">
            <label for="phone">联系电话</label>
            <input 
              type="tel" 
              id="phone" 
              v-model="reservationForm.phone"
              placeholder="请输入联系电话">
          </div>
          
          <div class="form-group">
            <label for="arrivalTime">预计到达时间</label>
            <input 
              type="datetime-local" 
              id="arrivalTime" 
              v-model="reservationForm.arrivalTime">
          </div>
          
          <div class="form-group">
            <label for="duration">停车时长（小时）</label>
            <input 
              type="number" 
              id="duration" 
              v-model="reservationForm.duration"
              min="1" 
              max="24">
          </div>
        </div>
        <div class="modal-footer">
          <button 
            class="submit-btn" 
            @click="submitReservation"
            :disabled="isSubmitting">
            {{ isSubmitting ? '提交中...' : '确认预约' }}
          </button>
          <button class="cancel-btn" @click="closeReservation">取消</button>
        </div>
      </div>
    </div>
    
    <!-- 预约成功提示 -->
    <div v-if="showSuccessMessage" class="success-message">
      <div class="success-content">
        <div class="success-icon">✓</div>
        <h3>预约成功</h3>
        <p>您已成功预约车位</p>
        <p class="reservation-code">预约码: {{ reservationCode }}</p>
        <p>请在预约时间内到达车库</p>
        <button @click="closeSuccessMessage" class="ok-btn">我知道了</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, defineExpose, nextTick } from 'vue';
import bikeStore from '@/cesiumUtils/BikeStore';
import { calculateDistance } from '@/cesiumUtils/randomPoints';
import Cesium from '@/cesiumUtils/cesium';
import ParkingAnalysisService from '@/cesiumUtils/ParkingAnalysisService';
import BikeHeatmapService from '@/cesiumUtils/BikeHeatmapService';

// 响应式状态
const activeTab = ref('parking');
const parkingSpots = ref([]);
const garages = ref([]);
const isLoading = ref(false);
const showVisualization = ref(true);

// 智能分析相关状态
const isAnalyzing = ref(false);
const userQuery = ref('');
const analysisResults = ref([]);
const outputContainer = ref(null);

// 热力图状态
const heatmapActive = ref(false);

// 预约相关状态
const showReservation = ref(false);
const selectedGarage = ref(null);
const reservationForm = ref({
  userName: '',
  carNumber: '',
  phone: '',
  arrivalTime: '',
  duration: 1
});
const isSubmitting = ref(false);

// 预约成功相关状态
const showSuccessMessage = ref(false);
const reservationCode = ref('');

// 常量定义
const PARKING_HEIGHT = 20;
const GARAGE_CYLINDER_RADIUS = 2;
const GARAGE_CYLINDER_HEIGHT = 10;
const GARAGE_CAPACITY = 100;
const UPDATE_INTERVAL = 5000; // 5秒更新一次

// 计算多边形面积（球面面积计算）
const calculatePolygonArea = (coordinates) => {
  if (!coordinates || coordinates.length < 3) return 0;
  
  const toRadians = (degrees) => degrees * Math.PI / 180;
  let area = 0;
  const R = 6371000;
  
  for (let i = 0; i < coordinates.length; i++) {
    const j = (i + 1) % coordinates.length;
    const lat1 = toRadians(coordinates[i][1]);
    const lat2 = toRadians(coordinates[j][1]);
    const deltaLon = toRadians(coordinates[j][0] - coordinates[i][0]);
    
    area += deltaLon * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  
  area = Math.abs(area * R * R / 2);
  return area;
};

// 计算多边形中心点
const calculatePolygonCenter = (coordinates) => {
  const sumLon = coordinates.reduce((sum, coord) => sum + coord[0], 0);
  const sumLat = coordinates.reduce((sum, coord) => sum + coord[1], 0);
  return [
    sumLon / coordinates.length,
    sumLat / coordinates.length
  ];
};

// 格式化位置显示
const formatLocation = (center) => {
  if (!center) return '未知';
  return `${center[0].toFixed(6)}, ${center[1].toFixed(6)}`;
};

// 判断点是否在多边形内
const isPointInPolygon = (point, polygon) => {
  const [x, y] = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
};

// 判断点是否在车库范围内
const isPointInGarageRadius = (point, garagePosition, radius = 50) => {
  const distance = calculateDistance(point, garagePosition);
  return distance <= radius;
};

// 跳转到指定车位
const flyToSpot = (spot) => {
  if (!bikeStore.viewer || !spot.center) return;
  
  const destination = Cesium.Cartesian3.fromDegrees(
    spot.center[0], 
    spot.center[1], 
    200
  );
  
  bikeStore.viewer.camera.flyTo({
    destination: destination,
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0.0
    },
    duration: 2.0,
    complete: () => {
      highlightSpot(spot);
    }
  });
};

// 跳转到指定车库
const flyToGarage = (garage) => {
  if (!bikeStore.viewer || !garage.position) return;
  
  const destination = Cesium.Cartesian3.fromDegrees(
    garage.position[0], 
    garage.position[1], 
    150
  );
  
  bikeStore.viewer.camera.flyTo({
    destination: destination,
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0.0
    },
    duration: 2.0,
    complete: () => {
      highlightGarage(garage);
    }
  });
};

// 高亮显示指定车位
const highlightSpot = (spot) => {
  if (!bikeStore.viewer) return;
  
  const entities = bikeStore.viewer.entities.values;
  const spotEntity = entities.find(entity => 
    entity.name === `车位 #${spot.id}`
  );
  
  if (spotEntity && spotEntity.polygon) {
    const originalMaterial = spotEntity.polygon.material;
    spotEntity.polygon.material = Cesium.Color.CYAN.withAlpha(0.8);
    
    setTimeout(() => {
      spotEntity.polygon.material = originalMaterial;
    }, 2000);
  }
};

// 高亮显示指定车库
const highlightGarage = (garage) => {
  if (!bikeStore.viewer) return;
  
  const entities = bikeStore.viewer.entities.values;
  const garageEntity = entities.find(entity => 
    entity.name === `车库 #${garage.id}`
  );
  
  if (garageEntity && garageEntity.cylinder) {
    const originalMaterial = garageEntity.cylinder.material;
    garageEntity.cylinder.material = Cesium.Color.CYAN.withAlpha(0.8);
    
    setTimeout(() => {
      garageEntity.cylinder.material = originalMaterial;
    }, 2000);
  }
};

// 清除实体
const clearEntities = () => {
  if (!bikeStore.viewer) return;
  
  const entities = bikeStore.viewer.entities.values.slice();
  entities.forEach(entity => {
    if (entity.name && (
      entity.name.includes('车位') || 
      entity.name.includes('车库')
    )) {
      bikeStore.viewer.entities.remove(entity);
    }
  });
};

// 智能分析相关方法
/**
 * 运行智能分析
 */
const runAnalysis = async () => {
  if (isAnalyzing.value) return;
  
  isAnalyzing.value = true;
  
  try {
    // 准备分析数据
    const analysisData = {
      parkingSpots: parkingSpots.value,
      garages: garages.value,
      totalSpots: totalSpots.value,
      occupiedSpots: occupiedSpots.value,
      availableSpots: availableSpots.value
    };
    
    // 调用分析服务
    const result = await ParkingAnalysisService.analyzeParkingData(
      analysisData, 
      userQuery.value
    );
    
    // 添加时间戳
    const analysisResult = {
      ...result,
      timestamp: new Date().toLocaleString()
    };
    
    // 将结果添加到分析结果列表
    analysisResults.value.unshift(analysisResult);
    
    // 清空查询输入
    userQuery.value = '';
    
    // 滚动到顶部
    await nextTick();
    if (outputContainer.value) {
      outputContainer.value.scrollTop = 0;
    }
  } catch (error) {
    console.error('分析出错:', error);
    
    // 添加错误信息到结果列表
    analysisResults.value.unshift({
      success: false,
      error: error.message || '未知错误',
      timestamp: new Date().toLocaleString(),
      detailedAnalysis: `分析过程中发生错误: ${error.message || '未知错误'}`
    });
  } finally {
    isAnalyzing.value = false;
  }
};

/**
 * 格式化分析结果，将Markdown转换为HTML
 */
const formatAnalysisResult = (text) => {
  if (!text) return '';
  
  // 简单的Markdown格式化
  return text
    .replace(/##\s+(.*?)(?=\n|$)/g, '<h4>$1</h4>')
    .replace(/###\s+(.*?)(?=\n|$)/g, '<h5>$1</h5>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
};

/**
 * 在地图上显示推荐的调配建议
 */
const showRecommendationsOnMap = (recommendations) => {
  if (!recommendations || !recommendations.length || !bikeStore.viewer) return;
  
  // 清除之前的分析实体
  clearAnalysisEntities();
  
  // 处理每一个推荐
  recommendations.forEach(rec => {
    if (rec.type === 'immediate' && rec.from && rec.to) {
      // 查找源车位和目标车位
      const fromSpot = findParkingSpotById(rec.from);
      const toSpot = findParkingSpotById(rec.to);
      
      if (fromSpot && toSpot) {
        // 添加箭头实体
        addArrowEntity(fromSpot, toSpot, rec);
        
        // 高亮显示源车位和目标车位
        highlightParkingSpot(fromSpot, Cesium.Color.YELLOW.withAlpha(0.6));
        highlightParkingSpot(toSpot, Cesium.Color.GREEN.withAlpha(0.6));
      }
    } else if (rec.type === 'longTerm' && rec.location) {
      // 查找位置
      const spot = findParkingSpotById(rec.location);
      
      if (spot) {
        // 高亮显示位置
        highlightParkingSpot(spot, Cesium.Color.BLUE.withAlpha(0.6));
        
        // 添加标签
        addLabelEntity(spot, rec.action || '长期优化');
      }
    }
  });
  
  // 飞行到第一个推荐的位置
  const firstRec = recommendations[0];
  if (firstRec) {
    const spot = findParkingSpotById(firstRec.from || firstRec.location);
    if (spot) {
      flyToSpot(spot);
    }
  }
};

/**
 * 根据ID查找车位
 */
const findParkingSpotById = (idStr) => {
  // 提取ID数字
  const idMatch = idStr.match(/\d+/);
  if (!idMatch) return null;
  
  const id = idMatch[0];
  return parkingSpots.value.find(spot => String(spot.id) === id);
};

/**
 * 添加箭头实体
 */
const addArrowEntity = (fromSpot, toSpot, recommendation) => {
  if (!fromSpot.center || !toSpot.center || !bikeStore.viewer) return;
  
  const fromPos = Cesium.Cartesian3.fromDegrees(
    fromSpot.center[0], 
    fromSpot.center[1], 
    PARKING_HEIGHT + 30
  );
  
  const toPos = Cesium.Cartesian3.fromDegrees(
    toSpot.center[0], 
    toSpot.center[1], 
    PARKING_HEIGHT + 30
  );
  
  // 添加连接线
  bikeStore.viewer.entities.add({
    name: 'analysis-arrow',
    polyline: {
      positions: [fromPos, toPos],
      width: 3,
      material: new Cesium.PolylineArrowMaterialProperty(
        Cesium.Color.fromCssColorString(
          recommendation.priority === '高' ? '#FF4500' : 
          recommendation.priority === '中' ? '#FFA500' : '#4169E1'
        )
      ),
      clampToGround: false
    },
    label: {
      text: `调配 ${recommendation.amount || ''} 辆`,
      font: '14px sans-serif',
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      outlineWidth: 2,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      pixelOffset: new Cesium.Cartesian2(0, -10),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      position: Cesium.Cartesian3.midpoint(fromPos, toPos, new Cesium.Cartesian3())
    }
  });
};

/**
 * 高亮显示车位
 */
const highlightParkingSpot = (spot, color) => {
  if (!spot.coordinates || !bikeStore.viewer) return;
  
  try {
    const coordinateArray = spot.coordinates[0][0].reduce((acc, coord) => {
      acc.push(coord[0], coord[1]);
      return acc;
    }, []);
    
    bikeStore.viewer.entities.add({
      name: `analysis-highlight-${spot.id}`,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(coordinateArray),
        material: color,
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        height: PARKING_HEIGHT,
        extrudedHeight: PARKING_HEIGHT + 5
      }
    });
  } catch (error) {
    console.error('高亮显示车位失败:', error, spot);
  }
};

/**
 * 添加标签实体
 */
const addLabelEntity = (spot, text) => {
  if (!spot.center || !bikeStore.viewer) return;
  
  bikeStore.viewer.entities.add({
    name: `analysis-label-${spot.id}`,
    position: Cesium.Cartesian3.fromDegrees(
      spot.center[0], 
      spot.center[1], 
      PARKING_HEIGHT + 40
    ),
    label: {
      text: text,
      font: '16px sans-serif',
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      outlineWidth: 2,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      pixelOffset: new Cesium.Cartesian2(0, 0),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      showBackground: true,
      backgroundColor: Cesium.Color.BLUE.withAlpha(0.7)
    },
    billboard: {
      image: '/src/assets/images/pin.png',
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      scale: 0.1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
};

/**
 * 清除分析实体
 */
const clearAnalysisEntities = () => {
  if (!bikeStore.viewer) return;
  
  const entities = bikeStore.viewer.entities.values.slice();
  entities.forEach(entity => {
    if (entity.name && (
      entity.name.includes('analysis-arrow') || 
      entity.name.includes('analysis-highlight') ||
      entity.name.includes('analysis-label')
    )) {
      bikeStore.viewer.entities.remove(entity);
    }
  });
};

// 清理分析实体的方法
const cleanup = () => {
  clearAnalysisEntities();
  
  // 关闭热力图
  if (BikeHeatmapService.isActive) {
    BikeHeatmapService.deactivate();
    heatmapActive.value = false;
  }
  
  // 关闭弹窗
  showReservation.value = false;
  showSuccessMessage.value = false;
};

// 清理定时器
import { onUnmounted } from 'vue';
onUnmounted(() => {
  if (updateTimer) {
    clearInterval(updateTimer);
  }
  clearEntities();
  cleanup();
});

// 定时更新
let updateTimer = null;

// 组件加载时初始化
onMounted(async () => {
  await nextTick(); // 等待DOM更新
  
  // 等待bikeStore.viewer可用
  const waitForViewer = () => {
    return new Promise((resolve) => {
      const checkViewer = () => {
        if (window.viewer3D) {
          bikeStore.setViewer(window.viewer3D);
          resolve();
        } else {
          setTimeout(checkViewer, 100);
        }
      };
      checkViewer();
    });
  };
  
  await waitForViewer();
  
  // 加载数据
  await Promise.all([loadParkingData(), loadGarageData()]);
  
  // 初始化状态
  updateParkingStatus();
  updateGarageStatus();
  visualizeAll();
  
  // 设置定时更新
  updateTimer = setInterval(() => {
    updateParkingStatus();
    updateGarageStatus();
    if (showVisualization.value) {
      visualizeAll();
    }
  }, UPDATE_INTERVAL);
});

// 查找可用停车位
const findAvailableParkingSpotInRadius = (centerLon, centerLat, radiusInMeters = 100) => {
  if (!parkingSpots.value || parkingSpots.value.length === 0) {
    return null;
  }
  
  const nearbySpots = parkingSpots.value.filter(spot => {
    if (!spot.center) return false;
    
    const distance = calculateDistance([centerLon, centerLat], spot.center);
    return distance <= radiusInMeters && !spot.isFull;
  });
  
  if (nearbySpots.length === 0) {
    return null;
  }
  
  nearbySpots.sort((a, b) => {
    const distA = calculateDistance([centerLon, centerLat], a.center);
    const distB = calculateDistance([centerLon, centerLat], b.center);
    return distA - distB;
  });
  
  return nearbySpots[0];
};

// 查找可用车库
const findAvailableGarageInRadius = (centerLon, centerLat, radiusInMeters = 200) => {
  if (!garages.value || garages.value.length === 0) {
    return null;
  }
  
  const nearbyGarages = garages.value.filter(garage => {
    if (!garage.position) return false;
    
    const distance = calculateDistance([centerLon, centerLat], garage.position);
    return distance <= radiusInMeters && !garage.isFull;
  });
  
  if (nearbyGarages.length === 0) {
    return null;
  }
  
  nearbyGarages.sort((a, b) => {
    const distA = calculateDistance([centerLon, centerLat], a.position);
    const distB = calculateDistance([centerLon, centerLat], b.position);
    return distA - distB;
  });
  
  return nearbyGarages[0];
};

// 计算统计信息
const totalSpots = computed(() => parkingSpots.value.length);
const occupiedSpots = computed(() => parkingSpots.value.filter(spot => spot.isOccupied).length);
const availableSpots = computed(() => totalSpots.value - occupiedSpots.value);

const totalGarages = computed(() => garages.value.length);
const occupiedGarages = computed(() => garages.value.filter(garage => garage.isOccupied).length);
const availableGarages = computed(() => totalGarages.value - occupiedGarages.value);

// 根据占用率获取占用等级
const getOccupancyLevel = (occupancyRate) => {
  const rate = parseFloat(occupancyRate) || 0;
  if (rate === 0) return '0';
  if (rate <= 25) return '25';
  if (rate <= 50) return '50';
  if (rate <= 75) return '75';
  return '100';
};

// 加载车位数据
const loadParkingData = async () => {
  try {
    isLoading.value = true;
    const response = await fetch('/src/assets/ships/车位new.geojson');
    const data = await response.json();
    
    parkingSpots.value = data.features.map((feature, index) => {
      const coordinates = feature.geometry.coordinates;
      const center = calculatePolygonCenter(coordinates[0][0]);
      const spotId = feature.properties?.id || feature.properties?.ID || feature.properties?.name || (index + 1);
      
      const area = calculatePolygonArea(coordinates[0][0]);
      const maxCapacity = Math.max(1, Math.floor(area / 1)); // 改为每1平方米1辆单车
      
      return {
        id: spotId,
        coordinates: coordinates,
        center: center,
        area: area,
        maxCapacity: maxCapacity,
        isOccupied: false,
        bikeCount: 0,
        isFull: false,
        occupancyRate: '0.0'
      };
    });

    console.log('加载的车位数据:', parkingSpots.value);
    
  } catch (error) {
    console.error('加载车位数据失败:', error);
  } finally {
    isLoading.value = false;
  }
};

// 加载车库数据
const loadGarageData = async () => {
  try {
    isLoading.value = true;
    const response = await fetch('/src/assets/ships/车库点.geojson');
    const data = await response.json();
    
    garages.value = data.features.map((feature, index) => {
      const coordinates = feature.geometry.coordinates;
      const garageName = feature.properties?.Name || 
                        feature.properties?.name || 
                        `车库 #${feature.properties?.Number || (index + 1)}`;
      const garageId = feature.properties?.Number || 
                      feature.properties?.id || 
                      feature.properties?.ID || 
                      (index + 1);
      
      return {
        id: garageId,
        name: garageName,
        position: coordinates,
        maxCapacity: GARAGE_CAPACITY,
        isOccupied: false,
        bikeCount: 0,
        isFull: false,
        occupancyRate: '0.0'
      };
    });

    console.log('加载的车库数据:', garages.value);
    
  } catch (error) {
    console.error('加载车库数据失败:', error);
  } finally {
    isLoading.value = false;
  }
};

// 刷新数据
const refreshParkingData = async () => {
  await loadParkingData();
  updateParkingStatus();
  if (showVisualization.value) {
    visualizeAll();
  }
};

const refreshGarageData = async () => {
  await loadGarageData();
  updateGarageStatus();
  if (showVisualization.value) {
    visualizeAll();
  }
};

// 更新车位占用状态
const updateParkingStatus = () => {
  const bikes = bikeStore.getAllBikes();
  if (!bikes || !parkingSpots.value) return;
  
  parkingSpots.value = parkingSpots.value.map(spot => {
    const bikesInSpot = bikes.filter(bike => {
      if (bike.status !== 'parked') return false;
      return isPointInPolygon(
        [bike.longitude, bike.latitude],
        spot.coordinates[0][0]
      );
    });

    const bikeCount = bikesInSpot.length;
    const isOccupied = bikeCount > 0;
    const isFull = bikeCount >= spot.maxCapacity;
    const occupancyRate = (bikeCount / spot.maxCapacity * 100).toFixed(1);

    return {
      ...spot,
      bikeCount,
      isOccupied,
      isFull,
      occupancyRate
    };
  });
};

// 更新车库占用状态
const updateGarageStatus = () => {
  const bikes = bikeStore.getAllBikes();
  if (!bikes || !garages.value) return;
  
  garages.value = garages.value.map(garage => {
    const bikesInGarage = bikes.filter(bike => {
      if (bike.status !== 'parked') return false;
      return isPointInGarageRadius(
        [bike.longitude, bike.latitude],
        garage.position,
        50 // 50米范围内
      );
    });

    const bikeCount = bikesInGarage.length;
    const isOccupied = bikeCount > 0;
    const isFull = bikeCount >= garage.maxCapacity;
    const occupancyRate = (bikeCount / garage.maxCapacity * 100).toFixed(1);

    return {
      ...garage,
      bikeCount,
      isOccupied,
      isFull,
      occupancyRate
    };
  });
};

// 可视化所有设施
const visualizeAll = () => {
  if (showVisualization.value) {
    clearEntities();
    visualizeParkingSpots();
    visualizeGarages();
    console.log('可视化已更新，当前车库状态:', garages.value.map(g => ({ name: g.name, bikeCount: g.bikeCount })));
  } else {
    clearEntities();
  }
};

// 切换可视化显示
const toggleVisualization = () => {
  showVisualization.value = !showVisualization.value;
  visualizeAll();
};

// 在 Cesium 地图上可视化车位
const visualizeParkingSpots = () => {
  if (!bikeStore.viewer || !parkingSpots.value.length || !showVisualization.value) return;
  
  parkingSpots.value.forEach(spot => {
    try {
      const coordinateArray = spot.coordinates[0][0].reduce((acc, coord) => {
        acc.push(coord[0], coord[1]);
        return acc;
      }, []);

      let color = Cesium.Color.GREEN.withAlpha(0.6);
      
      if (spot.isFull) {
        color = Cesium.Color.RED.withAlpha(0.6);
      } else if (spot.isOccupied) {
        color = Cesium.Color.YELLOW.withAlpha(0.6);
      }

      const displayId = spot.id !== undefined && spot.id !== null ? spot.id : '未知';

      bikeStore.viewer.entities.add({
        name: `车位 #${displayId}`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(coordinateArray),
          material: color,
          outline: true,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          height: PARKING_HEIGHT,
          extrudedHeight: PARKING_HEIGHT + 2
        },
        description: `
          <table class="cesium-infoBox-defaultTable">
            <tr><th>车位编号</th><td>#${displayId}</td></tr>
            <tr><th>面积</th><td>${spot.area.toFixed(2)} m²</td></tr>
            <tr><th>最大容量</th><td>${spot.maxCapacity}</td></tr>
            <tr><th>当前状态</th><td>${spot.isFull ? '已满' : (spot.isOccupied ? '已占用' : '空闲')}</td></tr>
            <tr><th>停放数量</th><td>${spot.bikeCount}/${spot.maxCapacity}</td></tr>
            <tr><th>占用率</th><td>${spot.occupancyRate}%</td></tr>
          </table>
        `
      });
    } catch (error) {
      console.error('创建车位可视化失败:', error, spot);
    }
  });
};

// 在 Cesium 地图上可视化车库
const visualizeGarages = () => {
  if (!bikeStore.viewer || !garages.value.length || !showVisualization.value) return;
  
  garages.value.forEach(garage => {
    try {
      let color = Cesium.Color.BLUE.withAlpha(0.7);
      
      if (garage.isFull) {
        color = Cesium.Color.RED.withAlpha(0.7);
      } else if (garage.isOccupied) {
        color = Cesium.Color.ORANGE.withAlpha(0.7);
      }

      const displayId = garage.id !== undefined && garage.id !== null ? garage.id : '未知';
      const displayName = garage.name || `车库 #${displayId}`;

      const lon = garage.position[0];
      const lat = garage.position[1];

      bikeStore.viewer.entities.add({
        name: `车库 #${displayId}`,
        position: Cesium.Cartesian3.fromDegrees(
          lon,
          lat,
          PARKING_HEIGHT + GARAGE_CYLINDER_HEIGHT / 2
        ),
        cylinder: {
          topRadius: GARAGE_CYLINDER_RADIUS,
          bottomRadius: GARAGE_CYLINDER_RADIUS,
          length: GARAGE_CYLINDER_HEIGHT,
          material: color,
          outline: true,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2
        },
        description: `
          <table class="cesium-infoBox-defaultTable">
            <tr><th>车库名称</th><td>${displayName}</td></tr>
            <tr><th>车库编号</th><td>#${displayId}</td></tr>
            <tr><th>最大容量</th><td>${garage.maxCapacity}</td></tr>
            <tr><th>当前状态</th><td>${garage.isFull ? '已满' : (garage.isOccupied ? '使用中' : '空闲')}</td></tr>
            <tr><th>停放数量</th><td>${garage.bikeCount}/${garage.maxCapacity}</td></tr>
            <tr><th>占用率</th><td>${garage.occupancyRate}%</td></tr>
          </table>
        `
      });
    } catch (error) {
      console.error('创建车库可视化失败:', error, garage);
    }
  });
};

// 刷新数据
const refreshData = async () => {
  isLoading.value = true;
  
  try {
    // 并行加载车位和车库数据
    await Promise.all([loadParkingData(), loadGarageData()]);
    
    // 更新状态
    updateParkingStatus();
    updateGarageStatus();
    
    // 可视化
    if (showVisualization.value) {
      visualizeAll();
    }
  } catch (error) {
    console.error('刷新数据失败:', error);
  } finally {
    isLoading.value = false;
  }
};

// 添加热力图开关功能
const toggleHeatmap = async () => {
  if (!bikeStore.viewer) {
    console.error('Cesium实例未初始化，无法使用热力图功能');
    return;
  }
  
  // 初始化热力图服务
  if (!BikeHeatmapService.viewer) {
    BikeHeatmapService.initialize(bikeStore.viewer);
  }
  
  try {
    // 切换热力图状态
    const isActive = await BikeHeatmapService.toggle();
    heatmapActive.value = isActive;
    
    if (isActive) {
      console.log('热力图已激活');
    } else {
      console.log('热力图已关闭');
    }
  } catch (error) {
    console.error('切换热力图状态失败:', error);
    heatmapActive.value = BikeHeatmapService.isActive;
  }
};

// 在generateHeatmap函数中添加热力图生成功能
const generateHeatmap = async () => {
  if (!bikeStore.viewer) {
    console.error('Cesium实例未初始化，无法使用热力图功能');
    return;
  }
  
  // 初始化热力图服务
  if (!BikeHeatmapService.viewer) {
    BikeHeatmapService.initialize(bikeStore.viewer);
  }
  
  // 激活热力图
  const success = await BikeHeatmapService.activate();
  heatmapActive.value = success;
};

// 生成随机预约码
const generateReservationCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// 打开预约弹窗
const openReservation = (garage) => {
  selectedGarage.value = garage;
  
  // 设置默认到达时间为当前时间后1小时
  const now = new Date();
  now.setHours(now.getHours() + 1);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  reservationForm.value = {
    userName: '',
    carNumber: '',
    phone: '',
    arrivalTime: `${year}-${month}-${day}T${hours}:${minutes}`,
    duration: 2
  };
  
  showReservation.value = true;
};

// 关闭预约弹窗
const closeReservation = () => {
  showReservation.value = false;
  selectedGarage.value = null;
};

// 提交预约
const submitReservation = async () => {
  // 简单验证
  if (!reservationForm.value.userName || !reservationForm.value.carNumber || !reservationForm.value.phone) {
    alert('请填写完整的预约信息');
    return;
  }
  
  isSubmitting.value = true;
  
  try {
    // 模拟提交延迟
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // 更新车库车辆数量
    if (selectedGarage.value) {
      const garageIndex = garages.value.findIndex(g => g.id === selectedGarage.value.id);
      if (garageIndex !== -1) {
        // 增加一辆车
        const updatedGarage = { ...garages.value[garageIndex] };
        updatedGarage.bikeCount += 1;
        
        // 更新状态
        updatedGarage.isOccupied = updatedGarage.bikeCount > 0;
        updatedGarage.isFull = updatedGarage.bikeCount >= updatedGarage.maxCapacity;
        updatedGarage.occupancyRate = (updatedGarage.bikeCount / updatedGarage.maxCapacity * 100).toFixed(1);
        
        // 使用数组替换方式更新车库数据，确保响应式
        garages.value = [
          ...garages.value.slice(0, garageIndex),
          updatedGarage,
          ...garages.value.slice(garageIndex + 1)
        ];
        
        console.log(`车库 ${updatedGarage.name} 更新后的车辆数量: ${updatedGarage.bikeCount}`);
        
        // 如果可视化开启，更新显示
        if (showVisualization.value) {
          visualizeAll();
        }
      }
    }
    
    // 生成预约码
    reservationCode.value = generateReservationCode();
    
    // 显示成功消息
    showSuccessMessage.value = true;
    
    // 关闭预约窗口
    showReservation.value = false;
  } catch (error) {
    console.error('预约提交失败:', error);
    alert('预约提交失败，请稍后重试');
  } finally {
    isSubmitting.value = false;
  }
};

// 关闭成功提示
const closeSuccessMessage = () => {
  showSuccessMessage.value = false;
  
  // 添加一个刷新状态的调用，确保显示最新数据
  updateGarageStatus();
  if (showVisualization.value) {
    visualizeAll();
  }
};

defineExpose({
  findAvailableParkingSpotInRadius,
  findAvailableGarageInRadius,
  parkingSpots,
  garages,
  runAnalysis
});
</script>

<style scoped lang="scss">
.parking-management {
  height: 100%;
  display: flex;
  flex-direction: column;
  
  .tab-switcher {
    display: flex;
    margin-bottom: 10px;
    background: var(--cl-panel-dark);
    border-radius: 4px;
    overflow: hidden;
    
    .tab-button {
      flex: 1;
      padding: 8px 12px;
      text-align: center;
      cursor: pointer;
      background: #4a90e2; // 改为蓝色背景
      color: white; // 白色文字
      transition: all 0.3s ease;
      font-size: 12px;
      
      &:hover {
        background: #357abd; // hover时深一点的蓝色
        color: white;
      }
      
      &.active {
        background: #2c5aa0; // 激活状态的深蓝色
        color: white;
        font-weight: bold;
      }
    }
  }
  
  .parking-content, .garage-content, .analysis-content {
    height: calc(100% - 50px);
    display: flex;
    flex-direction: column;
  }
  
  .status-header {
    padding: 10px;
    background: #4a90e2; // 修改为淡蓝色背景，与上方标签保持一致
    border-radius: 4px;
    margin-bottom: 10px;

    h4 {
      margin: 0 0 10px 0;
      color: white; // 改为白色以在蓝色背景上更清晰
      font-size: 14px;
    }
  }

  .status-summary {
    display: flex;
    justify-content: space-between;
    gap: 8px;

    .status-item {
      flex: 1;
      text-align: center;
      padding: 8px;
      border-radius: 4px;
      background: var(--cl-panel-light);
      
      &.available {
        border-left: 3px solid var(--cl-info);
      }
      
      &.occupied {
        border-left: 3px solid var(--cl-warning);
      }
      
      &.free {
        border-left: 3px solid var(--cl-success);
      }
      
      .label {
        display: block;
        font-size: 11px;
        color: var(--cl-text-secondary);
        margin-bottom: 2px;
      }
      
      .value {
        display: block;
        font-size: 16px;
        font-weight: bold;
        color: var(--cl-text);
      }
    }
  }

  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
    
    .control-btn {
      flex: 1;
      padding: 6px 12px;
      background: var(--cl-secondary);
      color: var(--cl-text);
      border: 1px solid var(--cl-border);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.3s ease;
      
      &:hover:not(:disabled) {
        background: var(--cl-hover);
      }
      
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }

  .parking-list, .garage-list {
    flex: 1;
    overflow-y: auto;
    padding: 5px 0;
  }

  .parking-item, .garage-item {
    padding: 12px;
    margin-bottom: 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.3s ease;
    border-left: 4px solid var(--cl-success);

    // 根据占用率动态设置背景色
    &[data-occupancy="0"] {
      background: #90ee90; // 淡绿色 (0%)
    }
    
    &[data-occupancy="25"] {
      background: #ffff99; // 淡黄色 (1-25%)
    }
    
    &[data-occupancy="50"] {
      background: #ffcc66; // 橙色 (26-50%)
    }
    
    &[data-occupancy="75"] {
      background: #ff9966; // 深橙色 (51-75%)
    }
    
    &[data-occupancy="100"] {
      background: #ff6666; // 红色 (76-100%)
    }

    &:hover {
      transform: translateX(5px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      filter: brightness(0.9); // hover时稍微变暗
      
      .click-hint {
        opacity: 1;
      }
    }

    &.occupied {
      border-left-color: var(--cl-warning);
    }

    &.full {
      border-left-color: var(--cl-danger);
    }

    .spot-info, .garage-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;

      .spot-id, .garage-id {
        font-weight: bold;
        font-size: 14px;
        color: #000; // 黑色字体以便在浅色背景上清晰显示
      }

      .spot-status, .garage-status {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 12px;
        color: white;
        font-weight: bold;
        
        &.status-free {
          background-color: var(--cl-success);
        }
        
        &.status-occupied {
          background-color: var(--cl-warning);
        }
        
        &.status-full {
          background-color: var(--cl-danger);
        }
      }
    }

    .spot-details, .garage-details {
      .detail-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
        
        .detail-label {
          font-size: 12px;
          color: #333; // 深灰色以便在浅色背景上清晰显示
        }
        
        .detail-value {
          font-size: 12px;
          color: #000; // 黑色以便在浅色背景上清晰显示
          font-weight: 500;
        }
      }
    }

    .click-hint {
      font-size: 10px;
      color: #666; // 深灰色以便在浅色背景上清晰显示
      text-align: center;
      margin-top: 8px;
      padding: 4px;
      background: rgba(0, 0, 0, 0.1); // 黑色半透明背景
      border-radius: 3px;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
  }

  // 车库特殊样式
  .garage-item {
    border-left-color: #2196f3;
    
    &.occupied {
      border-left-color: var(--cl-warning);
    }

    &.full {
      border-left-color: var(--cl-danger);
    }
    
    .garage-status {
      &.status-free {
        background-color: #2196f3;
      }
    }
  }

  // 智能分析内容
  .analysis-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 10px;
    background: var(--cl-panel-light);
    border-radius: 4px;
    margin-top: 10px;

    .status-header {
      background: #4caf50; // 修改为绿色背景
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 12px;

      h4 {
        margin: 0;
        color: white;
        font-size: 16px;
      }
    }

    .status-summary {
      display: flex;
      justify-content: space-between;
      gap: 10px;

      .status-item {
        flex: 1;
        text-align: center;
        padding: 10px;
        border-radius: 4px;
        background: var(--cl-panel-dark);
        
        &.available {
          border-left: 3px solid var(--cl-info);
        }
        
        &.occupied {
          border-left: 3px solid var(--cl-warning);
        }
        
        &.free {
          border-left: 3px solid var(--cl-success);
        }
        
        .label {
          display: block;
          font-size: 12px;
          color: var(--cl-text-secondary);
          margin-bottom: 4px;
        }
        
        .value {
          display: block;
          font-size: 18px;
          font-weight: bold;
          color: var(--cl-text);
        }
      }
    }

    .analysis-controls {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 12px;
      
      .control-btn {
        padding: 10px;
        background: #4a90e2;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        transition: all 0.3s ease;
        
        &:hover:not(:disabled) {
          background: #357abd;
        }
        
        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      }
      
      .query-input {
        input {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          
          &:focus {
            outline: none;
            border-color: #4a90e2;
            box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.3);
          }
          
          &:disabled {
            background: #f5f5f5;
            cursor: not-allowed;
          }
        }
      }
    }

    .analysis-output {
      flex: 1;
      overflow-y: auto;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      padding: 2px;
      
      .empty-state {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
        padding: 20px;
        color: #666;
        text-align: center;
        font-style: italic;
      }
      
      .loading-state {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        color: #4a90e2;
        
        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(74, 144, 226, 0.2);
          border-radius: 50%;
          border-top-color: #4a90e2;
          animation: spin 1s ease-in-out infinite;
          margin-bottom: 10px;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      }
      
      .result-container {
        .result-item {
          background: rgba(255, 255, 255, 0.9);
          border-radius: 6px;
          margin-bottom: 12px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          
          .result-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            background: #4a90e2;
            color: white;
            
            .result-title {
              font-weight: bold;
              font-size: 14px;
            }
            
            .result-time {
              font-size: 12px;
              opacity: 0.8;
            }
          }
          
          .result-summary {
            padding: 10px;
            background: #f0f7ff;
            
            h5 {
              margin: 0 0 8px 0;
              color: #2c5aa0;
              font-size: 14px;
            }
            
            .summary-item {
              display: flex;
              margin-bottom: 4px;
              
              .summary-label {
                flex: 0 0 100px;
                font-weight: 500;
                color: #555;
              }
              
              .summary-value {
                flex: 1;
                color: #000;
              }
            }
          }
          
          .result-recommendations {
            padding: 10px;
            background: #eefbf5;
            
            h5 {
              margin: 0 0 8px 0;
              color: #00796b;
              font-size: 14px;
            }
            
            .recommendation-item {
              display: flex;
              align-items: flex-start;
              margin-bottom: 8px;
              padding: 8px;
              background: rgba(255, 255, 255, 0.6);
              border-radius: 4px;
              
              &.immediate {
                border-left: 3px solid #ff5722;
              }
              
              &.longTerm {
                border-left: 3px solid #2196f3;
              }
              
              .rec-badge {
                flex: 0 0 auto;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 11px;
                font-weight: bold;
                color: white;
                margin-right: 8px;
                
                &.immediate {
                  background: #ff5722;
                }
                
                &.longterm {
                  background: #2196f3;
                }
              }
              
              .rec-content {
                flex: 1;
                font-size: 13px;
                
                .rec-highlight {
                  font-weight: bold;
                  color: #d32f2f;
                }
                
                .rec-priority {
                  display: inline-block;
                  padding: 1px 5px;
                  border-radius: 3px;
                  font-size: 10px;
                  margin-left: 6px;
                  color: white;
                  
                  &.高 {
                    background: #d32f2f;
                  }
                  
                  &.中 {
                    background: #ff9800;
                  }
                  
                  &.低 {
                    background: #4caf50;
                  }
                }
                
                .rec-description {
                  font-size: 12px;
                  color: #666;
                  margin-top: 4px;
                }
              }
            }
          }
          
          .result-content {
            padding: 12px;
            color: #333;
            font-size: 14px;
            line-height: 1.6;
            
            h4, h5 {
              color: #2c5aa0;
              margin: 15px 0 10px 0;
            }
            
            h4 {
              font-size: 16px;
            }
            
            h5 {
              font-size: 14px;
            }
            
            pre {
              background: #f5f5f5;
              padding: 10px;
              border-radius: 4px;
              overflow-x: auto;
              font-family: monospace;
              font-size: 13px;
            }
            
            strong {
              color: #2c5aa0;
            }
          }
          
          .result-actions {
            display: flex;
            gap: 8px;
            padding: 10px 12px;
            background: #f5f5f5;
            
            .action-btn {
              padding: 6px 12px;
              background: #4a90e2;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 13px;
              
              &:hover {
                background: #357abd;
              }
            }
          }
        }
      }
    }
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* 在<style>部分添加热力图按钮样式 */
  .control-btn.active {
    background: #e91e63;
    color: white;
  }

  // 预约弹窗样式
  .reservation-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    
    .reservation-content {
      background: white;
      width: 90%;
      max-width: 500px;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #4a90e2;
        color: white;
        
        h3 {
          margin: 0;
          font-size: 18px;
        }
        
        .close-btn {
          background: none;
          border: none;
          color: white;
          font-size: 24px;
          cursor: pointer;
          
          &:hover {
            color: #f0f0f0;
          }
        }
      }
      
      .modal-body {
        padding: 16px;
        max-height: 60vh;
        overflow-y: auto;
        
        .garage-info-modal {
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #eee;
          
          p {
            margin: 8px 0;
            font-size: 14px;
          }
        }
        
        .form-group {
          margin-bottom: 16px;
          
          label {
            display: block;
            margin-bottom: 6px;
            font-size: 14px;
            font-weight: 500;
            color: #333;
          }
          
          input {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            
            &:focus {
              outline: none;
              border-color: #4a90e2;
              box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
            }
          }
        }
      }
      
      .modal-footer {
        padding: 12px 16px;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        background: #f5f5f5;
        
        button {
          padding: 10px 16px;
          border-radius: 4px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          
          &.submit-btn {
            background: #4caf50;
            color: white;
            border: none;
            
            &:hover:not(:disabled) {
              background: #388e3c;
            }
            
            &:disabled {
              background: #a5d6a7;
              cursor: wait;
            }
          }
          
          &.cancel-btn {
            background: white;
            border: 1px solid #ddd;
            color: #333;
            
            &:hover {
              background: #f0f0f0;
            }
          }
        }
      }
    }
  }
  
  // 预约成功消息样式
  .success-message {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1010;
    
    .success-content {
      background: white;
      width: 90%;
      max-width: 400px;
      border-radius: 8px;
      padding: 24px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      
      .success-icon {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: #4caf50;
        color: white;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 32px;
        margin: 0 auto 16px;
      }
      
      h3 {
        margin: 0 0 12px;
        color: #4caf50;
        font-size: 22px;
      }
      
      p {
        margin: 8px 0;
        color: #666;
        font-size: 16px;
        
        &.reservation-code {
          background: #f5f5f5;
          padding: 12px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 20px;
          letter-spacing: 2px;
          color: #333;
          margin: 16px 0;
          font-weight: bold;
        }
      }
      
      .ok-btn {
        margin-top: 20px;
        padding: 10px 24px;
        background: #4a90e2;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.3s ease;
        
        &:hover {
          background: #357abd;
          transform: translateY(-2px);
        }
      }
    }
  }
}
</style>