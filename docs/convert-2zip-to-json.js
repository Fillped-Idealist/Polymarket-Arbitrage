/**
 * 将2.zip的CSV数据转换为回测系统需要的JSON格式
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data/imported');

// 读取价格历史
const priceHistory = [];
const historyContent = fs.readFileSync(path.join(DATA_DIR, 'crawled_price_history.csv'), 'utf-8');
const historyLines = historyContent.split('\n').slice(1);

for (let i = 0; i < historyLines.length; i++) {
  const line = historyLines[i];
  if (!line.trim()) continue;
  
  const parts = line.split(',');
  if (parts.length >= 7) {
    const marketId = parts[0];
    const outcomeName = parts[1];
    const timestamp = parseInt(parts[3]);
    const price = parseFloat(parts[5]);
    const volume = parseFloat(parts[6]) || 0;
    
    priceHistory.push({
      marketId,
      outcomeName,
      timestamp,
      price,
      volume,
    });
  }
}

console.log(`✅ 读取了 ${priceHistory.length} 条价格记录`);

// 按市场和时间分组
const marketSnapshots = {};
const marketMeta = {};

for (const record of priceHistory) {
  const marketId = record.marketId;
  if (!marketSnapshots[marketId]) {
    marketSnapshots[marketId] = {};
  }
  if (!marketMeta[marketId]) {
    marketMeta[marketId] = { volume: 0, liquidity: 0, question: '' };
  }
  
  const timestamp = record.timestamp;
  if (!marketSnapshots[marketId][timestamp]) {
    marketSnapshots[marketId][timestamp] = {
      timestamp: new Date(timestamp * 1000),
      marketId,
      outcomePrices: {},
      volumes: {},
    };
  }
  
  marketSnapshots[marketId][timestamp].outcomePrices[record.outcomeName] = record.price;
  marketSnapshots[marketId][timestamp].volumes[record.outcomeName] = record.volume;
  marketMeta[marketId].volume += record.volume;
}

// 生成快照
const snapshots = [];
for (const marketId in marketSnapshots) {
  const meta = marketMeta[marketId];
  const timestamps = Object.keys(marketSnapshots[marketId]).map(t => parseInt(t)).sort((a, b) => a - b);
  
  for (const timestamp of timestamps) {
    const snapshot = marketSnapshots[marketId][timestamp];
    
    const outcomePrices = Object.values(snapshot.outcomePrices);
    const totalVolume = Object.values(snapshot.volumes).reduce((sum, v) => sum + v, 0);
    
    snapshots.push({
      timestamp: snapshot.timestamp,
      marketId: snapshot.marketId,
      question: meta?.question || '',
      outcomePrices: outcomePrices.sort((a, b) => b - a),
      liquidity: Math.min(meta?.liquidity || 0, totalVolume * 0.1) || 0,
      volume24h: totalVolume || 0,
      endDate: snapshot.timestamp,
      isBinary: outcomePrices.length === 2,
      tags: [],
      tokenIds: [],
    });
  }
}

// 按时间戳排序
snapshots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

console.log(`✅ 生成了 ${snapshots.length} 个快照`);

// 保存为JSON
const output = {
  meta: {
    importedAt: new Date().toISOString(),
    snapshotCount: snapshots.length,
    marketCount: Object.keys(marketMeta).length,
    dateRange: {
      start: snapshots[0]?.timestamp.toISOString(),
      end: snapshots[snapshots.length - 1]?.timestamp.toISOString(),
    },
    source: '2.zip - crawled_price_history.csv',
    interval: '10min',
  },
  snapshots: snapshots,
};

const outputPath = path.join(DATA_DIR, 'backtest_data_2zip.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`✅ 数据已保存到: ${outputPath}`);
console.log(`📊 统计信息:`);
console.log(`  - 快照数量: ${snapshots.length.toLocaleString()}`);
console.log(`  - 市场数量: ${Object.keys(marketMeta).length}`);
console.log(`  - 时间范围: ${output.meta.dateRange.start} ~ ${output.meta.dateRange.end}`);
console.log(`  - 数据来源: 2.zip (真实历史数据, 10min间隔)`);
