#!/usr/bin/env node

/**
 * Reversal V8.2 完整数据集回测脚本
 *
 * 使用所有真实数据集进行回测（包括无交易的数据集）
 */

const BacktestStrategyType = {
  CONVERGENCE: 'convergence',
  ARBITRAGE: 'arbitrage',
  REVERSAL: 'reversal',
  TREND_FOLLOWING: 'trend_following',
  MEAN_REVERSION: 'mean_reversion',
};

const createConfig = () => ({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  intervalMinutes: 15,
  initialCapital: 10000,
  maxPositions: 3,
  maxPositionSize: 0.33,
  strategies: {
    [BacktestStrategyType.CONVERGENCE]: {
      enabled: false,
      maxPositions: 0,
      maxPositionSize: 0.2,
    },
    [BacktestStrategyType.ARBITRAGE]: {
      enabled: false,
      maxPositions: 0,
      maxPositionSize: 0.2,
    },
    [BacktestStrategyType.REVERSAL]: {
      enabled: true,
      maxPositions: 3,
      maxPositionSize: 0.33,
    },
    [BacktestStrategyType.TREND_FOLLOWING]: {
      enabled: false,
      maxPositions: 0,
      maxPositionSize: 0.2,
    },
    [BacktestStrategyType.MEAN_REVERSION]: {
      enabled: false,
      maxPositions: 0,
      maxPositionSize: 0.2,
    },
  },
  dailyLossLimit: 0.10,
  maxDrawdown: 0.15,
  filters: {
    minVolume: 0,
    minLiquidity: 0,
    minDaysToEnd: 1,
    maxDaysToEnd: 365,
  },
});

async function runBacktest(dataFile) {
  console.log(`\n${'='.repeat(100)}`);
  console.log(`数据文件: ${dataFile}`);
  console.log(`${'='.repeat(100)}\n`);

  const config = createConfig();

  try {
    const response = await fetch('http://localhost:5000/api/backtest/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config,
        dataFile,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let lastProgress = 0;
    let result = null;
    let tradeDetails = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'snapshot_processed') {
              const progress = parseFloat(data.data.progress);
              lastProgress = progress;
              process.stdout.write(`\r进度: ${progress.toFixed(1)}%`);
            } else if (data.type === 'complete') {
              process.stdout.write('\r' + ' '.repeat(100) + '\r');
              
              result = {
                totalReturn: data.result.totalReturn,
                totalTrades: data.result.totalTrades,
                winRate: data.result.winRate,
                bestStrategy: data.result.bestStrategy,
                tradesList: data.result.tradesList || [],
              };

              console.log('总收益率:', result.totalReturn || 'N/A');
              console.log('交易总数:', result.totalTrades || 0);
              console.log('胜率:', result.winRate || 'N/A');
              console.log('最佳策略:', result.bestStrategy || 'N/A');

              if (result.tradesList && result.tradesList.length > 0) {
                console.log('\n交易明细:');
                result.tradesList.forEach((trade, index) => {
                  const entryPrice = (trade.entryPrice * 100).toFixed(2);
                  const exitPrice = trade.exitPrice ? (trade.exitPrice * 100).toFixed(2) : 'N/A';
                  const pnl = trade.pnl ? trade.pnl.toFixed(2) : '0.00';
                  const pnlPercent = trade.pnlPercent ? (trade.pnlPercent * 100).toFixed(2) : '0.00';
                  console.log(`  交易${index + 1}: ${trade.question.substring(0, 50)}... 入场${entryPrice}% 出场${exitPrice}% 盈亏$${pnl} (${pnlPercent}%)`);
                });
              } else {
                console.log('\n没有交易记录');
              }

              return result;
            } else if (data.type === 'error') {
              console.error('\n错误:', data.error);
              return null;
            }
          } catch (e) {
            // 忽略 JSON 解析错误
          }
        }
      }
    }
  } catch (error) {
    console.error(`\n测试 ${dataFile} 失败:`, error.message);
    return null;
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  Reversal V8.2 完整数据集回测                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  // 获取所有数据文件
  const response = await fetch('http://localhost:5000/api/backtest/data');
  if (!response.ok) {
    console.error('无法获取数据文件列表');
    return;
  }

  const { data } = await response.json();
  
  console.log(`找到 ${data.length} 个数据文件\n`);

  const allResults = [];

  for (const fileData of data) {
    const fileName = fileData.fileName;
    const result = await runBacktest(fileName);
    if (result) {
      allResults.push({
        name: fileName,
        ...result,
      });
    }
    
    // 等待 1 秒再测试下一个文件
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 汇总分析
  console.log('\n\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              汇总分析                                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('┌─────────────────────────────────┬──────────────┬─────────────┬──────────────┐');
  console.log('│ 数据集                          │ 总收益率     │ 交易总数    │ 胜率         │');
  console.log('├─────────────────────────────────┼──────────────┼─────────────┼──────────────┤');
  
  allResults.forEach(r => {
    const name = r.name.padEnd(31, ' ');
    const totalReturn = (r.totalReturn || 'N/A').toString().padEnd(12, ' ');
    const totalTrades = (r.totalTrades || 0).toString().padEnd(11, ' ');
    const winRate = (r.winRate || 'N/A').toString().padEnd(12, ' ');
    console.log(`│ ${name} │ ${totalReturn} │ ${totalTrades} │ ${winRate} │`);
  });

  console.log('└─────────────────────────────────┴──────────────┴─────────────┴──────────────┘\n');

  // 统计分析
  const totalTrades = allResults.reduce((sum, r) => sum + (r.totalTrades || 0), 0);
  const tradesWithData = allResults.filter(r => r.totalTrades > 0);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('统计数据');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`总数据集: ${allResults.length}`);
  console.log(`有交易的数据集: ${tradesWithData.length}`);
  console.log(`无交易的数据集: ${allResults.length - tradesWithData.length}`);
  console.log(`总交易数: ${totalTrades}`);

  // 分析收益率分布
  const returnRates = tradesWithData.map(r => {
    const match = r.totalReturn.match(/[-+]?\d+\.?\d*/);
    return match ? parseFloat(match[0]) : 0;
  });

  if (returnRates.length > 0) {
    returnRates.sort((a, b) => a - b);
    const avgReturn = returnRates.reduce((sum, r) => sum + r, 0) / returnRates.length;
    const medianReturn = returnRates[Math.floor(returnRates.length / 2)];
    const maxReturn = Math.max(...returnRates);
    const minReturn = Math.min(...returnRates);

    console.log(`\n收益率统计:`);
    console.log(`  平均收益率: ${avgReturn.toFixed(2)}%`);
    console.log(`  中位数收益率: ${medianReturn.toFixed(2)}%`);
    console.log(`  最高收益率: ${maxReturn.toFixed(2)}%`);
    console.log(`  最低收益率: ${minReturn.toFixed(2)}%`);

    // 计算胜率分布
    const winRates = tradesWithData.map(r => {
      const match = r.winRate.match(/[-+]?\d+\.?\d*/);
      return match ? parseFloat(match[0]) : 0;
    });

    if (winRates.length > 0) {
      const avgWinRate = winRates.reduce((sum, r) => sum + r, 0) / winRates.length;
      console.log(`\n胜率统计:`);
      console.log(`  平均胜率: ${avgWinRate.toFixed(2)}%`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ 回测完成');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
