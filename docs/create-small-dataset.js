const fs = require('fs');
const path = require('path');

// 读取原数据集
const originalDataPath = path.join(process.cwd(), 'data', 'imported', 'backtest_data_2zip.json');
const smallDataPath = path.join(process.cwd(), 'data', 'imported', 'backtest_data_small.json');

console.log('正在读取原数据集...');
const rawData = fs.readFileSync(originalDataPath, 'utf8');
const parsedData = JSON.parse(rawData);

console.log(`原数据集大小: ${parsedData.snapshots ? parsedData.snapshots.length : parsedData.length} 个快照`);

// 提取数据
let snapshots = Array.isArray(parsedData) ? parsedData : (parsedData.snapshots || []);

// 只取前 5000 个快照
const smallSnapshots = snapshots.slice(0, 5000);

console.log(`小数据集大小: ${smallSnapshots.length} 个快照`);

// 保存小数据集
const smallData = {
  snapshots: smallSnapshots,
  marketsCount: new Set(smallSnapshots.map(s => s.marketId)).size,
  dateRange: {
    start: smallSnapshots[0]?.timestamp,
    end: smallSnapshots[smallSnapshots.length - 1]?.timestamp
  }
};

fs.writeFileSync(smallDataPath, JSON.stringify(smallData, null, 2));

console.log(`小数据集已保存到: ${smallDataPath}`);
console.log(`文件大小: ${(fs.statSync(smallDataPath).size / 1024 / 1024).toFixed(2)} MB`);
