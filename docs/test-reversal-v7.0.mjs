#!/usr/bin/env node

/**
 * 测试 Reversal V7.0 策略
 *
 * 使用多组真实数据回测 V7.0 策略表现
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
  intervalMinutes: 15,  // 15分钟间隔

  initialCapital: 10000,
  maxPositions: 3,
  maxPositionSize: 0.33,  // 每个仓位最多 33%

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
      stopLoss: 0.08,      // 8% 止损
      takeProfit: 0.50,    // 50% 止盈
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

  dailyLossLimit: 0.10,  // 日亏损限制 10%
  maxDrawdown: 0.15,     // 最大回撤 15%

  filters: {
    minVolume: 5000,
    minLiquidity: 1000,
    minDaysToEnd: 1,
    maxDaysToEnd: 60,
  },
});

// 数据文件列表
const dataFiles = [
  'real_data_250mb.json',
  'backtest_data_1769009635709.json',
  'backtest_data_1769009621518.json',
];

// 测试每个数据文件
async function testStrategy(dataFile) {
  console.log(`\n=== 测试数据文件: ${dataFile} ===`);

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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'progress') {
              process.stdout.write(`\r进度: ${data.progress.toFixed(1)}% | 当前资金: $${data.currentEquity?.toFixed(2) || 'N/A'} | 开仓数: ${data.openTrades || 0} | 平仓数: ${data.closedTrades || 0}`);
            } else if (data.type === 'complete') {
              console.log('\n');
              console.log('\n=== 回测完成 ===');
              console.log(`总盈亏: $${data.result?.pnl?.total?.toFixed(2) || 'N/A'}`);
              console.log(`收益率: ${(data.result?.pnl?.totalPercent * 100)?.toFixed(2) || 'N/A'}%`);
              console.log(`胜率: ${(data.result?.trades?.winRate * 100)?.toFixed(2) || 'N/A'}%`);
              console.log(`最大回撤: ${(data.result?.pnl?.maxDrawdownPercent * 100)?.toFixed(2) || 'N/A'}%`);
              console.log(`交易总数: ${data.result?.trades?.total || 0}`);
              console.log(`盈利交易: ${data.result?.trades?.winning || 0}`);
              console.log(`亏损交易: ${data.result?.trades?.losing || 0}`);
              console.log(`平均盈亏: $${data.result?.trades?.averageTrade?.toFixed(2) || 'N/A'}`);
              console.log(`最佳交易: $${data.result?.trades?.bestTrade?.toFixed(2) || 'N/A'}`);
              console.log(`最差交易: $${data.result?.trades?.worstTrade?.toFixed(2) || 'N/A'}`);
              
              if (data.result?.strategyStats?.reversal) {
                console.log('\n=== Reversal 策略详情 ===');
                console.log(`交易数: ${data.result.strategyStats.reversal.trades}`);
                console.log(`胜率: ${(data.result.strategyStats.reversal.winRate * 100).toFixed(2)}%`);
                console.log(`总盈亏: $${data.result.strategyStats.reversal.totalPnl.toFixed(2)}`);
                console.log(`平均盈亏: $${data.result.strategyStats.reversal.averagePnl.toFixed(2)}`);
                console.log(`最大回撤: ${(data.result.strategyStats.reversal.maxDrawdown * 100).toFixed(2)}%`);
              }
            } else if (data.type === 'error') {
              console.error('\n错误:', data.error);
            }
          } catch (e) {
            // 忽略 JSON 解析错误
          }
        }
      }
    }
  } catch (error) {
    console.error(`测试 ${dataFile} 失败:`, error.message);
  }
}

// 主函数
async function main() {
  console.log('=== Reversal V7.0 策略回测 ===');
  console.log('策略特性：');
  console.log('  • 价格区间：5%-40%');
  console.log('  • 时间范围：距离到期 7-60 天');
  console.log('  • 动量确认：连续 3 个数据点上涨 & 5 个数据点涨幅 > 10%');
  console.log('  • 持续性：最近 5 个数据点中有 4 个上涨');
  console.log('  • 对立确认：对立选项价格下跌（3 个数据点中有 2 个下跌 & 跌幅 > 5%）');
  console.log('  • 开仓条件：至少满足 5 个条件中的 4 个');
  console.log('  • 止盈：价格达到入场价的 1.3-1.5 倍（30%-50% 盈利）');
  console.log('  • 止损：价格跌破入场价的 8%');
  console.log('  • 动量反转：价格连续 2 个数据点下跌且低于入场价');
  console.log('  • 最大持仓：14 天\n');

  for (const dataFile of dataFiles) {
    await testStrategy(dataFile);
    // 等待 2 秒再测试下一个文件
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n=== 所有回测完成 ===');
}

main().catch(console.error);
