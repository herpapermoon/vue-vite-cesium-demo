<template>
  <div class="camera-setup-panel" :class="{ active: visible }">
    <div class="panel-header">
      <h3>摄像头管理</h3>
      <button class="close-btn" @click="close">×</button>
    </div>
    
    <div class="camera-list">
      <div v-if="cameras.length === 0" class="no-cameras">
        尚未添加摄像头，请点击下方按钮添加
      </div>
      
      <div 
        v-for="camera in cameras" 
        :key="camera.id" 
        class="camera-item"
        :class="{ active: camera.active }"
        @click="activateCamera(camera.id)"
      >
        <div class="camera-icon">
          <i class="camera-symbol"></i>
        </div>
        <div class="camera-info">
          <div class="camera-name">{{ camera.name }}</div>
          <div class="camera-position">
            位置: {{ formatCoordinate(camera.position[0]) }}, {{ formatCoordinate(camera.position[1]) }}
          </div>
        </div>
        <div class="camera-actions">
          <button class="edit-btn" @click.stop="editCamera(camera)">编辑</button>
          <button class="remove-btn" @click.stop="removeCamera(camera.id)">移除</button>
        </div>
      </div>
    </div>
    
    <div class="camera-form" v-if="showForm">
      <h4>{{ editMode ? '编辑摄像头' : '添加摄像头' }}</h4>
      
      <div class="form-group">
        <label>名称</label>
        <input v-model="form.name" placeholder="输入摄像头名称" />
      </div>
      
      <div class="form-group">
        <label>位置 (经度, 纬度, 高度)</label>
        <div class="coord-inputs">
          <input v-model.number="form.longitude" placeholder="经度" type="number" step="0.000001" />
          <input v-model.number="form.latitude" placeholder="纬度" type="number" step="0.000001" />
          <input v-model.number="form.height" placeholder="高度(米)" type="number" />
        </div>
      </div>
      
      <div class="form-group">
        <label>朝向 (方位角, 俯仰角, 翻滚角)</label>
        <div class="coord-inputs">
          <input v-model.number="form.heading" placeholder="方位角" type="number" step="1" />
          <input v-model.number="form.pitch" placeholder="俯仰角" type="number" step="1" />
          <input v-model.number="form.roll" placeholder="翻滚角" type="number" step="1" />
        </div>
      </div>
      
      <div class="form-group">
        <label>视场角</label>
        <div class="field-inputs">
          <div class="field-group">
            <label>水平</label>
            <input v-model.number="form.horizontalFOV" placeholder="水平视场角" type="number" min="1" max="120" />
          </div>
          <div class="field-group">
            <label>垂直</label>
            <input v-model.number="form.verticalFOV" placeholder="垂直视场角" type="number" min="1" max="120" />
          </div>
        </div>
      </div>
      
      <div class="form-group">
        <label>最大可视距离 (米)</label>
        <input v-model.number="form.maxDistance" placeholder="最大可视距离" type="number" min="1" />
      </div>
      
      <div class="form-actions">
        <button class="cancel-btn" @click="cancelEdit">取消</button>
        <button class="save-btn" @click="saveCamera">保存</button>
      </div>
    </div>
    
    <div class="panel-footer" v-if="!showForm">
      <button class="add-camera-btn" @click="addNewCamera">添加摄像头</button>
      <button 
        class="pick-position-btn" 
        :class="{ active: pickingPosition }"
        @click="togglePositionPicker"
      >
        {{ pickingPosition ? '取消选点' : '从地图选择位置' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import * as Cesium from 'cesium';

const props = defineProps({
  bikeDetector: {
    type: Object,
    required: true
  },
  visible: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'camera-added', 'camera-removed', 'camera-activated']);

// 摄像头列表
const cameras = ref([]);

// 表单相关状态
const showForm = ref(false);
const editMode = ref(false);
const editingCameraId = ref(null);
const form = ref({
  name: '',
  longitude: 0,
  latitude: 0,
  height: 10,
  heading: 0,
  pitch: -30,
  roll: 0,
  horizontalFOV: 60,
  verticalFOV: 45,
  maxDistance: 100
});

// 位置选择状态
const pickingPosition = ref(false);
let positionHandler = null;

// 格式化坐标显示
const formatCoordinate = (value) => {
  return value.toFixed(6);
};

// 关闭面板
const close = () => {
  // 确保关闭位置选择模式
  if (pickingPosition.value) {
    togglePositionPicker();
  }
  emit('close');
};

// 刷新摄像头列表
const refreshCameraList = () => {
  if (!props.bikeDetector || !props.bikeDetector.cameraManager) return;
  
  const cameraList = [];
  for (const [id, camera] of props.bikeDetector.cameraManager.cameras.entries()) {
    cameraList.push({
      id,
      name: camera.name,
      position: camera.position,
      direction: camera.direction,
      active: camera.active
    });
  }
  
  cameras.value = cameraList;
};

// 激活摄像头
const activateCamera = (id) => {
  if (!props.bikeDetector) return;
  
  props.bikeDetector.activateCamera(id);
  refreshCameraList();
  emit('camera-activated', id);
};

// 移除摄像头
const removeCamera = (id) => {
  if (!props.bikeDetector) return;
  
  if (confirm(`确定要移除摄像头 "${cameras.value.find(c => c.id === id)?.name}" 吗？`)) {
    props.bikeDetector.removeCamera(id);
    refreshCameraList();
    emit('camera-removed', id);
  }
};

// 添加新摄像头
const addNewCamera = () => {
  // 重置表单
  form.value = {
    name: `摄像头 ${cameras.value.length + 1}`,
    longitude: 116.3912,
    latitude: 39.9065,
    height: 30,
    heading: 0,
    pitch: -30,
    roll: 0,
    horizontalFOV: 60,
    verticalFOV: 45,
    maxDistance: 100
  };
  
  editMode.value = false;
  editingCameraId.value = null;
  showForm.value = true;
};

// 编辑摄像头
const editCamera = (camera) => {
  // 设置表单数据
  form.value = {
    name: camera.name,
    longitude: camera.position[0],
    latitude: camera.position[1],
    height: camera.position[2],
    heading: camera.direction[0],
    pitch: camera.direction[1],
    roll: camera.direction[2],
    horizontalFOV: props.bikeDetector.cameraManager.cameras.get(camera.id).horizontalFOV,
    verticalFOV: props.bikeDetector.cameraManager.cameras.get(camera.id).verticalFOV,
    maxDistance: props.bikeDetector.cameraManager.cameras.get(camera.id).maxDistance
  };
  
  editMode.value = true;
  editingCameraId.value = camera.id;
  showForm.value = true;
};

// 保存摄像头
const saveCamera = () => {
  if (!props.bikeDetector) return;
  
  // 验证表单
  if (!form.value.name.trim()) {
    alert('请输入摄像头名称');
    return;
  }
  
  // 准备摄像头数据
  const cameraData = {
    name: form.value.name,
    position: [form.value.longitude, form.value.latitude, form.value.height],
    direction: [form.value.heading, form.value.pitch, form.value.roll],
    horizontalFOV: form.value.horizontalFOV,
    verticalFOV: form.value.verticalFOV,
    maxDistance: form.value.maxDistance
  };
  
  if (editMode.value && editingCameraId.value) {
    // 先移除旧摄像头
    props.bikeDetector.removeCamera(editingCameraId.value);
    
    // 添加新摄像头，保持ID
    cameraData.id = editingCameraId.value;
  }
  
  // 添加摄像头
  const cameraId = props.bikeDetector.addCamera(cameraData);
  
  // 如果是编辑模式，保持原来的激活状态
  if (editMode.value && cameras.value.find(c => c.id === editingCameraId.value)?.active) {
    props.bikeDetector.activateCamera(cameraId);
  }
  
  // 刷新列表
  refreshCameraList();
  
  // 重置表单状态
  showForm.value = false;
  editMode.value = false;
  editingCameraId.value = null;
  
  // 触发事件
  emit('camera-added', cameraId);
};

// 取消编辑
const cancelEdit = () => {
  showForm.value = false;
  editMode.value = false;
  editingCameraId.value = null;
};

// 切换位置选择模式
const togglePositionPicker = () => {
  if (!props.bikeDetector || !props.bikeDetector.viewer) return;
  
  pickingPosition.value = !pickingPosition.value;
  
  if (pickingPosition.value) {
    // 启用点击选择位置
    const viewer = props.bikeDetector.viewer;
    
    // 显示鼠标指针提示
    viewer.cesiumWidget.canvas.style.cursor = 'crosshair';
    
    // 添加点击事件处理
    positionHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    positionHandler.setInputAction((click) => {
      // 使用pickEllipsoid获取地球表面位置
      const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      
      if (Cesium.defined(cartesian)) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const longitude = Cesium.Math.toDegrees(cartographic.longitude);
        const latitude = Cesium.Math.toDegrees(cartographic.latitude);
        
        // 尝试获取地形高度，如果支持的话
        let height = 0;
        if (viewer.scene.terrainProvider && viewer.scene.globe) {
          // 异步获取地形高度
          const promise = Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [cartographic]);
          
          // 使用Promise兼容方式处理，适用于新旧版本Cesium
          Promise.resolve(promise)
            .then((updatedPositions) => {
              height = updatedPositions[0].height || 0;
              
              // 确保高度是合理的值，如果低于5米则设为10米
              height = (height < 5) ? 10 : height + 10;
              
              // 自动添加新摄像头
              form.value = {
                name: `摄像头 ${cameras.value.length + 1}`,
                longitude,
                latitude,
                height, // 添加适当高度
                heading: 0,
                pitch: -30,
                roll: 0,
                horizontalFOV: 60,
                verticalFOV: 45,
                maxDistance: 100
              };
              
              editMode.value = false;
              editingCameraId.value = null;
              showForm.value = true;
              
              // 关闭选择模式
              togglePositionPicker();
            })
            .catch(error => {
              // 出错时使用默认高度
              console.warn('获取地形高度出错:', error);
              
              form.value = {
                name: `摄像头 ${cameras.value.length + 1}`,
                longitude,
                latitude,
                height: 10, // 默认高度
                heading: 0,
                pitch: -30,
                roll: 0,
                horizontalFOV: 60,
                verticalFOV: 45,
                maxDistance: 100
              };
              
              editMode.value = false;
              editingCameraId.value = null;
              showForm.value = true;
              
              // 关闭选择模式
              togglePositionPicker();
            });
        } else {
          // 如果无法获取地形高度，使用默认高度
          height = 10; // 默认高度为10米
          
          // 自动添加新摄像头
          form.value = {
            name: `摄像头 ${cameras.value.length + 1}`,
            longitude,
            latitude,
            height,
            heading: 0,
            pitch: -30,
            roll: 0,
            horizontalFOV: 60,
            verticalFOV: 45,
            maxDistance: 100
          };
          
          editMode.value = false;
          editingCameraId.value = null;
          showForm.value = true;
          
          // 关闭选择模式
          togglePositionPicker();
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    
  } else {
    // 禁用点击选择位置
    if (positionHandler) {
      positionHandler.destroy();
      positionHandler = null;
    }
    
    // 恢复默认鼠标指针
    if (props.bikeDetector.viewer) {
      props.bikeDetector.viewer.cesiumWidget.canvas.style.cursor = 'default';
    }
  }
};

// 监听面板可见性变化
watch(() => props.visible, (newValue) => {
  if (newValue) {
    refreshCameraList();
  } else {
    // 关闭位置选择模式
    if (pickingPosition.value) {
      togglePositionPicker();
    }
    
    // 关闭表单
    showForm.value = false;
  }
});

// 在组件挂载时设置
onMounted(() => {
  refreshCameraList();
});

// 在组件卸载时清理
onUnmounted(() => {
  if (positionHandler) {
    positionHandler.destroy();
    positionHandler = null;
  }
});
</script>

<style scoped>
.camera-setup-panel {
  position: absolute;
  top: 60px;
  right: -350px;
  width: 330px;
  background-color: rgba(30, 40, 50, 0.9);
  border: 1px solid var(--cl-border);
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  transition: right 0.3s ease-in-out;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 120px);
  color: white;
}

.camera-setup-panel.active {
  right: 10px;
}

.panel-header {
  padding: 10px 15px;
  border-bottom: 1px solid var(--cl-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: white;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  padding: 0 5px;
}

.close-btn:hover {
  color: var(--cl-primary);
}

.camera-list {
  padding: 10px;
  overflow-y: auto;
  flex: 1;
}

.no-cameras {
  padding: 20px;
  text-align: center;
  color: #aaa;
  font-style: italic;
}

.camera-item {
  margin-bottom: 10px;
  padding: 10px;
  background-color: rgba(50, 60, 70, 0.5);
  border-radius: 4px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.camera-item:hover {
  background-color: rgba(60, 70, 80, 0.7);
}

.camera-item.active {
  background-color: rgba(0, 128, 128, 0.3);
  border-color: var(--cl-primary);
}

.camera-icon {
  width: 40px;
  height: 40px;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
}

.camera-symbol {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid currentColor;
  position: relative;
}

.camera-symbol::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  background-color: currentColor;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.camera-info {
  flex: 1;
}

.camera-name {
  font-weight: bold;
  margin-bottom: 5px;
}

.camera-position {
  font-size: 12px;
  color: #ccc;
}

.camera-actions {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.camera-actions button {
  background: rgba(30, 40, 50, 0.7);
  border: 1px solid var(--cl-border);
  padding: 3px 8px;
  font-size: 12px;
  border-radius: 3px;
  cursor: pointer;
  color: white;
}

.edit-btn:hover {
  background-color: var(--cl-primary);
}

.remove-btn:hover {
  background-color: #e74c3c;
}

.panel-footer {
  padding: 10px;
  border-top: 1px solid var(--cl-border);
  display: flex;
  justify-content: space-between;
}

.add-camera-btn, .pick-position-btn {
  padding: 8px 12px;
  background-color: var(--cl-primary);
  border: none;
  border-radius: 3px;
  color: white;
  cursor: pointer;
  font-size: 14px;
}

.add-camera-btn:hover, .pick-position-btn:hover {
  background-color: var(--cl-hover);
}

.pick-position-btn.active {
  background-color: #e74c3c;
}

.camera-form {
  padding: 15px;
  border-top: 1px solid var(--cl-border);
}

.camera-form h4 {
  margin-top: 0;
  margin-bottom: 15px;
  color: white;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-size: 14px;
  color: #ddd;
}

.form-group input {
  width: 100%;
  padding: 8px;
  background-color: rgba(30, 30, 30, 0.7);
  border: 1px solid var(--cl-border);
  border-radius: 3px;
  color: white;
}

.coord-inputs {
  display: flex;
  gap: 5px;
}

.coord-inputs input {
  flex: 1;
}

.field-inputs {
  display: flex;
  gap: 10px;
}

.field-group {
  flex: 1;
}

.field-group label {
  font-size: 12px;
  color: #bbb;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.cancel-btn, .save-btn {
  padding: 8px 15px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.cancel-btn {
  background-color: #555;
  color: white;
}

.save-btn {
  background-color: var(--cl-primary);
  color: white;
}

.cancel-btn:hover {
  background-color: #666;
}

.save-btn:hover {
  background-color: var(--cl-hover);
}
</style> 