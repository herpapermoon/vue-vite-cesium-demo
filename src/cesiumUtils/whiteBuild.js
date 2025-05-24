// white build
import Cesium from '@/cesiumUtils/cesium'

let primitive
let tilesetPrimitive
function loadTilesShader(tileset) {
  tileset.style = new Cesium.Cesium3DTileStyle({
    color: {
      conditions: [
        ['true', 'rgba(240, 240, 245, 1)']  // 修改为浅灰白色，减少蓝色调
      ]
    }
  })
  tileset.tileVisible.addEventListener((tile) => {
    const { content } = tile
    const { featuresLength } = content
    for (let i = 0; i < featuresLength; i += 2) {
      const feature = content.getFeature(i)
      const model = feature.content._model
      if (model && model._sourcePrograms && model._rendererResources) {
        Object.keys(model._sourcePrograms).forEach((key) => {
          const program = model._sourcePrograms[key]
          const fragmentShader = model._rendererResources.sourceShaders[program.fragmentShader]
          let v_position = ''
          if (fragmentShader.indexOf(' v_positionEC;') !== -1) {
            v_position = 'v_positionEC'
          } else if (fragmentShader.indexOf(' v_pos;') !== -1) {
            v_position = 'v_pos'
          }
          const color = `vec4(${feature.color.toString()})`

          model._rendererResources.sourceShaders[program.fragmentShader] =
            `
            varying vec3 ${v_position};
            void main(void){
              vec4 position = czm_inverseModelView * vec4(${v_position},1);
              gl_FragColor = ${color}; // 基础颜色
              
              // 减弱高度渐变效果，提高系数使渐变更加细腻
              float heightFactor = position.z / 120.0;
              // 添加对比度，使模型更加清晰
              heightFactor = clamp(heightFactor, 0.5, 1.0);
              gl_FragColor *= vec4(vec3(heightFactor), 1.0);
              
              // 调整动画参数，使流光效果更加细腻
              float time = fract(czm_frameNumber / 200.0);
              time = abs(time - 0.5) * 2.0;
              
              // 增加光效范围，使建筑轮廓更加清晰
              float glowRange = 220.0;
              float glowIntensity = 0.003; // 降低光效的强度，提高清晰度
              
              // 优化边缘光效
              float diff = step(glowIntensity, abs(clamp(position.z / glowRange, 0.0, 1.0) - time));
              
              // 添加轻微的边缘高光，增强模型细节
              gl_FragColor.rgb += gl_FragColor.rgb * (1.0 - diff) * 0.8;
              
              // 提高整体亮度和对比度
              gl_FragColor.rgb = gl_FragColor.rgb * 1.1;
              gl_FragColor.rgb = clamp(gl_FragColor.rgb, 0.0, 1.0);
            }
          `
        })
        model._shouldRegenerateShaders = true
      }
    }
  })
}
export const setWhiteBuild = (viewer, active) => {
  if (active) {
    if (primitive) {
      viewer.zoomTo(
        tilesetPrimitive,
        new Cesium.HeadingPitchRange(
          0.0,
          -0.45, // 略微调整俯角以获得更好的视角
          tilesetPrimitive.boundingSphere.radius * 1.8 // 稍微拉近以看清细节
        )
      )
      return
    }
    primitive = viewer.scene.primitives.add(new Cesium.PrimitiveCollection())
    new Cesium.Cesium3DTileset({
      url: '/city/CugMoudle_3Dtiles.json',
      maximumScreenSpaceError: 2, // 降低屏幕空间误差，提高清晰度
      maximumMemoryUsage: 2048 // 增加内存使用上限，提高模型质量
    }).readyPromise
      .then((data) => {
        tilesetPrimitive = data
        primitive.add(tilesetPrimitive)
        loadTilesShader(tilesetPrimitive)
        viewer.zoomTo(
          tilesetPrimitive,
          new Cesium.HeadingPitchRange(
            0.0,
            -0.45,
            tilesetPrimitive.boundingSphere.radius * 1.8
          )
        )
      })
      .catch(error => {
        console.error('加载3D模型失败:', error);
      })
  } else if (primitive) {
    primitive.removeAll()
    primitive = null
  }
}
