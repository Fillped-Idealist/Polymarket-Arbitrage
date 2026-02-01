#!/usr/bin/env node

/**
 * 30轮动态优化回测
 * 每轮结束后根据结果调整参数，下一轮使用新参数
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:5000/api/backtest/single-round-custom';
const DATA_FILE = 'real_data_250mb.json';
const OUTPUT_FILE = path.join(__dirname, '../30_rounds_optimized_results.json');

// 导入参数优化器
class ParameterOptimizer {
  constructor(initialParams) {
    this.history = [];
    this.params = JSON.parse(JSON.stringify(initialParams));
    this.targetMonthlyReturn = 0.5;
    this.targetWinRate = 0.5;
  }

  addResult(result) {
    this.history.push(result);
  }

  adjustParameters(result) {
    const avgMonthlyReturn = this.calculateAvgMonthlyReturn();
    const avgWinRate = this.calculateAvgWinRate();
    const avgMaxDrawdown = this.calculateAvgMaxDrawdown();
    const avgTrades = this.calculateAvgTrades();

    console.log('\n📊 参数调整分析:');
    console.log(`   当前月利润率: ${(result.monthlyReturn * 100).toFixed(2)}%`);
    console.log(`   平均月利润率: ${(avgMonthlyReturn * 100).toFixed(2)}%`);
    console.log(`   目标月利润率: ${(this.targetMonthlyReturn * 100).toFixed(2)}%`);
    console.log(`   当前胜率: ${(result.winRate * 100).toFixed(2)}%`);
    console.log(`   平均胜率: ${(avgWinRate * 100).toFixed(2)}%`);
    console.log(`   平均回撤: ${(avgMaxDrawdown * 100).toFixed(2)}%`);
    console.log(`   平均交易数: ${avgTrades.toFixed(0)}`);

    const adjustments = [];

    if (avgMonthlyReturn < this.targetMonthlyReturn) {
      const gap = this.targetMonthlyReturn - avgMonthlyReturn;
      adjustments.push(`月利润率偏低，需要调整`);

      if (avgTrades < 10) {
        console.log('   → 交易数太少，降低信号阈值');
        this.params.reversal.signalThreshold = Math.max(3, this.params.reversal.signalThreshold - 0.5);
        this.params.convergence.signalThreshold = Math.max(4, this.params.convergence.signalThreshold - 0.5);
        adjustments.push(`Reversal信号阈值 → ${this.params.reversal.signalThreshold}`);
        adjustments.push(`Convergence信号阈值 → ${this.params.convergence.signalThreshold}`);
      } else if (avgWinRate > 0.6) {
        console.log('   → 胜率高但利润低，放宽止损');
        this.params.reversal.stopLoss = Math.min(0.5, this.params.reversal.stopLoss + 0.05);
        this.params.convergence.stopLoss = Math.min(0.2, this.params.convergence.stopLoss + 0.05);
        adjustments.push(`Reversal止损 → ${(this.params.reversal.stopLoss * 100).toFixed(0)}%`);
        adjustments.push(`Convergence止损 → ${(this.params.convergence.stopLoss * 100).toFixed(0)}%`);
      } else if (avgWinRate < 0.4) {
        console.log('   → 胜率低，提高信号阈值');
        this.params.reversal.signalThreshold = Math.min(7, this.params.reversal.signalThreshold + 0.5);
        this.params.convergence.signalThreshold = Math.min(8, this.params.convergence.signalThreshold + 0.5);
        adjustments.push(`Reversal信号阈值 → ${this.params.reversal.signalThreshold}`);
        adjustments.push(`Convergence信号阈值 → ${this.params.convergence.signalThreshold}`);
      }
    }

    if (avgMaxDrawdown > 0.4) {
      console.log('   → 回撤过大，减少持仓数');
      this.params.reversal.maxPositions = Math.max(5, this.params.reversal.maxPositions - 1);
      this.params.convergence.maxPositions = Math.max(10, this.params.convergence.maxPositions - 1);
      adjustments.push(`Reversal持仓数 → ${this.params.reversal.maxPositions}`);
      adjustments.push(`Convergence持仓数 → ${this.params.convergence.maxPositions}`);
    }

    if (avgMonthlyReturn > 1.0 && avgMaxDrawdown < 0.2) {
      console.log('   → 利润高且风险低，增加持仓数');
      this.params.reversal.maxPositions = Math.min(15, this.params.reversal.maxPositions + 1);
      this.params.convergence.maxPositions = Math.min(20, this.params.convergence.maxPositions + 1);
      adjustments.push(`Reversal持仓数 → ${this.params.reversal.maxPositions}`);
      adjustments.push(`Convergence持仓数 → ${this.params.convergence.maxPositions}`);
    }

    if (avgTrades < 5) {
      console.log('   → 交易极少，扩大价格区间');
      this.params.reversal.minPrice = Math.max(0.01, this.params.reversal.minPrice - 0.01);
      this.params.reversal.maxPrice = Math.min(0.6, this.params.reversal.maxPrice + 0.05);
      this.params.convergence.minPrice = Math.max(0.7, this.params.convergence.minPrice - 0.05);
      this.params.convergence.maxPrice = Math.min(0.99, this.params.convergence.maxPrice + 0.01);
      adjustments.push(`Reversal价格区间 → ${(this.params.reversal.minPrice * 100).toFixed(0)}%-${(this.params.reversal.maxPrice * 100).toFixed(0)}%`);
      adjustments.push(`Convergence价格区间 → ${(this.params.convergence.minPrice * 100).toFixed(0)}%-${(this.params.convergence.maxPrice * 100).toFixed(0)}%`);
    } else if (avgTrades > 50) {
      console.log('   → 交易过多，缩小价格区间');
      this.params.reversal.minPrice = Math.min(0.1, this.params.reversal.minPrice + 0.01);
      this.params.reversal.maxPrice = Math.max(0.5, this.params.reversal.maxPrice - 0.05);
      this.params.convergence.minPrice = Math.min(0.85, this.params.convergence.minPrice + 0.05);
      this.params.convergence.maxPrice = Math.max(0.95, this.params.convergence.maxPrice - 0.01);
      adjustments.push(`Reversal价格区间 → ${(this.params.reversal.minPrice * 100).toFixed(0)}%-${(this.params.reversal.maxPrice * 100).toFixed(0)}%`);
      adjustments.push(`Convergence价格区间 → ${(this.params.convergence.minPrice * 100).toFixed(0)}%-${(this.params.convergence.maxPrice * 100).toFixed(0)}%`);
    }

    this.validateParams();

    console.log('\n✅ 参数调整完成:');
    adjustments.forEach(adj => console.log(`   - ${adj}`));
    console.log('');

    return JSON.parse(JSON.stringify(this.params));
  }

  calculateAvgMonthlyReturn() {
    if (this.history.length === 0) return 0;
    return this.history.reduce((acc, r) => acc + r.monthlyReturn, 0) / this.history.length;
  }

  calculateAvgWinRate() {
    if (this.history.length === 0) return 0;
    return this.history.reduce((acc, r) => acc + r.winRate, 0) / this.history.length;
  }

  calculateAvgMaxDrawdown() {
    if (this.history.length === 0) return 0;
    return this.history.reduce((acc, r) => acc + r.maxDrawdown, 0) / this.history.length;
  }

  calculateAvgTrades() {
    if (this.history.length === 0) return 0;
    return this.history.reduce((acc, r) => acc + r.totalTrades, 0) / this.history.length;
  }

  validateParams() {
    this.params.reversal.maxPositions = Math.max(3, Math.min(20, this.params.reversal.maxPositions));
    this.params.reversal.stopLoss = Math.max(0.2, Math.min(0.5, this.params.reversal.stopLoss));
    this.params.reversal.takeProfit = 1.0;
    this.params.reversal.minPrice = Math.max(0.01, Math.min(0.3, this.params.reversal.minPrice));
    this.params.reversal.maxPrice = Math.max(0.4, Math.min(0.7, this.params.reversal.maxPrice));
    this.params.reversal.signalThreshold = Math.max(2, Math.min(10, this.params.reversal.signalThreshold));

    this.params.convergence.maxPositions = Math.max(5, Math.min(30, this.params.convergence.maxPositions));
    this.params.convergence.stopLoss = Math.max(0.1, Math.min(0.3, this.params.convergence.stopLoss));
    this.params.convergence.takeProfit = 1.0;
    this.params.convergence.minPrice = Math.max(0.7, Math.min(0.85, this.params.convergence.minPrice));
    this.params.convergence.maxPrice = Math.max(0.9, Math.min(0.99, this.params.convergence.maxPrice));
    this.params.convergence.signalThreshold = Math.max(3, Math.min(10, this.params.convergence.signalThreshold));

    if (this.params.reversal.minPrice >= this.params.reversal.maxPrice) {
      this.params.reversal.minPrice = 0.05;
      this.params.reversal.maxPrice = 0.55;
    }
    if (this.params.convergence.minPrice >= this.params.convergence.maxPrice) {
      this.params.convergence.minPrice = 0.80;
      this.params.convergence.maxPrice = 0.98;
    }
  }

  getParams() {
    return JSON.parse(JSON.stringify(this.params));
  }

  printParams() {
    console.log('\n📋 当前策略参数:');
    console.log('\n【Reversal Strategy】');
    console.log(`   持仓数: ${this.params.reversal.maxPositions}`);
    console.log(`   止损: ${(this.params.reversal.stopLoss * 100).toFixed(0)}%`);
    console.log(`   止盈: ${(this.params.reversal.takeProfit * 100).toFixed(0)}%`);
    console.log(`   价格区间: ${(this.params.reversal.minPrice * 100).toFixed(0)}%-${(this.params.reversal.maxPrice * 100).toFixed(0)}%`);
    console.log(`   信号阈值: ${this.params.reversal.signalThreshold}`);

    console.log('\n【Convergence Strategy】');
    console.log(`   持仓数: ${this.params.convergence.maxPositions}`);
    console.log(`   止损: ${(this.params.convergence.stopLoss * 100).toFixed(0)}%`);
    console.log(`   止盈: ${(this.params.convergence.takeProfit * 100).toFixed(0)}%`);
    console.log(`   价格区间: ${(this.params.convergence.minPrice * 100).toFixed(0)}%-${(this.params.convergence.maxPrice * 100).toFixed(0)}%`);
    console.log(`   信号阈值: ${this.params.convergence.signalThreshold}`);
    console.log('');
  }
}

// 初始参数
const initialParams = {
  reversal: {
    maxPositions: 10,
    stopLoss: 0.40,
    takeProfit: 1.0,
    minPrice: 0.05,
    maxPrice: 0.55,
    signalThreshold: 5,
  },
  convergence: {
    maxPositions: 15,
    stopLoss: 0.15,
    takeProfit: 1.0,
    minPrice: 0.80,
    maxPrice: 0.98,
    signalThreshold: 6,
  },
};

// 统计数据
const results = [];
const optimizer = new ParameterOptimizer(initialParams);

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║        Polymarket 30轮动态优化回测                    ║');
console.log('║      每轮结束后自动调整参数优化策略                      ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log(`API URL: ${API_URL}`);
console.log(`数据文件: ${DATA_FILE}`);
console.log(`输出文件: ${OUTPUT_FILE}\n`);

optimizer.printParams();

async function runRound(round, params) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      dataFile: DATA_FILE,
      round,
      customParams: params,
    });

    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/backtest/single-round-custom',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            resolve(result.result);
          } else {
            reject(new Error(result.error || '回测失败'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  const startTime = Date.now();
  const ROUNDS = 30;

  for (let i = 1; i <= ROUNDS; i++) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`第 ${i}/${ROUNDS} 轮回测`);
    console.log(`${'='.repeat(60)}`);

    try {
      // 获取当前参数
      const currentParams = optimizer.getParams();
      
      // 运行回测
      const result = await runRound(i, currentParams);
      
      // 添加结果到历史
      optimizer.addResult(result);
      results.push(result);

      // 打印结果
      console.log(`\n📊 第 ${i} 轮结果:`);
      console.log(`   月利润率: ${(result.monthlyReturn * 100).toFixed(2)}%`);
      console.log(`   胜率: ${(result.winRate * 100).toFixed(2)}%`);
      console.log(`   夏普比率: ${result.sharpeRatio.toFixed(2)}`);
      console.log(`   最大回撤: ${(result.maxDrawdown * 100).toFixed(2)}%`);
      console.log(`   交易数: ${result.totalTrades}`);
      console.log(`   盈利交易: ${result.profitTrades}, 亏损交易: ${result.lossTrades}`);
      console.log(`   平均盈利: ${(result.avgProfit * 100).toFixed(2)}%`);
      console.log(`   平均亏损: ${(result.avgLoss * 100).toFixed(2)}%`);

      // 调整参数（如果不是最后一轮）
      if (i < ROUNDS) {
        console.log(`\n🔄 调整参数...`);
        const newParams = optimizer.adjustParameters(result);
        optimizer.printParams();
      }

      // 保存中间结果
      saveResults(i);
      
      // 计算预计时间
      const elapsedMin = (Date.now() - startTime) / 1000 / 60;
      const remainingRounds = ROUNDS - i;
      const avgTimePerRound = elapsedMin / i;
      const estimatedRemainingMin = avgTimePerRound * remainingRounds;
      
      console.log(`\n⏱️  已用时间: ${elapsedMin.toFixed(1)}分钟`);
      console.log(`   预计剩余: ${estimatedRemainingMin.toFixed(1)}分钟`);
      console.log(`   预计总计: ${(elapsedMin + estimatedRemainingMin).toFixed(1)}分钟`);

    } catch (error) {
      console.error(`\n❌ 第 ${i} 轮失败:`, error.message);
      
      // 添加失败结果
      results.push({
        round: i,
        success: false,
        error: error.message,
      });
      
      // 不调整参数，继续下一轮
    }
  }

  // 最终总结
  console.log('\n\n' + '='.repeat(60));
  console.log('🎉 30轮动态优化回测完成！');
  console.log('='.repeat(60) + '\n');

  printFinalSummary();
  saveResults(ROUNDS);
}

function saveResults(currentRound) {
  const totalTime = Date.now() - performance.now();

  const output = {
    timestamp: new Date().toISOString(),
    dataFile: DATA_FILE,
    strategyVersion: 'V3.0-Dynamic',
    mode: 'dynamic-optimization',
    currentRound,
    totalRounds: 30,
    results,
    finalParams: optimizer.getParams(),
  };

  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`💾 已保存 ${currentRound} 轮结果\n`);
  } catch (error) {
    console.error(`⚠️  保存结果失败: ${error.message}\n`);
  }
}

function printFinalSummary() {
  const validResults = results.filter(r => r.success !== false && r.monthlyReturn !== undefined);
  
  if (validResults.length === 0) {
    console.log('❌ 没有成功的结果');
    return;
  }

  const monthlyReturns = validResults.map(r => r.monthlyReturn);
  const winRates = validResults.map(r => r.winRate);
  const sharpeRatios = validResults.map(r => r.sharpeRatio);
  const maxDrawdowns = validResults.map(r => r.maxDrawdown);
  const totalTrades = validResults.map(r => r.totalTrades);

  const avgMonthlyReturn = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
  const avgWinRate = winRates.reduce((a, b) => a + b, 0) / winRates.length;
  const avgSharpeRatio = sharpeRatios.reduce((a, b) => a + b, 0) / sharpeRatios.length;
  const avgMaxDrawdown = maxDrawdowns.reduce((a, b) => a + b, 0) / maxDrawdowns.length;
  const avgTotalTrades = totalTrades.reduce((a, b) => a + b, 0) / totalTrades.length;

  monthlyReturns.sort((a, b) => a - b);
  const medianMonthlyReturn = monthlyReturns[Math.floor(monthlyReturns.length / 2)];

  console.log('📊 最终统计摘要\n');
  console.log(`总回测轮数: ${results.length}`);
  console.log(`成功回测: ${validResults.length}`);
  console.log(`失败回测: ${results.length - validResults.length}\n`);

  console.log('月利润率统计:');
  console.log(`  平均值: ${(avgMonthlyReturn * 100).toFixed(2)}%`);
  console.log(`  中位数: ${(medianMonthlyReturn * 100).toFixed(2)}%`);
  console.log(`  最小值: ${(monthlyReturns[0] * 100).toFixed(2)}%`);
  console.log(`  最大值: ${(monthlyReturns[monthlyReturns.length - 1] * 100).toFixed(2)}%`);
  console.log(`  标准差: ${(calculateStdDev(monthlyReturns, avgMonthlyReturn) * 100).toFixed(2)}%\n`);

  console.log('胜率统计:');
  console.log(`  平均值: ${(avgWinRate * 100).toFixed(2)}%`);
  console.log(`  最小值: ${(Math.min(...winRates) * 100).toFixed(2)}%`);
  console.log(`  最大值: ${(Math.max(...winRates) * 100).toFixed(2)}%`);
  console.log(`  标准差: ${(calculateStdDev(winRates, avgWinRate) * 100).toFixed(2)}%\n`);

  console.log('其他指标:');
  console.log(`  平均夏普比率: ${avgSharpeRatio.toFixed(2)}`);
  console.log(`  平均最大回撤: ${(avgMaxDrawdown * 100).toFixed(2)}%`);
  console.log(`  平均交易数: ${avgTotalTrades.toFixed(0)}\n`);

  const targetAchieved = avgMonthlyReturn >= 0.5;
  console.log('目标达成:');
  console.log(`  目标月利润率: 50%`);
  console.log(`  实际月利润率: ${(avgMonthlyReturn * 100).toFixed(2)}%`);
  console.log(`  是否达标: ${targetAchieved ? '✅ 是' : '❌ 否'}\n`);

  console.log('最终参数:');
  const finalParams = optimizer.getParams();
  console.log(`  Reversal: 持仓${finalParams.reversal.maxPositions}, 止损${(finalParams.reversal.stopLoss * 100).toFixed(0)}%, 阈值${finalParams.reversal.signalThreshold}`);
  console.log(`  Convergence: 持仓${finalParams.convergence.maxPositions}, 止损${(finalParams.convergence.stopLoss * 100).toFixed(0)}%, 阈值${finalParams.convergence.signalThreshold}\n`);

  console.log(`结果文件: ${OUTPUT_FILE}\n`);
}

function calculateStdDev(values, mean) {
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n⚠️  收到中断信号，正在保存结果...\n');
  saveResults(results.length);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  收到终止信号，正在保存结果...\n');
  saveResults(results.length);
  process.exit(0);
});

// 启动
main().catch(error => {
  console.error('\n❌ 主程序失败:', error);
  process.exit(1);
});
