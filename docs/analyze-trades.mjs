#!/usr/bin/env node

/**
 * 详细交易分析脚本
 *
 * 分析每笔交易的详细信息，包括入场价格、出场价格、盈亏、持仓时间、平仓原因等
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

async function analyzeTrades(dataFile) {
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

    const trades = [];
    let lastProgress = 0;

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
              
              const r = data.result;
              
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log('回测结果汇总');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log(`总收益率: ${r.totalReturn || 'N/A'}`);
              console.log(`交易总数: ${r.totalTrades || 0}`);
              console.log(`胜率: ${r.winRate || 'N/A'}`);
              console.log(`最佳策略: ${r.bestStrategy || 'N/A'}`);
              
              if (r.tradesList && r.tradesList.length > 0) {
                console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('交易明细');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                
                r.tradesList.forEach((trade, index) => {
                  console.log(`\n【交易 ${index + 1}】`);
                  console.log(`  市场: ${trade.question}`);
                  console.log(`  市场ID: ${trade.marketId}`);
                  console.log(`  策略: ${trade.strategy}`);
                  console.log(`  结果: ${trade.outcomeName}（索引 ${trade.outcomeIndex}）`);
                  console.log(`  入场时间: ${trade.entryTime}`);
                  console.log(`  入场价格: ${(trade.entryPrice * 100).toFixed(2)}%`);
                  console.log(`  入场价值: $${trade.entryValue.toFixed(2)}`);
                  console.log(`  出场时间: ${trade.exitTime}`);
                  console.log(`  出场价格: ${(trade.exitPrice * 100).toFixed(2)}%`);
                  console.log(`  出场价值: $${trade.exitValue.toFixed(2)}`);
                  console.log(`  盈亏: $${trade.pnl.toFixed(2)} (${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(2)}%)`);
                  console.log(`  状态: ${trade.status}`);
                  console.log(`  平仓原因: ${trade.exitReason}`);
                  console.log(`  持仓时间: ${Math.round((trade.exitTime - trade.entryTime) / (1000 * 60 * 60 * 24))} 天`);
                  
                  trades.push(trade);
                });

                console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('交易统计');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                
                const winningTrades = trades.filter(t => t.pnl > 0);
                const losingTrades = trades.filter(t => t.pnl < 0);
                
                console.log(`盈利交易: ${winningTrades.length} 笔`);
                if (winningTrades.length > 0) {
                  const avgWinPnl = winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length;
                  const maxWinPnl = Math.max(...winningTrades.map(t => t.pnl));
                  const maxWinPercent = Math.max(...winningTrades.map(t => t.pnlPercent));
                  console.log(`  平均盈利: $${avgWinPnl.toFixed(2)}`);
                  console.log(`  最大盈利: $${maxWinPnl.toFixed(2)} (${maxWinPercent.toFixed(2)}%)`);
                }
                
                console.log(`\n亏损交易: ${losingTrades.length} 笔`);
                if (losingTrades.length > 0) {
                  const avgLossPnl = losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length;
                  const maxLossPnl = Math.min(...losingTrades.map(t => t.pnl));
                  const maxLossPercent = Math.min(...losingTrades.map(t => t.pnlPercent));
                  console.log(`  平均亏损: $${avgLossPnl.toFixed(2)}`);
                  console.log(`  最大亏损: $${maxLossPnl.toFixed(2)} (${maxLossPercent.toFixed(2)}%)`);
                }
                
                // 按平仓原因分类
                console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('按平仓原因分类');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                
                const exitReasons = {};
                trades.forEach(t => {
                  if (!exitReasons[t.exitReason]) {
                    exitReasons[t.exitReason] = {
                      count: 0,
                      winCount: 0,
                      lossCount: 0,
                      totalPnl: 0,
                    };
                  }
                  exitReasons[t.exitReason].count++;
                  exitReasons[t.exitReason].totalPnl += t.pnl;
                  if (t.pnl > 0) exitReasons[t.exitReason].winCount++;
                  if (t.pnl < 0) exitReasons[t.exitReason].lossCount++;
                });
                
                Object.entries(exitReasons).forEach(([reason, stats]) => {
                  console.log(`\n${reason}:`);
                  console.log(`  交易数: ${stats.count}`);
                  console.log(`  盈利: ${stats.winCount} 笔，亏损: ${stats.lossCount} 笔`);
                  console.log(`  总盈亏: $${stats.totalPnl.toFixed(2)}`);
                  if (stats.count > 0) {
                    console.log(`  平均盈亏: $${(stats.totalPnl / stats.count).toFixed(2)}`);
                  }
                });

                // 盈亏比分析
                console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('盈亏比分析');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                
                if (winningTrades.length > 0 && losingTrades.length > 0) {
                  const avgWin = winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length;
                  const avgLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length);
                  const profitLossRatio = avgWin / avgLoss;
                  console.log(`平均盈利: $${avgWin.toFixed(2)}`);
                  console.log(`平均亏损: $${avgLoss.toFixed(2)}`);
                  console.log(`盈亏比: ${profitLossRatio.toFixed(2)}:1`);
                }

                // 入场价格分析
                console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('入场价格分析');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                
                const entryPrices = trades.map(t => t.entryPrice);
                console.log(`最低入场价: ${(Math.min(...entryPrices) * 100).toFixed(2)}%`);
                console.log(`最高入场价: ${(Math.max(...entryPrices) * 100).toFixed(2)}%`);
                console.log(`平均入场价: ${((entryPrices.reduce((a, b) => a + b, 0) / entryPrices.length) * 100).toFixed(2)}%`);
                
                // 持仓时间分析
                console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('持仓时间分析');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                
                const holdingTimes = trades.map(t => (t.exitTime - t.entryTime) / (1000 * 60 * 60 * 24));
                console.log(`最短持仓: ${Math.min(...holdingTimes).toFixed(2)} 天`);
                console.log(`最长持仓: ${Math.max(...holdingTimes).toFixed(2)} 天`);
                console.log(`平均持仓: ${(holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length).toFixed(2)} 天`);

                return {
                  totalReturn: r.totalReturn,
                  totalTrades: r.totalTrades,
                  winRate: r.winRate,
                  trades: trades,
                  winningTrades,
                  losingTrades,
                };
              } else {
                console.log('没有交易记录');
                return {
                  totalReturn: r.totalReturn,
                  totalTrades: r.totalTrades,
                  winRate: r.winRate,
                  trades: [],
                  winningTrades: [],
                  losingTrades: [],
                };
              }
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
  console.log('║                    Reversal V8.1 详细交易分析                              ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  // 数据文件列表
  const dataFiles = [
    'real_data_250mb.json',
    'backtest_data_1769009635709.json',
    'backtest_data_1769009621518.json',
    'backtest_data_multi.json',
  ];

  const allResults = [];

  for (const dataFile of dataFiles) {
    const result = await analyzeTrades(dataFile);
    if (result) {
      allResults.push({
        name: dataFile,
        ...result,
      });
    }
    
    // 等待 2 秒再测试下一个文件
    if (dataFiles.indexOf(dataFile) < dataFiles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
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

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ 详细分析完成');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
