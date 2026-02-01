#!/usr/bin/env node

/**
 * V8.3 策略多数据集回测脚本
 *
 * 使用多组真实数据进行交叉验证，确保策略的稳健性
 * V8.3 新特性：
 * - 添加波动性过滤（避免极端波动开仓）
 * - 优化止损逻辑（硬止损 + 软止损）
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

// 数据文件列表（多组真实数据）
const dataFiles = [
  { name: 'backtest_data_2zip.json', description: '2zip数据集（时间间隔极短）' },
  { name: 'backtest_data_1769009635709.json', description: '数据集 2（0.10分钟间隔）' },
  { name: 'backtest_data_1769009755199.json', description: '数据集 3（0.60分钟间隔）' },
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
    const result = {
      tradesOpened: 0,
      tradesClosed: 0,
      finalEquity: 10000,
      totalReturn: 0,
      totalTrades: 0,
      winRate: 0,
    };

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
              process.stdout.write('\r' + ' '.repeat(100) + '\r'); // 清除进度行
              console.log('\n✅ 回测完成\n');
              
              const r = data.result;
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log('回测结果');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log(`总收益率: ${r.totalReturn || 'N/A'}`);
              console.log(`交易总数: ${r.totalTrades || 0}`);
              console.log(`胜率: ${r.winRate || 'N/A'}`);
              console.log(`最佳策略: ${r.bestStrategy || 'N/A'}`);
              
              if (r.strategyStats?.reversal) {
                console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('Reversal V8.3 策略详情');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`交易数: ${r.strategyStats.reversal.trades}`);
                console.log(`胜率: ${(r.strategyStats.reversal.winRate * 100).toFixed(2)}%`);
                console.log(`总盈亏: $${r.strategyStats.reversal.totalPnl.toFixed(2)}`);
                console.log(`平均盈亏: $${r.strategyStats.reversal.averagePnl.toFixed(2)}`);
                console.log(`最大回撤: ${(r.strategyStats.reversal.maxDrawdown * 100).toFixed(2)}%`);
              }
              
              return {
                totalReturn: r.totalReturn,
                totalTrades: r.totalTrades,
                winRate: r.winRate,
                reversalTrades: r.strategyStats?.reversal?.trades || 0,
                reversalWinRate: r.strategyStats?.reversal?.winRate * 100 || 0,
                reversalTotalPnl: r.strategyStats?.reversal?.totalPnl || 0,
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
  console.log('║         Reversal V8.3 策略多数据集回测（波动性过滤 + 优化止损）               ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('V8.3 策略特性：');
  console.log('  • 波动性过滤（避免极端波动开仓）：');
  console.log('    - 最近10个数据点价格变化 < 30%');
  console.log('    - 最近5个数据点价格变化率 < 10%/小时');
  console.log('  • 分段检测（根据剩余天数动态调整）：');
  console.log('    - 临期（0-3 天）：止损5%，止盈15%，动量阈值5%，至少1个条件');
  console.log('    - 短期（3-7 天）：止损8%，止盈20%，动量阈值6%，至少1个条件');
  console.log('    - 中期（7-30 天）：止损10%，止盈25%，动量阈值8%，至少2个条件');
  console.log('    - 长期（30+ 天）：止损12%，止盈30%，动量阈值10%，至少2个条件');
  console.log('  • 优化止损逻辑：');
  console.log('    - 硬止损：参数的 1.5 倍容忍度（严格执行）');
  console.log('    - 软止损：标准参数，但需要最小持仓时间 1 小时');
  console.log('    - 动量反转止损：连续2个数据点下跌且亏损 > 5%');
  console.log('  • 价格区间：5%-40%');
  console.log('  • 时间范围：不限制（移除时间限制）\n');

  const results = [];

  for (const dataFile of dataFiles) {
    const result = await testStrategy(dataFile);
    if (result) {
      results.push({
        name: dataFile.name,
        description: dataFile.description,
        ...result,
      });
    }
    
    // 等待 2 秒再测试下一个文件
    if (dataFiles.indexOf(dataFile) < dataFiles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // 汇总结果
  console.log('\n\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              汇总结果                                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('┌─────────────────────────────────┬──────────────┬─────────────┬──────────────┐');
  console.log('│ 数据集                          │ 总收益率     │ 交易总数    │ 胜率         │');
  console.log('├─────────────────────────────────┼──────────────┼─────────────┼──────────────┤');
  
  results.forEach(r => {
    const name = r.name.padEnd(31, ' ');
    const totalReturn = (r.totalReturn || 'N/A').toString().padEnd(12, ' ');
    const totalTrades = (r.totalTrades || 0).toString().padEnd(11, ' ');
    const winRate = (r.winRate || 'N/A').toString().padEnd(12, ' ');
    console.log(`│ ${name} │ ${totalReturn} │ ${totalTrades} │ ${winRate} │`);
  });

  console.log('└─────────────────────────────────┴──────────────┴─────────────┴──────────────┘\n');

  // 计算平均表现
  const validResults = results.filter(r => r.totalReturn && typeof r.totalReturn === 'string' && r.totalReturn !== 'N/A');
  if (validResults.length > 0) {
    const avgReturn = validResults.reduce((sum, r) => {
      const returnPercent = parseFloat(r.totalReturn.replace('%', ''));
      return sum + returnPercent;
    }, 0) / validResults.length;
    
    const avgTrades = validResults.reduce((sum, r) => sum + (r.totalTrades || 0), 0) / validResults.length;
    
    const avgWinRate = validResults.reduce((sum, r) => {
      const winRatePercent = parseFloat(r.winRate.replace('%', ''));
      return sum + winRatePercent;
    }, 0) / validResults.length;

    console.log('平均表现（基于有效数据集）：');
    console.log(`  平均收益率: ${avgReturn.toFixed(2)}%`);
    console.log(`  平均交易数: ${avgTrades.toFixed(0)} 笔`);
    console.log(`  平均胜率: ${avgWinRate.toFixed(2)}%\n`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ 所有多数据集回测完成');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
