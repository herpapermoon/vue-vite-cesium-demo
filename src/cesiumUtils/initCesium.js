import Cesium from '@/cesiumUtils/cesium'

// eslint-disable-next-line no-unused-vars
const addTileMapProvider = (viewer) => {
  const imageryViewModels = []
  imageryViewModels.push(
    new Cesium.ProviderViewModel({
      name: 'Google_COBALT',
      iconUrl: Cesium.buildModuleUrl('Widgets/Images/ImageryProviders/blueMarble.png'),
      tooltip: 'Google_COBALT',
      creationFunction() {
        return new Cesium.TileMapServiceImageryProvider({
          url: window.setting.geoServerBaseUrl,
          fileExtension: 'png'
        })
      }
    })
  )
  new Cesium.BaseLayerPicker('baseLayerPickerContainer', {
    globe: viewer.scene.globe,
    imageryProviderViewModels: imageryViewModels
  })
}

export const initCesium = (viewerName = '3d') => {
  // DEFAULT_VIEW in China
  Cesium.Camera.DEFAULT_VIEW_RECTANGLE = Cesium.Rectangle.fromDegrees(80, 22, 130, 50)
  Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhYjExMWQ2Ny1mZTQ3LTRkMTgtYWNhNS00M2Q3ZWIwNTU3MDIiLCJpZCI6MjkzOTU3LCJpYXQiOjE3NDg5NDg5ODd9.Owohi0CYZ5sKi4KuwY4VeArkiYHaAOm7LEg9aMCVq9A'
  // const url = '/geoserver' // Geoserver URL
  // const terrainUrl = '/terrain' // Terrain URL
  const is3D = viewerName === '3d'
  const containerName = is3D ? 'cesiumContainer' : 'cesiumContainer2D'
  const baseConf = {
    // imageryProvider: false,
    geocoder: false,
    navigationHelpButton: false,
    selectionIndicator: false,
    baseLayerPicker: false,
    showRenderLoopErrors: false
  }
  const extendConf = {}
  const viewer = new Cesium.Viewer(containerName, { ...baseConf, ...extendConf })
  // load terrain from Cesium IonResource site, also load your own terrain optionally
  const terrainLayer = new Cesium.CesiumTerrainProvider({
    // url: terrainUrl,
    url: Cesium.IonResource.fromAssetId(1),
    requestWaterMask: true,
    requestVertexNormals: true
  })
  viewer.scene.terrainProvider = terrainLayer
  viewer.scene.globe.enableLighting = true
  viewer.imageryLayers.addImageryProvider(
    new Cesium.IonImageryProvider({ assetId: 3 })
  )
  // load your own tile optionally
  // addTileMapProvider(viewer)
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(...[104, 30, 10000000]),
    orientation: {
      // heading
      heading: Cesium.Math.toRadians(0, 0),
      // pitch
      pitch: Cesium.Math.toRadians(-90),
      roll: 0.0
    }
  })
  viewer.clock.shouldAnimate = true
  window.cesiumViewer = viewer
  return viewer
}
