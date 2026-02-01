const fs = require('fs');
const path = require('path');
const { BacktestEngine } = require('./src/lib/backtest/engine');

async function runBacktest() {
  console.log('========== 开始回测（小数据集） ==========\n');

  // 读取数据
  const dataPath = path.join(process.cwd(), 'data', 'imported', 'backtest_data_small.json');
  const rawData = fs.readFileSync(dataPath, 'utf8');
  const parsedData = JSON.parse(rawData);
  const snapshots = parsedData.snapshots || [];

  console.log(`数据集大小: ${snapshots.length} 个快照`);
  console.log(`市场数量: ${new Set(snapshots.map(s => s.marketId)).size}\n`);

  // 配置
  const config = {
    startDate: new Date(snapshots[0]?.timestamp),
    endDate: new Date(snapshots[snapshots.length - 1]?.timestamp),
    intervalMinutes: 1,
    initialCapital: 10000,
    maxPositions: 10,
    maxPositionSize: 0.25,
    dailyLossLimit: 0.15,
    maxDrawdown: 0.25,
    filters: {
      minVolume: 0,
      minLiquidity: 0,
      minDaysToEnd: 0,
      maxDaysToEnd: 365,
    },
    strategies: {
      reversal: {
        enabled: true,
        version: 'v8.9',
        maxPositions: 5,
        maxPositionSize: 0.15,
        stopLoss: 0.10,
        trailingStop: 0.20,
      },
      convergence: { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
      arbitrage: { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
      trend_following: { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
      mean_reversion: { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    },
  };

  // 创建引擎
  const engine = new BacktestEngine(config, (event) => {
    console.log(`[${event.type}]`, JSON.stringify(event.data || {}).substring(0, 200));
  });

  // 加载数据
  await engine.loadData(snapshots);

  // 运行回测
  console.log('\n========== 开始运行回测 ==========\n');
  const result = await engine.run();

  // 输出结果
  console.log('\n========== 回测完成 ==========');
  console.log(`总收益率: ${result.pnl.totalPercent.toFixed(2)}%`);
  console.log(`总交易数: ${result.trades.total}`);
  console.log(`胜率: ${result.trades.winRate.toFixed(1)}%`);
  console.log(`平均盈亏: ${result.trades.averageTrade.toFixed(2)} 美元`);
  console.log(`最佳交易: ${result.trades.bestTrade.toFixed(2)} 美元`);
  console.log(`最差交易: ${result.trades.worstTrade.toFixed(2)} 美元`);
  console.log(`最大回撤: ${result.pnl.maxDrawdownPercent.toFixed(2)}%`);

  // 输出前 20 笔交易的详细信息
  console.log('\n========== 前 20 笔交易 ==========');
  const trades = engine.trades.slice(0, 20);
  trades.forEach((trade, index) => {
    console.log(`\n交易 #${index + 1}: ${trade.id}`);
    console.log(`  入场价格: ${(trade.entryPrice * 100).toFixed(2)}%`);
    console.log(`  入场金额: ${trade.entryValue.toFixed(2)} 美元`);
    console.log(`  仓位大小: ${trade.positionSize.toFixed(2)}`);
    console.log(`  出场价格: ${trade.exitPrice ? (trade.exitPrice * 100).toFixed(2) + '%' : '未平仓'}`);
    console.log(`  出场金额: ${trade.exitValue ? trade.exitValue.toFixed(2) : '未平仓'} 美元`);
    console.log(`  盈亏: ${trade.pnl.toFixed(2)} 美元 (${trade.pnlPercent.toFixed(2)}%)`);
    console.log(`  状态: ${trade.status} (${trade.exitReason || 'N/A'})`);
  });

  console.log('\n========== 回测结束 ==========');
}

runBacktest().catch(console.error);
