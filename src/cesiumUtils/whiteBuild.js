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
export const setWhiteBuild = async(viewer, active) => {
  if (active) {
    if (primitive) {
      viewer.zoomTo(
        tilesetPrimitive,
        new Cesium.HeadingPitchRange(
          0.0,
          -0.45,
          tilesetPrimitive.boundingSphere.radius * 1.8
        )
      )
      return
    }
    
    try {
      Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhOTRlOWE4NC1iNjczLTQzOTMtYmMzZi01NDA3NTE5NTFjNzQiLCJpZCI6MjkzOTU3LCJpYXQiOjE3NDQ2MzA2MTl9.OmRyRoAbHCuII3-CzVIcnbwogxdJ3JVhx-DPMJuDBpg'
      tilesetPrimitive = new Cesium.Cesium3DTileset({
        url: Cesium.IonResource.fromAssetId(3387364),
        maximumScreenSpaceError: 1, // 降低到1，提高显示精度（默认值是16）
        maximumMemoryUsage: 4096,   // 增加内存使用限制，允许加载更高精度的瓦片
        preferLeaves: true,         // 优先加载叶节点，提高详细程度
        dynamicScreenSpaceError: true, // 启用动态屏幕空间误差
        dynamicScreenSpaceErrorDensity: 0.00278, // 优化动态误差密度
        dynamicScreenSpaceErrorFactor: 4.0, // 提高动态误差因子
        dynamicScreenSpaceErrorHeightFalloff: 0.25 // 调整高度衰减
      });

      viewer.scene.primitives.add(tilesetPrimitive);
      // 等待模型加载完成
      await tilesetPrimitive.readyPromise;
      // 应用自定义着色器
      loadTilesShader(tilesetPrimitive)
      
      // 视角缩放到模型
      await viewer.zoomTo(
        tilesetPrimitive,
        new Cesium.HeadingPitchRange(
          0.0,
          -0.45,
          tilesetPrimitive.boundingSphere.radius * 1.8
        )
      )
      
      // 模型加载完成后，跳转到中国地质大学（武汉）未来城校区
      const destinationPosition = Cesium.Cartesian3.fromDegrees(
        114.58515,
        30.435571,
        2500
      )
      
      // 设置相机视角
      viewer.camera.flyTo({
        destination: destinationPosition,
        orientation: {
          heading: Cesium.Math.toRadians(30.0),
          pitch: Cesium.Math.toRadians(-35.0),
          roll: 0.0
        },
        duration: 3.0,
        complete: function() {
          console.log('已定位至中国地质大学（武汉）未来城校区')
        }
      })
    } catch (error) {
      console.error('加载Ion 3D模型失败:', error)
    }
  } else if (tilesetPrimitive) {
    viewer.scene.primitives.remove(tilesetPrimitive)
    tilesetPrimitive = null
  }
}