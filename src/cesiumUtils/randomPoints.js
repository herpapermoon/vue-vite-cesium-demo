import Cesium from '@/cesiumUtils/cesium'
import ship0 from '@/assets/ships/ship0.png'
import ship1 from '@/assets/ships/ship1.png'
import ship2 from '@/assets/ships/ship2.png'
import ship3 from '@/assets/ships/ship3.png'
import ship4 from '@/assets/ships/ship4.png'
import { loadRoadNetwork, generatePointsNearRoads } from './roadNetwork'
import { BikeStatus, getIconByStatus, initializeBikeMovement, destroyBikeMovement } from './bikeMovement'

// 单车图标资源数组
const images = [ship0, ship1, ship2, ship3, ship4]

// 单车高度（米）
const BIKE_HEIGHT = 17;

// 全局存储容器
let billboards = [] // 广告牌集合
let bikesData = [] // 校园单车数据存储

/**
 * 生成随机坐标点，沿道路网分布
 * @param {number} count - 生成的坐标点数量
 * @param {Array} center - 中心点坐标 [纬度, 经度, 高度]
 * @returns {Promise<Cesium.Cartesian3[]>} 三维笛卡尔坐标数组
 */
const generatePos = async (count = 200, center = [30.457, 114.615, 0]) => {
  // 加载道路网络数据
  const roadNetwork = await loadRoadNetwork();
  
  if (!roadNetwork) {
    // 如果加载失败，使用原有的随机生成逻辑
    console.warn('道路网络数据加载失败，使用随机分布');
    return generateRandomPos(count, center);
  }
  
  // 生成道路附近的点
  const [baseLat, baseLon, baseH] = center;
  const points = generatePointsNearRoads(
    roadNetwork, 
    count, 
    10,  // 最小距离10米
    100, // 最大距离100米
    [baseLon - 0.015, baseLat - 0.01, baseLon + 0.015, baseLat + 0.01] // 范围约束 - 已调整为wlcroad区域
  );
  
  // 如果生成的点不足，用随机点补充
  if (points.length < count) {
    console.warn(`仅生成了${points.length}个道路附近的点，将用随机点补充`);
    const randomPoints = generateRandomPos(count - points.length, center);
    
    // 转换生成的路点为Cesium.Cartesian3
    const roadPoints = points.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, baseH + BIKE_HEIGHT));
    
    // 合并道路点和随机点
    return [...roadPoints, ...randomPoints];
  }
  
  // 转换生成的点为Cesium.Cartesian3
  return points.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, baseH + BIKE_HEIGHT));
};

/**
 * 生成随机分布的点（原方法，用作备选）
 * @param {number} count - 生成的坐标点数量
 * @param {Array} center - 中心点坐标 [纬度, 经度, 高度]
 * @returns {Cesium.Cartesian3[]} 三维笛卡尔坐标数组
 */
const generateRandomPos = (count = 200, center = [30.457, 114.615, 0]) => {
  const [baseLat, baseLon, baseH] = center;
  
  return Array(count).fill().map(() => {
    // 限制生成范围（纬度±0.01度 ≈ 1.1km，经度±0.015度 ≈ 1.5km）
    const latOffset = (Math.random() * 0.02 - 0.01);  // 纬度范围
    const lonOffset = (Math.random() * 0.03 - 0.015); // 经度范围
    
    // 转换为Cesium三维坐标
    return Cesium.Cartesian3.fromDegrees(
      baseLon + lonOffset,  // 东经偏移
      baseLat + latOffset,  // 北纬偏移
      baseH + BIKE_HEIGHT   // 固定高度 + 单车高度(17米)
    );
  });
};

/**
 * 计算两点之间的距离（米）
 * @param {Array} point1 - 点1 [经度, 纬度]
 * @param {Array} point2 - 点2 [经度, 纬度]
 * @returns {number} 距离（米）
 */
export const calculateDistance = (point1, point2) => {
  const R = 6371000; // 地球半径（米）
  const [lon1, lat1] = point1;
  const [lon2, lat2] = point2;
  
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

/**
 * 调整摄像机位置以聚焦单车分布区域
 * @param {Cesium.Viewer} viewer - Cesium视图对象
 * @param {Array} positions - 位置数组
 */
const flyToBikes = (viewer, positions) => {
  if (!positions || positions.length === 0) return;
  
  // 计算边界球
  const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
  
  // 设置摄像机视角，留有一定的缓冲距离
  viewer.camera.flyToBoundingSphere(boundingSphere, {
    duration: 2.0,
    offset: new Cesium.HeadingPitchRange(0, -0.5, boundingSphere.radius * 2.5)
  });
};

/**
 * 主入口函数 - 随机生成单车
 * @param {Cesium.Viewer} viewer - Cesium视图对象
 * @param {number} count - 生成数量
 * @param {number} imgIndex - 图标索引
 * @returns {Promise<Array>} 单车数据数组
 */
export const randomGenerateBillboards = async (viewer, count, imgIndex) => {
  console.log(`开始生成${count}个道路网附近的随机点...`);
  
  // 生成武汉市道路网附近的坐标点
  const posArr = await generatePos(count);
  
  console.log(`成功生成${posArr.length}个符合条件的点，开始创建图元...`);
  
  // 初始化图元集合
  billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());
  
  // 清空现有单车数据
  bikesData = [];

  // 状态分布比例: 85% 停车，15% 骑行
  const statusDistribution = [
    { status: BikeStatus.PARKED, probability: 0.85 },
    { status: BikeStatus.RIDING, probability: 0.15 }
  ];

  posArr.forEach((position, index) => {
    // 根据概率随机分配状态
    const randomValue = Math.random();
    let randomStatus = BikeStatus.PARKED; // 默认停车
    let cumulativeProbability = 0;
    
    for (const statusInfo of statusDistribution) {
      cumulativeProbability += statusInfo.probability;
      if (randomValue <= cumulativeProbability) {
        randomStatus = statusInfo.status;
        break;
      }
    }
    
    // 根据状态选择图标
    const iconImage = getIconByStatus(randomStatus);
    
    // 创建广告牌
    const billboard = billboards.add({
      id: `bike-${index}`,
      position,
      image: iconImage,
      scale: 0.1,
      pixelOffset: new Cesium.Cartesian2(0, 0),
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER
    });
    
    // 获取WGS84坐标
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    
    // 存储单车数据
    const bikeInfo = {
      id: `bike-${index}`,
      position: position.clone(), // 存储Cartesian3坐标（三维坐标）
      longitude: lon,            // 经度
      latitude: lat,             // 纬度
      billboard: billboard,      // 对应的广告牌对象
      status: randomStatus,      // 状态
      lastUpdated: Date.now(),   // 最后更新时间
      modelType: `Model-${String.fromCharCode(65 + Math.floor(Math.random() * 5))}` // 随机型号A-E
    };
    
    // 添加到存储
    bikesData.push(bikeInfo);
  });
  
  // 初始化单车移动系统
  initializeBikeMovement(viewer, bikesData);
  
  // 初始化BikeStore
  try {
    const bikeStore = (await import('./BikeStore')).default;
    bikeStore.initialize(bikesData);
    
    // 尝试自动显示校园单车统计侧边栏
    setTimeout(() => {
      // 获取左侧边栏组件实例
      const leftSidebar = document.querySelector('.sidebar-container')?.__vueParentComponent?.ctx;
      if (leftSidebar && typeof leftSidebar.showBikeStats === 'function') {
        leftSidebar.showBikeStats();
      }
    }, 1000);
  } catch (error) {
    console.error('初始化BikeStore失败:', error);
  }
  
  // 自动调整摄像机位置
  flyToBikes(viewer, posArr);
  
  console.log(`成功创建${bikesData.length}个校园单车数据点`);
  return bikesData;
};

/**
 * 销毁校园单车图元
 */
export const destroyBillboard = () => {
  // 销毁移动系统
  destroyBikeMovement();
  
  if (billboards) {
    billboards = billboards.destroy();
  }
  
  bikesData = []; // 清空数据
};

/**
 * 获取所有校园单车数据
 * @returns {Array} 校园单车数据数组
 */
export const getAllBikes = () => {
  return bikesData;
};

/**
 * 根据ID获取单车数据
 * @param {string} id - 单车ID
 * @returns {Object|null} 单车数据对象或null
 */
export const getBikeById = (id) => {
  return bikesData.find(bike => bike.id === id) || null;
};

/**
 * 手动聚焦到单车分布区域
 * @param {Cesium.Viewer} viewer - Cesium视图对象
 */
export const focusOnBikes = (viewer) => {
  if (!bikesData || bikesData.length === 0) {
    console.warn('没有可用的单车数据，无法聚焦');
    return;
  }
  
  // 获取所有单车位置
  const positions = bikesData.map(bike => bike.position);
  
  // 飞向单车分布区域
  flyToBikes(viewer, positions);
};

// 导出状态枚举供其他模块使用
export { BikeStatus };