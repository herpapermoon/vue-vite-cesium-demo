export class ViolationGeoJSONService {
  constructor() {
    this.baseURL = 'http://localhost:10000'
  }

  // 将违规数据转换为 GeoJSON 格式
  createViolationGeoJSON(violations) {
    const features = violations.map(violation => ({
      type: "Feature",
      properties: {
        id: violation.id,
        bikeId: violation.bikeId,
        type: violation.type,
        status: violation.status,
        location: violation.location,
        detectedTime: violation.detectedTime,
        distanceFromParkingArea: violation.distanceFromParkingArea,
        nearestParkingArea: violation.nearestParkingArea?.name || violation.nearestParkingArea || '',
        adminNotes: violation.adminNotes || null,
        resolvedTime: violation.resolvedTime || null,
        processedBy: violation.processedBy || null
      },
      geometry: {
        type: "Point",
        coordinates: violation.coordinates || [0, 0, 0]
      }
    }))

    return {
      type: "FeatureCollection",
      name: "违规车辆数据",
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
      features: features
    }
  }

  // 计算违规严重程度
  calculateSeverity(violation) {
    const distance = violation.distanceFromParkingArea
    if (distance > 100) return 'high'
    if (distance > 50) return 'medium'
    return 'low'
  }

  // 保存违规数据为GeoJSON格式（保存到violations.geojson文件）
    // 修改 saveViolationsGeoJSON 方法
   async saveViolationsGeoJSON(violationsData) {
    try {
      console.log('=== 开始保存违规数据 ===');
      console.log('请求URL:', `${this.baseURL}/api/save-violations-geojson`);
      console.log('数据类型:', typeof violationsData);
      console.log('数据数量:', Array.isArray(violationsData) ? violationsData.length : '非数组');
      
      // 验证数据
      if (!violationsData || (Array.isArray(violationsData) && violationsData.length === 0)) {
        console.warn('没有数据需要保存');
        return {
          success: false,
          message: '没有数据需要保存'
        };
      }

      // 发送请求
      const response = await fetch(`${this.baseURL}/api/save-violations-geojson`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(violationsData)
      });

      console.log('服务器响应状态:', response.status);
      console.log('响应头:', response.headers.get('content-type'));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('服务器响应错误:', response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('保存结果:', result);
      
      return result;
      
    } catch (error) {
      console.error('保存违规数据到服务器失败:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // 更新单个违规记录
  async updateViolation(violationId, updateData) {
    try {
      const response = await fetch(`${this.baseURL}/update-violation/${violationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
      })
      
      const result = await response.json()
      
      if (result.success) {
        console.log(`违规记录 ${violationId} 更新成功`)
        return result
      } else {
        throw new Error(result.message)
      }
      
    } catch (error) {
      console.error('更新违规记录失败:', error)
      return {
        success: false,
        message: error.message
      }
    }
  }

  // 从GeoJSON加载违规数据
  async loadViolationsGeoJSON() {
    try {
      // 首先尝试从服务器加载最新数据
      const response = await fetch('/data/violations.geojson')
      if (response.ok) {
        const data = await response.json()
        console.log('从服务器加载违规数据成功，特征数量:', data.features?.length || 0)
        return data
      }
      
      // 如果服务器加载失败，尝试从本地存储加载
      const localData = localStorage.getItem('violations_geojson')
      if (localData) {
        console.log('从本地存储加载违规数据')
        return JSON.parse(localData)
      }
      
      throw new Error('无法加载违规数据')
      
    } catch (error) {
      console.error('加载违规GeoJSON数据失败:', error)
      throw error
    }
  }

  // 添加创建下载链接的方法
  downloadGeoJSON(geoJsonData, filename = 'violations.geojson') {
    const dataStr = JSON.stringify(geoJsonData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    console.log(`已下载文件: ${filename}`)
  }
}

export default ViolationGeoJSONService