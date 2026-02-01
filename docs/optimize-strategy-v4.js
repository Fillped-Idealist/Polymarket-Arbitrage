#!/usr/bin/env node

/**
 * 策略优化脚本 V4.0
 * 使用真实历史数据进行30+轮优化，目标月利润率>50%
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:5000/api/backtest/single-round-custom';
const DATA_FILE = 'real_data_250mb.json';
const OUTPUT_FILE = path.join(__dirname, '../optimization_v4_results.json');

// V4.0 参数优化器
class V4ParameterOptimizer {
  constructor(initialParams) {
    this.history = [];
    this.params = JSON.parse(JSON.stringify(initialParams));
    this.targetMonthlyReturn = 0.5; // 50%
    this.iteration = 0;
  }

  addResult(result) {
    this.history.push(result);
    this.iteration++;
  }

  // V4.0：基于多学科视角的智能参数调整
  adjustParameters(result) {
    const avgMonthlyReturn = this.calculateAvgMonthlyReturn();
    const avgWinRate = this.calculateAvgWinRate();
    const avgMaxDrawdown = this.calculateAvgMaxDrawdown();
    const avgTrades = this.calculateAvgTrades();

    console.log('\n📊 V4.0 参数优化分析:');
    console.log(`   迭代次数: ${this.iteration}`);
    console.log(`   当前月利润率: ${(result.monthlyReturn * 100).toFixed(2)}%`);
    console.log(`   平均月利润率: ${(avgMonthlyReturn * 100).toFixed(2)}%`);
    console.log(`   目标月利润率: ${(this.targetMonthlyReturn * 100).toFixed(2)}%`);
    console.log(`   当前胜率: ${(result.winRate * 100).toFixed(2)}%`);
    console.log(`   平均胜率: ${(avgWinRate * 100).toFixed(2)}%`);
    console.log(`   平均回撤: ${(avgMaxDrawdown * 100).toFixed(2)}%`);
    console.log(`   平均交易数: ${avgTrades.toFixed(0)}`);

    const adjustments = [];

    // 【量化工程师视角】盈亏比优化
    if (avgMonthlyReturn < 0) {
      // 如果亏损，可能是止损太严或止盈太松
      console.log('   → [量化] 亏损状态，优化盈亏比');

      if (avgWinRate < 0.3) {
        // 胜率低，提高信号质量
        this.params.reversal.minPrice = Math.max(0.02, this.params.reversal.minPrice + 0.01);
        this.params.reversal.maxPrice = Math.min(0.50, this.params.reversal.maxPrice - 0.02);
        adjustments.push(`提高Reversal价格区间 → ${(this.params.reversal.minPrice * 100).toFixed(0)}%-${(this.params.reversal.maxPrice * 100).toFixed(0)}%`);
      }

      if (avgTrades < 20) {
        // 交易少，降低止损，增加机会
        this.params.reversal.stopLoss = Math.max(0.25, this.params.reversal.stopLoss - 0.05);
        this.params.convergence.stopLoss = Math.max(0.05, this.params.convergence.stopLoss - 0.02);
        adjustments.push(`放宽止损 → R:${(this.params.reversal.stopLoss * 100).toFixed(0)}% C:${(this.params.convergence.stopLoss * 100).toFixed(0)}%`);
      }
    } else if (avgMonthlyReturn < 0.3) {
      // 盈利但不够，可能是止盈太早
      console.log('   → [量化] 盈利不足，优化止盈');

      // 提高止盈阈值，让利润奔跑
      this.params.reversal.takeProfit = 0.999; // 使用最高止盈
      adjustments.push(`提高Reversal止盈 → 99.9%`);
    }

    // 【金融研究员视角】概率调整
    if (avgWinRate < 0.35 && avgMaxDrawdown < 0.3) {
      // 胜率低但回撤小，可能是持仓太少
      console.log('   → [金融] 增加持仓捕捉机会');
      this.params.reversal.maxPositions = Math.min(15, this.params.reversal.maxPositions + 1);
      this.params.convergence.maxPositions = Math.min(12, this.params.convergence.maxPositions + 1);
      adjustments.push(`增加持仓 → R:${this.params.reversal.maxPositions} C:${this.params.convergence.maxPositions}`);
    } else if (avgMaxDrawdown > 0.4) {
      // 回撤太大，减少持仓
      console.log('   → [金融] 降低风险，减少持仓');
      this.params.reversal.maxPositions = Math.max(5, this.params.reversal.maxPositions - 1);
      this.params.convergence.maxPositions = Math.max(8, this.params.convergence.maxPositions - 1);
      adjustments.push(`减少持仓 → R:${this.params.reversal.maxPositions} C:${this.params.convergence.maxPositions}`);
    }

    // 【数学家视角】期望收益优化
    // 理论：如果Prob(赌对) > p²，期望收益为正
    // 对于p=0.10，只要Prob > 1%，期望收益就为正
    if (avgMonthlyReturn > 0.4 && avgWinRate > 0.45) {
      // 表现好，激进策略
      console.log('   → [数学] 表现优异，激进策略');
      this.params.reversal.minPrice = Math.max(0.01, this.params.reversal.minPrice - 0.01);
      adjustments.push(`扩大低价格区间 → ${(this.params.reversal.minPrice * 100).toFixed(0)}%`);
    } else if (avgMonthlyReturn < -0.2) {
      // 表现差，保守策略
      console.log('   → [数学] 表现不佳，保守策略');
      this.params.reversal.minPrice = Math.min(0.15, this.params.reversal.minPrice + 0.02);
      adjustments.push(`缩小价格区间，提高质量 → ${(this.params.reversal.minPrice * 100).toFixed(0)}%`);
    }

    // 【统计学家视角】波动性管理
    if (avgTrades > 50 && avgWinRate < 0.4) {
      // 交易多但胜率低，过度交易
      console.log('   → [统计] 过度交易，提高门槛');
      this.params.reversal.minPrice = Math.min(0.10, this.params.reversal.minPrice + 0.01);
      this.params.convergence.minPrice = Math.min(0.85, this.params.convergence.minPrice + 0.02);
      adjustments.push(`提高入场门槛 → R:${(this.params.reversal.minPrice * 100).toFixed(0)}% C:${(this.params.convergence.minPrice * 100).toFixed(0)}%`);
    }

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
    // Reversal参数验证
    this.params.reversal.maxPositions = Math.max(3, Math.min(20, this.params.reversal.maxPositions));
    this.params.reversal.stopLoss = Math.max(0.2, Math.min(0.5, this.params.reversal.stopLoss));
    this.params.reversal.takeProfit = 1.0;
    this.params.reversal.minPrice = Math.max(0.01, Math.min(0.3, this.params.reversal.minPrice));
    this.params.reversal.maxPrice = Math.max(0.4, Math.min(0.7, this.params.reversal.maxPrice));

    // Convergence参数验证
    this.params.convergence.maxPositions = Math.max(5, Math.min(30, this.params.convergence.maxPositions));
    this.params.convergence.stopLoss = Math.max(0.05, Math.min(0.2, this.params.convergence.stopLoss));
    this.params.convergence.takeProfit = 1.0;
    this.params.convergence.minPrice = Math.max(0.7, Math.min(0.85, this.params.convergence.minPrice));
    this.params.convergence.maxPrice = Math.max(0.9, Math.min(0.99, this.params.convergence.maxPrice));

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
    console.log('\n📋 当前策略参数 (V4.0):');
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

// V4.0 初始参数（基于多学科视角）
const initialParams = {
  reversal: {
    maxPositions: 10,
    stopLoss: 0.30,  // 更宽松的止损，让利润奔跑
    takeProfit: 1.0,  // 分阶段止盈（0.90→0.95→0.99）
    minPrice: 0.05,  // 从5%开始，捕捉低价格机会
    maxPrice: 0.55,  // 扩展到55%
  },
  convergence: {
    maxPositions: 10,  // 减少持仓，仅用于填补空仓
    stopLoss: 0.10,  // 更严格的止损
    takeProfit: 1.0,
    minPrice: 0.80,
    maxPrice: 0.98,
  },
};

const results = [];
const optimizer = new V4ParameterOptimizer(initialParams);

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     Polymarket 策略优化 V4.0（多学科视角）               ║');
console.log('║  目标：月利润率>50%，迭代>30轮，使用真实历史数据          ║');
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
      res.on('data', (chunk) => { data += chunk; });
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

    req.on('error', (error) => { reject(error); });
    req.write(postData);
    req.end();
  });
}

async function main() {
  const startTime = Date.now();
  const MAX_ITERATIONS = 50; // 迭代50轮
  const TARGET_MONTHLY_RETURN = 0.5; // 50%

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
    strategyVersion: 'V4.0-Multi-Discipline',
    mode: 'multi-discipline-optimization',
    currentRound,
    totalRounds: optimizer.iteration,
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

  const stdDevMonthlyReturn = Math.sqrt(
    monthlyReturns.reduce((sum, val) => sum + Math.pow(val - avgMonthlyReturn, 2), 0) / monthlyReturns.length
  );

  console.log('📊 最终统计摘要\n');
  console.log(`总迭代轮数: ${results.length}`);
  console.log(`成功回测: ${validResults.length}`);
  console.log(`失败回测: ${results.length - validResults.length}\n`);

  console.log('月利润率统计:');
  console.log(`  平均值: ${(avgMonthlyReturn * 100).toFixed(2)}%`);
  console.log(`  中位数: ${(medianMonthlyReturn * 100).toFixed(2)}%`);
  console.log(`  最小值: ${(monthlyReturns[0] * 100).toFixed(2)}%`);
  console.log(`  最大值: ${(monthlyReturns[monthlyReturns.length - 1] * 100).toFixed(2)}%`);
  console.log(`  标准差: ${(stdDevMonthlyReturn * 100).toFixed(2)}%\n`);

  console.log('胜率统计:');
  console.log(`  平均值: ${(avgWinRate * 100).toFixed(2)}%`);
  console.log(`  最小值: ${(Math.min(...winRates) * 100).toFixed(2)}%`);
  console.log(`  最大值: ${(Math.max(...winRates) * 100).toFixed(2)}%`);

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
  console.log(`  Reversal: 持仓${finalParams.reversal.maxPositions}, 止损${(finalParams.reversal.stopLoss * 100).toFixed(0)}%, 区间${(finalParams.reversal.minPrice * 100).toFixed(0)}%-${(finalParams.reversal.maxPrice * 100).toFixed(0)}%`);
  console.log(`  Convergence: 持仓${finalParams.convergence.maxPositions}, 止损${(finalParams.convergence.stopLoss * 100).toFixed(0)}%, 区间${(finalParams.convergence.minPrice * 100).toFixed(0)}%-${(finalParams.convergence.maxPrice * 100).toFixed(0)}%\n`);

  console.log(`结果文件: ${OUTPUT_FILE}\n`);
}

process.on('SIGINT', () => {
  console.log('\n\n⚠️  收到中断信号，正在保存结果...\n');
  saveResults(optimizer.iteration);
  process.exit(0);
});

main().catch(error => {
  console.error('\n❌ 主程序失败:', error);
  process.exit(1);
});
