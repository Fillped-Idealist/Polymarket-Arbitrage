#!/usr/bin/env node

/**
 * 使用所有真实可用的数据集测试 Reversal V8.5 策略
 */

const createV85Config = () => ({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  intervalMinutes: 15,

  initialCapital: 10000,
  maxPositions: 3,
  maxPositionSize: 0.33,

  strategies: {
    'convergence': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'arbitrage': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'reversal': { enabled: true, maxPositions: 3, maxPositionSize: 0.33 },
    'trend_following': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'mean_reversion': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
  },

  dailyLossLimit: 0.10,
  maxDrawdown: 0.15,

  filters: {
    minVolume: 5000,
    minLiquidity: 1000,
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
  { fileName: 'backtest_data_2zip.json', snapshotCount: 813717, marketCount: 100 },
  { fileName: 'backtest_data_multi.json', snapshotCount: 500, marketCount: 50 },
  { fileName: 'backtest_data_small.json', snapshotCount: 500, marketCount: 500 }
];

async function testDataset(fileName) {
  const config = createV85Config();

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
  console.log('Reversal V8.5 全数据集交叉验证');
  console.log('='.repeat(80));
  console.log(`\n测试数据集数量: ${datasets.length}`);
  console.log(`策略版本: Reversal V8.5\n`);

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

      // Calculate statistics
      const totalReturn = parseFloat(result.totalReturn);
      const trades = result.totalTrades || tradesList.length;
      const winRate = parseFloat(result.winRate);
      const bigProfitCount = tradesList.filter(t => {
        const profitPercent = (t.exitPrice - t.entryPrice) / t.entryPrice * 100;
        return profitPercent > 100;
      }).length;
      const avgProfitLoss = trades > 0 ?
        tradesList.reduce((sum, t) => sum + ((t.exitPrice - t.entryPrice) / t.entryPrice * 100), 0) / trades : 0;

      console.log(`✅ 测试完成`);
      console.log(`   总收益率: ${totalReturn}%`);
      console.log(`   交易总数: ${trades}`);
      console.log(`   胜率: ${winRate}%`);
      console.log(`   大额盈利(>100%): ${bigProfitCount} 笔`);
      console.log(`   平均盈亏: ${avgProfitLoss.toFixed(2)}%`);

      results.push({
        fileName: dataset.fileName,
        status: 'success',
        totalReturn,
        trades,
        winRate,
        bigProfitCount,
        avgProfitLoss
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

  console.log('\n' + '='.repeat(80));

  // Save results to file
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const outputPath = path.join(__dirname, '../scripts/v85-full-dataset-results.json');

  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    strategy: 'Reversal V8.5',
    totalDatasets: datasets.length,
    successCount,
    failCount,
    avgReturn: parseFloat(avgReturn),
    avgWinRate: parseFloat(avgWinRate),
    avgTrades: parseFloat(avgTrades),
    profitabilityRate: parseFloat(profitabilityRate),
    results
  }, null, 2));

  console.log(`\n结果已保存到: ${outputPath}`);
}

main().catch(console.error);
