#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../30_rounds_optimized_results.json');

function main() {
  if (!fs.existsSync(OUTPUT_FILE)) {
    console.log('❌ 结果文件不存在:', OUTPUT_FILE);
    return;
  }

  const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  const results = data.results || [];

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        30轮动态优化回测 - 最终报告                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('📊 基本信息:');
  console.log(`   数据文件: ${data.dataFile}`);
  console.log(`   策略版本: ${data.strategyVersion}`);
  console.log(`   优化模式: ${data.mode}`);
  console.log(`   总回测轮数: ${data.totalRounds}`);
  console.log(`   成功回测: ${results.length}`);
  console.log(`   回测时间: ${new Date(data.timestamp).toLocaleString()}\n`);

  if (results.length === 0) {
    console.log('❌ 没有有效的回测结果');
    return;
  }

  const monthlyReturns = results.map(r => r.monthlyReturn);
  const winRates = results.map(r => r.winRate);
  const sharpeRatios = results.map(r => r.sharpeRatio);
  const maxDrawdowns = results.map(r => r.maxDrawdown);
  const totalTrades = results.map(r => r.totalTrades);

  const avgMonthlyReturn = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
  const avgWinRate = winRates.reduce((a, b) => a + b, 0) / winRates.length;
  const avgSharpeRatio = sharpeRatios.reduce((a, b) => a + b, 0) / sharpeRatios.length;
  const avgMaxDrawdown = maxDrawdowns.reduce((a, b) => a + b, 0) / maxDrawdowns.length;
  const avgTotalTrades = totalTrades.reduce((a, b) => a + b, 0) / totalTrades.length;

  monthlyReturns.sort((a, b) => a - b);
  const medianMonthlyReturn = monthlyReturns[Math.floor(monthlyReturns.length / 2)];

  const stdDevMonthlyReturn = Math.sqrt(
    monthlyReturns.reduce((sum, val) => sum + Math.pow(val - avgMonthlyReturn, 2), 0) / monthlyReturns.length
  );

  const stdDevWinRate = Math.sqrt(
    winRates.reduce((sum, val) => sum + Math.pow(val - avgWinRate, 2), 0) / winRates.length
  );

  console.log('📈 月利润率统计:');
  console.log(`   平均值: ${avgMonthlyReturn.toFixed(2)}%`);
  console.log(`   中位数: ${medianMonthlyReturn.toFixed(2)}%`);
  console.log(`   最小值: ${monthlyReturns[0].toFixed(2)}%`);
  console.log(`   最大值: ${monthlyReturns[monthlyReturns.length - 1].toFixed(2)}%`);
  console.log(`   标准差: ${stdDevMonthlyReturn.toFixed(2)}%\n`);

  console.log('🎯 胜率统计:');
  console.log(`   平均值: ${avgWinRate.toFixed(2)}%`);
  console.log(`   最小值: ${Math.min(...winRates).toFixed(2)}%`);
  console.log(`   最大值: ${Math.max(...winRates).toFixed(2)}%`);
  console.log(`   标准差: ${stdDevWinRate.toFixed(2)}%\n`);

  console.log('⚖️  风险指标:');
  console.log(`   平均夏普比率: ${avgSharpeRatio.toFixed(2)}`);
  console.log(`   平均最大回撤: ${avgMaxDrawdown.toFixed(2)}%`);
  console.log(`   平均交易数: ${avgTotalTrades.toFixed(0)}\n`);

  const targetAchieved = avgMonthlyReturn >= 0.5;
  console.log('🏆 目标达成:');
  console.log(`   目标月利润率: 50.00%`);
  console.log(`   实际月利润率: ${avgMonthlyReturn.toFixed(2)}%`);
  console.log(`   差距: ${(avgMonthlyReturn - 0.5).toFixed(2)}%`);
  console.log(`   是否达标: ${targetAchieved ? '✅ 是' : '❌ 否'}\n`);

  console.log('📋 最终优化参数:');
  const finalParams = data.finalParams;
  if (finalParams) {
    console.log('');
    console.log('   【Reversal Strategy】');
    console.log(`      持仓数: ${finalParams.reversal?.maxPositions || 'N/A'}`);
    console.log(`      止损: ${(finalParams.reversal?.stopLoss * 100 || 0).toFixed(0)}%`);
    console.log(`      止盈: ${(finalParams.reversal?.takeProfit * 100 || 0).toFixed(0)}%`);
    console.log(`      价格区间: ${(finalParams.reversal?.minPrice * 100 || 0).toFixed(0)}%-${(finalParams.reversal?.maxPrice * 100 || 0).toFixed(0)}%`);
    console.log(`      信号阈值: ${finalParams.reversal?.signalThreshold || 'N/A'}`);

    console.log('');
    console.log('   【Convergence Strategy】');
    console.log(`      持仓数: ${finalParams.convergence?.maxPositions || 'N/A'}`);
    console.log(`      止损: ${(finalParams.convergence?.stopLoss * 100 || 0).toFixed(0)}%`);
    console.log(`      止盈: ${(finalParams.convergence?.takeProfit * 100 || 0).toFixed(0)}%`);
    console.log(`      价格区间: ${(finalParams.convergence?.minPrice * 100 || 0).toFixed(0)}%-${(finalParams.convergence?.maxPrice * 100 || 0).toFixed(0)}%`);
    console.log(`      信号阈值: ${finalParams.convergence?.signalThreshold || 'N/A'}`);
  }

  console.log('\n📄 每轮详细结果:');
  console.log('');
  results.forEach((r, i) => {
    console.log(`第 ${i + 1} 轮:`);
    console.log(`   月利润率: ${r.monthlyReturn.toFixed(2)}%`);
    console.log(`   胜率: ${r.winRate.toFixed(2)}%`);
    console.log(`   夏普比率: ${r.sharpeRatio.toFixed(2)}`);
    console.log(`   最大回撤: ${r.maxDrawdown.toFixed(2)}%`);
    console.log(`   交易数: ${r.totalTrades}`);
    if (i < results.length - 1) console.log('');
  });

  console.log('');
  console.log(`📁 结果文件: ${OUTPUT_FILE}\n`);
}

main();
