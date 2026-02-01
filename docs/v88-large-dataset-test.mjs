#!/usr/bin/env node

/**
 * Reversal V8.9 高盈亏比策略测试脚本
 *
 * 使用 80w 快照的大数据集（backtest_data_2zip.json）进行回测
 *
 * 【V8.9 核心理念】
 * 1. 高盈亏比：低价格入场（0.01-0.05），15% 止损，移动止盈
 * 2. 单笔期望：0.05 买入涨到 1 美元，收益率 1900%
 * 3. 胜率要求：20% 胜率就能有极高的单笔期望
 * 4. 极简化入场：取消所有技术指标，只检查基础条件
 * 5. 聚焦低价格：优先入场 1%-10% 的低价格机会
 *
 * 目标：
 * 1. 单笔交易期望 >8%（扣除 4% 磨损后 >4%）
 * 2. 月收益率 >30%（扣除 4% 磨损后）
 * 3. 交易数 20-30 笔/数据集（实际可能更多）
 * 4. 胜率 15-25%（降低，因为盈亏比极高）
 * 5. 盈亏比 >5（极高盈亏比）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createV88Config = () => ({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  intervalMinutes: 15,

  initialCapital: 10000,
  maxPositions: 20,  // 从 10 增加到 20（高盈亏比策略可以承受更多仓位）
  maxPositionSize: 0.15,  // 从 0.25 降低到 0.15（分散风险）

  strategies: {
    'convergence': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'arbitrage': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'reversal': { enabled: true, version: 'v8', maxPositions: 20, maxPositionSize: 0.15 },  // V8.9 使用 v8
    'trend_following': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'mean_reversion': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
  },

  dailyLossLimit: 0.15,  // 从 0.10 放宽到 0.15
  maxDrawdown: 0.25,  // 从 0.20 放宽到 0.25

  filters: {
    minVolume: 500,  // 从 2000 降低到 500
    minLiquidity: 100,  // 从 500 降低到 100
    minDaysToEnd: 1,  // V8.9 仍然保留时间过滤（但回测引擎会处理 endDate 相同的问题）
    maxDaysToEnd: 365,
  },
});

async function testDataset(fileName) {
  const config = createV88Config();

  try {
    const response = await fetch('http://localhost:5000/api/backtest/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config,
        dataFile: fileName,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let result = null;
    let tradesList = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'complete') {
              result = data.result;
              tradesList = result.tradesList || [];
              return { success: true, result, tradesList };
            } else if (data.type === 'error') {
              return { success: false, error: data.error };
            }
          } catch (e) {
            // 忽略 JSON 解析错误
          }
        }
      }
    }

    return { success: false, error: 'No result received' };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('Reversal V8.9 高盈亏比策略 - 大数据集测试');
  console.log('='.repeat(80));
  console.log(`\n测试数据集: backtest_data_2zip.json（80w 快照）`);
  console.log(`策略版本: Reversal V8.9（高盈亏比极简版）\n`);

  const fileName = 'backtest_data_2zip.json';

  console.log('-'.repeat(80));
  console.log(`\n测试: ${fileName}`);

  const testResult = await testDataset(fileName);

  if (testResult.success) {
    const { result, tradesList } = testResult;

    const totalReturn = parseFloat(result.totalReturn);
    const trades = result.totalTrades || tradesList.length;
    const winRate = parseFloat(result.winRate);

    // 统计盈利交易和亏损交易
    const profitableTrades = tradesList.filter(t => t.exitPrice > t.entryPrice);
    const losingTrades = tradesList.filter(t => t.exitPrice <= t.entryPrice);

    // 计算平均盈利和平均亏损
    const avgProfit = profitableTrades.length > 0 ?
      profitableTrades.reduce((sum, t) => sum + (t.exitPrice - t.entryPrice), 0) / profitableTrades.length / profitableTrades[0].entryPrice : 0;
    const avgLoss = losingTrades.length > 0 ?
      losingTrades.reduce((sum, t) => sum + (t.exitPrice - t.entryPrice), 0) / losingTrades.length / losingTrades[0].entryPrice : 0;

    // 计算盈亏比
    const profitLossRatio = avgLoss !== 0 ? Math.abs(avgProfit / avgLoss) : 0;

    // 计算大额盈利次数（>100%）
    const bigProfitCount = tradesList.filter(t => {
      const profitPercent = (t.exitPrice - t.entryPrice) / t.entryPrice * 100;
      return profitPercent > 100;
    }).length;

    // 计算极大额盈利次数（>300%）
    const hugeProfitCount = tradesList.filter(t => {
      const profitPercent = (t.exitPrice - t.entryPrice) / t.entryPrice * 100;
      return profitPercent > 300;
    }).length;

    // 计算平均持仓时间
    const avgHoldingTime = trades > 0 ?
      tradesList.reduce((sum, t) => sum + ((new Date(t.exitTime) - new Date(t.entryTime)) / (1000 * 60 * 60)), 0) / trades : 0;

    // 计算月收益率
    const monthlyTrades = trades;  // 假设整个数据集代表一个月
    const avgProfitPercent = trades > 0 ?
      tradesList.reduce((sum, t) => sum + ((t.exitPrice - t.entryPrice) / t.entryPrice * 100), 0) / trades : 0;

    // 扣除 4% 磨损后的单笔期望
    const avgProfitPercentAfterSlippage = avgProfitPercent - 4;

    // 扣除 4% 磨损后的月收益率
    const monthlyReturnAfterSlippage = monthlyTrades * avgProfitPercentAfterSlippage / 100;
    const monthlyReturn = monthlyTrades * avgProfitPercent / 100;

    // 计算年化收益率
    const annualReturn = Math.pow(1 + monthlyReturn, 12) - 1;
    const annualReturnAfterSlippage = Math.pow(1 + monthlyReturnAfterSlippage, 12) - 1;

    console.log(`✅ 测试完成\n`);

    console.log('基础指标：');
    console.log(`   总交易数: ${trades}`);
    console.log(`   盈利交易数: ${profitableTrades.length} (${(profitableTrades.length / trades * 100).toFixed(2)}%)`);
    console.log(`   亏损交易数: ${losingTrades.length} (${(losingTrades.length / trades * 100).toFixed(2)}%)`);
    console.log(`   胜率: ${winRate}%`);
    console.log(`   平均盈利: ${(avgProfit * 100).toFixed(2)}%`);
    console.log(`   平均亏损: ${(avgLoss * 100).toFixed(2)}%`);
    console.log(`   盈亏比: ${profitLossRatio.toFixed(2)}`);

    console.log('\n大额盈利统计：');
    console.log(`   大额盈利次数（>100%）: ${bigProfitCount} (${(bigProfitCount / trades * 100).toFixed(2)}%)`);
    console.log(`   极大额盈利次数（>300%）: ${hugeProfitCount} (${(hugeProfitCount / trades * 100).toFixed(2)}%)`);

    console.log('\n时间和资金：');
    console.log(`   平均持仓时间: ${avgHoldingTime.toFixed(2)} 小时`);
    console.log(`   总收益率（理论）: ${totalReturn}%`);
    console.log(`   总收益率（计算）: ${(avgProfitPercent * trades).toFixed(2)}%`);

    console.log('\n月收益率：');
    console.log(`   月收益率（理论）: ${(monthlyReturn * 100).toFixed(2)}%`);
    console.log(`   年化收益率（理论）: ${(annualReturn * 100).toFixed(2)}%`);

    console.log('\n考虑 4% 磨损后：');
    console.log(`   单笔期望（理论）: ${avgProfitPercent.toFixed(2)}%`);
    console.log(`   单笔期望（扣除 4% 磨损）: ${avgProfitPercentAfterSlippage.toFixed(2)}%`);
    console.log(`   月收益率（扣除 4% 磨损）: ${(monthlyReturnAfterSlippage * 100).toFixed(2)}%`);
    console.log(`   年化收益率（扣除 4% 磨损）: ${(annualReturnAfterSlippage * 100).toFixed(2)}%`);

    // 目标对比
    console.log('\n' + '='.repeat(80));
    console.log('目标对比（V8.9）');
    console.log('='.repeat(80));

    console.log(`\n目标1：单笔交易期望 >8%（扣除 4% 磨损后 >4%）`);
    console.log(`   当前（扣除 4% 磨损后）：${avgProfitPercentAfterSlippage.toFixed(2)}%`);
    console.log(`   状态：${avgProfitPercentAfterSlippage > 4 ? '✅ 达成' : '❌ 未达成'}`);

    console.log(`\n目标2：月收益率 >30%（扣除 4% 磨损后）`);
    console.log(`   当前（扣除 4% 磨损后）：${(monthlyReturnAfterSlippage * 100).toFixed(2)}%`);
    console.log(`   状态：${monthlyReturnAfterSlippage > 0.30 ? '✅ 达成' : '❌ 未达成'}`);

    console.log(`\n目标3：交易数 >20`);
    console.log(`   当前：${trades}`);
    console.log(`   状态：${trades > 20 ? '✅ 达成' : '❌ 未达成'}`);

    console.log(`\n目标4：胜率 15-25%（V8.9 降低，因为盈亏比极高）`);
    console.log(`   当前：${winRate}%`);
    console.log(`   状态：${winRate >= 15 && winRate <= 25 ? '✅ 达成' : '❌ 未达成'}`);

    console.log(`\n目标5：盈亏比 >5（V8.9 提高，因为聚焦低价格）`);
    console.log(`   当前：${profitLossRatio.toFixed(2)}`);
    console.log(`   状态：${profitLossRatio > 5 ? '✅ 达成' : '❌ 未达成'}`);

    // 结论
    console.log('\n' + '='.repeat(80));
    console.log('结论');
    console.log('='.repeat(80));

    const goalsMet = [
      avgProfitPercentAfterSlippage > 4,
      monthlyReturnAfterSlippage > 0.30,
      trades > 20,
      winRate >= 15 && winRate <= 25,
      profitLossRatio > 5
    ].filter(g => g).length;

    if (goalsMet === 5) {
      console.log('\n✅ V8.9 策略已达到所有目标！');
      console.log('   • 单笔期望 >4%（扣除 4% 磨损后）');
      console.log('   • 月收益率 >30%（扣除 4% 磨损后）');
      console.log('   • 交易数 >20');
      console.log('   • 胜率 15-25%');
      console.log('   • 盈亏比 >5');
      console.log('   • 可以部署到生产环境');
    } else {
      console.log('\n⚠️  V8.9 策略部分达标：');
      console.log(`   • 达成目标：${goalsMet}/5`);

      if (avgProfitPercentAfterSlippage <= 4) {
        console.log('   • 单笔期望（扣除 4% 磨损后）<= 4% ❌');
      }
      if (monthlyReturnAfterSlippage <= 0.30) {
        console.log('   • 月收益率（扣除 4% 磨损后）<= 30% ❌');
      }
      if (trades <= 20) {
        console.log('   • 交易数 <= 20 ❌');
      }
      if (winRate < 15 || winRate > 25) {
        console.log('   • 胜率不在 15-25% 范围内 ❌');
      }
      if (profitLossRatio <= 5) {
        console.log('   • 盈亏比 <= 5 ❌');
      }

      console.log('\n   建议进一步优化：');
      if (monthlyReturnAfterSlippage <= 0.30) {
        console.log('   • 调整移动止盈回撤阈值，让利润继续奔跑');
        console.log('   • 放宽入场条件，增加交易数');
      }
      if (profitLossRatio <= 5) {
        console.log('   • 进一步聚焦极低价格（0.01-0.05）');
      }
      if (trades <= 20) {
        console.log('   • 降低交易量门槛，增加交易数');
      }
    }

    // 保存详细交易记录
    const tradeDetailsPath = path.join(__dirname, '..', 'data', 'output', `v89_trades_${fileName}`);
    fs.writeFileSync(tradeDetailsPath, JSON.stringify(tradesList, null, 2));
    console.log(`\n📄 详细交易记录已保存到: ${tradeDetailsPath}`);

    // 保存测试结果
    const summary = {
      fileName,
      totalReturn,
      trades,
      winRate,
      avgProfitPercent,
      avgLoss,
      profitLossRatio,
      bigProfitCount,
      hugeProfitCount,
      avgHoldingTime,
      monthlyReturn,
      annualReturn,
      avgProfitPercentAfterSlippage,
      monthlyReturnAfterSlippage,
      annualReturnAfterSlippage,
      goalsMet,
    };

    const summaryPath = path.join(__dirname, '..', 'data', 'output', 'v89_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`📄 测试结果已保存到: ${summaryPath}`);

  } else {
    console.log(`❌ 测试失败: ${testResult.error}`);
  }
}

main().catch(error => {
  console.error('❌ 程序执行失败:', error);
  process.exit(1);
});
