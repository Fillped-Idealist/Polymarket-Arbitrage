#!/usr/bin/env node

/**
 * Reversal V8.7 全数据集测试脚本
 *
 * 基于超激进优化策略的全面验证
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createV87Config = () => ({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  intervalMinutes: 15,

  initialCapital: 10000,
  maxPositions: 2,  // 从 3 降低到 2
  maxPositionSize: 0.25,  // 从 0.33 降低到 0.25

  strategies: {
    'convergence': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'arbitrage': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'reversal': { enabled: true, version: 'v6', maxPositions: 2, maxPositionSize: 0.25 },  // V8.7 使用 v6
    'trend_following': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'mean_reversion': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
  },

  dailyLossLimit: 0.05,  // 从 0.10 降低到 0.05
  maxDrawdown: 0.10,  // 从 0.15 降低到 0.10

  filters: {
    minVolume: 10000,  // 从 5000 增加到 10000
    minLiquidity: 2000,  // 从 1000 增加到 2000
    minDaysToEnd: 1,
    maxDaysToEnd: 365,
  },
});

// All valid datasets
const datasets = [
  { fileName: 'backtest_data_1769008904731.json', snapshotCount: 20, marketCount: 4 },
  { fileName: 'backtest_data_1769009082241.json', snapshotCount: 500, marketCount: 15 },
  { fileName: 'backtest_data_1769009621518.json', snapshotCount: 10000, marketCount: 100 },
  { fileName: 'backtest_data_1769009635709.json', snapshotCount: 50000, marketCount: 100 },
  { fileName: 'backtest_data_1769009755199.json', snapshotCount: 10000, marketCount: 40 },
  { fileName: 'backtest_data_1769009786594.json', snapshotCount: 50000, marketCount: 42 },
  { fileName: 'backtest_data_multi.json', snapshotCount: 500, marketCount: 50 },
  { fileName: 'backtest_data_small.json', snapshotCount: 500, marketCount: 500 }
];

async function testDataset(fileName) {
  const config = createV87Config();

  try {
    const response = await fetch('http://localhost:5000/api/backtest/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config,
        dataFile: fileName,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let result = null;
    let tradesList = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'complete') {
              result = data.result;
              tradesList = result.tradesList || [];
              return { success: true, result, tradesList };
            } else if (data.type === 'error') {
              return { success: false, error: data.error };
            }
          } catch (e) {
            // 忽略 JSON 解析错误
          }
        }
      }
    }

    return { success: false, error: 'No result received' };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('Reversal V8.7 超激进策略 - 全数据集交叉验证');
  console.log('='.repeat(80));
  console.log(`\n测试数据集数量: ${datasets.length}`);
  console.log(`策略版本: Reversal V8.7（超激进优化）\n`);

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (const dataset of datasets) {
    console.log('-'.repeat(80));
    console.log(`\n测试: ${dataset.fileName}`);
    console.log(`快照数: ${dataset.snapshotCount}, 市场数: ${dataset.marketCount}`);

    const testResult = await testDataset(dataset.fileName);

    if (testResult.success) {
      const { result, tradesList } = testResult;

      const totalReturn = parseFloat(result.totalReturn);
      const trades = result.totalTrades || tradesList.length;
      const winRate = parseFloat(result.winRate);
      const bigProfitCount = tradesList.filter(t => {
        const profitPercent = (t.exitPrice - t.entryPrice) / t.entryPrice * 100;
        return profitPercent > 100;
      }).length;
      const avgProfitLoss = trades > 0 ?
        tradesList.reduce((sum, t) => sum + ((t.exitPrice - t.entryPrice) / t.entryPrice * 100), 0) / trades : 0;

      // 计算平均持仓时间
      const avgHoldingTime = trades > 0 ?
        tradesList.reduce((sum, t) => sum + ((t.exitTime - t.entryTime) / (1000 * 60 * 60)), 0) / trades : 0;

      console.log(`✅ 测试完成`);
      console.log(`   总收益率: ${totalReturn}%`);
      console.log(`   交易总数: ${trades}`);
      console.log(`   胜率: ${winRate}%`);
      console.log(`   大额盈利(>100%): ${bigProfitCount} 笔`);
      console.log(`   平均盈亏: ${avgProfitLoss.toFixed(2)}%`);
      console.log(`   平均持仓时间: ${avgHoldingTime.toFixed(2)} 小时`);

      results.push({
        fileName: dataset.fileName,
        status: 'success',
        totalReturn,
        trades,
        winRate,
        bigProfitCount,
        avgProfitLoss,
        avgHoldingTime
      });

      successCount++;
    } else {
      console.log(`❌ 测试失败: ${testResult.error}`);

      results.push({
        fileName: dataset.fileName,
        status: 'failed',
        error: testResult.error
      });

      failCount++;
    }

    console.log('');
  }

  // Calculate overall statistics
  const successfulResults = results.filter(r => r.status === 'success');
  const avgReturn = successfulResults.length > 0 ?
    (successfulResults.reduce((sum, r) => sum + r.totalReturn, 0) / successfulResults.length).toFixed(2) : '0.00';
  const avgWinRate = successfulResults.length > 0 ?
    (successfulResults.reduce((sum, r) => sum + r.winRate, 0) / successfulResults.length).toFixed(2) : '0.00';
  const avgTrades = successfulResults.length > 0 ?
    (successfulResults.reduce((sum, r) => sum + r.trades, 0) / successfulResults.length).toFixed(1) : '0.0';
  const avgProfitLoss = successfulResults.length > 0 ?
    (successfulResults.reduce((sum, r) => sum + r.avgProfitLoss, 0) / successfulResults.length).toFixed(2) : '0.00';
  const avgHoldingTime = successfulResults.length > 0 ?
    (successfulResults.reduce((sum, r) => sum + r.avgHoldingTime, 0) / successfulResults.length).toFixed(2) : '0.00';
  const profitableDatasets = successfulResults.filter(r => r.totalReturn > 0).length;
  const profitabilityRate = successfulResults.length > 0 ?
    ((profitableDatasets / successfulResults.length) * 100).toFixed(2) : '0.00';

  console.log('='.repeat(80));
  console.log('总结');
  console.log('='.repeat(80));
  console.log(`\n成功: ${successCount} / ${datasets.length}`);
  console.log(`失败: ${failCount} / ${datasets.length}`);
  console.log(`\n平均收益率: ${avgReturn}%`);
  console.log(`平均胜率: ${avgWinRate}%`);
  console.log(`平均交易数: ${avgTrades} 笔`);
  console.log(`平均盈亏: ${avgProfitLoss}%`);
  console.log(`平均持仓时间: ${avgHoldingTime} 小时`);
  console.log(`盈利数据集占比: ${profitabilityRate}%`);

  console.log('\n✅ 成功的数据集:');
  successfulResults.forEach(r => {
    const profitEmoji = r.totalReturn > 0 ? '🟢' : '🔴';
    console.log(`  ${profitEmoji} ${r.fileName}: ${r.totalReturn > 0 ? '+' : ''}${r.totalReturn}% (${r.trades} 笔, ${r.winRate}% 胜率)`);
  });

  if (failCount > 0) {
    console.log('\n❌ 失败的数据集:');
    results.filter(r => r.status === 'failed').forEach(r => {
      console.log(`  - ${r.fileName}: ${r.error}`);
    });
  }

  // 目标对比
  console.log('\n' + '='.repeat(80));
  console.log('目标对比');
  console.log('='.repeat(80));

  const monthlyTrades = parseFloat(avgTrades);  // 假设每个数据集代表一个月
  const monthlyReturn = parseFloat(avgProfitLoss) * monthlyTrades / 100;  // 月收益率 = 平均单笔盈亏 * 月交易数
  const annualReturn = Math.pow(1 + monthlyReturn, 12) - 1;  // 年化收益率

  console.log(`\n目标1：单笔交易期望为正（平均每笔盈亏 > 0）`);
  console.log(`   当前：${avgProfitLoss}%`);
  console.log(`   状态：${parseFloat(avgProfitLoss) > 0 ? '✅ 达成' : '❌ 未达成'}`);

  console.log(`\n目标2：月收益率超过 30%`);
  console.log(`   当前：${(monthlyReturn * 100).toFixed(2)}%`);
  console.log(`   年化：${(annualReturn * 100).toFixed(2)}%`);
  console.log(`   状态：${monthlyReturn > 0.30 ? '✅ 达成' : '❌ 未达成'}`);

  // 结论
  console.log('\n' + '='.repeat(80));
  console.log('结论');
  console.log('='.repeat(80));

  if (parseFloat(avgProfitLoss) > 0 && monthlyReturn > 0.30) {
    console.log('\n✅ V8.7 策略已达到目标！');
    console.log('   • 单笔交易期望为正');
    console.log('   • 月收益率超过 30%');
    console.log('   • 可以部署到生产环境');
  } else if (parseFloat(avgProfitLoss) > 0) {
    console.log('\n⚠️  V8.7 策略部分达标：');
    console.log('   • 单笔交易期望为正 ✅');
    console.log('   • 月收益率未达到 30% ❌');
    console.log('   • 需要进一步优化（V8.8）');
  } else {
    console.log('\n❌ V8.7 策略未达到目标：');
    console.log('   • 单笔交易期望为负 ❌');
    console.log('   • 月收益率未达到 30% ❌');
    console.log('   • 需要深度优化（V8.8）');
  }

  // 保存汇总结果
  const summaryPath = path.join(__dirname, '..', 'data', 'output', 'v87_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    results,
    summary: {
      successCount,
      failCount,
      avgReturn,
      avgWinRate,
      avgTrades,
      avgProfitLoss,
      avgHoldingTime,
      profitableDatasets,
      profitabilityRate,
      monthlyReturn: (monthlyReturn * 100).toFixed(2),
      annualReturn: (annualReturn * 100).toFixed(2)
    }
  }, null, 2));
  console.log(`\n📄 汇总结果已保存到: ${summaryPath}`);
}

main().catch(error => {
  console.error('❌ 程序执行失败:', error);
  process.exit(1);
});
