/**
 * CSV解析工具
 * 用于解析CSV文件，支持处理带引号的字段
 */

/**
 * 解析CSV文本为对象数组
 * @param {string} csvText - CSV文本内容
 * @param {Object} options - 解析选项
 * @returns {Array} 解析后的对象数组
 */
export function parseCSV(csvText, options = {}) {
  const {
    delimiter = ',',
    hasHeader = true,
    skipEmptyLines = true
  } = options;
  
  // 分割行
  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0) return [];
  
  // 解析表头
  let headers = [];
  let startIndex = 0;
  
  if (hasHeader) {
    headers = parseCSVLine(lines[0], delimiter);
    startIndex = 1;
  }
  
  // 解析数据行
  const results = [];
  
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (skipEmptyLines && !line) continue;
    
    const values = parseCSVLine(line, delimiter);
    
    if (hasHeader) {
      // 创建对象，将表头作为键
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      results.push(obj);
    } else {
      // 直接添加值数组
      results.push(values);
    }
  }
  
  return results;
}

/**
 * 解析单行CSV文本
 * @param {string} line - CSV行文本
 * @param {string} delimiter - 分隔符
 * @returns {Array} 解析后的值数组
 */
function parseCSVLine(line, delimiter) {
  const result = [];
  let currentValue = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      // 处理引号
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // 转义的引号 (""), 添加一个引号并跳过下一个字符
        currentValue += '"';
        i++;
      } else {
        // 切换引号状态
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      // 分隔符，添加当前值到结果并重置
      result.push(currentValue);
      currentValue = '';
    } else {
      // 普通字符，添加到当前值
      currentValue += char;
    }
  }
  
  // 添加最后一个值
  result.push(currentValue);
  
  return result;
}

/**
 * 将对象数组转换为CSV文本
 * @param {Array} data - 对象数组
 * @param {Object} options - 转换选项
 * @returns {string} CSV文本
 */
export function objectsToCSV(data, options = {}) {
  if (!Array.isArray(data) || data.length === 0) return '';
  
  const {
    delimiter = ',',
    includeHeader = true
  } = options;
  
  // 获取所有可能的键
  const keys = Object.keys(data[0]);
  
  // 创建表头行
  let csvContent = '';
  if (includeHeader) {
    csvContent = keys.map(key => escapeCSVValue(key, delimiter)).join(delimiter) + '\n';
  }
  
  // 添加数据行
  data.forEach(item => {
    const row = keys.map(key => escapeCSVValue(item[key], delimiter)).join(delimiter);
    csvContent += row + '\n';
  });
  
  return csvContent;
}

/**
 * 转义CSV值
 * @param {any} value - 要转义的值
 * @param {string} delimiter - 分隔符
 * @returns {string} 转义后的值
 */
function escapeCSVValue(value, delimiter) {
  if (value === null || value === undefined) return '';
  
  const stringValue = String(value);
  
  // 如果值包含分隔符、引号或换行符，则需要用引号包裹
  if (stringValue.includes(delimiter) || stringValue.includes('"') || stringValue.includes('\n')) {
    // 将值中的引号替换为两个引号
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
}
