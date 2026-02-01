#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '../data/imported');

// All dataset files
const datasetFiles = [
  'backtest_data.json',
  'backtest_data_1769008904731.json',
  'backtest_data_1769009082241.json',
  'backtest_data_1769009621518.json',
  'backtest_data_1769009635709.json',
  'backtest_data_1769009755199.json',
  'backtest_data_1769009786594.json',
  'backtest_data_2zip.json',
  'backtest_data_multi.json',
  'backtest_data_small.json',
  'test_backtest.json'
];

console.log('='.repeat(80));
console.log('检查所有数据集文件的有效性');
console.log('='.repeat(80));

const validDatasets = [];
const invalidDatasets = [];

for (const fileName of datasetFiles) {
  const filePath = path.join(dataDir, fileName);

  if (!fs.existsSync(filePath)) {
    console.log(`\n❌ ${fileName}: 文件不存在`);
    invalidDatasets.push({ fileName, reason: '文件不存在' });
    continue;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Check if data is valid (new format with snapshots)
    if (!data || !data.snapshots || !Array.isArray(data.snapshots) || data.snapshots.length === 0) {
      console.log(`\n❌ ${fileName}: 数据格式无效或为空 (需要 snapshots 数组)`);
      invalidDatasets.push({ fileName, reason: '数据格式无效或为空' });
      continue;
    }

    // Check snapshot structure
    const firstSnapshot = data.snapshots[0];
    if (!firstSnapshot || !firstSnapshot.timestamp || !firstSnapshot.marketId || !firstSnapshot.outcomePrices) {
      console.log(`\n❌ ${fileName}: 数据结构不完整，缺少必要字段`);
      invalidDatasets.push({ fileName, reason: '数据结构不完整' });
      continue;
    }

    // Check outcomePrices
    const outcomePrices = firstSnapshot.outcomePrices;
    if (!Array.isArray(outcomePrices) || outcomePrices.length === 0) {
      console.log(`\n❌ ${fileName}: outcomePrices 为空或无效`);
      invalidDatasets.push({ fileName, reason: 'outcomePrices 为空' });
      continue;
    }

    // Group by marketId to get market count and data points per market
    const marketMap = new Map();
    for (const snapshot of data.snapshots) {
      const marketId = snapshot.marketId;
      if (!marketMap.has(marketId)) {
        marketMap.set(marketId, []);
      }
      marketMap.get(marketId).push(snapshot);
    }

    const marketCount = marketMap.size;
    const snapshotCount = data.snapshots.length;

    // Calculate average data points per market
    const avgDataPoints = snapshotCount / marketCount;

    // Calculate time span
    const firstTimestamp = new Date(data.snapshots[0].timestamp).getTime();
    const lastTimestamp = new Date(data.snapshots[data.snapshots.length - 1].timestamp).getTime();
    const timeSpanHours = (lastTimestamp - firstTimestamp) / (1000 * 60 * 60);

    console.log(`\n✅ ${fileName}:`);
    console.log(`   - 市场数: ${marketCount}`);
    console.log(`   - 快照总数: ${snapshotCount}`);
    console.log(`   - 平均每市场数据点: ${avgDataPoints.toFixed(1)}`);
    console.log(`   - 时间跨度: ${timeSpanHours.toFixed(2)} 小时`);

validDatasets.push({
  fileName,
  marketCount,
  snapshotCount,
  avgDataPoints,
  timeSpanHours
});

  } catch (error) {
    console.log(`\n❌ ${fileName}: 解析失败 - ${error.message}`);
    invalidDatasets.push({ fileName, reason: `解析失败: ${error.message}` });
  }
}

console.log('\n' + '='.repeat(80));
console.log('总结');
console.log('='.repeat(80));
console.log(`\n有效数据集: ${validDatasets.length} 个`);
console.log(`无效数据集: ${invalidDatasets.length} 个`);

console.log('\n✅ 有效数据集列表:');
validDatasets.forEach(d => {
  console.log(`  - ${d.fileName} (${d.snapshotCount} 快照, ${d.marketCount} 市场, ${d.timeSpanHours.toFixed(2)} 小时)`);
});

if (invalidDatasets.length > 0) {
  console.log('\n❌ 无效数据集列表:');
  invalidDatasets.forEach(d => {
    console.log(`  - ${d.fileName}: ${d.reason}`);
  });
}

console.log('\n' + '='.repeat(80));
