#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const tradesFile = path.join(__dirname, '../data/exports/trades-2026-01-29T11-49-51-488Z.json');

const data = JSON.parse(fs.readFileSync(tradesFile, 'utf-8'));
const trades = data.trades || [];

// 分析交易样本
const sampleTrades = trades.slice(0, 10);

console.log('=== 前10笔交易样本 ===\n');
sampleTrades.forEach((trade, i) => {
  console.log(`交易 ${i + 1}:`);
  console.log(`  市场ID: ${trade.marketId}`);
  console.log(`  策略: ${trade.strategy}`);
  console.log(`  买入: 价格 ${trade.entry.price}, 数量 ${trade.entry.size.toFixed(2)}, 价值 ${trade.entry.value.toFixed(2)}`);
  console.log(`  卖出: 价格 ${trade.exit.price}, 价值 ${trade.exit.value.toFixed(2)}`);
  console.log(`  PNL: ${trade.pnl.toFixed(2)} USD (${trade.pnlPercent.toFixed(2)}%)`);
  console.log(`  退出原因: ${trade.exitReason}`);
  console.log();
});

// 按 PNL 和 PNL% 分别统计
console.log('=== 按 USD PNL 统计 ===\n');
const winsUsd = trades.filter(t => t.pnl > 0);
const lossesUsd = trades.filter(t => t.pnl < 0);

const avgWinUsd = winsUsd.reduce((sum, t) => sum + t.pnl, 0) / winsUsd.length;
const avgLossUsd = lossesUsd.reduce((sum, t) => sum + t.pnl, 0) / lossesUsd.length;
const plRatioUsd = Math.abs(avgWinUsd / avgLossUsd);

console.log(`盈利交易数: ${winsUsd.length}`);
console.log(`亏损交易数: ${lossesUsd.length}`);
console.log(`平均盈利 (USD): ${avgWinUsd.toFixed(2)}`);
console.log(`平均亏损 (USD): ${avgLossUsd.toFixed(2)}`);
console.log(`盈亏比 (USD): ${plRatioUsd.toFixed(2)}`);
console.log();

console.log('=== 按 PNL% 统计 ===\n');
const winsPercent = trades.filter(t => t.pnlPercent > 0);
const lossesPercent = trades.filter(t => t.pnlPercent < 0);

const avgWinPercent = winsPercent.reduce((sum, t) => sum + t.pnlPercent, 0) / winsPercent.length;
const avgLossPercent = lossesPercent.reduce((sum, t) => sum + t.pnlPercent, 0) / lossesPercent.length;
const plRatioPercent = Math.abs(avgWinPercent / avgLossPercent);

console.log(`盈利交易数: ${winsPercent.length}`);
console.log(`亏损交易数: ${lossesPercent.length}`);
console.log(`平均盈利 (%): ${avgWinPercent.toFixed(2)}%`);
console.log(`平均亏损 (%): ${avgLossPercent.toFixed(2)}%`);
console.log(`盈亏比 (%): ${plRatioPercent.toFixed(2)}`);
console.log();

// 计算期望（基于 USD）
const winRateUsd = winsUsd.length / trades.length;
const expectedValueUsd = (winRateUsd * avgWinUsd) + ((1 - winRateUsd) * avgLossUsd);

console.log('=== 期望计算（基于 USD） ===\n');
console.log(`胜率: ${(winRateUsd * 100).toFixed(2)}%`);
console.log(`平均盈利: ${avgWinUsd.toFixed(2)} USD`);
console.log(`平均亏损: ${avgLossUsd.toFixed(2)} USD`);
console.log(`盈亏比: ${plRatioUsd.toFixed(2)}`);
console.log(`单笔交易期望: ${expectedValueUsd.toFixed(2)} USD`);
console.log();

// 交易盈亏分布
console.log('=== 交易盈亏分布 ===\n');
const pnlRanges = {
  '<-5000': 0,
  '-5000~-1000': 0,
  '-1000~-500': 0,
  '-500~0': 0,
  '0~500': 0,
  '500~1000': 0,
  '1000~5000': 0,
  '5000~10000': 0,
  '>10000': 0
};

trades.forEach(trade => {
  const pnl = trade.pnl;
  if (pnl < -5000) pnlRanges['<-5000']++;
  else if (pnl < -1000) pnlRanges['-5000~-1000']++;
  else if (pnl < -500) pnlRanges['-1000~-500']++;
  else if (pnl < 0) pnlRanges['-500~0']++;
  else if (pnl < 500) pnlRanges['0~500']++;
  else if (pnl < 1000) pnlRanges['500~1000']++;
  else if (pnl < 5000) pnlRanges['1000~5000']++;
  else if (pnl < 10000) pnlRanges['5000~10000']++;
  else pnlRanges['>10000']++;
});

Object.entries(pnlRanges).forEach(([range, count]) => {
  const percentage = (count / trades.length * 100).toFixed(1);
  console.log(`${range} USD: ${count} 笔 (${percentage}%)`);
});
