#!/usr/bin/env node

/**
 * 分析单个数据集的详细交易记录
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

async function analyzeDataset(fileName) {
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
  // Focus on datasets with many trades
  const datasetsToAnalyze = [
    { fileName: 'backtest_data_1769009082241.json', trades: 14, return: -47.9 },  // 🔴 最差
    { fileName: 'backtest_data_1769009786594.json', trades: 34, return: -35.59 }, // 🔴 交易最多，亏损
    { fileName: 'backtest_data_1769009755199.json', trades: 10, return: -30.98 }, // 🔴 亏损
    { fileName: 'backtest_data_1769009635709.json', trades: 5, return: 25.12 },   // 🟢 盈利
    { fileName: 'backtest_data_multi.json', trades: 3, return: 52.64 },           // 🟢 盈利
  ];

  for (const dataset of datasetsToAnalyze) {
    console.log('='.repeat(100));
    console.log(`数据集: ${dataset.fileName}`);
    console.log(`交易数: ${dataset.trades}, 收益率: ${dataset.return}%`);
    console.log('='.repeat(100));

    const testResult = await analyzeDataset(dataset.fileName);

    if (testResult.success) {
      const { tradesList } = testResult;

      if (tradesList.length === 0) {
        console.log('⚠️  没有交易记录\n');
        continue;
      }

      console.log('\n详细交易记录:\n');

      tradesList.forEach((trade, index) => {
        const profitPercent = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(2);
        const pnl = ((trade.exitPrice - trade.entryPrice) * trade.positionSize).toFixed(2);
        const hoursHeld = trade.exitTime && trade.entryTime ? ((trade.exitTime - trade.entryTime) / (1000 * 60 * 60)).toFixed(2) : 'N/A';

        const profitEmoji = parseFloat(profitPercent) > 0 ? '🟢' : '🔴';

        console.log(`${profitEmoji} 交易 ${index + 1}:`);
        console.log(`   市场 ID: ${trade.marketId?.substring(0, 40)}...`);
        console.log(`   入场价格: ${(trade.entryPrice * 100).toFixed(2)}%`);
        console.log(`   出场价格: ${(trade.exitPrice * 100).toFixed(2)}%`);
        console.log(`   盈亏: ${profitPercent}% ($${pnl})`);
        console.log(`   持仓时间: ${hoursHeld} 小时`);
        console.log(`   入场原因: ${trade.entryReason || 'N/A'}`);
        console.log(`   出场原因: ${trade.exitReason || 'N/A'}`);
        console.log('');
      });

      // Statistics
      const profitTrades = tradesList.filter(t => (t.exitPrice - t.entryPrice) / t.entryPrice > 0);
      const lossTrades = tradesList.filter(t => (t.exitPrice - t.entryPrice) / t.entryPrice <= 0);
      const avgProfit = profitTrades.length > 0 ? profitTrades.reduce((sum, t) => sum + (t.exitPrice - t.entryPrice) / t.entryPrice, 0) / profitTrades.length : 0;
      const avgLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, t) => sum + (t.exitPrice - t.entryPrice) / t.entryPrice, 0) / lossTrades.length : 0;
      const avgHoldingTime = tradesList.reduce((sum, t) => {
        const hours = t.exitTime && t.entryTime ? (t.exitTime - t.entryTime) / (1000 * 60 * 60) : 0;
        return sum + hours;
      }, 0) / tradesList.length;

      console.log('='.repeat(100));
      console.log('统计信息:');
      console.log('='.repeat(100));
      console.log(`盈利交易数: ${profitTrades.length}`);
      console.log(`亏损交易数: ${lossTrades.length}`);
      console.log(`平均盈利: ${(avgProfit * 100).toFixed(2)}%`);
      console.log(`平均亏损: ${(avgLoss * 100).toFixed(2)}%`);
      console.log(`平均持仓时间: ${avgHoldingTime.toFixed(2)} 小时`);
      console.log(`盈利/亏损比: ${avgLoss !== 0 ? Math.abs(avgProfit / avgLoss).toFixed(2) : 'N/A'}`);
      console.log('\n');
    } else {
      console.log(`❌ 测试失败: ${testResult.error}\n`);
    }
  }
}

main().catch(console.error);
