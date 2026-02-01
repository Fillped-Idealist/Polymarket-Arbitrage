#!/usr/bin/env node

/**
 * 检查数据中是否有满足 V7.0 开仓条件的快照
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataFilePath = path.join(__dirname, '../data/imported/real_data_250mb.json');
const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'));

// 构建市场历史数据映射
const marketHistory = new Map();

data.snapshots.forEach(snapshot => {
  const marketId = snapshot.marketId;
  if (!marketHistory.has(marketId)) {
    marketHistory.set(marketId, []);
  }
  marketHistory.get(marketId).push({
    timestamp: new Date(snapshot.timestamp),
    prices: snapshot.outcomePrices,
  });
});

// 按时间排序
marketHistory.forEach(history => {
  history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
});

let checkedSnapshots = 0;
let metCondition1 = 0;
let metCondition2 = 0;
let metCondition3 = 0;
let metCondition4 = 0;
let metCondition5 = 0;
let met4OrMore = 0;
let metAll5 = 0;

for (const snapshot of data.snapshots) {
  if (checkedSnapshots >= 10000) break;  // 只检查前 10000 个快照

  checkedSnapshots++;

  // 检查价格区间
  for (let i = 0; i < snapshot.outcomePrices.length; i++) {
    const price = snapshot.outcomePrices[i];

    if (price >= 0.05 && price <= 0.40) {
      // 获取历史价格
      const history = marketHistory.get(snapshot.marketId);
      if (!history || history.length < 10) continue;

      // 找到当前快照在历史中的位置
      const currentIndex = history.findIndex(
        h => h.timestamp.getTime() === new Date(snapshot.timestamp).getTime()
      );
      if (currentIndex < 10) continue;

      const historicalPrices = history.slice(currentIndex - 10, currentIndex + 1);
      const recentPrices = historicalPrices.map(h => h.prices[i]);
      const currentPrice = price;

      // 条件1：价格连续上涨（至少 3 个数据点）
      const last3Prices = recentPrices.slice(-3);
      const isRising = last3Prices.length >= 3 &&
                      last3Prices[2] > last3Prices[1] &&
                      last3Prices[1] > last3Prices[0];

      // 条件2：动量强度（最近 5 个数据点涨幅 > 10%）
      const last5Prices = recentPrices.slice(-5);
      const momentum = (currentPrice - last5Prices[0]) / last5Prices[0];
      const hasMomentum = momentum > 0.10;

      // 条件3：动量持续性（最近 5 个数据点中有 4 个上涨）
      const priceChanges = [];
      for (let j = 1; j < last5Prices.length; j++) {
        priceChanges.push(last5Prices[j] > last5Prices[j - 1]);
      }
      const isPersistent = priceChanges.filter(Boolean).length >= 4;

      // 对立选项确认
      const otherOptionIndex = 1 - i;
      const otherOptionPrice = snapshot.outcomePrices[otherOptionIndex];
      const otherHistoricalPrices = historicalPrices.map(h => h.prices[otherOptionIndex]);

      // 条件4：对立选项价格在下跌（最近 3 个数据点中有 2 个下跌）
      const otherLast3Prices = otherHistoricalPrices.slice(-3);
      let otherIsFalling = false;
      if (otherLast3Prices.length >= 3) {
        const otherPriceChanges = [
          otherLast3Prices[1] < otherLast3Prices[0],
          otherLast3Prices[2] < otherLast3Prices[1]
        ];
        otherIsFalling = otherPriceChanges.filter(Boolean).length >= 2;
      }

      // 条件5：对立选项价格跌幅 > 5%
      const otherLast5Prices = otherHistoricalPrices.slice(-5);
      let otherHasNegativeMomentum = false;
      if (otherLast5Prices.length >= 2) {
        const otherMomentum = (otherOptionPrice - otherLast5Prices[0]) / otherLast5Prices[0];
        otherHasNegativeMomentum = otherMomentum < -0.05;
      }

      if (isRising) metCondition1++;
      if (hasMomentum) metCondition2++;
      if (isPersistent) metCondition3++;
      if (otherIsFalling) metCondition4++;
      if (otherHasNegativeMomentum) metCondition5++;

      const conditionsMet = [isRising, hasMomentum, isPersistent, otherIsFalling, otherHasNegativeMomentum].filter(Boolean).length;
      if (conditionsMet >= 4) met4OrMore++;
      if (conditionsMet === 5) metAll5++;
    }
  }
}

console.log('=== V7.0 开仓条件统计（前 10000 个快照）===');
console.log(`检查的快照数量: ${checkedSnapshots}`);
console.log(`价格在 5%-40% 区间内的选项: ${metCondition1 + metCondition2 + metCondition3 + metCondition4 + metCondition5 > 0 ? '是' : '否'}`);
console.log('');
console.log('条件满足统计:');
console.log(`  条件1（连续 3 个数据点上涨）: ${metCondition1} 次`);
console.log(`  条件2（5 个数据点涨幅 > 10%）: ${metCondition2} 次`);
console.log(`  条件3（最近 5 个中有 4 个上涨）: ${metCondition3} 次`);
console.log(`  条件4（对立选项 3 个中有 2 个下跌）: ${metCondition4} 次`);
console.log(`  条件5（对立选项跌幅 > 5%）: ${metCondition5} 次`);
console.log('');
console.log(`满足 >=4 个条件: ${met4OrMore} 次`);
console.log(`满足全部 5 个条件: ${metAll5} 次`);

if (met4OrMore === 0 && metAll5 === 0) {
  console.log('');
  console.log('警告: 没有快照满足 V7.0 的开仓条件！');
  console.log('可能需要降低条件或增加数据量。');
}
