#!/usr/bin/env node

/**
 * 专业量化测试分析报告
 *
 * 全面分析 Reversal 策略的表现，包括：
 * - 收益率分析
 * - 仓位管理分析
 * - 交易详情分析
 * - 2-10倍大额盈利分析
 * - 止损效果分析
 * - 胜率分布分析
 * - 盈亏比分析
 */

const BacktestStrategyType = {
  CONVERGENCE: 'convergence',
  ARBITRAGE: 'arbitrage',
  REVERSAL: 'reversal',
  TREND_FOLLOWING: 'trend_following',
  MEAN_REVERSION: 'mean_reversion',
};

const createConfig = () => ({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  intervalMinutes: 15,
  initialCapital: 10000,
  maxPositions: 3,
  maxPositionSize: 0.33,
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
  dailyLossLimit: 0.10,
  maxDrawdown: 0.15,
  filters: {
    minVolume: 0,
    minLiquidity: 0,
    minDaysToEnd: 1,
    maxDaysToEnd: 365,
  },
});

/**
 * 分析数据集
 */
async function analyzeDataset(dataFile) {
  console.log(`\n${'═'.repeat(100)}`);
  console.log(`数据集: ${dataFile}`);
  console.log(`══${'═'.repeat(98)}`);

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

    const trades = [];
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'snapshot_processed') {
              const progress = parseFloat(data.data.progress);
              process.stdout.write(`\r进度: ${progress.toFixed(1)}%`);
            } else if (data.type === 'complete') {
              process.stdout.write('\r' + ' '.repeat(100) + '\r');
              
              result = {
                totalReturn: data.result.totalReturn,
                totalTrades: data.result.totalTrades,
                winRate: data.result.winRate,
                bestStrategy: data.result.bestStrategy,
                tradesList: data.result.tradesList || [],
              };

              if (result.tradesList.length > 0) {
                trades.push(...result.tradesList);
              }

              return { result, trades };
            } else if (data.type === 'error') {
              console.error('\n错误:', data.error);
              return null;
            }
          } catch (e) {
            // 忽略 JSON 解析错误
          }
        }
      }
    }
  } catch (error) {
    console.error(`\n测试 ${dataFile} 失败:`, error.message);
    return null;
  }
}

/**
 * 生成量化分析报告
 */
function generateQuantitativeReport(dataFile, result, trades) {
  if (!trades || trades.length === 0) {
    console.log('\n该数据集没有交易记录');
    return;
  }

  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    专业量化测试分析报告                                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  // ========== 1. 基本信息 ==========
  console.log('┌────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 1. 基本信息                                                                        │');
  console.log('└────────────────────────────────────────────────────────────────────────────────────┘');
  console.log(`总收益率: ${result.totalReturn}`);
  console.log(`交易总数: ${result.totalTrades}`);
  console.log(`胜率: ${result.winRate}`);
  console.log(`最佳策略: ${result.bestStrategy}`);

  // ========== 2. 收益率分析 ==========
  console.log('\n┌────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 2. 收益率分析                                                                      │');
  console.log('└────────────────────────────────────────────────────────────────────────────────────┘');

  const winRates = trades.map(t => t.pnlPercent);
  const sortedWinRates = winRates.sort((a, b) => a - b);
  
  console.log(`\n收益率分布:`);
  console.log(`  最低: ${Math.min(...winRates).toFixed(2)}%`);
  console.log(`  最高: ${Math.max(...winRates).toFixed(2)}%`);
  console.log(`  平均: ${(winRates.reduce((sum, r) => sum + r, 0) / winRates.length).toFixed(2)}%`);
  console.log(`  中位数: ${sortedWinRates[Math.floor(sortedWinRates.length / 2)].toFixed(2)}%`);

  // 收益率区间统计
  const ranges = [
    { min: -Infinity, max: -100, label: '< -100%' },
    { min: -100, max: -50, label: '-100% ~ -50%' },
    { min: -50, max: -20, label: '-50% ~ -20%' },
    { min: -20, max: 0, label: '-20% ~ 0%' },
    { min: 0, max: 20, label: '0% ~ 20%' },
    { min: 20, max: 50, label: '20% ~ 50%' },
    { min: 50, max: 100, label: '50% ~ 100%' },
    { min: 100, max: 200, label: '100% ~ 200%' },
    { min: 200, max: 500, label: '200% ~ 500%' },
    { min: 500, max: 1000, label: '500% ~ 1000%' },
    { min: 1000, max: Infinity, label: '> 1000%' },
  ];

  console.log(`\n收益率区间分布:`);
  ranges.forEach(range => {
    const count = winRates.filter(r => r >= range.min && r < range.max).length;
    const percent = (count / winRates.length * 100).toFixed(1);
    console.log(`  ${range.label.padEnd(15, ' ')}: ${count.toString().padStart(3, ' ')} 笔 (${percent}%)`);
  });

  // ========== 3. 2-10倍大额盈利分析 ==========
  console.log('\n┌────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 3. 2-10倍大额盈利分析（核心策略）                                                │');
  console.log('└────────────────────────────────────────────────────────────────────────────────────┘');

  const bigWins = trades.filter(t => t.pnlPercent >= 100 && t.pnlPercent <= 1000);
  console.log(`\n2-10倍盈利交易数: ${bigWins.length} 笔 (${(bigWins.length / trades.length * 100).toFixed(1)}%)`);

  if (bigWins.length > 0) {
    const bigWinRates = bigWins.map(t => t.pnlPercent);
    const bigWinPnls = bigWins.map(t => t.pnl);

    console.log(`  平均收益率: ${(bigWinRates.reduce((sum, r) => sum + r, 0) / bigWinRates.length).toFixed(2)}%`);
    console.log(`  平均盈利额: $${(bigWinPnls.reduce((sum, p) => sum + p, 0) / bigWinPnls.length).toFixed(2)}`);
    console.log(`  总盈利额: $${bigWinPnls.reduce((sum, p) => sum + p, 0).toFixed(2)}`);

    console.log(`\n大额盈利交易明细:`);
    bigWins.forEach((trade, index) => {
      const holdingTime = (trade.exitTime - trade.entryTime) / (1000 * 60 * 60);
      console.log(`  ${index + 1}. ${trade.question.substring(0, 50)}...`);
      console.log(`     入场: ${(trade.entryPrice * 100).toFixed(2)}% → 出场: ${(trade.exitPrice * 100).toFixed(2)}%`);
      console.log(`     盈利: ${trade.pnlPercent.toFixed(2)}% ($${trade.pnl.toFixed(2)})`);
      console.log(`     持仓: ${holdingTime.toFixed(2)} 小时 | 平仓: ${trade.exitReason}`);
    });
  }

  // ========== 4. 止损效果分析 ==========
  console.log('\n┌────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 4. 止损效果分析                                                                    │');
  console.log('└────────────────────────────────────────────────────────────────────────────────────┘');

  const stoppedTrades = trades.filter(t => t.status === 'stopped');
  const stoppedByStopLoss = trades.filter(t => t.exitReason.includes('止损'));
  const stoppedByMomentum = trades.filter(t => t.exitReason.includes('动量反转'));

  console.log(`\n止损统计:`);
  console.log(`  总止损交易数: ${stoppedTrades.length} 笔`);
  console.log(`  止损触发（价格止损）: ${stoppedByStopLoss.length} 笔`);
  console.log(`  动量反转止损: ${stoppedByMomentum.length} 笔`);

  if (stoppedTrades.length > 0) {
    const stopLossPnls = stoppedTrades.map(t => t.pnl);
    const stopLossRates = stoppedTrades.map(t => t.pnlPercent);

    console.log(`\n止损效果:`);
    console.log(`  平均亏损: $${(stopLossPnls.reduce((sum, p) => sum + p, 0) / stopLossPnls.length).toFixed(2)}`);
    console.log(`  平均亏损率: ${(stopLossRates.reduce((sum, r) => sum + r, 0) / stopLossRates.length).toFixed(2)}%`);
    console.log(`  最大亏损: $${Math.min(...stopLossPnls).toFixed(2)}`);
    console.log(`  最大亏损率: ${Math.min(...stopLossRates).toFixed(2)}%`);

    // 止损是否有效（是否控制了单笔最大亏损）
    const maxAcceptableLoss = 0.12; // 12% 止损
    const effectiveStops = stoppedByStopLoss.filter(t => Math.abs(t.pnlPercent) <= maxAcceptableLoss * 1.5);
    console.log(`\n止损有效性:`);
    console.log(`  有效止损（亏损 ≤ ${(maxAcceptableLoss * 1.5 * 100).toFixed(0)}%）: ${effectiveStops.length}/${stoppedByStopLoss.length} (${(effectiveStops.length / stoppedByStopLoss.length * 100).toFixed(1)}%)`);
  }

  // ========== 5. 仓位管理分析 ==========
  console.log('\n┌────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 5. 仓位管理分析                                                                    │');
  console.log('└────────────────────────────────────────────────────────────────────────────────────┘');

  const positionValues = trades.map(t => t.entryValue);
  const positionSizes = trades.map(t => t.positionSize);

  console.log(`\n仓位统计:`);
  console.log(`  入场价值: 平均 $${(positionValues.reduce((sum, v) => sum + v, 0) / positionValues.length).toFixed(2)}`);
  console.log(`  入场价值: 最小 $${Math.min(...positionValues).toFixed(2)}`);
  console.log(`  入场价值: 最大 $${Math.max(...positionValues).toFixed(2)}`);
  console.log(`  仓位大小: 平均 ${(positionSizes.reduce((sum, s) => sum + s, 0) / positionSizes.length).toFixed(2)}`);

  // 仓位分布
  const positionRanges = [
    { min: 0, max: 1000, label: '$0 ~ $1,000' },
    { min: 1000, max: 5000, label: '$1,000 ~ $5,000' },
    { min: 5000, max: 10000, label: '$5,000 ~ $10,000' },
    { min: 10000, max: 20000, label: '$10,000 ~ $20,000' },
    { min: 20000, max: 50000, label: '$20,000 ~ $50,000' },
    { min: 50000, max: Infinity, label: '> $50,000' },
  ];

  console.log(`\n入场价值分布:`);
  positionRanges.forEach(range => {
    const count = positionValues.filter(v => v >= range.min && v < range.max).length;
    const percent = (count / positionValues.length * 100).toFixed(1);
    console.log(`  ${range.label.padEnd(18, ' ')}: ${count.toString().padStart(2, ' ')} 笔 (${percent}%)`);
  });

  // ========== 6. 持仓时间分析 ==========
  console.log('\n┌────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 6. 持仓时间分析                                                                    │');
  console.log('└────────────────────────────────────────────────────────────────────────────────────┘');

  const holdingTimes = trades.map(t => (t.exitTime - t.entryTime) / (1000 * 60 * 60)); // 小时
  const sortedHoldingTimes = holdingTimes.sort((a, b) => a - b);

  console.log(`\n持仓时间（小时）:`);
  console.log(`  最短: ${Math.min(...holdingTimes).toFixed(2)} 小时`);
  console.log(`  最长: ${Math.max(...holdingTimes).toFixed(2)} 小时`);
  console.log(`  平均: ${(holdingTimes.reduce((sum, t) => sum + t, 0) / holdingTimes.length).toFixed(2)} 小时`);
  console.log(`  中位数: ${sortedHoldingTimes[Math.floor(sortedHoldingTimes.length / 2)].toFixed(2)} 小时`);

  // 持仓时间分布
  const holdingRanges = [
    { min: 0, max: 1, label: '0-1 小时' },
    { min: 1, max: 6, label: '1-6 小时' },
    { min: 6, max: 24, label: '6-24 小时' },
    { min: 24, max: 72, label: '1-3 天' },
    { min: 72, max: 168, label: '3-7 天' },
    { min: 168, max: Infinity, label: '> 7 天' },
  ];

  console.log(`\n持仓时间分布:`);
  holdingRanges.forEach(range => {
    const count = holdingTimes.filter(t => t >= range.min && t < range.max).length;
    const percent = (count / holdingTimes.length * 100).toFixed(1);
    console.log(`  ${range.label.padEnd(15, ' ')}: ${count.toString().padStart(3, ' ')} 笔 (${percent}%)`);
  });

  // ========== 7. 入场价格分析 ==========
  console.log('\n┌────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 7. 入场价格分析（5%-40% 区间）                                                │');
  console.log('└────────────────────────────────────────────────────────────────────────────────────┘');

  const entryPrices = trades.map(t => t.entryPrice * 100); // 转换为百分比

  console.log(`\n入场价格分布:`);
  console.log(`  最低: ${Math.min(...entryPrices).toFixed(2)}%`);
  console.log(`  最高: ${Math.max(...entryPrices).toFixed(2)}%`);
  console.log(`  平均: ${(entryPrices.reduce((sum, p) => sum + p, 0) / entryPrices.length).toFixed(2)}%`);

  // 价格区间分布
  const priceRanges = [
    { min: 5, max: 10, label: '5%-10%' },
    { min: 10, max: 15, label: '10%-15%' },
    { min: 15, max: 20, label: '15%-20%' },
    { min: 20, max: 25, label: '20%-25%' },
    { min: 25, max: 30, label: '25%-30%' },
    { min: 30, max: 35, label: '30%-35%' },
    { min: 35, max: 40, label: '35%-40%' },
  ];

  console.log(`\n入场价格区间分布:`);
  priceRanges.forEach(range => {
    const count = entryPrices.filter(p => p >= range.min && p < range.max).length;
    const percent = (count / entryPrices.length * 100).toFixed(1);
    console.log(`  ${range.label.padEnd(10, ' ')}: ${count.toString().padStart(3, ' ')} 笔 (${percent}%)`);
  });

  // ========== 8. 盈亏比分析 ==========
  console.log('\n┌────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 8. 盈亏比分析                                                                      │');
  console.log('└────────────────────────────────────────────────────────────────────────────────────┘');

  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);

  if (winningTrades.length > 0 && losingTrades.length > 0) {
    const avgWin = winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length;
    const avgLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length);
    const profitLossRatio = avgWin / avgLoss;

    console.log(`\n盈亏比:`);
    console.log(`  平均盈利: $${avgWin.toFixed(2)}`);
    console.log(`  平均亏损: $${avgLoss.toFixed(2)}`);
    console.log(`  盈亏比: ${profitLossRatio.toFixed(2)}:1`);

    // 理想盈亏比：如果有大额盈利（2-10倍），盈亏比应该很高
    const idealRatio = 3; // 理想盈亏比
    if (profitLossRatio >= idealRatio) {
      console.log(`  ✓ 盈亏比健康（≥ ${idealRatio}:1）`);
    } else {
      console.log(`  ✗ 盈亏比偏低（理想 ≥ ${idealRatio}:1）`);
    }
  }

  // ========== 9. 策略建议 ==========
  console.log('\n┌────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 9. 策略建议                                                                        │');
  console.log('└────────────────────────────────────────────────────────────────────────────────────┘');

  const suggestions = [];

  // 分析 1：大额盈利是否充足
  if (bigWins.length === 0) {
    suggestions.push('⚠️  没有大额盈利（2-10倍），策略可能需要调整开仓条件');
  } else {
    suggestions.push(`✓  有 ${bigWins.length} 笔大额盈利，符合策略核心理念`);
  }

  // 分析 2：止损是否有效
  if (stoppedByStopLoss.length > 0) {
    const effectiveStops = stoppedByStopLoss.filter(t => Math.abs(t.pnlPercent) <= 18); // 12% 止损 + 50% 容忍
    const effectiveRate = effectiveStops.length / stoppedByStopLoss.length;
    if (effectiveRate >= 0.8) {
      suggestions.push('✓  止损机制有效，能够控制单笔亏损');
    } else {
      suggestions.push('⚠️  止损机制需要优化，部分交易止损失效');
    }
  }

  // 分析 3：胜率是否合理
  const winRate = parseFloat(result.winRate);
  if (winRate >= 40) {
    suggestions.push('✓  胜率合理，符合大额盈利策略特点');
  } else {
    suggestions.push('⚠️  胜率偏低，可能需要优化开仓条件');
  }

  // 分析 4：仓位是否合理
  const avgPositionValue = positionValues.reduce((sum, v) => sum + v, 0) / positionValues.length;
  const maxPositionRatio = avgPositionValue / 10000; // 相对于初始资金的比例
  if (maxPositionRatio <= 0.5) {
    suggestions.push('✓  仓位控制合理，风险可控');
  } else {
    suggestions.push('⚠️  仓位偏大，建议降低仓位比例');
  }

  console.log('\n建议：');
  suggestions.forEach(s => console.log(`  ${s}`));
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  Reversal V8.3 专业量化测试分析                              ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  // 获取所有数据文件
  const response = await fetch('http://localhost:5000/api/backtest/data');
  if (!response.ok) {
    console.error('无法获取数据文件列表');
    return;
  }

  const { data } = await response.json();
  
  console.log(`找到 ${data.length} 个数据文件\n`);

  // 重点分析有交易的数据集
  const dataFiles = ['backtest_data_2zip.json', 'backtest_data_1769009755199.json', 'backtest_data_1769009635709.json'];

  for (const dataFile of dataFiles) {
    const fileData = data.find(f => f.fileName === dataFile);
    if (!fileData || fileData.snapshotCount === 0) {
      console.log(`\n跳过 ${dataFile}（无快照数据）`);
      continue;
    }

    const analysisResult = await analyzeDataset(dataFile);
    
    if (analysisResult && analysisResult.result && analysisResult.trades) {
      generateQuantitativeReport(dataFile, analysisResult.result, analysisResult.trades);
    } else {
      console.log(`\n跳过 ${dataFile}（分析失败或无交易）`);
    }

    // 等待 1 秒再测试下一个文件
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              总结                                           ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
  console.log('✅ 量化分析完成\n');
}

main().catch(console.error);
