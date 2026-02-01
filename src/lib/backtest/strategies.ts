/**
 * Polymarket 套利策略系统 V3.0
 * 
 * 【重大重新设计】
 * 核心洞察：Polymarket是二元市场，价格最终会收敛到0或1
 * 如果赌对，价格会从0.01涨到1.00，理论收益10000%
 * 如果赌错，价格会从0.99跌到0.00，理论损失100%
 * 
 * 【策略定位】
 * - Reversal：主力策略，捕捉概率反转，目标收益100-10000%
 * - Convergence：填补策略，捕捉概率收敛，目标收益20-100%
 * - 辅助函数：Trend和Mean仅作为入场判断，不独立开仓
 */

import {
  BacktestStrategy,
  BacktestStrategyType,
  BacktestMarketSnapshot,
  BacktestConfig,
  BacktestTrade,
} from './types';

// ==================== 辅助函数 ====================

function calculateMomentum(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i-1]) / prices[i-1]);
  }
  let weightedSum = 0;
  let weightSum = 0;
  for (let i = 0; i < returns.length; i++) {
    const weight = (i + 1) / returns.length;
    weightedSum += returns[i] * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? weightedSum / weightSum : 0;
}

function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i-1]) / prices[i-1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance);
}

function detectConsecutiveUpDays(prices: number[]): number {
  if (prices.length < 2) return 0;
  let consecutive = 0;
  for (let i = prices.length - 1; i > 0; i--) {
    if (prices[i] > prices[i-1]) {
      consecutive++;
    } else {
      break;
    }
  }
  return consecutive;
}

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i-1];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// ==================== 辅助筛选函数 ====================

/**
 * 综合市场情绪评分
 */
function calculateMarketSentimentScore(
  prices: number[],
  volume?: number,
  historicalVolumes?: number[]
): {
  score: number;
  confidence: number;
  signals: string[];
} {
  const signals: string[] = [];
  let score = 0;
  let confidence = 0;

  // 1. 动量分析
  if (prices.length >= 8) {
    const momentum = calculateMomentum(prices.slice(-8));
    if (momentum > 0.03) {
      score += 15;
      signals.push(`强劲动量(${(momentum * 100).toFixed(1)}%)`);
      confidence += 0.25;
    } else if (momentum > 0.01) {
      score += 8;
      signals.push(`正动量(${(momentum * 100).toFixed(1)}%)`);
      confidence += 0.15;
    } else if (momentum < -0.02) {
      score -= 10;
      signals.push(`负动量(${(momentum * 100).toFixed(1)}%)`);
    }
  }

  // 2. RSI分析
  if (prices.length >= 15) {
    const rsi = calculateRSI(prices, 14);
    if (rsi < 30) {
      score += 15;
      signals.push(`RSI超卖(${rsi.toFixed(0)})`);
      confidence += 0.25;
    } else if (rsi < 40) {
      score += 8;
      signals.push(`RSI偏低(${rsi.toFixed(0)})`);
      confidence += 0.15;
    } else if (rsi > 70) {
      score -= 10;
      signals.push(`RSI超买(${rsi.toFixed(0)})`);
    }
  }

  // 3. 连续上涨检测
  if (prices.length >= 4) {
    const consecutiveDays = detectConsecutiveUpDays(prices.slice(-4));
    if (consecutiveDays >= 3) {
      score += 12;
      signals.push(`连续上涨${consecutiveDays}次`);
      confidence += 0.2;
    }
  }

  // 4. 波动率检查
  if (prices.length >= 10) {
    const volatility = calculateVolatility(prices.slice(-10));
    if (volatility < 0.05) {
      score += 8;
      signals.push(`低波动稳定上涨`);
      confidence += 0.15;
    } else if (volatility > 0.20) {
      score -= 8;
      signals.push(`高波动风险`);
    }
  }

  // 5. 成交量激增
  if (volume && historicalVolumes && historicalVolumes.length >= 5) {
    const avgVolume = historicalVolumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    if (volume > avgVolume * 1.5) {
      score += 10;
      signals.push('成交量激增');
      confidence += 0.15;
    }
  }

  score = Math.max(-100, Math.min(100, score));
  confidence = Math.min(1, confidence);

  return { score, confidence, signals };
}

// ==================== 核心策略 ====================

/**
 * 【核心策略】反转套利策略 (Reversal) V3.0
 * 
 * 【核心洞察】
 * Polymarket是二元市场，价格最终会收敛到0或1
 * 如果赌对，价格会从0.01涨到1.00，理论收益10000%
 * 如果赌错，价格会从0.99跌到0.00，理论损失100%
 * 
 * 【策略定位】
 * - 主力策略，捕捉概率反转
 * - 目标收益：100-10000%
 * - 风险控制：动态止损
 * - 核心优势：利用信息不对称和事件分析
 * 
 * 【重大改进】
 * 1. 止盈提高到0.999（99.9%），充分利用二元市场特性
 * 2. 完全禁用移动止损，让利润奔跑
 * 3. 动态止损：根据持有时间调整（越久越宽松）
 * 4. 时间窗口：7-90天（大幅放宽）
 */
export class ReversalStrategyV3 implements BacktestStrategy {
  type = BacktestStrategyType.REVERSAL;

  constructor(private engine?: any) {}

  shouldOpen(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    const strategyConfig = config.strategies.reversal;
    if (!strategyConfig.enabled) return false;

    if (!this.passesFilters(snapshot, config)) {
      return false;
    }

    // 时间过滤：7-90天（大幅放宽）
    const daysToEnd = (snapshot.endDate.getTime() - snapshot.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    if (daysToEnd < 7 || daysToEnd > 90) {
      return false;
    }

    // 分层价格区间：5%-55%（扩展到55%）
    const priceRanges = [
      { min: 0.05, max: 0.15, baseScore: 6 },  // 极低概率，高盈亏比
      { min: 0.15, max: 0.25, baseScore: 7 },  // 低概率，高盈亏比
      { min: 0.25, max: 0.35, baseScore: 6 },  // 中低概率，中高盈亏比
      { min: 0.35, max: 0.45, baseScore: 5 },  // 中等概率，中等盈亏比
      { min: 0.45, max: 0.55, baseScore: 4 },  // 新增区间
    ];

    for (let i = 0; i < snapshot.outcomePrices.length; i++) {
      const price = snapshot.outcomePrices[i];
      
      const range = priceRanges.find(r => price >= r.min && price <= r.max);
      if (!range) continue;

      let signalStrength = range.baseScore;

      // 使用综合市场情绪评分
      if (this.engine) {
        const historicalPrices = this.engine.getHistoricalPrices(
          snapshot.marketId,
          snapshot.timestamp,
          30
        );

        if (historicalPrices.length >= 15) {
          const sentiment = calculateMarketSentimentScore(
            historicalPrices,
            snapshot.volume24h,
            this.engine.getHistoricalVolumes?.(snapshot.marketId, snapshot.timestamp, 15)
          );

          // 根据评分调整信号强度
          if (sentiment.score > 25) {
            signalStrength += 5;
            if (sentiment.confidence > 0.6) signalStrength += 2;
          } else if (sentiment.score > 15) {
            signalStrength += 3;
          } else if (sentiment.score < -10) {
            signalStrength -= 4;
          }
        }
      }

      // 信号强度阈值：5
      if (signalStrength >= 5) {
        return true;
      }
    }

    return false;
  }

  shouldClose(trade: BacktestTrade, currentPrice: number, currentTime: Date, config: BacktestConfig): boolean {
    const daysHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60 * 24);
    const hoursToEnd = (trade.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);

    // 【重大改进1】止盈目标：0.999（99.9%）
    if (currentPrice >= 0.999) {
      return true;
    }

    // 【重大改进2】动态止损：根据持有时间调整（越久越宽松）
    let stopLossPercent: number;

    if (daysHeld < 7) {
      stopLossPercent = 0.60;  // 持有<7天：入场价的60%（宽止损40%）
    } else if (daysHeld < 30) {
      stopLossPercent = 0.70;  // 持有7-30天：入场价的70%（宽止损30%）
    } else if (daysHeld < 60) {
      stopLossPercent = 0.80;  // 持有30-60天：入场价的80%（宽止损20%）
    } else {
      stopLossPercent = 0.90;  // 持有>60天：入场价的90%（宽止损10%）
    }

    // 止损判断
    const stopLossPrice = trade.entryPrice * stopLossPercent;
    if (currentPrice <= stopLossPrice) {
      return true;
    }

    // 【重大改进3】时间敏感性：距离截止12小时强制平仓
    if (hoursToEnd <= 12) {
      return true;
    }

    // 【重大改进4】完全禁用移动止损，让利润奔跑
    // 不再设置移动止损

    return false;
  }

  getExitReason(trade: BacktestTrade, currentPrice: number, currentTime: Date): string {
    const daysHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60 * 24);
    const hoursToEnd = (trade.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);

    // 止盈判断
    if (currentPrice >= 0.999) {
      return '止盈：价格收敛至99.9%+';
    }

    // 止损判断
    let stopLossPercent: number;
    if (daysHeld < 7) stopLossPercent = 0.60;
    else if (daysHeld < 30) stopLossPercent = 0.70;
    else if (daysHeld < 60) stopLossPercent = 0.80;
    else stopLossPercent = 0.90;

    const stopLossPrice = trade.entryPrice * stopLossPercent;
    if (currentPrice <= stopLossPrice) {
      return `止损：价格跌至${(stopLossPercent * 100).toFixed(0)}%入场价`;
    }

    // 时间敏感性
    if (hoursToEnd <= 12) {
      return '临近截止强制平仓';
    }

    return '临近截止强制平仓';
  }

  private passesFilters(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    // 允许liquidity为0或undefined（数据可能不包含该字段）
    if (snapshot.liquidity && snapshot.liquidity < 1000) {
      return false;
    }

    // 只检查24小时成交量
    if (!snapshot.volume24h || snapshot.volume24h < 5000) {
      return false;
    }

    return true;
  }
}

/**
 * 【核心策略】收敛套利策略 (Convergence) V3.0
 * 
 * 【策略定位】
 * - 填补空余仓位的辅助策略
 * - 捕捉概率确定性收敛
 * - 目标收益：20-100%
 * 
 * 【重大改进】
 * 1. 止盈提高到1.0（100%），充分利用确定性
 * 2. 动态止损更宽松
 * 3. 时间窗口：12-72小时
 * 4. 禁用移动止损
 */
export class ConvergenceStrategyV3 implements BacktestStrategy {
  type = BacktestStrategyType.CONVERGENCE;

  constructor(private engine?: any) {}

  shouldOpen(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    const strategyConfig = config.strategies.convergence;
    if (!strategyConfig.enabled) return false;

    if (!this.passesFilters(snapshot, config)) {
      return false;
    }

    // 允许在Reversal持仓数量<5时使用
    if (this.engine) {
      const openTrades = this.engine.getOpenTrades?.() || [];
      const reversalTrades = openTrades.filter((t: BacktestTrade) => t.strategy === BacktestStrategyType.REVERSAL);
      if (reversalTrades.length >= 5) {
        return false;
      }
    }

    // 时间过滤：12-72小时
    const hoursToEnd = (snapshot.endDate.getTime() - snapshot.timestamp.getTime()) / (1000 * 60 * 60);
    if (hoursToEnd < 12 || hoursToEnd > 72) {
      return false;
    }

    // 分层价格区间：80%-98%（提高下限）
    const priceRanges = [
      { min: 0.80, max: 0.85, score: 5 },  // 高风险高回报
      { min: 0.85, max: 0.90, score: 6 },  // 中高风险
      { min: 0.90, max: 0.95, score: 7 },  // 中等风险
      { min: 0.95, max: 0.98, score: 6 },  // 低风险
    ];

    for (let i = 0; i < snapshot.outcomePrices.length; i++) {
      const price = snapshot.outcomePrices[i];
      
      const range = priceRanges.find(r => price >= r.min && price <= r.max);
      if (!range) continue;

      let signalStrength = range.score;

      // 使用综合市场情绪评分
      if (this.engine) {
        const historicalPrices = this.engine.getHistoricalPrices(
          snapshot.marketId,
          snapshot.timestamp,
          20
        );

        if (historicalPrices.length >= 10) {
          const sentiment = calculateMarketSentimentScore(
            historicalPrices,
            snapshot.volume24h,
            this.engine.getHistoricalVolumes?.(snapshot.marketId, snapshot.timestamp, 10)
          );

          if (sentiment.score > 20) {
            signalStrength += 4;
          } else if (sentiment.score < -15) {
            signalStrength -= 4;
          }

          // 波动率检查
          const volatility = calculateVolatility(historicalPrices.slice(-10));
          if (volatility < 0.08) {
            signalStrength += 3;
          } else if (volatility > 0.20) {
            signalStrength -= 3;
          }
        }
      }

      // 信号强度阈值：6
      if (signalStrength >= 6) {
        return true;
      }
    }

    return false;
  }

  shouldClose(trade: BacktestTrade, currentPrice: number, currentTime: Date, config: BacktestConfig): boolean {
    const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);
    const hoursToEnd = (trade.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);

    // 【重大改进】止盈目标：1.0（100%）
    if (currentPrice >= 1.0) {
      return true;
    }

    // 【优化】动态止损
    let stopLossPercent: number;

    if (hoursHeld < 6) {
      stopLossPercent = 0.85;  // 持有<6小时：止损15%
    } else if (hoursHeld < 12) {
      stopLossPercent = 0.90;  // 持有6-12小时：止损10%
    } else if (hoursHeld < 24) {
      stopLossPercent = 0.93;  // 持有12-24小时：止损7%
    } else {
      stopLossPercent = 0.95;  // 持有>24小时：止损5%
    }

    const stopLossPrice = trade.entryPrice * stopLossPercent;
    if (currentPrice <= stopLossPrice) {
      return true;
    }

    // 【优化】时间敏感性：距离截止8小时强制平仓
    if (hoursToEnd <= 8) {
      return true;
    }

    // 【重大改进】禁用移动止损
    // 不再设置移动止损

    return false;
  }

  getExitReason(trade: BacktestTrade, currentPrice: number, currentTime: Date): string {
    const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);
    const hoursToEnd = (trade.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);

    // 止盈判断
    if (currentPrice >= 1.0) {
      return '止盈：价格收敛至100%';
    }

    // 止损判断
    let stopLossPercent: number;
    if (hoursHeld < 6) stopLossPercent = 0.85;
    else if (hoursHeld < 12) stopLossPercent = 0.90;
    else if (hoursHeld < 24) stopLossPercent = 0.93;
    else stopLossPercent = 0.95;

    const stopLossPrice = trade.entryPrice * stopLossPercent;
    if (currentPrice <= stopLossPrice) {
      return `止损：价格跌至${(stopLossPercent * 100).toFixed(0)}%入场价`;
    }

    // 时间敏感性
    if (hoursToEnd <= 8) {
      return '临近截止强制平仓';
    }

    return '临近截止强制平仓';
  }

  private passesFilters(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    // 允许liquidity为0或undefined（数据可能不包含该字段）
    if (snapshot.liquidity && snapshot.liquidity < 1000) {
      return false;
    }

    // 只检查24小时成交量
    if (!snapshot.volume24h || snapshot.volume24h < 5000) {
      return false;
    }

    return true;
  }
}

// ==================== 策略工厂 ====================

export class StrategyFactory {
  static getStrategy(type: BacktestStrategyType, engine?: any): BacktestStrategy {
    switch (type) {
      case BacktestStrategyType.CONVERGENCE:
        return new ConvergenceStrategyV3(engine);
      case BacktestStrategyType.REVERSAL:
        return new ReversalStrategyV3(engine);
      case BacktestStrategyType.ARBITRAGE:
        return new class implements BacktestStrategy {
          type = BacktestStrategyType.ARBITRAGE;
          shouldOpen() { return false; }
          shouldClose() { return false; }
          getExitReason() { return '禁用'; }
        }();
      case BacktestStrategyType.TREND_FOLLOWING:
        return new class implements BacktestStrategy {
          type = BacktestStrategyType.TREND_FOLLOWING;
          shouldOpen() { return false; }
          shouldClose() { return false; }
          getExitReason() { return '禁用'; }
        }();
      case BacktestStrategyType.MEAN_REVERSION:
        return new class implements BacktestStrategy {
          type = BacktestStrategyType.MEAN_REVERSION;
          shouldOpen() { return false; }
          shouldClose() { return false; }
          getExitReason() { return '禁用'; }
        }();
      default:
        throw new Error(`Unknown strategy type: ${type}`);
    }
  }
}
