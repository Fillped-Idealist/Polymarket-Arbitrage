#!/usr/bin/env node

/**
 * 策略优化脚本 V5.1
 * 从 V5.0 最佳参数继续优化，目标月利润率>50%
 *
 * V5.1 改进：
 * 1. 从 V5.0 最佳参数作为起点
 * 2. 增加随机扰动强度
 * 3. 扩大参数搜索空间
 * 4. 禁用早停机制，进行完整 50 轮优化
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:5000/api/backtest/single-round-custom';
const DATA_FILE = 'real_data_250mb.json';
const OUTPUT_FILE = path.join(__dirname, '../optimization_v5_1_results.json');
const LOG_FILE = '/tmp/optimization_v5_1.log';

// 重定向日志到文件
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const originalConsoleLog = console.log;
console.log = (...args) => {
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');
  logStream.write(message + '\n');
  originalConsoleLog(...args);
};

// V5.1 参数优化器
class V5_1ParameterOptimizer {
  constructor(initialParams) {
    this.history = [];
    this.params = JSON.parse(JSON.stringify(initialParams));
    this.targetMonthlyReturn = 0.5; // 50%
    this.iteration = 0;
    this.bestParams = null;
    this.bestReturn = -Infinity;
    this.explorationMode = false;
  }

  addResult(result) {
    this.history.push(result);
    this.iteration++;

    // 更新最佳参数
    if (result.monthlyReturn > this.bestReturn) {
      this.bestReturn = result.monthlyReturn;
      this.bestParams = JSON.parse(JSON.stringify(this.params));
      console.log(`🎉 新最佳参数！月利润率: ${result.monthlyReturn.toFixed(2)}%`);
    }
  }

  // V5.1：增加随机扰动强度
  addRandomPerturbation() {
    const perturb = (value, maxChange) => {
      const change = (Math.random() - 0.5) * 2 * maxChange;
      return Math.max(0.01, value + change);
    };

    // 随机扰动部分参数（50%概率，V5.1: 提高）
    if (Math.random() < 0.5) {
      this.params.reversal.minPrice = perturb(this.params.reversal.minPrice, 0.03);
      console.log(`   → [随机] 扰动 Reversal minPrice → ${(this.params.reversal.minPrice * 100).toFixed(0)}%`);
    }

    if (Math.random() < 0.5) {
      this.params.reversal.maxPrice = perturb(this.params.reversal.maxPrice, 0.08);
      console.log(`   → [随机] 扰动 Reversal maxPrice → ${(this.params.reversal.maxPrice * 100).toFixed(0)}%`);
    }

    if (Math.random() < 0.5) {
      this.params.convergence.minPrice = perturb(this.params.convergence.minPrice, 0.05);
      console.log(`   → [随机] 扰动 Convergence minPrice → ${(this.params.convergence.minPrice * 100).toFixed(0)}%`);
    }

    if (Math.random() < 0.5) {
      this.params.reversal.stopLoss = perturb(this.params.reversal.stopLoss, 0.1);
      console.log(`   → [随机] 扰动 Reversal stopLoss → ${(this.params.reversal.stopLoss * 100).toFixed(0)}%`);
    }
  }

  // V5.1：基于多学科视角的智能参数调整（扩大参数范围）
  adjustParameters(result) {
    const avgMonthlyReturn = this.calculateAvgMonthlyReturn();
    const avgWinRate = this.calculateAvgWinRate();
    const avgMaxDrawdown = this.calculateAvgMaxDrawdown();
    const avgTrades = this.calculateAvgTrades();

    console.log('\n📊 V5.1 参数优化分析:');
    console.log(`   迭代次数: ${this.iteration}`);
    console.log(`   当前月利润率: ${result.monthlyReturn.toFixed(2)}%`);
    console.log(`   平均月利润率: ${avgMonthlyReturn.toFixed(2)}%`);
    console.log(`   目标月利润率: ${(this.targetMonthlyReturn * 100).toFixed(2)}%`);
    console.log(`   当前胜率: ${result.winRate.toFixed(2)}%`);
    console.log(`   平均胜率: ${avgWinRate.toFixed(2)}%`);
    console.log(`   平均回撤: ${avgMaxDrawdown.toFixed(2)}%`);
    console.log(`   平均交易数: ${avgTrades.toFixed(0)}`);
    console.log(`   最佳月利润率: ${this.bestReturn.toFixed(2)}%`);

    const adjustments = [];

    // 【量化工程师视角】盈亏比优化（V5.1: 扩大调整范围）
    if (avgMonthlyReturn < 0) {
      console.log('   → [量化] 亏损状态，优化盈亏比');

      if (avgWinRate < 0.3) {
        this.params.reversal.minPrice = Math.max(0.01, this.params.reversal.minPrice + 0.03);
        this.params.reversal.maxPrice = Math.min(0.80, this.params.reversal.maxPrice - 0.05);
        adjustments.push(`提高Reversal价格区间 → ${(this.params.reversal.minPrice * 100).toFixed(0)}%-${(this.params.reversal.maxPrice * 100).toFixed(0)}%`);
      }

      if (avgTrades < 15) {
        this.params.reversal.stopLoss = Math.max(0.15, this.params.reversal.stopLoss - 0.1);
        this.params.convergence.stopLoss = Math.max(0.03, this.params.convergence.stopLoss - 0.05);
        adjustments.push(`放宽止损 → R:${(this.params.reversal.stopLoss * 100).toFixed(0)}% C:${(this.params.convergence.stopLoss * 100).toFixed(0)}%`);
      }
    } else if (avgMonthlyReturn < 0.3) {
      console.log('   → [量化] 盈利不足，优化止盈');
      this.params.reversal.takeProfit = 0.999;
      adjustments.push(`提高Reversal止盈 → 99.9%`);
    }

    // 【金融研究员视角】概率调整（V5.1: 扩大调整范围）
    if (avgWinRate < 0.35 && avgMaxDrawdown < 0.3) {
      console.log('   → [金融] 增加持仓捕捉机会');
      this.params.reversal.maxPositions = Math.min(25, this.params.reversal.maxPositions + 3);
      this.params.convergence.maxPositions = Math.min(20, this.params.convergence.maxPositions + 3);
      adjustments.push(`增加持仓 → R:${this.params.reversal.maxPositions} C:${this.params.convergence.maxPositions}`);
    } else if (avgMaxDrawdown > 0.5) {
      console.log('   → [金融] 降低风险，减少持仓');
      this.params.reversal.maxPositions = Math.max(3, this.params.reversal.maxPositions - 3);
      this.params.convergence.maxPositions = Math.max(5, this.params.convergence.maxPositions - 3);
      adjustments.push(`减少持仓 → R:${this.params.reversal.maxPositions} C:${this.params.convergence.maxPositions}`);
    }

    // 【数学家视角】期望收益优化（V5.1: 扩大调整范围）
    if (avgMonthlyReturn > 0.4 && avgWinRate > 0.45) {
      console.log('   → [数学] 表现优异，激进策略');
      this.params.reversal.minPrice = Math.max(0.01, this.params.reversal.minPrice - 0.03);
      adjustments.push(`扩大低价格区间 → ${(this.params.reversal.minPrice * 100).toFixed(0)}%`);
    } else if (avgMonthlyReturn < -0.2) {
      console.log('   → [数学] 表现不佳，保守策略');
      this.params.reversal.minPrice = Math.min(0.20, this.params.reversal.minPrice + 0.04);
      adjustments.push(`缩小价格区间，提高质量 → ${(this.params.reversal.minPrice * 100).toFixed(0)}%`);
    }

    // 【统计学家视角】波动性管理（V5.1: 扩大调整范围）
    if (avgTrades > 50 && avgWinRate < 0.4) {
      console.log('   → [统计] 过度交易，提高门槛');
      this.params.reversal.minPrice = Math.min(0.15, this.params.reversal.minPrice + 0.03);
      this.params.convergence.minPrice = Math.min(0.85, this.params.convergence.minPrice + 0.04);
      adjustments.push(`提高入场门槛 → R:${(this.params.reversal.minPrice * 100).toFixed(0)}% C:${(this.params.convergence.minPrice * 100).toFixed(0)}%`);
    }

    // V5.1：增加随机扰动
    this.addRandomPerturbation();

    // 验证参数
    this.validateParams();

    console.log('\n✅ 参数优化完成:');
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
    // Reversal参数验证（V5.1: 进一步扩大范围）
    this.params.reversal.maxPositions = Math.max(3, Math.min(30, this.params.reversal.maxPositions));
    this.params.reversal.stopLoss = Math.max(0.10, Math.min(0.70, this.params.reversal.stopLoss));
    this.params.reversal.takeProfit = 1.0;
    this.params.reversal.minPrice = Math.max(0.01, Math.min(0.25, this.params.reversal.minPrice));
    this.params.reversal.maxPrice = Math.max(0.25, Math.min(0.85, this.params.reversal.maxPrice));

    // Convergence参数验证（V5.1: 进一步扩大范围）
    this.params.convergence.maxPositions = Math.max(5, Math.min(40, this.params.convergence.maxPositions));
    this.params.convergence.stopLoss = Math.max(0.02, Math.min(0.30, this.params.convergence.stopLoss));
    this.params.convergence.takeProfit = 1.0;
    this.params.convergence.minPrice = Math.max(0.60, Math.min(0.85, this.params.convergence.minPrice));
    this.params.convergence.maxPrice = Math.max(0.9, Math.min(0.998, this.params.convergence.maxPrice));

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

  getBestParams() {
    return this.bestParams || this.getParams();
  }

  printParams() {
    console.log('\n📋 当前策略参数 (V5.1):');
    console.log('\n【Reversal Strategy - 核心策略】');
    console.log(`   持仓数: ${this.params.reversal.maxPositions}`);
    console.log(`   止损: ${(this.params.reversal.stopLoss * 100).toFixed(0)}%`);
    console.log(`   止盈: ${(this.params.reversal.takeProfit * 100).toFixed(0)}%`);
    console.log(`   价格区间: ${(this.params.reversal.minPrice * 100).toFixed(0)}%-${(this.params.reversal.maxPrice * 100).toFixed(0)}%`);

    console.log('\n【Convergence Strategy - 填补策略】');
    console.log(`   持仓数: ${this.params.convergence.maxPositions}`);
    console.log(`   止损: ${(this.params.convergence.stopLoss * 100).toFixed(0)}%`);
    console.log(`   止盈: ${(this.params.convergence.takeProfit * 100).toFixed(0)}%`);
    console.log(`   价格区间: ${(this.params.convergence.minPrice * 100).toFixed(0)}%-${(this.params.convergence.maxPrice * 100).toFixed(0)}%`);
    console.log('');
  }
}

// V5.1 初始参数（从 V5.0 最佳参数开始）
const initialParams = {
  reversal: {
    maxPositions: 4,
    stopLoss: 0.25,
    takeProfit: 1.0,
    minPrice: 0.14,
    maxPrice: 0.69,
  },
  convergence: {
    maxPositions: 5,
    stopLoss: 0.08,
    takeProfit: 1.0,
    minPrice: 0.76,
    maxPrice: 0.995,
  },
  trend: { enabled: false },
  mean: { enabled: false },
  arbitrage: { enabled: false },
};

const optimizer = new V5_1ParameterOptimizer(initialParams);
const results = [];

function runRound(round, params) {
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
          if (res.statusCode === 200) {
            const result = JSON.parse(data);
            if (result.success) {
              resolve(result.result);
            } else {
              reject(new Error(result.error || '回测失败'));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => { reject(error); });
    req.write(postData);
    req.end();
  });
}

async function main() {
  const startTime = Date.now();
  const MAX_ITERATIONS = 50; // 迭代50轮
  const TARGET_MONTHLY_RETURN = 0.5; // 50%

  console.log('🚀 V5.1 策略优化开始');
  console.log(`📊 目标月利润率: ${(TARGET_MONTHLY_RETURN * 100).toFixed(0)}%`);
  console.log(`🔄 最大迭代轮次: ${MAX_ITERATIONS}`);
  console.log(`🎯 起始参数: V5.0 最佳参数\n`);

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    console.log(`${'='.repeat(60)}`);
    console.log(`第 ${i}/${MAX_ITERATIONS} 轮迭代`);
    console.log(`${'='.repeat(60)}`);

    try {
      const currentParams = optimizer.getParams();
      const result = await runRound(i, currentParams);

      optimizer.addResult(result);
      results.push(result);

      console.log(`\n📊 第 ${i} 轮结果:`);
      console.log(`   月利润率: ${result.monthlyReturn.toFixed(2)}%`);
      console.log(`   胜率: ${result.winRate.toFixed(2)}%`);
      console.log(`   夏普比率: ${result.sharpeRatio.toFixed(2)}`);
      console.log(`   最大回撤: ${result.maxDrawdown.toFixed(2)}%`);
      console.log(`   交易数: ${result.totalTrades}`);
      console.log(`   盈利交易: ${result.profitTrades}, 亏损交易: ${result.lossTrades}`);

      // 检查是否达标
      if (result.monthlyReturn >= TARGET_MONTHLY_RETURN && optimizer.calculateAvgMonthlyReturn() >= TARGET_MONTHLY_RETURN) {
        console.log(`\n🎉 恭喜！已达到目标月利润率 ${(TARGET_MONTHLY_RETURN * 100).toFixed(0)}%！`);
        console.log(`   迭代次数: ${i}`);
        break;
      }

      // 调整参数
      if (i < MAX_ITERATIONS) {
        console.log(`\n🔄 优化参数...`);
        const newParams = optimizer.adjustParameters(result);
        optimizer.printParams();
      }

      saveResults(i);

      const elapsedMin = (Date.now() - startTime) / 1000 / 60;
      const remainingRounds = MAX_ITERATIONS - i;
      const avgTimePerRound = elapsedMin / i;
      const estimatedRemainingMin = avgTimePerRound * remainingRounds;

      console.log(`\n⏱️  已用时间: ${elapsedMin.toFixed(1)}分钟`);
      console.log(`   预计剩余: ${estimatedRemainingMin.toFixed(1)}分钟`);
      console.log(`   预计总计: ${(elapsedMin + estimatedRemainingMin).toFixed(1)}分钟`);

    } catch (error) {
      console.error(`\n❌ 第 ${i} 轮失败:`, error.message);
      results.push({
        round: i,
        success: false,
        error: error.message,
      });
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log(`🎉 策略优化完成！共迭代 ${optimizer.iteration} 轮`);
  console.log('='.repeat(60) + '\n');

  printFinalSummary();
  saveResults(optimizer.iteration);
}

function saveResults(currentRound) {
  const output = {
    timestamp: new Date().toISOString(),
    dataFile: DATA_FILE,
    strategyVersion: 'V5.1-Aggressive',
    mode: 'aggressive-optimization-from-best',
    currentRound,
    totalRounds: optimizer.iteration,
    bestReturn: optimizer.bestReturn,
    bestParams: optimizer.getBestParams(),
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
  console.log('📊 最终统计摘要\n');

  const successResults = results.filter(r => r.success !== false);
  console.log(`总迭代轮次: ${optimizer.iteration}`);
  console.log(`成功回测: ${successResults.length}`);
  console.log(`失败回测: ${results.length - successResults.length}`);

  if (successResults.length > 0) {
    const monthlyReturns = successResults.map(r => r.monthlyReturn);
    const winRates = successResults.map(r => r.winRate);
    const maxDrawdowns = successResults.map(r => r.maxDrawdown);
    const totalTrades = successResults.map(r => r.totalTrades);

    console.log('\n月利润率统计:');
    console.log(`  平均值: ${average(monthlyReturns).toFixed(2)}%`);
    console.log(`  中位数: ${median(monthlyReturns).toFixed(2)}%`);
    console.log(`  最小值: ${Math.min(...monthlyReturns).toFixed(2)}%`);
    console.log(`  最大值: ${Math.max(...monthlyReturns).toFixed(2)}%`);
    console.log(`  标准差: ${stdDev(monthlyReturns).toFixed(2)}%`);

    console.log('\n胜率统计:');
    console.log(`  平均值: ${average(winRates).toFixed(2)}%`);
    console.log(`  最小值: ${Math.min(...winRates).toFixed(2)}%`);
    console.log(`  最大值: ${Math.max(...winRates).toFixed(2)}%`);

    console.log('\n其他指标:');
    console.log(`  平均夏普比率: ${average(successResults.map(r => r.sharpeRatio)).toFixed(2)}`);
    console.log(`  平均最大回撤: ${average(maxDrawdowns).toFixed(2)}%`);
    console.log(`  平均交易数: ${average(totalTrades).toFixed(0)}`);

    const targetReached = optimizer.bestReturn >= optimizer.targetMonthlyReturn;
    console.log('\n目标达成:');
    console.log(`  目标月利润率: ${(optimizer.targetMonthlyReturn * 100).toFixed(0)}%`);
    console.log(`  实际最佳月利润率: ${optimizer.bestReturn.toFixed(2)}%`);
    console.log(`  是否达标: ${targetReached ? '✅ 是' : '❌ 否'}`);

    console.log('\n最佳参数:');
    const bestParams = optimizer.getBestParams();
    console.log(`  Reversal: 持仓${bestParams.reversal.maxPositions}, 止损${(bestParams.reversal.stopLoss * 100).toFixed(0)}%, 区间${(bestParams.reversal.minPrice * 100).toFixed(0)}%-${(bestParams.reversal.maxPrice * 100).toFixed(0)}%`);
    console.log(`  Convergence: 持仓${bestParams.convergence.maxPositions}, 止损${(bestParams.convergence.stopLoss * 100).toFixed(0)}%, 区间${(bestParams.convergence.minPrice * 100).toFixed(0)}%-${(bestParams.convergence.maxPrice * 100).toFixed(0)}%`);
  }

  console.log(`\n结果文件: ${OUTPUT_FILE}`);
  console.log(`日志文件: ${LOG_FILE}\n`);
}

function average(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(arr) {
  const mean = average(arr);
  const squaredDiffs = arr.map(value => Math.pow(value - mean, 2));
  return Math.sqrt(average(squaredDiffs));
}

main().catch(console.error);
