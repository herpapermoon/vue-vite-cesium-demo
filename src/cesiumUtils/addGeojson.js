import Cesium from '@/cesiumUtils/cesium'

// 武汉中心坐标
const viewPosition = [114.305469, 30.593175]
let buildingTileset

export const addGeojson = async(viewer) => {
  // 方案1：使用Cesium ion提供的全球3D建筑数据
  const ionAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIwMWI4NjEzMC1mMTUwLTRkYjItOTFmMC02YTQ3Nzc0NTQ4YjAiLCJpZCI6MjkzMTc2LCJpYXQiOjE3NDQzNjk4NTV9.kSLOXqOdJOAW28z0wxJaH7EnI21xucABvIDwiFzLj8U'; // 需要注册Cesium ion获取
  Cesium.Ion.defaultAccessToken = ionAccessToken;
  
  buildingTileset = viewer.scene.primitives.add(
    new Cesium.Cesium3DTileset({
      url: Cesium.IonResource.fromAssetId(96188), // 全球建筑数据集ID
      maximumScreenSpaceError: 2
    })
  )
  
  // 设置样式
  if (buildingTileset) {
    buildingTileset.style = new Cesium.Cesium3DTileStyle({
      color: 'color("white", 0.8)',
      show: true
    })
  }

  // 飞行到武汉
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      ...viewPosition,
      2000
    ),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0.0
    }
  })
}

export const removeGeojson = (viewer) => {
  if (buildingTileset && !buildingTileset.isDestroyed()) {
    viewer.scene.primitives.remove(buildingTileset)
    buildingTileset = undefined
  }
}
