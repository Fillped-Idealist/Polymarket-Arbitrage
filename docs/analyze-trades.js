#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const tradesFile = path.join(__dirname, '../data/exports/trades-2026-01-29T11-49-51-488Z.json');

const data = JSON.parse(fs.readFileSync(tradesFile, 'utf-8'));
const trades = data.trades || [];

// 统计退出原因
const exitReasons = {
  '移动止盈': { count: 0, totalPnl: 0, wins: 0, trades: [] },
  '硬止损': { count: 0, totalPnl: 0, wins: 0, trades: [] },
  '强制平仓': { count: 0, totalPnl: 0, wins: 0, trades: [] },
  '市场归零': { count: 0, totalPnl: 0, wins: 0, trades: [] }
};

trades.forEach(trade => {
  const { exitReason, pnl } = trade;
  
  if (exitReason.includes('移动止盈')) {
    exitReasons['移动止盈'].count++;
    exitReasons['移动止盈'].totalPnl += pnl;
    if (pnl > 0) exitReasons['移动止盈'].wins++;
    exitReasons['移动止盈'].trades.push(trade);
  } else if (exitReason.includes('硬止损')) {
    exitReasons['硬止损'].count++;
    exitReasons['硬止损'].totalPnl += pnl;
    if (pnl > 0) exitReasons['硬止损'].wins++;
    exitReasons['硬止损'].trades.push(trade);
  } else if (exitReason.includes('强制平仓')) {
    exitReasons['强制平仓'].count++;
    exitReasons['强制平仓'].totalPnl += pnl;
    if (pnl > 0) exitReasons['强制平仓'].wins++;
    exitReasons['强制平仓'].trades.push(trade);
  } else if (exitReason.includes('市场归零')) {
    exitReasons['市场归零'].count++;
    exitReasons['市场归零'].totalPnl += pnl;
    if (pnl > 0) exitReasons['市场归零'].wins++;
    exitReasons['市场归零'].trades.push(trade);
  }
});

console.log('=== 退出原因分析 ===\n');

Object.entries(exitReasons).forEach(([reason, data]) => {
  if (data.count === 0) return;
  
  const winRate = (data.wins / data.count * 100).toFixed(2);
  const avgPnl = (data.totalPnl / data.count).toFixed(2);
  
  console.log(`${reason}:`);
  console.log(`  交易数: ${data.count}`);
  console.log(`  胜率: ${winRate}%`);
  console.log(`  平均收益: ${avgPnl}%`);
  console.log(`  总收益: ${data.totalPnl.toFixed(2)}%`);
  console.log();
});

// 分析移动止盈的收益分布
const mobileWinTrades = exitReasons['移动止盈'].trades.filter(t => t.pnl > 0);
const mobileWinPnls = mobileWinTrades.map(t => t.pnl).sort((a, b) => a - b);

console.log('=== 移动止盈盈利交易分析 ===\n');
console.log(`盈利交易数: ${mobileWinTrades.length}`);
console.log(`收益中位数: ${mobileWinPnls[Math.floor(mobileWinPnls.length / 2)]?.toFixed(2)}%`);
console.log(`收益最小值: ${mobileWinPnls[0]?.toFixed(2)}%`);
console.log(`收益最大值: ${mobileWinPnls[mobileWinPnls.length - 1]?.toFixed(2)}%`);
console.log();

// 统计收益区间
const pnlRanges = {
  '0-50%': 0,
  '50-100%': 0,
  '100-200%': 0,
  '200-500%': 0,
  '>500%': 0
};

mobileWinTrades.forEach(trade => {
  const pnl = trade.pnl;
  if (pnl < 50) pnlRanges['0-50%']++;
  else if (pnl < 100) pnlRanges['50-100%']++;
  else if (pnl < 200) pnlRanges['100-200%']++;
  else if (pnl < 500) pnlRanges['200-500%']++;
  else pnlRanges['>500%']++;
});

console.log('=== 移动止盈盈利交易收益分布 ===\n');
Object.entries(pnlRanges).forEach(([range, count]) => {
  const percentage = (count / mobileWinTrades.length * 100).toFixed(1);
  console.log(`${range}: ${count} 笔 (${percentage}%)`);
});

// 分析硬止损的亏损分布
const hardLossTrades = exitReasons['硬止损'].trades.filter(t => t.pnl < 0);
const hardLossPnls = hardLossTrades.map(t => Math.abs(t.pnl)).sort((a, b) => a - b);

console.log('\n=== 硬止损亏损交易分析 ===\n');
console.log(`亏损交易数: ${hardLossTrades.length}`);
console.log(`亏损中位数: ${hardLossPnls[Math.floor(hardLossPnls.length / 2)]?.toFixed(2)}%`);
console.log(`亏损最小值: ${hardLossPnls[0]?.toFixed(2)}%`);
console.log(`亏损最大值: ${hardLossPnls[hardLossPnls.length - 1]?.toFixed(2)}%`);
console.log();
