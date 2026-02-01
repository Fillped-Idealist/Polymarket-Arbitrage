#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const tradesFile = path.join(__dirname, '../data/exports/trades-2026-01-29T11-49-51-488Z.json');

const data = JSON.parse(fs.readFileSync(tradesFile, 'utf-8'));
const trades = data.trades || [];
const summary = data.summary || {};

console.log('=== 回测结果总览 ===\n');
// 从 trades 计算缺失的统计数据
const wins = trades.filter(t => t.pnl > 0);
const losses = trades.filter(t => t.pnl < 0);
const winRate = wins.length / trades.length;
const avgWin = wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length;
const avgLoss = losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length;
const profitLossRatio = Math.abs(avgWin / avgLoss);
const totalReturn = summary.totalReturnPercent ? parseFloat(summary.totalReturnPercent) : ((summary.finalEquity - summary.initialCapital) / summary.initialCapital * 100);

console.log('=== 回测结果总览 ===\n');
console.log(`初始资金: ${summary.initialCapital}`);
console.log(`最终权益: ${summary.finalEquity.toFixed(2)}`);
console.log(`总收益率: ${totalReturn.toFixed(2)}%`);
console.log(`总交易数: ${summary.totalTrades}`);
console.log(`盈利交易: ${wins.length} (${(winRate * 100).toFixed(2)}%)`);
console.log(`亏损交易: ${losses.length} (${((1 - winRate) * 100).toFixed(2)}%)`);
console.log(`平均盈利: ${avgWin.toFixed(2)}%`);
console.log(`平均亏损: ${avgLoss.toFixed(2)}%`);
console.log(`盈亏比: ${profitLossRatio.toFixed(2)}`);
console.log();

// 分析交易时长
const tradeDurations = trades.map(t => {
  const entryTime = new Date(t.entry.time).getTime();
  const exitTime = new Date(t.exit.time).getTime();
  return (exitTime - entryTime) / (1000 * 60 * 60); // 小时
}).filter(d => !isNaN(d));

tradeDurations.sort((a, b) => a - b);

if (tradeDurations.length > 0) {
  console.log('=== 交易时长分析 ===\n');
  console.log(`最短持仓: ${tradeDurations[0].toFixed(2)} 小时`);
  console.log(`最长持仓: ${tradeDurations[tradeDurations.length - 1].toFixed(2)} 小时`);
  console.log(`中位数持仓: ${tradeDurations[Math.floor(tradeDurations.length / 2)].toFixed(2)} 小时`);
  console.log(`平均持仓: ${(tradeDurations.reduce((sum, d) => sum + d, 0) / tradeDurations.length).toFixed(2)} 小时`);
  console.log();
}

// 按市场分析
const marketTrades = {};
trades.forEach(trade => {
  const market = trade.marketId;
  if (!marketTrades[market]) {
    marketTrades[market] = {
      count: 0,
      totalPnl: 0,
      wins: 0,
      trades: []
    };
  }
  marketTrades[market].count++;
  marketTrades[market].totalPnl += trade.pnlPercent;
  if (trade.pnlPercent > 0) marketTrades[market].wins++;
  marketTrades[market].trades.push(trade);
});

console.log('=== 按市场分析（Top 10） ===\n');
const sortedMarkets = Object.entries(marketTrades)
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 10);

sortedMarkets.forEach(([market, data]) => {
  const winRate = (data.wins / data.count * 100).toFixed(2);
  const avgPnl = (data.totalPnl / data.count).toFixed(2);
  console.log(`${market}:`);
  console.log(`  交易数: ${data.count}, 胜率: ${winRate}%, 平均收益: ${avgPnl}%`);
});
console.log();

// 分析买入价格分布
const entryPrices = trades.map(t => parseFloat(t.entry.price)).sort((a, b) => a - b);
const priceRanges = {
  '<0.01': 0,
  '0.01-0.05': 0,
  '0.05-0.10': 0,
  '0.10-0.20': 0,
  '0.20-0.35': 0
};

trades.forEach(trade => {
  const price = parseFloat(trade.entry.price);
  if (price < 0.01) priceRanges['<0.01']++;
  else if (price < 0.05) priceRanges['0.01-0.05']++;
  else if (price < 0.10) priceRanges['0.05-0.10']++;
  else if (price < 0.20) priceRanges['0.10-0.20']++;
  else if (price < 0.35) priceRanges['0.20-0.35']++;
});

console.log('=== 买入价格分布 ===\n');
Object.entries(priceRanges).forEach(([range, count]) => {
  const percentage = (count / trades.length * 100).toFixed(1);
  console.log(`${range}: ${count} 笔 (${percentage}%)`);
});
console.log();

// 分析最大盈利交易
const maxProfitTrade = trades.reduce((max, trade) => trade.pnlPercent > max.pnlPercent ? trade : max, trades[0]);
const maxProfitDuration = (new Date(maxProfitTrade.exit.time).getTime() - new Date(maxProfitTrade.entry.time).getTime()) / (1000 * 60 * 60);
console.log('=== 最大盈利交易 ===\n');
console.log(`市场ID: ${maxProfitTrade.marketId}`);
console.log(`策略: ${maxProfitTrade.strategy}`);
console.log(`买入价格: ${maxProfitTrade.entry.price}`);
console.log(`卖出价格: ${maxProfitTrade.exit.price}`);
console.log(`收益率: ${maxProfitTrade.pnlPercent.toFixed(2)}%`);
console.log(`退出原因: ${maxProfitTrade.exitReason}`);
console.log(`持仓时长: ${maxProfitDuration.toFixed(2)} 小时`);
console.log();

// 分析最大亏损交易
const maxLossTrade = trades.reduce((min, trade) => trade.pnlPercent < min.pnlPercent ? trade : min, trades[0]);
const maxLossDuration = (new Date(maxLossTrade.exit.time).getTime() - new Date(maxLossTrade.entry.time).getTime()) / (1000 * 60 * 60);
console.log('=== 最大亏损交易 ===\n');
console.log(`市场ID: ${maxLossTrade.marketId}`);
console.log(`策略: ${maxLossTrade.strategy}`);
console.log(`买入价格: ${maxLossTrade.entry.price}`);
console.log(`卖出价格: ${maxLossTrade.exit.price}`);
console.log(`收益率: ${maxLossTrade.pnlPercent.toFixed(2)}%`);
console.log(`退出原因: ${maxLossTrade.exitReason}`);
console.log(`持仓时长: ${maxLossDuration.toFixed(2)} 小时`);

// 按策略分析
const strategyStats = {};
trades.forEach(trade => {
  const strategy = trade.strategy;
  if (!strategyStats[strategy]) {
    strategyStats[strategy] = {
      count: 0,
      totalPnl: 0,
      wins: 0
    };
  }
  strategyStats[strategy].count++;
  strategyStats[strategy].totalPnl += trade.pnlPercent;
  if (trade.pnlPercent > 0) strategyStats[strategy].wins++;
});

console.log('\n=== 按策略分析 ===\n');
Object.entries(strategyStats).forEach(([strategy, data]) => {
  const winRate = (data.wins / data.count * 100).toFixed(2);
  const avgPnl = (data.totalPnl / data.count).toFixed(2);
  console.log(`${strategy}:`);
  console.log(`  交易数: ${data.count}, 胜率: ${winRate}%, 平均收益: ${avgPnl}%`);
});
