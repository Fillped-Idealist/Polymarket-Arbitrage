#!/usr/bin/env node

/**
 * V8.4 策略全数据集交叉验证脚本
 *
 * 使用所有真实历史数据集进行交叉验证，确保策略的稳健性
 */

const BacktestStrategyType = {
  CONVERGENCE: 'convergence',
  ARBITRAGE: 'arbitrage',
  REVERSAL: 'reversal',
  TREND_FOLLOWING: 'trend_following',
  MEAN_REVERSION: 'mean_reversion',
};

// 构建回测配置
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

// 所有数据集
const dataFiles = [
  { name: 'real_data_250mb.json', description: '大型数据集（250MB）' },
  { name: 'backtest_data_2zip.json', description: '2zip数据集（时间间隔极短）' },
  { name: 'backtest_data_multi.json', description: '多市场数据集' },
  { name: 'backtest_data_1769009635709.json', description: '数据集 1（0.10分钟间隔）' },
  { name: 'backtest_data_1769009755199.json', description: '数据集 2（0.60分钟间隔）' },
  { name: 'backtest_data_1769009621518.json', description: '数据集 3' },
  { name: 'backtest_data_1769008904731.json', description: '数据集 4' },
  { name: 'backtest_data_1769009082241.json', description: '数据集 5' },
  { name: 'backtest_data_1769009786594.json', description: '数据集 6' },
  { name: 'backtest_data_small.json', description: '小型数据集' },
  { name: 'test_backtest.json', description: '测试数据集' },
];

// 测试每个数据文件
async function testStrategy(dataFile) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`数据文件: ${dataFile.name}`);
  console.log(`描述: ${dataFile.description}`);
  console.log(`${'='.repeat(80)}`);

  const config = createConfig();

  try {
    const response = await fetch('http://localhost:5000/api/backtest/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config,
        dataFile: dataFile.name,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

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
              process.stdout.write(`\r进度: ${progress.toFixed(1)}% | 当前资金: $${data.data.currentEquity?.toFixed(2) || 'N/A'} | 开仓: ${data.data.stats?.tradesOpened || 0} | 平仓: ${data.data.stats?.tradesClosed || 0}`);
            } else if (data.type === 'complete') {
              process.stdout.write('\r' + ' '.repeat(100) + '\r');
              
              const r = data.result;
              return {
                totalReturn: r.totalReturn,
                totalTrades: r.totalTrades,
                winRate: r.winRate,
                bestStrategy: r.bestStrategy,
                tradesList: r.tradesList || [],
              };
            } else if (data.type === 'error') {
              console.error('\n❌ 错误:', data.error);
              return null;
            }
          } catch (e) {
            // 忽略 JSON 解析错误
          }
        }
      }
    }
  } catch (error) {
    console.error(`\n❌ 测试 ${dataFile.name} 失败:`, error.message);
    return null;
  }
}

// 主函数
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              Reversal V8.4 策略全数据集交叉验证                            ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('V8.4 策略特性：');
  console.log('  • 市场归零风险控制（价格 < 5% 立即平仓）');
  console.log('  • 价格过低过滤（避免在价格 < 10% 时开仓）');
  console.log('  • 波动性过滤（最近10个数据点价格变化 < 30%）');
  console.log('  • 硬止损（参数的 1.2 倍容忍度）');
  console.log('  • 价格暴跌检测（短时间内跌幅 > 20%）');
  console.log('  • 分段检测（根据剩余天数动态调整）');
  console.log('  • 价格区间：10%-40%\n');

  const results = [];

  for (const dataFile of dataFiles) {
    const result = await testStrategy(dataFile);
    if (result) {
      results.push({
        name: dataFile.name,
        description: dataFile.description,
        ...result,
      });
    } else {
      results.push({
        name: dataFile.name,
        description: dataFile.description,
        totalReturn: 'ERROR',
        totalTrades: 0,
        winRate: 'N/A',
        tradesList: [],
      });
    }
    
    // 等待 2 秒再测试下一个文件
    if (dataFiles.indexOf(dataFile) < dataFiles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // 汇总结果
  console.log('\n\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              交叉验证结果                                     ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('┌─────────────────────────────────┬──────────────┬─────────────┬──────────────┐');
  console.log('│ 数据集                          │ 总收益率     │ 交易总数    │ 胜率         │');
  console.log('├─────────────────────────────────┼──────────────┼─────────────┼──────────────┤');
  
  results.forEach(r => {
    const name = r.name.substring(0, 31).padEnd(31, ' ');
    const totalReturn = (r.totalReturn || 'ERROR').toString().padEnd(12, ' ');
    const totalTrades = (r.totalTrades || 0).toString().padEnd(11, ' ');
    const winRate = (r.winRate || 'N/A').toString().padEnd(12, ' ');
    console.log(`│ ${name} │ ${totalReturn} │ ${totalTrades} │ ${winRate} │`);
  });

  console.log('└─────────────────────────────────┴──────────────┴─────────────┴──────────────┘\n');

  // 统计分析
  const validResults = results.filter(r => r.totalReturn && typeof r.totalReturn === 'string' && r.totalReturn !== 'ERROR');
  
  if (validResults.length > 0) {
    const returnValues = validResults.map(r => parseFloat(r.totalReturn.replace('%', '')));
    const avgReturn = returnValues.reduce((sum, val) => sum + val, 0) / returnValues.length;
    const maxReturn = Math.max(...returnValues);
    const minReturn = Math.min(...returnValues);
    const positiveCount = returnValues.filter(v => v > 0).length;
    
    const avgTrades = validResults.reduce((sum, r) => sum + (r.totalTrades || 0), 0) / validResults.length;
    
    const winRateValues = validResults
      .map(r => parseFloat(r.winRate.replace('%', '')))
      .filter(v => !isNaN(v));
    const avgWinRate = winRateValues.length > 0 
      ? winRateValues.reduce((sum, v) => sum + v, 0) / winRateValues.length 
      : 0;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('统计分析');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`有效数据集: ${validResults.length}/${results.length}`);
    console.log(`平均收益率: ${avgReturn.toFixed(2)}%`);
    console.log(`最高收益率: ${maxReturn.toFixed(2)}%`);
    console.log(`最低收益率: ${minReturn.toFixed(2)}%`);
    console.log(`盈利数据集: ${positiveCount}/${validResults.length} (${(positiveCount/validResults.length*100).toFixed(1)}%)`);
    console.log(`平均交易数: ${avgTrades.toFixed(0)} 笔`);
    console.log(`平均胜率: ${avgWinRate.toFixed(2)}%\n`);

    // 找出最佳数据集
    const bestResult = validResults.reduce((best, r) => {
      const returnPercent = parseFloat(r.totalReturn.replace('%', ''));
      const bestPercent = parseFloat(best.totalReturn.replace('%', ''));
      return returnPercent > bestPercent ? r : best;
    }, validResults[0]);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('最佳表现数据集');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`数据集: ${bestResult.name}`);
    console.log(`总收益率: ${bestResult.totalReturn}`);
    console.log(`交易总数: ${bestResult.totalTrades}`);
    console.log(`胜率: ${bestResult.winRate}\n`);
  }

  // 详细交易记录汇总
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('所有数据集交易汇总');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  let totalTradesAll = 0;
  let totalProfitTrades = 0;
  let totalProfitAmount = 0;
  let totalLossTrades = 0;
  let totalLossAmount = 0;
  let bigProfitTrades = 0;  // >100%

  validResults.forEach(r => {
    if (r.tradesList && r.tradesList.length > 0) {
      r.tradesList.forEach(trade => {
        totalTradesAll++;
        const profitPercent = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
        const profitAmount = (trade.exitPrice - trade.entryPrice) * trade.positionSize;

        if (profitPercent > 0) {
          totalProfitTrades++;
          totalProfitAmount += profitAmount;
          if (profitPercent > 100) {
            bigProfitTrades++;
          }
        } else {
          totalLossTrades++;
          totalLossAmount += profitAmount;
        }
      });
    }
  });

  console.log(`总交易数: ${totalTradesAll}`);
  console.log(`盈利交易: ${totalProfitTrades} (${(totalProfitTrades/totalTradesAll*100).toFixed(1)}%)`);
  console.log(`亏损交易: ${totalLossTrades} (${(totalLossTrades/totalTradesAll*100).toFixed(1)}%)`);
  console.log(`大额盈利(>100%): ${bigProfitTrades} 笔`);
  console.log(`总盈利: $${totalProfitAmount.toFixed(2)}`);
  console.log(`总亏损: $${totalLossAmount.toFixed(2)}`);
  console.log(`净盈亏: $${(totalProfitAmount + totalLossAmount).toFixed(2)}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ 交叉验证完成');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
