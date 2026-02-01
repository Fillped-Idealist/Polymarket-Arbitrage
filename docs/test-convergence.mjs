#!/usr/bin/env node

/**
 * 测试尾盘收敛策略（Convergence V5.3）回测功能
 */

const createConvergenceConfig = () => ({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  intervalMinutes: 15,

  initialCapital: 10000,
  maxPositions: 3,
  maxPositionSize: 0.33,

  strategies: {
    'convergence': { enabled: true, maxPositions: 3, maxPositionSize: 0.33 },
    'arbitrage': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'reversal': { enabled: false, maxPositions: 0, maxPositionSize: 0.33 },
    'trend_following': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'mean_reversion': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
  },

  dailyLossLimit: 0.10,
  maxDrawdown: 0.15,

  filters: {
    minVolume: 5000,
    minLiquidity: 1000,
    minDaysToEnd: 0,  // Convergence 使用小时
    maxDaysToEnd: 2,  // 48 小时
  },
});

// Test datasets
const datasets = [
  'backtest_data_1769009635709.json',
  'backtest_data_multi.json',
  'backtest_data_1769009755199.json',
  'backtest_data_1769009786594.json'
];

async function testDataset(fileName) {
  const config = createConvergenceConfig();

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
  console.log('尾盘收敛策略（Convergence V5.3）回测测试');
  console.log('='.repeat(80));
  console.log(`\n测试数据集数量: ${datasets.length}`);
  console.log(`策略版本: Convergence V5.3\n`);

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (const fileName of datasets) {
    console.log('-'.repeat(80));
    console.log(`\n测试: ${fileName}`);

    const testResult = await testDataset(fileName);

    if (testResult.success) {
      const { result, tradesList } = testResult;

      const totalReturn = parseFloat(result.totalReturn);
      const trades = result.totalTrades || tradesList.length;
      const winRate = parseFloat(result.winRate);
      const avgProfitLoss = trades > 0 ?
        tradesList.reduce((sum, t) => sum + ((t.exitPrice - t.entryPrice) / t.entryPrice * 100), 0) / trades : 0;

      console.log(`✅ 测试完成`);
      console.log(`   总收益率: ${totalReturn}%`);
      console.log(`   交易总数: ${trades}`);
      console.log(`   胜率: ${winRate}%`);
      console.log(`   平均盈亏: ${avgProfitLoss.toFixed(2)}%`);

      results.push({
        fileName,
        status: 'success',
        totalReturn,
        trades,
        winRate,
        avgProfitLoss
      });

      successCount++;
    } else {
      console.log(`❌ 测试失败: ${testResult.error}`);

      results.push({
        fileName,
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
  const outputPath = path.join(__dirname, '../scripts/convergence-test-results.json');

  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    strategy: 'Convergence V5.3',
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
