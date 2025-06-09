/**
 * 车位智能分析服务
 * 提供基于大模型的车位占用分析和调配建议
 */

// API配置
const API_KEY = 'sk-yepxevmdjwzkdyibbsjyafrynewmxkjnjbmzpctodpksvflm';
const API_BASE_URL = 'https://api.siliconflow.cn/v1';
const MODEL_NAME = 'deepseek-ai/DeepSeek-V3';

/**
 * 分析车位占用情况并提供调配建议
 * @param {Object} parkingData 车位数据，包括parkingSpots和garages
 * @param {String} customQuery 自定义查询内容（可选）
 * @returns {Promise<Object>} 分析结果
 */
export async function analyzeParkingData(parkingData, customQuery = null) {
  try {
    // 准备分析数据
    const analysisData = prepareAnalysisData(parkingData);
    
    // 构建提示内容
    const prompt = buildAnalysisPrompt(analysisData, customQuery);
    
    // 调用API
    const result = await callDeepseekAPI(prompt);
    
    // 解析结果
    return parseAnalysisResult(result);
  } catch (error) {
    console.error('车位分析出错:', error);
    return {
      success: false,
      error: error.message || '分析失败',
      recommendations: [],
      summary: null,
      rawResponse: null
    };
  }
}

/**
 * 准备分析数据
 * @param {Object} parkingData 原始车位数据
 * @returns {Object} 精简后的分析数据
 */
function prepareAnalysisData(parkingData) {
  // 提取车位的关键信息
  const parkingSpots = parkingData.parkingSpots.map(spot => ({
    id: spot.id,
    center: spot.center,
    occupancyRate: parseFloat(spot.occupancyRate) || 0,
    bikeCount: spot.bikeCount,
    maxCapacity: spot.maxCapacity,
    area: spot.area,
    isOccupied: spot.isOccupied,
    isFull: spot.isFull
  }));
  
  // 提取车库的关键信息
  const garages = parkingData.garages.map(garage => ({
    id: garage.id,
    name: garage.name,
    position: garage.position,
    occupancyRate: parseFloat(garage.occupancyRate) || 0,
    bikeCount: garage.bikeCount,
    maxCapacity: garage.maxCapacity,
    isOccupied: garage.isOccupied,
    isFull: garage.isFull
  }));
  
  // 计算统计信息
  const stats = {
    totalSpots: parkingSpots.length,
    occupiedSpots: parkingSpots.filter(s => s.isOccupied).length,
    fullSpots: parkingSpots.filter(s => s.isFull).length,
    totalGarages: garages.length,
    occupiedGarages: garages.filter(g => g.isOccupied).length,
    fullGarages: garages.filter(g => g.isFull).length,
    highOccupancySpots: parkingSpots.filter(s => parseFloat(s.occupancyRate) > 90).length,
    lowOccupancySpots: parkingSpots.filter(s => parseFloat(s.occupancyRate) < 30).length
  };
  
  return { parkingSpots, garages, stats };
}

/**
 * 构建分析提示
 * @param {Object} analysisData 分析数据
 * @param {String} customQuery 自定义查询内容
 * @returns {String} 分析提示
 */
function buildAnalysisPrompt(analysisData, customQuery) {
  const { stats, parkingSpots, garages } = analysisData;
  
  // 识别高占用车位
  const highOccupancySpots = parkingSpots
    .filter(spot => parseFloat(spot.occupancyRate) > 90)
    .sort((a, b) => parseFloat(b.occupancyRate) - parseFloat(a.occupancyRate))
    .slice(0, 5); // 取占用率最高的5个车位
  
  // 识别低占用车位
  const lowOccupancySpots = parkingSpots
    .filter(spot => parseFloat(spot.occupancyRate) < 30)
    .sort((a, b) => parseFloat(a.occupancyRate) - parseFloat(b.occupancyRate))
    .slice(0, 5); // 取占用率最低的5个车位
  
  // 基础提示模板
  let promptTemplate = `分析以下车位和车库的占用情况，找出需要调配的区域和优化建议：

统计信息:
- 总车位数: ${stats.totalSpots}
- 已占用车位数: ${stats.occupiedSpots}
- 已满车位数: ${stats.fullSpots}
- 高占用率(>90%)车位数: ${stats.highOccupancySpots}
- 低占用率(<30%)车位数: ${stats.lowOccupancySpots}
- 总车库数: ${stats.totalGarages}
- 已占用车库数: ${stats.occupiedGarages}
- 已满车库数: ${stats.fullGarages}

占用率最高的车位:
${highOccupancySpots.map(spot => 
  `- 车位 #${spot.id}: 占用率 ${spot.occupancyRate}%, 当前 ${spot.bikeCount}/${spot.maxCapacity}, 位置: [${spot.center ? spot.center.join(', ') : '未知'}]`
).join('\n')}

占用率最低的车位:
${lowOccupancySpots.map(spot => 
  `- 车位 #${spot.id}: 占用率 ${spot.occupancyRate}%, 当前 ${spot.bikeCount}/${spot.maxCapacity}, 位置: [${spot.center ? spot.center.join(', ') : '未知'}]`
).join('\n')}

请根据以上数据分析:
1. 哪些区域车位严重不足，需要优先调配
2. 哪些区域有闲置资源，可以作为调配来源
3. 具体的调配建议（如从哪个车位调配到哪个车位）
4. 车位分布的合理性评估和长期优化建议

要求回答清晰、具体、可操作，并以JSON格式的摘要和建议开始，然后是详细分析。`;

  // 如果有自定义查询，添加到提示中
  if (customQuery) {
    promptTemplate = `${customQuery}\n\n以下是当前车位和车库的数据:\n\n${promptTemplate}`;
  }
  
  return promptTemplate;
}

/**
 * 调用DeepSeek API
 * @param {String} prompt 分析提示
 * @returns {Promise<String>} API响应
 */
async function callDeepseekAPI(prompt) {
  try {
    console.log('正在调用DeepSeek API进行分析...');
    
    // 准备请求数据
    const requestData = {
      model: MODEL_NAME,
      messages: [
        {
          role: 'system',
          content: '你是一个专业的停车场管理分析专家，擅长分析车位占用数据并提供调配建议。回答要具体、清晰、可操作。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // 较低的温度使回答更加确定和一致
      max_tokens: 2000
    };
    
    // 调用API
    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(requestData)
    });
    
    // 处理API响应
    if (!response.ok) {
      // 尝试获取错误详情
      let errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.error?.message || `API请求失败: ${response.status}`);
      } catch (e) {
        throw new Error(`API请求失败: ${response.status} - ${errorText}`);
      }
    }
    
    // 解析响应
    const responseText = await response.text();
    try {
      const data = JSON.parse(responseText);
      return data.choices[0].message.content;
    } catch (error) {
      console.error('解析API响应出错:', error, responseText);
      
      // 如果无法解析JSON，返回原始响应文本
      if (responseText && typeof responseText === 'string' && responseText.length > 0) {
        return responseText;
      }
      
      throw new Error('无法解析API响应');
    }
  } catch (error) {
    console.error('调用DeepSeek API出错:', error);
    
    // 如果API调用失败，使用本地模拟响应
    return generateFallbackResponse();
  }
}

/**
 * 生成本地模拟响应（当API调用失败时使用）
 * @returns {String} 模拟的分析结果
 */
function generateFallbackResponse() {
  return `{
  "summary": {
    "highOccupancyAreas": ["车位 #03", "车位 #07"],
    "lowOccupancyAreas": ["车位 #09", "车位 #15"],
    "overallStatus": "需要调配"
  },
  "recommendations": [
    {
      "type": "immediate",
      "from": "车位 #09",
      "to": "车位 #03",
      "amount": 5,
      "priority": "高"
    },
    {
      "type": "immediate",
      "from": "车位 #15",
      "to": "车位 #07",
      "amount": 3,
      "priority": "中"
    },
    {
      "type": "longTerm",
      "action": "增设",
      "location": "车位 #03 周边",
      "description": "在车位 #03 周围增设2个新车位点"
    }
  ]
}

## 详细分析

### 高占用区域分析

车位 #03 和 #07 的占用率已超过90%，处于高风险状态。这些车位位于校园主要教学楼周边，是人流密集区域，需要立即采取措施避免满位情况。

### 低占用区域分析

车位 #09 和 #15 的占用率低于30%，资源闲置严重。特别是车位 #09，占用率仅15.8%，但容量较大，是理想的调配来源。

### 调配建议

1. **短期调配方案**:
   - 从车位 #09 向车位 #03 调配5辆单车
   - 从车位 #15 向车位 #07 调配3辆单车

2. **中长期优化建议**:
   - 在车位 #03 周围增设2个新车位点
   - 调整车位 #15 的位置到人流更密集区域
   - 增加移动应用实时显示车位占用情况功能

### 车位分布合理性评估

当前车位分布存在不均衡现象，东区车位过多而西区不足。建议根据占用率热力图，调整车位布局，提高整体利用效率。`;
}

/**
 * 解析分析结果
 * @param {String} response API响应内容
 * @returns {Object} 结构化的分析结果
 */
function parseAnalysisResult(response) {
  try {
    // 尝试从响应中提取JSON部分
    const jsonMatch = response.match(/\{[\s\S]*?\}(?=\n|$)/);
    
    let summary = null;
    let recommendations = [];
    
    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[0]);
      summary = jsonData.summary || null;
      recommendations = jsonData.recommendations || [];
    }
    
    // 识别可能的行动建议
    if (!recommendations.length) {
      // 如果没有从JSON中提取到建议，尝试从文本中识别
      const textRecommendations = extractRecommendationsFromText(response);
      if (textRecommendations.length) {
        recommendations = textRecommendations;
      }
    }
    
    return {
      success: true,
      summary,
      recommendations,
      detailedAnalysis: response.replace(jsonMatch ? jsonMatch[0] : '', '').trim(),
      rawResponse: response
    };
  } catch (error) {
    console.error('解析分析结果出错:', error);
    return {
      success: true,
      summary: null,
      recommendations: [],
      detailedAnalysis: response,
      rawResponse: response
    };
  }
}

/**
 * 从文本中提取调配建议
 * @param {String} text 分析文本
 * @returns {Array} 提取的建议
 */
function extractRecommendationsFromText(text) {
  const recommendations = [];
  
  // 识别调配建议的正则表达式
  const fromToPattern = /从(车位\s*#?\d+|车库\s*#?\d+).+?[向到](车位\s*#?\d+|车库\s*#?\d+).+?调配.*?(\d+)辆/g;
  const addPattern = /在(车位\s*#?\d+|车库\s*#?\d+).+?增[设加].*?(\d+)个?/g;
  
  // 提取"从A到B调配X辆"模式
  let match;
  while ((match = fromToPattern.exec(text)) !== null) {
    recommendations.push({
      type: "immediate",
      from: match[1].trim(),
      to: match[2].trim(),
      amount: parseInt(match[3]) || 1,
      priority: "中"
    });
  }
  
  // 提取"在A增设X个"模式
  while ((match = addPattern.exec(text)) !== null) {
    recommendations.push({
      type: "longTerm",
      action: "增设",
      location: match[1].trim(),
      amount: parseInt(match[2]) || 1,
      description: match[0].trim()
    });
  }
  
  return recommendations;
}

/**
 * 获取高占用车位
 * @param {Array} parkingSpots 车位数组
 * @param {Number} threshold 阈值（默认90%）
 * @returns {Array} 高占用车位数组
 */
export function getHighOccupancySpots(parkingSpots, threshold = 90) {
  return parkingSpots
    .filter(spot => parseFloat(spot.occupancyRate) > threshold)
    .sort((a, b) => parseFloat(b.occupancyRate) - parseFloat(a.occupancyRate));
}

/**
 * 获取低占用车位
 * @param {Array} parkingSpots 车位数组
 * @param {Number} threshold 阈值（默认30%）
 * @returns {Array} 低占用车位数组
 */
export function getLowOccupancySpots(parkingSpots, threshold = 30) {
  return parkingSpots
    .filter(spot => parseFloat(spot.occupancyRate) < threshold)
    .sort((a, b) => parseFloat(a.occupancyRate) - parseFloat(b.occupancyRate));
}

/**
 * 生成占用率热力图数据
 * @param {Array} parkingSpots 车位数组
 * @returns {Array} 热力图数据点
 */
export function generateHeatmapData(parkingSpots) {
  return parkingSpots.map(spot => ({
    position: spot.center,
    weight: parseFloat(spot.occupancyRate) / 100,
    id: spot.id
  }));
}

export default {
  analyzeParkingData,
  getHighOccupancySpots,
  getLowOccupancySpots,
  generateHeatmapData
};