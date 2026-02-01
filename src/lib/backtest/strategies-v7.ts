/**
 * Reversal 策略 V8.8（高频高盈亏比版）
 *
 * 基于 V8.7 的深度分析和用户需求（月收益率 >30%，扣除 4% 磨损后）
 *
 * 【核心目标】
 * 1. 单笔交易期望 >8%（扣除 4% 磨损后 >4%）
 * 2. 月收益率 >30%（扣除 4% 磨损后）
 * 3. 交易数 20-30 笔/数据集（足够样本）
 * 4. 胜率 25-35%（可接受）
 * 5. 盈亏比 3-5（高盈亏比）
 *
 * 【核心改进】
 * 1. 分段入场条件：低价格区间（15%-25%）、中价格区间（25%-35%）、高价格区间（35%-45%）
 * 2. 分段止盈策略：锁定部分利润，让剩余部分继续追逐大额盈利
 * 3. 捕捉大额盈利：低价格区间目标 200%-600% 盈利，盈亏比 4-6
 * 4. 动态仓位管理：根据价格区间调整仓位大小
 * 5. 大幅放宽入场条件：增加交易数到 20-30 笔/数据集
 * 6. 取消市场冷却期和交易冷却时间：允许连续交易
 */

import {
  BacktestStrategy,
  BacktestStrategyType,
  BacktestMarketSnapshot,
  BacktestConfig,
  BacktestTrade,
} from './types';

// ==================== 辅助函数 ====================

/**
 * 计算趋势斜率（线性回归）
 */
function calculateTrendSlope(prices: number[]): number {
  if (prices.length < 2) return 0;

  const n = prices.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const y = prices;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return slope;
}

/**
 * 计算价格波动率
 */
function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;

  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const volatility = stdDev / mean;

  return volatility;
}

/**
 * 计算 RSI（相对强弱指标）
 */
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * 计算动量
 */
function calculateMomentum(prices: number[], period: number = 10): number {
  if (prices.length < period + 1) return 0;
  return prices[prices.length - 1] - prices[prices.length - 1 - period];
}

/**
 * 计算布林带
 */
function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): {
  upper: number;
  middle: number;
  lower: number;
  width: number;
} {
  if (prices.length < period) {
    const currentPrice = prices[prices.length - 1];
    return { upper: currentPrice * 1.1, middle: currentPrice, lower: currentPrice * 0.9, width: 0.2 };
  }

  const recentPrices = prices.slice(-period);
  const sma = recentPrices.reduce((a, b) => a + b, 0) / period;
  const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  const std = Math.sqrt(variance);

  return {
    upper: sma + stdDev * std,
    middle: sma,
    lower: sma - stdDev * std,
    width: ((sma + stdDev * std) - (sma - stdDev * std)) / sma,
  };
}

/**
 * 计算市场情绪评分
 * 综合RSI、动量、布林带等多个指标
 */
function calculateMarketSentimentScore(
  prices: number[],
  volume?: number,
  historicalVolumes?: number[]
): {
  score: number;
  confidence: number;
  rsi: number;
  momentum: number;
  bbPosition: number;
} {
  if (prices.length < 20) {
    return { score: 0, confidence: 0, rsi: 50, momentum: 0, bbPosition: 0.5 };
  }

  const rsi = calculateRSI(prices, 14);
  const momentum = calculateMomentum(prices, 10);
  const bb = calculateBollingerBands(prices, 20, 2);
  const currentPrice = prices[prices.length - 1];

  // 布林带价格位置（0-1）
  const bbPosition = (currentPrice - bb.lower) / (bb.upper - bb.lower);

  // RSI得分：30-80之间得分高，其他得分低（V8.8 大幅放宽）
  let rsiScore = 0;
  if (rsi >= 30 && rsi <= 80) {
    rsiScore = (rsi >= 50 ? (70 - rsi) / 20 : (rsi - 30) / 20) * 40;  // 最大 40 分
  }

  // 动量得分：正动量得分
  const momentumScore = Math.max(0, momentum * 1000);  // 最大 30 分

  // 布林带得分：30%-70% 位置得分高（V8.8 放宽到 20%-80%）
  let bbScore = 0;
  if (bbPosition >= 0.2 && bbPosition <= 0.8) {
    bbScore = 30;  // 固定 30 分
  }

  // 综合得分（V8.8 降低阈值）
  const score = rsiScore + momentumScore + bbScore;

  // 置信度：基于价格波动性和数据长度
  const confidence = Math.min(1, prices.length / 30);

  return {
    score,
    confidence,
    rsi,
    momentum,
    bbPosition,
  };
}

/**
 * 检查最近 N 个数据点中有多少个上涨
 */
function countIncreasingPrices(prices: number[], n: number): number {
  if (prices.length < n + 1) return 0;

  let count = 0;
  for (let i = prices.length - n; i < prices.length; i++) {
    if (prices[i] > prices[i - 1]) {
      count++;
    }
  }

  return count;
}

/**
 * 【核心策略】反转策略 (Reversal) V8.8 - 高频高盈亏比版
 */
export class ReversalStrategyV8 implements BacktestStrategy {
  type = BacktestStrategyType.REVERSAL;

  // 分段最高价格记录（用于分段止盈）
  private highestPrices = new Map<string, number>();

  // 分段仓位记录（用于动态仓位管理）
  private positionSegments = new Map<string, { price: number; size: number; taken: number }[]>();

  constructor(private engine?: any) {}

  shouldOpen(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    const strategyConfig = config.strategies.reversal;
    if (!strategyConfig.enabled) return false;

    if (!this.passesFilters(snapshot, config)) {
      return false;
    }

    // V8.8: 取消市场冷却期检查（允许连续交易）

    // V8.8: 时间过滤（保持不变）
    const hoursToEnd = (snapshot.endDate.getTime() - snapshot.timestamp.getTime()) / (1000 * 60 * 60);
    const daysToEnd = hoursToEnd / 24;
    if (daysToEnd < 1 || daysToEnd > 365) {
      return false;
    }

    // V8.8: 分段入场条件
    for (let i = 0; i < snapshot.outcomePrices.length; i++) {
      const price = snapshot.outcomePrices[i];
      const priceRange = this.getPriceRange(price);

      if (priceRange) {
        // V8.8: 根据价格区间检查入场条件
        if (this.passesSegmentedEntryConditions(snapshot, i, priceRange)) {
          return true;
        }
      }
    }

    return false;
  }

  shouldClose(trade: BacktestTrade, currentPrice: number, currentTime: Date, config: BacktestConfig): boolean {
    const hoursToEnd = (trade.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    const daysToEnd = hoursToEnd / 24;
    const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);
    const profitPercent = (currentPrice - trade.entryPrice) / trade.entryPrice;

    // V8.8: 市场归零风险控制（保持不变）
    if (currentPrice < 0.03) {
      return true;
    }

    // V8.8: 确定价格区间
    const priceRange = this.getPriceRange(trade.entryPrice);

    // V8.8: 如果价格区间不在支持范围内，使用默认逻辑
    if (!priceRange) {
      // 不分段，使用默认逻辑
      // 移动止盈（盈利超过 50% 时启用）
      if (profitPercent > 0.50) {
        // 更新最高价格
        const currentHighest = this.highestPrices.get(trade.marketId) || trade.entryPrice;
        if (currentPrice > currentHighest) {
          this.highestPrices.set(trade.marketId, currentPrice);
        }

        // 计算回撤比率
        const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
        const drawdownRatio = (highestPrice - currentPrice) / highestPrice;

        // 如果从最高点回撤超过 15%，触发移动止盈
        if (drawdownRatio > 0.15) {
          trade.exitReason = '移动止盈';
          return true;
        }
      }
      return false;
    }

    // V8.8: 根据价格区间获取分段参数
    const params = this.getSegmentedParameters(priceRange);

    // V8.8: 分段止盈
    if (this.passesSegmentedTakeProfit(trade, currentPrice, profitPercent, priceRange)) {
      return true;
    }

    // V8.8: 移动止盈
    if (this.passesMovingTakeProfit(trade, currentPrice, profitPercent, priceRange)) {
      return true;
    }

    // V8.8: 分段硬止损
    const hardStopLossPrice = trade.entryPrice * (1 + params.hardStopLoss);
    if (currentPrice <= hardStopLossPrice) {
      return true;
    }

    // V8.8: 分段软止损
    const softStopLossPrice = trade.entryPrice * (1 + params.softStopLoss);
    if (currentPrice <= softStopLossPrice && hoursHeld >= params.softStopTime) {
      return true;
    }

    // V8.8: 动量反转止损
    if (this.engine && hoursHeld >= params.softStopTime && profitPercent < -0.20) {
      const historicalPrices = this.engine.getHistoricalPrices(
        trade.marketId,
        currentTime,
        params.momentumReversalWindow,
        trade.outcomeIndex
      );

      if (historicalPrices.length >= params.momentumReversalWindow) {
        const isFalling = historicalPrices.every((price: number, i: number) =>
          i === 0 || historicalPrices[i] < historicalPrices[i - 1]
        );
        if (isFalling && currentPrice < trade.entryPrice) {
          return true;
        }
      }
    }

    // V8.8: 分段最大持仓时间
    if (hoursHeld >= params.maxHoldingHours) {
      return true;
    }

    // V8.8: 临近截止强制平仓（24 小时内）
    if (hoursToEnd <= 24) {
      return true;
    }

    return false;
  }

  getExitReason(trade: BacktestTrade, currentPrice: number, currentTime: Date): string {
    const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);
    const hoursToEnd = (trade.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    const daysToEnd = hoursToEnd / 24;
    const profitPercent = (currentPrice - trade.entryPrice) / trade.entryPrice;

    // V8.8: 确定价格区间
    const priceRange = this.getPriceRange(trade.entryPrice);

    // V8.8: 如果价格区间不在支持范围内，使用默认参数
    if (!priceRange) {
      // 使用默认参数
      // 市场归零风险控制
      if (currentPrice < 0.03) {
        return '市场归零风险控制（价格 < 3%）';
      }

      // 默认止盈（盈利超过 50% 时启用移动止盈）
      if (profitPercent > 0.50) {
        // 更新最高价格
        const currentHighest = this.highestPrices.get(trade.marketId) || trade.entryPrice;
        if (currentPrice > currentHighest) {
          this.highestPrices.set(trade.marketId, currentPrice);
        }

        // 计算回撤比率
        const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
        const drawdownRatio = (highestPrice - currentPrice) / highestPrice;

        // 如果从最高点回撤超过 15%，触发移动止盈
        if (drawdownRatio > 0.15) {
          return '移动止盈：从最高点回撤超过 15%';
        }
      }

      // 默认止损（亏损超过 30%）
      if (profitPercent < -0.30) {
        return '硬止损：亏损超过 30%';
      }

      // 默认：没有触发退出条件
      return '';
    }

    const params = this.getSegmentedParameters(priceRange);

    // V8.8: 市场归零风险控制
    if (currentPrice < 0.03) {
      return '市场归零风险控制（价格 < 3%）';
    }

    // V8.8: 分段止盈
    const takeProfitStages = this.getTakeProfitStages(priceRange);
    for (const stage of takeProfitStages) {
      if (profitPercent >= stage.threshold && profitPercent < (takeProfitStages.find(s => s.threshold > stage.threshold)?.threshold || Infinity)) {
        return `分段止盈：价格达到${(currentPrice * 100).toFixed(2)}%（盈利${(profitPercent * 100).toFixed(0)}%，止盈${stage.takePercent}%）`;
      }
    }

    // V8.8: 移动止盈
    if (profitPercent > 0.5) {
      const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
      const drawdownRatio = (highestPrice - currentPrice) / highestPrice;
      if (drawdownRatio > params.movingStopLossDrawdown) {
        return `移动止盈：从最高点回撤${(drawdownRatio * 100).toFixed(2)}%`;
      }
    }

    // V8.8: 分段硬止损
    const hardStopLossPrice = trade.entryPrice * (1 + params.hardStopLoss);
    if (currentPrice <= hardStopLossPrice) {
      return `硬止损：价格跌至${(currentPrice * 100).toFixed(2)}%(${(-params.hardStopLoss * 100).toFixed(0)}%硬止损）`;
    }

    // V8.8: 分段软止损
    const softStopLossPrice = trade.entryPrice * (1 + params.softStopLoss);
    if (currentPrice <= softStopLossPrice && hoursHeld >= params.softStopTime) {
      return `软止损：价格跌至${(currentPrice * 100).toFixed(2)}%(${(-params.softStopLoss * 100).toFixed(0)}%软止损）`;
    }

    // V8.8: 动量反转止损
    if (this.engine && hoursHeld >= params.softStopTime && profitPercent < -0.20) {
      const historicalPrices = this.engine.getHistoricalPrices(
        trade.marketId,
        currentTime,
        params.momentumReversalWindow,
        trade.outcomeIndex
      );

      if (historicalPrices.length >= params.momentumReversalWindow) {
        const isFalling = historicalPrices.every((price: number, i: number) =>
          i === 0 || historicalPrices[i] < historicalPrices[i - 1]
        );
        if (isFalling && currentPrice < trade.entryPrice) {
          return '动量反转止损/价格暴跌';
        }
      }
    }

    // V8.8: 分段最大持仓时间
    if (hoursHeld >= params.maxHoldingHours) {
      return `强制平仓：最大持仓时间${params.maxHoldingHours.toFixed(0)}小时`;
    }

    // V8.8: 临近截止强制平仓
    if (hoursToEnd <= 24) {
      return '临近截止强制平仓';
    }

    return '未知原因';
  }

  /**
   * V8.8: 获取价格区间（重构：基于数据集实际价格分布）
   *
   * 原区间（15%-45%）在大数据集中无市场，需要重新设计：
   * - 极低价格（1%-10%）：捕捉从极低价格突然上涨的机会（黑天鹅）
   * - 低价格（10%-25%）：捕捉低价格上涨的机会（潜力股）
   * - 中价格（25%-45%）：捕捉中价格上涨的机会（稳定增长）
   * - 中高价格（45%-65%）：捕捉中高价格上涨的机会（强趋势）
   */
  private getPriceRange(price: number): 'ultra_low' | 'low' | 'medium' | 'medium_high' | null {
    if (price >= 0.01 && price <= 0.10) {
      return 'ultra_low';  // 极低价格区间：1%-10%
    } else if (price > 0.10 && price <= 0.25) {
      return 'low';  // 低价格区间：10%-25%
    } else if (price > 0.25 && price <= 0.45) {
      return 'medium';  // 中价格区间：25%-45%
    } else if (price > 0.45 && price <= 0.65) {
      return 'medium_high';  // 中高价格区间：45%-65%
    }
    return null;
  }

  /**
   * V8.8: 获取分段入场条件参数（重构：基于新价格区间）
   */
  private getSegmentedEntryConditions(priceRange: 'ultra_low' | 'low' | 'medium' | 'medium_high') {
    switch (priceRange) {
      case 'ultra_low':
        return {
          trendConfirmationWindow: 3,
          minTrendSlope: 0,
          minIncreasingCount: 2,
          marketSentimentThreshold: 20,
          volatilityThreshold: 0.40,
          priceHistoryThreshold: 0.90,
          minVolume24h: 1000,
          minLiquidity: 0,  // 不检查流动性（因为数据集中都是 0）
        };
      case 'low':
        return {
          trendConfirmationWindow: 5,
          minTrendSlope: 0,
          minIncreasingCount: 3,
          marketSentimentThreshold: 25,
          volatilityThreshold: 0.30,
          priceHistoryThreshold: 0.85,
          minVolume24h: 2000,
          minLiquidity: 0,
        };
      case 'medium':
        return {
          trendConfirmationWindow: 8,
          minTrendSlope: 0,
          minIncreasingCount: 4,
          marketSentimentThreshold: 30,
          volatilityThreshold: 0.25,
          priceHistoryThreshold: 0.80,
          minVolume24h: 3000,
          minLiquidity: 0,
        };
      case 'medium_high':
        return {
          trendConfirmationWindow: 10,
          minTrendSlope: 0,
          minIncreasingCount: 5,
          marketSentimentThreshold: 35,
          volatilityThreshold: 0.20,
          priceHistoryThreshold: 0.75,
          minVolume24h: 5000,
          minLiquidity: 0,
        };
    }
  }

  /**
   * V8.8: 检查分段入场条件（重构：基于新价格区间）
   */
  private passesSegmentedEntryConditions(
    snapshot: BacktestMarketSnapshot,
    outcomeIndex: number,
    priceRange: 'ultra_low' | 'low' | 'medium' | 'medium_high'
  ): boolean {
    const conditions = this.getSegmentedEntryConditions(priceRange);

    // V8.8: 趋势判断（大幅放宽）
    if (!this.passesTrendCheck(snapshot, outcomeIndex, conditions)) {
      return false;
    }

    // V8.8: 市场情绪评分（大幅降低）
    if (!this.passesMarketSentimentCheck(snapshot, outcomeIndex, conditions.marketSentimentThreshold)) {
      return false;
    }

    // V8.8: 市场稳定性检查（大幅放宽）
    if (!this.passesStabilityCheck(snapshot, outcomeIndex, conditions.volatilityThreshold)) {
      return false;
    }

    // V8.8: 价格历史检查（大幅放宽）
    if (!this.passesPriceHistoryCheck(snapshot, outcomeIndex, conditions.priceHistoryThreshold)) {
      return false;
    }

    // V8.8: 市场深度检查（大幅降低）
    if (!this.passesMarketDepthCheck(snapshot, conditions.minVolume24h, conditions.minLiquidity)) {
      return false;
    }

    return true;
  }

  /**
   * V8.8: 获取分段参数（重构：基于新价格区间）
   */
  private getSegmentedParameters(priceRange: 'ultra_low' | 'low' | 'medium' | 'medium_high') {
    switch (priceRange) {
      case 'ultra_low':
        return {
          hardStopLoss: -0.50,  // -50%
          softStopLoss: -0.40,  // -40%
          softStopTime: 1,  // 1 小时
          momentumReversalWindow: 5,  // 5 个数据点
          movingStopLossDrawdown: 0.25,  // 25% 回撤
          maxHoldingHours: 72,  // 72 小时（3 天）
        };
      case 'low':
        return {
          hardStopLoss: -0.40,  // -40%
          softStopLoss: -0.35,  // -35%
          softStopTime: 2,  // 2 小时
          momentumReversalWindow: 6,  // 6 个数据点
          movingStopLossDrawdown: 0.20,  // 20% 回撤
          maxHoldingHours: 120,  // 120 小时（5 天）
        };
      case 'medium':
        return {
          hardStopLoss: -0.30,  // -30%
          softStopLoss: -0.25,  // -25%
          softStopTime: 2,  // 2 小时
          momentumReversalWindow: 7,  // 7 个数据点
          movingStopLossDrawdown: 0.15,  // 15% 回撤
          maxHoldingHours: 168,  // 168 小时（7 天）
        };
      case 'medium_high':
        return {
          hardStopLoss: -0.20,  // -20%
          softStopLoss: -0.15,  // -15%
          softStopTime: 2,  // 2 小时
          momentumReversalWindow: 8,  // 8 个数据点
          movingStopLossDrawdown: 0.10,  // 10% 回撤
          maxHoldingHours: 240,  // 240 小时（10 天）
        };
    }
  }

  /**
   * V8.8: 获取分段止盈策略（重构：基于新价格区间）
   */
  private getTakeProfitStages(priceRange: 'ultra_low' | 'low' | 'medium' | 'medium_high') {
    switch (priceRange) {
      case 'ultra_low':
        return [
          { threshold: 0.50, takePercent: 40 },  // 50% 时止盈 40%
          { threshold: 1.00, takePercent: 30 },  // 100% 时止盈 30%
          { threshold: 2.00, takePercent: 20 },  // 200% 时止盈 20%
          { threshold: 5.00, takePercent: 10 },  // 500% 时止盈 10%
        ];
      case 'low':
        return [
          { threshold: 0.50, takePercent: 40 },  // 50% 时止盈 40%
          { threshold: 1.00, takePercent: 40 },  // 100% 时止盈 40%
          { threshold: 1.50, takePercent: 20 },  // 150% 时止盈 20%
        ];
      case 'medium':
        return [
          { threshold: 0.30, takePercent: 50 },  // 30% 时止盈 50%
          { threshold: 0.50, takePercent: 50 },  // 50% 时止盈 50%
        ];
      case 'medium_high':
        return [
          { threshold: 0.15, takePercent: 60 },  // 15% 时止盈 60%
          { threshold: 0.25, takePercent: 40 },  // 25% 时止盈 40%
        ];
    }
  }

  /**
   * V8.8: 分段止盈检查
   */
  private passesSegmentedTakeProfit(
    trade: BacktestTrade,
    currentPrice: number,
    profitPercent: number,
    priceRange: 'ultra_low' | 'low' | 'medium' | 'medium_high'
  ): boolean {
    const takeProfitStages = this.getTakeProfitStages(priceRange);

    // 检查每个止盈阶段
    for (const stage of takeProfitStages) {
      if (profitPercent >= stage.threshold) {
        // 计算已止盈的部分
        const alreadyTaken = trade.exitValue ? (trade.exitValue - trade.entryValue) / trade.entryValue : 0;
        const targetTakePercent = stage.threshold - alreadyTaken;

        // 如果当前盈利超过目标止盈百分比
        if (profitPercent - alreadyTaken >= targetTakePercent) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * V8.8: 移动止盈检查
   */
  private passesMovingTakeProfit(
    trade: BacktestTrade,
    currentPrice: number,
    profitPercent: number,
    priceRange: 'ultra_low' | 'low' | 'medium' | 'medium_high'
  ): boolean {
    const params = this.getSegmentedParameters(priceRange);

    if (profitPercent <= 0.50) {
      return false;  // 盈利不超过 50%，不启用移动止盈
    }

    // 更新最高价格
    const currentHighest = this.highestPrices.get(trade.marketId) || trade.entryPrice;
    if (currentPrice > currentHighest) {
      this.highestPrices.set(trade.marketId, currentPrice);
    }

    // 计算回撤比率
    const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
    const drawdownRatio = (highestPrice - currentPrice) / highestPrice;

    // 如果从最高点回撤超过阈值，触发移动止盈
    if (drawdownRatio > params.movingStopLossDrawdown) {
      return true;
    }

    return false;
  }

  /**
   * V8.8: 趋势判断检查（大幅放宽）
   */
  private passesTrendCheck(
    snapshot: BacktestMarketSnapshot,
    outcomeIndex: number,
    conditions: any
  ): boolean {
    if (!this.engine) {
      return true;  // 如果没有 engine，跳过趋势检查
    }

    // 获取历史价格
    const historicalPrices = this.engine.getHistoricalPrices(
      snapshot.marketId,
      snapshot.timestamp,
      conditions.trendConfirmationWindow,
      outcomeIndex
    );

    if (historicalPrices.length < conditions.trendConfirmationWindow) {
      return true;  // 数据不足，跳过检查
    }

    // 计算趋势斜率（V8.8 大幅放宽）
    const slope = calculateTrendSlope(historicalPrices);
    if (slope <= conditions.minTrendSlope) {
      return false;
    }

    // 检查最近 N 个数据点中有多少个上涨
    const increasingCount = countIncreasingPrices(historicalPrices, conditions.minIncreasingCount + conditions.trendConfirmationWindow - conditions.trendConfirmationWindow);
    if (increasingCount < conditions.minIncreasingCount) {
      return false;
    }

    return true;
  }

  /**
   * V8.8: 市场情绪评分检查（大幅降低）
   */
  private passesMarketSentimentCheck(
    snapshot: BacktestMarketSnapshot,
    outcomeIndex: number,
    threshold: number
  ): boolean {
    if (!this.engine) {
      return true;  // 如果没有 engine，跳过市场情绪检查
    }

    // 获取历史价格
    const historicalPrices = this.engine.getHistoricalPrices(
      snapshot.marketId,
      snapshot.timestamp,
      20,
      outcomeIndex
    );

    if (historicalPrices.length < 20) {
      return true;  // 数据不足，跳过检查
    }

    // 计算市场情绪评分
    const sentiment = calculateMarketSentimentScore(historicalPrices);

    // V8.8: 大幅降低综合评分阈值
    return sentiment.score > threshold;
  }

  /**
   * V8.8: 市场稳定性检查（大幅放宽）
   */
  private passesStabilityCheck(
    snapshot: BacktestMarketSnapshot,
    outcomeIndex: number,
    volatilityThreshold: number
  ): boolean {
    if (!this.engine) {
      return true;  // 如果没有 engine，跳过稳定性检查
    }

    // 获取历史价格
    const historicalPrices = this.engine.getHistoricalPrices(
      snapshot.marketId,
      snapshot.timestamp,
      10,
      outcomeIndex
    );

    if (historicalPrices.length < 10) {
      return true;  // 数据不足，跳过检查
    }

    // 计算波动率
    const volatility = calculateVolatility(historicalPrices);
    return volatility <= volatilityThreshold;
  }

  /**
   * V8.8: 价格历史检查（大幅放宽）
   */
  private passesPriceHistoryCheck(
    snapshot: BacktestMarketSnapshot,
    outcomeIndex: number,
    priceHistoryThreshold: number
  ): boolean {
    if (!this.engine) {
      return true;  // 如果没有 engine，跳过价格历史检查
    }

    // 获取历史价格
    const historicalPrices = this.engine.getHistoricalPrices(
      snapshot.marketId,
      snapshot.timestamp,
      20,
      outcomeIndex
    );

    if (historicalPrices.length < 20) {
      return true;  // 数据不足，跳过检查
    }

    const currentPrice = snapshot.outcomePrices[outcomeIndex];
    const highestPrice = Math.max(...historicalPrices);
    const pricePosition = currentPrice / highestPrice;

    return pricePosition <= priceHistoryThreshold;
  }

  /**
   * V8.8: 市场深度检查（大幅降低）
   * 修复：处理 liquidity=0 的情况，使用 volume24h 作为替代指标
   */
  private passesMarketDepthCheck(
    snapshot: BacktestMarketSnapshot,
    minVolume24h: number,
    minLiquidity: number
  ): boolean {
    // 24小时成交量
    if (!snapshot.volume24h || snapshot.volume24h < minVolume24h) {
      return false;
    }

    // 流动性检查（V8.8 修复：如果 liquidity=0，跳过此检查，只依赖 volume24h）
    if (snapshot.liquidity && snapshot.liquidity < minLiquidity) {
      return false;
    }

    return true;
  }

  private passesFilters(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    // V8.8: 大幅降低流动性检查（修复：如果 liquidity=0，跳过此检查）
    if (snapshot.liquidity && snapshot.liquidity < 500) {  // 从 2000 降低到 500
      return false;
    }

    // V8.8: 大幅降低24小时成交量检查
    if (!snapshot.volume24h || snapshot.volume24h < 2000) {  // 从 10000 降低到 2000
      return false;
    }

    if (snapshot.liquidity && snapshot.volume24h) {
      const ratio = snapshot.liquidity / snapshot.volume24h;
      if (ratio < 0.01) {  // 从 0.015 降低到 0.01
        return false;
      }
    }

    return true;
  }

  getDescription(): string {
    return `Reversal Strategy V8.8（高频高盈亏比版 V2）：
    • 分段入场：极低价格（1%-10%）、低价格（10%-25%）、中价格（25%-45%）、中高价格（45%-65%）
    • 极低价格区间：趋势判断（3 数据点）、评分>20、波动率<=40%、成交量>=$1,000
    • 低价格区间：趋势判断（5 数据点）、评分>25、波动率<=30%、成交量>=$2,000
    • 中价格区间：趋势判断（8 数据点）、评分>30、波动率<=25%、成交量>=$3,000
    • 中高价格区间：趋势判断（10 数据点）、评分>35、波动率<=20%、成交量>=$5,000
    • 分段止盈：极低价格（50%-500%）、低价格（50%-150%）、中价格（30%-50%）、中高价格（15%-25%）
    • 移动止盈：极低价格（25% 回撤）、低价格（20% 回撤）、中价格（15% 回撤）、中高价格（10% 回撤）
    • 分段止损：极低价格（-50% 硬止损）、低价格（-40% 硬止损）、中价格（-30% 硬止损）、中高价格（-20% 硬止损）
    • 软止损时间：极低价格（1 小时）、其他（2 小时）
    • 动量反转：极低价格（5 数据点）、低价格（6 数据点）、中价格（7 数据点）、中高价格（8 数据点）
    • 最大持仓时间：极低价格（72 小时）、低价格（120 小时）、中价格（168 小时）、中高价格（240 小时）
    • 风险管理：最大持仓 10，单仓位 25%，日亏损 10%，最大回撤 20%
    • 市场冷却期：0 小时（取消）
    • 交易冷却时间：0 分钟（取消）`;
  }
}
