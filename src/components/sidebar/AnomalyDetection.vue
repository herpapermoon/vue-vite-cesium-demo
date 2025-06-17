<!-- filepath: d:\cesium practice\3s practise\vue-vite-cesium-demo\src\components\sidebar\AnomalyDetection.vue -->
<template>
  <div class="anomaly-detection">
    <!-- 控制面板 -->
    <div class="control-panel">
      <div class="panel-header">
        <h3>🚨 异常骑行监测</h3>
        <div class="status-indicator" :class="{ active: isMonitoring }">
          {{ isMonitoring ? '监测中' : '已停止' }}
        </div>
      </div>

      <div class="controls">
        <button 
          @click="toggleMonitoring" 
          :class="['btn', isMonitoring ? 'btn-danger' : 'btn-primary']"
        >
          {{ isMonitoring ? '停止监测' : '开始监测' }}
        </button>
        
        <button @click="loadSampleData" class="btn btn-secondary">
          📂 加载数据
        </button>
        
        <button @click="detectCurrentTracks" class="btn btn-success">
          🔍 立即检测
        </button>
        
        <button @click="showSettings = !showSettings" class="btn btn-outline">
          ⚙️ 设置
        </button>
        
        <!-- 可视化控制按钮 -->
        <button @click="toggleVisualization" class="btn btn-info">
          🗺️ 显示地图
        </button>
        
        <button @click="clearVisualization" class="btn btn-warning">
          🧹 清除显示
        </button>
      </div>

      <!-- 检测设置 -->
      <div v-if="showSettings" class="settings-panel">
        <h4>检测参数设置</h4>
        <div class="setting-group">
          <label>速度范围 (km/h):</label>
          <div class="speed-inputs">
            <input 
              type="number" 
              v-model.number="detectionRules.speedLimit.min"
              placeholder="最小速度"
            />
            <span>-</span>
            <input 
              type="number" 
              v-model.number="detectionRules.speedLimit.max"
              placeholder="最大速度"
            />
          </div>
        </div>
        
        <div class="setting-group">
          <label>最大停留时间 (秒):</label>
          <input 
            type="number" 
            v-model.number="detectionRules.maxStopDuration"
          />
        </div>
        
        <div class="setting-group">
          <label>路径偏离距离 (米):</label>
          <input 
            type="number" 
            v-model.number="detectionRules.maxDeviationDistance"
          />
        </div>
        
        <!-- 新增：可视化设置 -->
        <div class="setting-group">
          <label>轨迹抬升高度 (米):</label>
          <input 
            type="number" 
            v-model.number="visualizationSettings.trackHeight"
            min="0"
            max="200"
          />
        </div>
        
        <div class="setting-group">
          <label>路网抬升高度 (米):</label>
          <input 
            type="number" 
            v-model.number="visualizationSettings.roadHeight"
            min="0"
            max="100"
          />
        </div>
        
        <div class="setting-group">
          <label>路网颜色:</label>
          <select v-model="visualizationSettings.roadColor">
            <option value="#00ff00">亮绿色</option>
            <option value="#ffff00">黄色</option>
            <option value="#ff8c00">橙色</option>
            <option value="#00ffff">青色</option>
            <option value="#ffffff">白色</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 实时监控统计 -->
    <div class="stats-panel">
      <div class="stat-item">
        <span class="stat-label">检测轨迹:</span>
        <span class="stat-value">{{ statistics.totalTracks }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">发现异常:</span>
        <span class="stat-value danger">{{ statistics.totalAnomalies }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">最后检测:</span>
        <span class="stat-value">{{ statistics.lastDetection }}</span>
      </div>
    </div>

    <!-- 异常列表 -->
    <div class="anomaly-list">
      <h4>当前异常 ({{ currentAnomalies.length }})</h4>
      <div class="anomaly-scroll">
        <div 
          v-for="anomaly in currentAnomalies" 
          :key="`${anomaly.bikeId}-${anomaly.type}-${anomaly.timestamp}`"
          class="anomaly-item"
          :class="anomaly.severity"
          @click="selectAndLocateAnomaly(anomaly)"
        >
          <div class="anomaly-header">
            <span class="bike-id">{{ anomaly.bikeId }}</span>
            <span class="anomaly-type">{{ getAnomalyTypeName(anomaly.type) }}</span>
            <span 
              class="severity-badge" 
              :style="{ backgroundColor: getAnomalySeverityColor(anomaly.severity) }"
            >
              {{ anomaly.severity }}
            </span>
          </div>
          <div class="anomaly-message">{{ anomaly.message }}</div>
          <div class="anomaly-time">
            {{ formatTime(anomaly.timestamp) }}
          </div>
        </div>
      </div>
    </div>

    <!-- 异常详情弹窗 -->
    <div v-if="selectedAnomaly" class="anomaly-modal" @click="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>异常详情</h3>
          <button @click="closeModal" type="button" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="detail-item">
            <label>单车ID:</label>
            <span>{{ selectedAnomaly.bikeId }}</span>
          </div>
          <div class="detail-item">
            <label>异常类型:</label>
            <span>{{ getAnomalyTypeName(selectedAnomaly.type) }}</span>
          </div>
          <div class="detail-item">
            <label>严重程度:</label>
            <span 
              class="severity-badge"
              :style="{ backgroundColor: getAnomalySeverityColor(selectedAnomaly.severity) }"
            >
              {{ selectedAnomaly.severity }}
            </span>
          </div>
          <div class="detail-item">
            <label>检测值:</label>
            <span>{{ selectedAnomaly.value }}</span>
          </div>
          <div class="detail-item">
            <label>阈值:</label>
            <span>{{ selectedAnomaly.threshold }}</span>
          </div>
          <div class="detail-item">
            <label>发生时间:</label>
            <span>{{ formatTime(selectedAnomaly.timestamp) }}</span>
          </div>
          <div class="detail-item">
            <label>位置:</label>
            <span v-if="selectedAnomaly.coordinates">
              {{ selectedAnomaly.coordinates[0].toFixed(6) }}, 
              {{ selectedAnomaly.coordinates[1].toFixed(6) }}
            </span>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="locateAnomaly(selectedAnomaly)" type="button" class="btn btn-primary">
            定位到地图
          </button>
          <button @click="closeModal" type="button" class="btn btn-secondary">
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { 
  detectAnomaliesLocal, 
  detectAnomaliesServer,
  getAnomalySeverityColor,
  formatAnomalyMessage,
  DEFAULT_DETECTION_RULES
} from '@/cesiumUtils/anomaly-detection';

// 导入 Cesium（重要！）
import * as Cesium from 'cesium';

export default {
  name: 'AnomalyDetection',
  data() {
    return {
      isMonitoring: false,
      showSettings: false,
      selectedAnomaly: null,
      currentAnomalies: [],
      trackData: null,
      roadNetwork: null,
      detectionRules: {
        speedLimit: {
          min: 5,
          max: 30
        },
        maxStopDuration: 300,
        maxDeviationDistance: 50,
        minTripDistance: 100,
        maxTripDuration: 3600
      },
      statistics: {
        totalTracks: 0,
        totalAnomalies: 0,
        lastDetection: '从未'
      },
      monitoringInterval: null,
      visualizationSettings: {
        trackHeight: 50,
        roadHeight: 30,
        roadColor: '#00ff00',
        roadWidth: 4,
        showLabels: true
      },
      highlightedBikeId: null,
      blinkingIntervals: {},
      persistentBlinkingIntervals: {}
    };
  },
  
  mounted() {
    console.log('AnomalyDetection组件已挂载');
  },
  
  methods: {
    // 获取 Cesium viewer 实例
    getCesiumViewer() {
      if (window.cesiumViewer) {
        return window.cesiumViewer;
      }
      
      if (this.$root.$cesiumViewer) {
        return this.$root.$cesiumViewer;
      }
      
      const cesiumContainer = document.getElementById('cesiumContainer');
      if (cesiumContainer && cesiumContainer._cesiumViewer) {
        return cesiumContainer._cesiumViewer;
      }
      
      console.error('未找到 Cesium viewer 实例');
      return null;
    },

    // 切换监测状态
    toggleMonitoring() {
      if (this.isMonitoring) {
        this.stopMonitoring();
      } else {
        this.startMonitoring();
      }
    },

    // 开始监测
    startMonitoring() {
      this.isMonitoring = true;
      console.log('开始异常监测');
      
      // 设置定时检测
      this.monitoringInterval = setInterval(() => {
        this.detectCurrentTracks();
      }, 10000); // 每10秒检测一次
      
      // 立即执行一次检测
      this.detectCurrentTracks();
    },

    // 停止监测
    stopMonitoring() {
      this.isMonitoring = false;
      console.log('停止异常监测');
      
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }
    },

    // 加载示例数据
    async loadSampleData() {
      try {
        console.log('加载数据文件...');
        
        // 加载路网数据
        const roadNetworkResponse = await fetch('/data/wlcroad.geojson');
        if (!roadNetworkResponse.ok) {
          throw new Error(`加载路网数据失败: ${roadNetworkResponse.status}`);
        }
        this.roadNetwork = await roadNetworkResponse.json();
        console.log('路网数据加载成功，特征数量:', this.roadNetwork.features.length);

        // 加载轨迹数据
        const tracksResponse = await fetch('/data/sample-tracks.geojson');
        if (!tracksResponse.ok) {
          throw new Error(`加载轨迹数据失败: ${tracksResponse.status}`);
        }
        this.trackData = await tracksResponse.json();
        console.log('轨迹数据加载成功，轨迹数量:', this.trackData.features.length);

        // 更新统计信息
        this.statistics.totalTracks = this.trackData.features.length;
        
        // 验证数据格式
        this.validateLoadedData();

        this.$message?.success(`数据加载成功: ${this.roadNetwork.features.length} 条路网, ${this.trackData.features.length} 条轨迹`);
        
      } catch (error) {
        console.error('加载数据失败:', error);
        this.$message?.error('加载数据失败: ' + error.message);
        
        // 如果加载失败，使用示例数据
        this.loadFallbackData();
      }
    },

    // 验证加载的数据格式
    validateLoadedData() {
      console.log('验证数据格式...');
      
      // 验证路网数据
      if (this.roadNetwork && this.roadNetwork.features) {
        const validRoads = this.roadNetwork.features.filter(feature => 
          feature.geometry && 
          (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') &&
          feature.geometry.coordinates && 
          feature.geometry.coordinates.length > 0
        );
        console.log(`有效路网特征: ${validRoads.length}/${this.roadNetwork.features.length}`);
        
        // 打印第一条路网信息
        if (validRoads.length > 0) {
          const firstRoad = validRoads[0];
          console.log('第一条路网示例:', {
            name: firstRoad.properties?.name || '未命名',
            type: firstRoad.geometry.type,
            coordinates: firstRoad.geometry.coordinates.length
          });
        }
      }

      // 验证轨迹数据
      if (this.trackData && this.trackData.features) {
        const validTracks = this.trackData.features.filter(feature => 
          feature.geometry && 
          feature.geometry.type === 'LineString' &&
          feature.geometry.coordinates && 
          feature.geometry.coordinates.length > 1 &&
          feature.properties && 
          feature.properties.bikeId
        );
        console.log(`有效轨迹特征: ${validTracks.length}/${this.trackData.features.length}`);
        
        // 打印第一条轨迹信息
        if (validTracks.length > 0) {
          const firstTrack = validTracks[0];
          console.log('第一条轨迹示例:', {
            bikeId: firstTrack.properties.bikeId,
            coordinates: firstTrack.geometry.coordinates.length,
            avgSpeed: firstTrack.properties.avgSpeed,
            totalDistance: firstTrack.properties.totalDistance
          });
        }
      }
    },

    // 备用数据加载（如果文件加载失败）
    loadFallbackData() {
      console.log('使用备用示例数据...');
      
      // 简单的备用轨迹数据
      this.trackData = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              bikeId: "BIKE_001",
              userId: "USER_123",
              startTime: "2025-06-05T08:00:00Z",
              endTime: "2025-06-05T08:04:20Z",
              totalDistance: 450,
              avgSpeed: 14.2,
              status: "completed",
              stopDuration: 0
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [114.610569625172772, 30.45789442004131, 1717574400000],
                [114.6107355, 30.4581928, 1717574460000],
                [114.6110343, 30.4587302, 1717574520000],
                [114.6112538, 30.4586638, 1717574580000],
                [114.611506, 30.4585531, 1717574640000]
              ]
            }
          }
        ]
      };

      // 简单的备用路网数据
      this.roadNetwork = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              name: "测试道路",
              fclass: "tertiary"
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [114.610569625172772, 30.45789442004131],
                [114.611506, 30.4585531]
              ]
            }
          }
        ]
      };

      this.statistics.totalTracks = this.trackData.features.length;
      console.log('备用数据加载完成');
    },

    // 检测当前轨迹 - 修改为使用真实数据进行异常检测
    async detectCurrentTracks() {
      if (!this.trackData || !this.trackData.features || this.trackData.features.length === 0) {
        console.warn('没有轨迹数据可供检测');
        this.$message?.warning('请先加载轨迹数据');
        return;
      }

      try {
        console.log('开始异常检测...');
        
        const anomalies = [];
        
        // 遍历所有轨迹进行异常检测
        this.trackData.features.forEach((track, index) => {
          try {
            const properties = track.properties;
            const geometry = track.geometry;
            
            if (!properties || !geometry || !geometry.coordinates) {
              console.warn(`轨迹 ${index} 数据不完整`);
              return;
            }

            const bikeId = properties.bikeId || `BIKE_${index}`;
            const avgSpeed = properties.avgSpeed || 0;
            const stopDuration = properties.stopDuration || 0;
            const totalDistance = properties.totalDistance || 0;
            const coordinates = geometry.coordinates;
            
            // 检测规则1: 速度过快
            if (avgSpeed > this.detectionRules.speedLimit.max) {
              const midPoint = coordinates[Math.floor(coordinates.length / 2)];
              anomalies.push({
                bikeId: bikeId,
                type: "SPEED_TOO_FAST",
                severity: avgSpeed > 50 ? "critical" : avgSpeed > 30 ? "high" : "medium",
                message: `车辆速度过快（${avgSpeed.toFixed(1)} km/h）`,
                coordinates: [midPoint[0], midPoint[1], 30],
                timestamp: new Date().toISOString(),
                trackIndex: index,
                details: {
                  avgSpeed: avgSpeed,
                  speedLimit: this.detectionRules.speedLimit.max,
                  totalDistance: totalDistance
                }
              });
            }
            
            // 检测规则2: 速度过慢
            if (avgSpeed > 0 && avgSpeed < this.detectionRules.speedLimit.min) {
              const midPoint = coordinates[Math.floor(coordinates.length / 2)];
              anomalies.push({
                bikeId: bikeId,
                type: "SPEED_TOO_SLOW",
                severity: avgSpeed < 2 ? "high" : "medium",
                message: `车辆速度过慢（${avgSpeed.toFixed(1)} km/h）`,
                coordinates: [midPoint[0], midPoint[1], 30],
                timestamp: new Date().toISOString(),
                trackIndex: index,
                details: {
                  avgSpeed: avgSpeed,
                  speedLimit: this.detectionRules.speedLimit.min,
                  totalDistance: totalDistance
                }
              });
            }
            
            // 检测规则3: 长时间停留
            if (stopDuration > this.detectionRules.maxStopDuration) {
              const lastPoint = coordinates[coordinates.length - 1];
              anomalies.push({
                bikeId: bikeId,
                type: "LONG_STOP",
                severity: stopDuration > 600 ? "high" : "medium",
                message: `车辆长时间停留（${Math.round(stopDuration / 60)}分钟）`,
                coordinates: [lastPoint[0], lastPoint[1], 30],
                timestamp: new Date().toISOString(),
                trackIndex: index,
                details: {
                  stopDuration: stopDuration,
                  maxStopDuration: this.detectionRules.maxStopDuration,
                  totalDistance: totalDistance
                }
              });
            }
            
            // 检测规则4: 轨迹距离过短
            if (totalDistance < this.detectionRules.minTripDistance) {
              const firstPoint = coordinates[0];
              anomalies.push({
                bikeId: bikeId,
                type: "INSUFFICIENT_DATA",
                severity: "medium",
                message: `轨迹距离过短（${totalDistance}m）`,
                coordinates: [firstPoint[0], firstPoint[1], 30],
                timestamp: new Date().toISOString(),
                trackIndex: index,
                details: {
                  totalDistance: totalDistance,
                  minTripDistance: this.detectionRules.minTripDistance
                }
              });
            }
            
          } catch (error) {
            console.error(`处理轨迹 ${index} 时出错:`, error);
          }
        });

        this.currentAnomalies = anomalies;
        this.statistics.totalAnomalies = anomalies.length;
        this.statistics.lastDetection = new Date().toLocaleTimeString();
        
        console.log(`异常检测完成，发现 ${anomalies.length} 个异常:`, anomalies);
        
        // 显示检测结果
        if (anomalies.length > 0) {
          this.$message?.warning(`检测完成，发现 ${anomalies.length} 个异常`);
          
          // 自动更新可视化
          if (this.getCesiumViewer()) {
            setTimeout(() => {
              this.updateVisualization();
            }, 500);
          }
        } else {
          this.$message?.success('检测完成，未发现异常');
        }
        
      } catch (error) {
        console.error('异常检测失败:', error);
        this.$message?.error('异常检测失败: ' + error.message);
      }
    },

    // 修复 visualizeRoadNetworkDirect 方法 - 处理 MultiLineString
    visualizeRoadNetworkDirect() {
      if (!this.roadNetwork) {
        console.warn('路网数据未加载');
        return 0;
      }

      const viewer = this.getCesiumViewer();
      if (!viewer) {
        console.error('未找到地图实例');
        return 0;
      }

      try {
        // 清除之前的路网数据
        const existingRoadEntities = viewer.entities.values.filter(entity => 
          entity.name && entity.name.includes('路网')
        );
        existingRoadEntities.forEach(entity => viewer.entities.remove(entity));

        let count = 0;
        let errorCount = 0;
        
        this.roadNetwork.features.forEach((feature, index) => {
          try {
            if (!feature.geometry) {
              console.warn(`路网特征 ${index} 没有几何信息`);
              errorCount++;
              return;
            }

            const geometry = feature.geometry;
            const properties = feature.properties || {};
            const roadName = properties.name || `路网-${index}`;
            
            // 处理不同的几何类型
            let coordinatesArray = [];
            
            if (geometry.type === 'LineString') {
              coordinatesArray = [geometry.coordinates];
            } else if (geometry.type === 'MultiLineString') {
              coordinatesArray = geometry.coordinates;
            } else {
              console.warn(`不支持的几何类型: ${geometry.type}`);
              errorCount++;
              return;
            }

            // 为每个线段创建实体
            coordinatesArray.forEach((coordinates, lineIndex) => {
              if (!coordinates || coordinates.length < 2) {
                console.warn(`路网 ${index}-${lineIndex} 坐标不足`);
                return;
              }

              try {
                const positions = coordinates.map(coord => {
                  if (!coord || coord.length < 2) {
                    throw new Error('坐标格式错误');
                  }
                  return Cesium.Cartesian3.fromDegrees(
                    Number(coord[0]), 
                    Number(coord[1]), 
                    (Number(coord[2]) || 0) + this.visualizationSettings.roadHeight
                  );
                });

                const entityName = coordinatesArray.length > 1 ? 
                  `${roadName}-${lineIndex}` : roadName;

                viewer.entities.add({
                  name: `路网-${entityName}`,
                  polyline: {
                    positions: positions,
                    width: this.visualizationSettings.roadWidth,
                    material: Cesium.Color.fromCssColorString(this.visualizationSettings.roadColor),
                    clampToGround: false,
                    classificationType: Cesium.ClassificationType.TERRAIN
                  }
                });
                
                count++;
                
              } catch (coordError) {
                console.error(`路网 ${index}-${lineIndex} 坐标处理失败:`, coordError);
                errorCount++;
              }
            });
            
          } catch (error) {
            console.error(`路网 ${index} 处理失败:`, error);
            errorCount++;
          }
        });

        console.log(`路网可视化完成: 成功 ${count} 条，失败 ${errorCount} 条`);
        return count;
        
      } catch (error) {
        console.error('路网可视化失败:', error);
        return 0;
      }
    },

    // 飞到数据范围 - 根据实际数据计算范围
    flyToDataRange() {
      const viewer = this.getCesiumViewer();
      if (!viewer) return;

      try {
        // 收集所有坐标点
        const allCoordinates = [];
        
        // 从轨迹数据收集坐标
        if (this.trackData && this.trackData.features) {
          this.trackData.features.forEach(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
              feature.geometry.coordinates.forEach(coord => {
                if (coord && coord.length >= 2) {
                  allCoordinates.push([Number(coord[0]), Number(coord[1])]);
                }
              });
            }
          });
        }
        
        // 从路网数据收集坐标
        if (this.roadNetwork && this.roadNetwork.features) {
          this.roadNetwork.features.forEach(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
              if (feature.geometry.type === 'LineString') {
                feature.geometry.coordinates.forEach(coord => {
                  if (coord && coord.length >= 2) {
                    allCoordinates.push([Number(coord[0]), Number(coord[1])]);
                  }
                });
              } else if (feature.geometry.type === 'MultiLineString') {
                feature.geometry.coordinates.forEach(lineCoords => {
                  lineCoords.forEach(coord => {
                    if (coord && coord.length >= 2) {
                      allCoordinates.push([Number(coord[0]), Number(coord[1])]);
                    }
                  });
                });
              }
            }
          });
        }

        if (allCoordinates.length === 0) {
          console.warn('没有找到有效坐标，使用默认位置');
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(114.6103993, 30.4457187, 1000),
            duration: 2.0
          });
          return;
        }

        // 计算边界框
        const lons = allCoordinates.map(coord => coord[0]);
        const lats = allCoordinates.map(coord => coord[1]);
        
        const west = Math.min(...lons);
        const east = Math.max(...lons);
        const south = Math.min(...lats);
        const north = Math.max(...lats);
        
        console.log('数据边界:', { west, east, south, north });
        
        // 创建矩形并飞到该区域
        const rectangle = Cesium.Rectangle.fromDegrees(west, south, east, north);
        
        viewer.camera.flyTo({
          destination: rectangle,
          duration: 2.0
        });
        
      } catch (error) {
        console.error('飞到数据范围失败:', error);
        // 使用默认位置
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(114.6103993, 30.4457187, 1000),
          duration: 2.0
        });
      }
    },

    // 更新可视化
    updateVisualization() {
      console.log('更新可视化，当前异常数量:', this.currentAnomalies.length);
      
      // 重新显示异常点
      if (this.currentAnomalies.length > 0) {
        const anomalyCount = this.visualizeAnomaliesDirect();
        console.log(`显示了 ${anomalyCount} 个异常点`);
      }
      
      // 重新显示轨迹
      this.visualizeTracksDirect();
    },

    // 添加缺失的方法
    getAnomalyTypeName(type) {
      const typeNames = {
        'SPEED_TOO_FAST': '超速',
        'SPEED_TOO_SLOW': '速度过慢',
        'LONG_STOP': '长时间停留',
        'ROUTE_DEVIATION': '路径偏离',
        'INSUFFICIENT_DATA': '数据不足',
        'SUSPICIOUS_PATTERN': '可疑模式'
      };
      return typeNames[type] || type;
    },

    getAnomalySeverityColor(severity) {
      const colors = {
        'low': '#52c41a',
        'medium': '#faad14', 
        'high': '#ff7a45',
        'critical': '#ff4d4f'
      };
      return colors[severity] || '#666';
    },

    formatTime(timestamp) {
      if (!timestamp) return '未知';
      try {
        return new Date(timestamp).toLocaleTimeString('zh-CN');
      } catch (error) {
        return '时间格式错误';
      }
    },

    // 选择并定位异常
    selectAndLocateAnomaly(anomaly) {
      this.selectedAnomaly = anomaly;
      this.locateAnomaly(anomaly);
    },

    // 定位异常
    locateAnomaly(anomaly) {
      if (!anomaly || !anomaly.coordinates) {
        console.warn('异常位置信息不完整');
        return;
      }

      const viewer = this.getCesiumViewer();
      if (!viewer) {
        console.error('未找到地图实例');
        return;
      }

      try {
        const [lon, lat, height = 100] = anomaly.coordinates;
        const position = Cesium.Cartesian3.fromDegrees(lon, lat, height + 200);
        
        viewer.camera.flyTo({
          destination: position,
          duration: 2.0
        });

        console.log(`定位到异常位置: ${lon}, ${lat}`);
      } catch (error) {
        console.error('定位异常失败:', error);
      }
    },

    // 关闭模态框
    closeModal() {
      this.selectedAnomaly = null;
    },

    // 显示可视化
    toggleVisualization() {
      const viewer = this.getCesiumViewer();
      if (!viewer) {
        this.$message?.error('地图未初始化');
        return;
      }

      console.log('显示地图可视化');
      
      // 显示路网
      if (this.roadNetwork) {
        const roadCount = this.visualizeRoadNetworkDirect();
        console.log(`显示了 ${roadCount} 条路网`);
      }

      // 显示轨迹
      if (this.trackData) {
        const trackCount = this.visualizeTracksDirect();
        console.log(`显示了 ${trackCount} 条轨迹`);
      }

      // 显示异常点
      if (this.currentAnomalies.length > 0) {
        const anomalyCount = this.visualizeAnomaliesDirect();
        console.log(`显示了 ${anomalyCount} 个异常点`);
      }

      // 飞到数据范围
      this.flyToDataRange();
    },

    // 清除可视化
    clearVisualization() {
      const viewer = this.getCesiumViewer();
      if (!viewer) return;

      // 清除所有实体
      viewer.entities.removeAll();
      console.log('清除所有可视化内容');
      this.$message?.success('已清除地图显示');
    },

    // 可视化轨迹
    visualizeTracksDirect() {
      if (!this.trackData) {
        console.warn('轨迹数据未加载');
        return 0;
      }

      const viewer = this.getCesiumViewer();
      if (!viewer) {
        console.error('未找到地图实例');
        return 0;
      }

      try {
        // 清除之前的轨迹
        const existingTrackEntities = viewer.entities.values.filter(entity => 
          entity.name && entity.name.includes('轨迹')
        );
        existingTrackEntities.forEach(entity => viewer.entities.remove(entity));

        let count = 0;

        this.trackData.features.forEach((feature, index) => {
          try {
            if (!feature.geometry || !feature.geometry.coordinates) {
              return;
            }

            const coordinates = feature.geometry.coordinates;
            const properties = feature.properties || {};
            const bikeId = properties.bikeId || `BIKE_${index}`;

            if (coordinates.length < 2) {
              return;
            }

            const positions = coordinates.map(coord => {
              return Cesium.Cartesian3.fromDegrees(
                Number(coord[0]), 
                Number(coord[1]), 
                (Number(coord[2]) || 0) + this.visualizationSettings.trackHeight
              );
            });

            // 根据是否有异常决定颜色
            const hasAnomaly = this.currentAnomalies.some(anomaly => 
              anomaly.bikeId === bikeId
            );
            const trackColor = hasAnomaly ? '#ff4d4f' : '#1890ff';

            viewer.entities.add({
              name: `轨迹-${bikeId}`,
              polyline: {
                positions: positions,
                width: 3,
                material: Cesium.Color.fromCssColorString(trackColor),
                clampToGround: false
              }
            });

            count++;

          } catch (error) {
            console.error(`轨迹 ${index} 处理失败:`, error);
          }
        });

        console.log(`轨迹可视化完成: ${count} 条`);
        return count;

      } catch (error) {
        console.error('轨迹可视化失败:', error);
        return 0;
      }
    },

    // 可视化异常点
    visualizeAnomaliesDirect() {
      if (!this.currentAnomalies || this.currentAnomalies.length === 0) {
        console.warn('没有异常数据');
        return 0;
      }

      const viewer = this.getCesiumViewer();
      if (!viewer) {
        console.error('未找到地图实例');
        return 0;
      }

      try {
        // 清除之前的异常点
        const existingAnomalyEntities = viewer.entities.values.filter(entity => 
          entity.name && entity.name.includes('异常')
        );
        existingAnomalyEntities.forEach(entity => viewer.entities.remove(entity));

        let count = 0;

        this.currentAnomalies.forEach((anomaly, index) => {
          try {
            if (!anomaly.coordinates || anomaly.coordinates.length < 2) {
              return;
            }

            const [lon, lat, height = 5] = anomaly.coordinates;
            const position = Cesium.Cartesian3.fromDegrees(lon, lat, height);
            const color = this.getAnomalySeverityColor(anomaly.severity);

            viewer.entities.add({
              name: `异常-${anomaly.bikeId}-${anomaly.type}`,
              position: position,
              point: {
                pixelSize: 12,
                color: Cesium.Color.fromCssColorString(color),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.5)
              },
              label: {
                text: `${anomaly.bikeId}\n${this.getAnomalyTypeName(anomaly.type)}`,
                font: '12pt sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                pixelOffset: new Cesium.Cartesian2(0, -50),
                scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.5)
              }
            });

            count++;

          } catch (error) {
            console.error(`异常点 ${index} 处理失败:`, error);
          }
        });

        console.log(`异常点可视化完成: ${count} 个`);
        return count;

      } catch (error) {
        console.error('异常点可视化失败:', error);
        return 0;
      }
    },
  },

  beforeUnmount() {
    this.stopMonitoring();
    
    if (this.blinkingIntervals) {
      Object.values(this.blinkingIntervals).forEach(interval => clearInterval(interval));
    }
    
    if (this.persistentBlinkingIntervals) {
      Object.values(this.persistentBlinkingIntervals).forEach(interval => clearInterval(interval));
    }
  }
};
</script>

<style scoped>
.anomaly-detection {
  background: transparent;
  border-radius: 8px;
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: #e8f4fd; /* 浅蓝色文字 */
}

.control-panel {
  margin-bottom: 16px;
  flex-shrink: 0;
  background-color: #1e3a5f; /* 深蓝色背景 */
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  border: 1px solid #2d4a73; /* 蓝色边框 */
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.panel-header h3 {
  margin: 0;
  color: #4dabf7; /* 亮蓝色标题 */
}

.status-indicator {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  background: #2d4a73;
  color: #b3d4fc;
  border: 1px solid #3d5a83;
}

.status-indicator.active {
  background: #52c41a;
  color: white;
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 0;
}

.btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.btn-primary { 
  background: #1890ff; 
  color: white; 
}

.btn-secondary { 
  background: #3d5a83; 
  color: #b3d4fc; 
  border: 1px solid #4d6a93;
}

.btn-success { 
  background: #52c41a; 
  color: white; 
}

.btn-danger { 
  background: #ff4d4f; 
  color: white; 
}

.btn-outline { 
  background: transparent; 
  border: 1px solid #4dabf7; 
  color: #4dabf7; 
}

.btn-info {
  background: #17a2b8;
  color: white;
}

.btn-warning {
  background: #ffc107;
  color: #333;
}

.btn:hover {
  opacity: 0.8;
  transform: translateY(-1px);
}

.settings-panel {
  background: #264a73; /* 深蓝色设置面板 */
  padding: 12px;
  border-radius: 4px;
  margin-top: 12px;
  margin-bottom: 0;
  border: 1px solid #3d5a83;
}

.settings-panel h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #b3d4fc;
}

.setting-group {
  margin-bottom: 8px;
}

.setting-group:last-child {
  margin-bottom: 0;
}

.setting-group label {
  display: block;
  font-size: 12px;
  margin-bottom: 4px;
  color: #93c5fd; /* 浅蓝色标签 */
}

.setting-group input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #3d5a83;
  border-radius: 4px;
  background: #1e3a5f;
  color: #e8f4fd;
  font-size: 12px;
}

.setting-group input:focus {
  outline: none;
  border-color: #4dabf7;
  box-shadow: 0 0 0 2px rgba(77, 171, 247, 0.2);
}

.setting-group select {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #3d5a83;
  border-radius: 4px;
  background: #1e3a5f;
  color: #e8f4fd;
  font-size: 12px;
}

.setting-group select:focus {
  outline: none;
  border-color: #4dabf7;
  box-shadow: 0 0 0 2px rgba(77, 171, 247, 0.2);
}

/* 设置组标题样式优化 */
.settings-panel h4::after {
  content: '';
  display: block;
  width: 100%;
  height: 1px;
  background: linear-gradient(to right, #4dabf7, transparent);
  margin-top: 4px;
}

.speed-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.speed-inputs input {
  flex: 1;
}

.speed-inputs span {
  color: #93c5fd;
  font-size: 12px;
}

.stats-panel {
  background: #1e3a5f;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid #2d4a73;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.stat-item {
  text-align: center;
  flex: 1;
  min-width: 80px;
}

.stat-label {
  display: block;
  font-size: 11px;
  color: #93c5fd;
  margin-bottom: 4px;
}

.stat-value {
  display: block;
  font-size: 16px;
  font-weight: bold;
  color: #4dabf7;
}

.stat-value.danger {
  color: #ff4d4f;
}

.anomaly-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #1e3a5f;
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #2d4a73;
}

.anomaly-list h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #4dabf7;
  flex-shrink: 0;
}

.anomaly-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.anomaly-item {
  background: #264a73;
  border: 1px solid #3d5a83;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.anomaly-item:hover {
  background: #2d5080;
  border-color: #4dabf7;
  transform: translateY(-1px);
}

.anomaly-item:last-child {
  margin-bottom: 0;
}

.anomaly-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  flex-wrap: wrap;
  gap: 4px;
}

.bike-id {
  font-weight: bold;
  color: #4dabf7;
  font-size: 12px;
}

.anomaly-type {
  font-size: 11px;
  color: #93c5fd;
}

.severity-badge {
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 10px;
  color: white;
  font-weight: bold;
}

.anomaly-message {
  font-size: 11px;
  color: #b3d4fc;
  margin-bottom: 4px;
  line-height: 1.3;
}

.anomaly-time {
  font-size: 10px;
  color: #6b9bd8;
}

.anomaly-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-content {
  background: #1e3a5f;
  border-radius: 8px;
  padding: 0;
  max-width: 400px;
  width: 90%;
  max-height: 80vh;
  overflow: hidden;
  border: 1px solid #2d4a73;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.modal-header {
  background: #264a73;
  padding: 12px 16px;
  border-bottom: 1px solid #3d5a83;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  color: #4dabf7;
  font-size: 16px;
}

.close-btn {
  background: none;
  border: none;
  color: #93c5fd;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #ff4d4f;
}

.modal-body {
  padding: 16px;
  max-height: 60vh;
  overflow-y: auto;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #3d5a83;
}

.detail-item:last-child {
  border-bottom: none;
}

.detail-item label {
  font-weight: bold;
  color: #93c5fd;
  margin-right: 12px;
  flex-shrink: 0;
}

.detail-item span {
  color: #e8f4fd;
  text-align: right;
  word-break: break-all;
}

.modal-footer {
  padding: 12px 16px;
  border-top: 1px solid #3d5a83;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* 滚动条样式 */
.anomaly-scroll::-webkit-scrollbar {
  width: 4px;
}

.anomaly-scroll::-webkit-scrollbar-track {
  background: #2d4a73;
  border-radius: 2px;
}

.anomaly-scroll::-webkit-scrollbar-thumb {
  background: #4dabf7;
  border-radius: 2px;
}

.anomaly-scroll::-webkit-scrollbar-thumb:hover {
  background: #74c0fc;
}

/* 响应式设计 */
@media (max-width: 480px) {
  .controls {
    flex-direction: column;
  }
  
  .btn {
    width: 100%;
  }
  
  .stats-panel {
    flex-direction: column;
  }
  
  .anomaly-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .modal-content {
    width: 95%;
    margin: 10px;
  }
  
  .modal-footer {
    flex-direction: column;
  }
}
</style>