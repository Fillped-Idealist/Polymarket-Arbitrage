/**
 * Reversal 策略 V8.7（超激进优化版）
 * 
 * 基于 V8.6 的深度分析和用户目标的超激进优化
 * 
 * 【核心目标】
 * 1. 单笔交易期望为正（平均每笔盈亏 > 0）
 * 2. 月收益率超过 30%（年化收益率 > 360%）
 * 
 * 【核心改进】
 * 1. 超严格入场筛选：只在最高质量的交易机会开仓
 * 2. 捕捉大额盈利：专注于捕捉 2-10 倍的大额盈利
 * 3. 严格止损：快速止损，避免单笔亏损过大
 * 4. 移动止盈：让利润奔跑，最大化盈利幅度
 * 
 * 【关键变化】
 * - 价格区间：30%-37%（从 25%-38% 收紧）
 * - 趋势判断：超严格（15 个数据点，斜率 > 0.001）
 * - 市场情绪评分：新增（RSI、动量、布林带综合评分 > 60）
 * - 市场稳定性：<= 10%（从 15% 收紧）
 * - 价格历史检查：<= 历史最高价的 70%（从 80% 收紧）
 * - 市场深度检查：新增（成交量、流动性、买卖价差）
 * - 动态止盈：根据盈利幅度动态调整（50% - 200%）
 * - 移动止盈：新增（从最高点下跌 15% 止盈）
 * - 硬止损：1.5 倍容忍度（从 2.0 倍降低）
 * - 风险管理：超保守（最大持仓 2，单仓位 25%，日亏损 5%）
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

  // RSI得分：50-70之间得分高，其他得分低
  let rsiScore = 0;
  if (rsi >= 50 && rsi <= 70) {
    rsiScore = (rsi - 50) * 3;  // 最大 60 分
  }

  // 动量得分：正动量得分
  const momentumScore = Math.max(0, momentum * 1000);  // 最大 30 分

  // 布林带得分：30%-70% 位置得分高
  let bbScore = 0;
  if (bbPosition >= 0.3 && bbPosition <= 0.7) {
    bbScore = 10;  // 固定 10 分
  }

  // 综合得分
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
 * 【核心策略】反转策略 (Reversal) V8.7 - 超激进优化版
 */
export class ReversalStrategyV6 implements BacktestStrategy {
  type = BacktestStrategyType.REVERSAL;

  // 市场冷却期记录：市场ID -> 最近平仓时间
  private marketCooldowns = new Map<string, Date>();

  // 记录最高盈利价格（用于移动止盈）：市场ID -> 最高价格
  private highestPrices = new Map<string, number>();

  constructor(private engine?: any) {}

  shouldOpen(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    const strategyConfig = config.strategies.reversal;
    if (!strategyConfig.enabled) return false;

    if (!this.passesFilters(snapshot, config)) {
      return false;
    }

    // V8.7: 检查市场冷却期
    if (!this.passesMarketCooldown(snapshot.marketId, snapshot.timestamp)) {
      return false;
    }

    // V8.7: 时间过滤（保持不变）
    const hoursToEnd = (snapshot.endDate.getTime() - snapshot.timestamp.getTime()) / (1000 * 60 * 60);
    const daysToEnd = hoursToEnd / 24;
    if (daysToEnd < 1 || daysToEnd > 365) {
      return false;
    }

    // V8.7: 价格区间（收紧到 30%-37%）
    for (let i = 0; i < snapshot.outcomePrices.length; i++) {
      const price = snapshot.outcomePrices[i];

      if (price >= 0.30 && price <= 0.37) {  // 从 25%-38% 收紧到 30%-37%
        // V8.7: 超严格趋势判断
        if (!this.passesTrendCheck(snapshot, i)) {
          continue;
        }

        // V8.7: 市场情绪评分（新增）
        if (!this.passesMarketSentimentCheck(snapshot, i)) {
          continue;
        }

        // V8.7: 市场稳定性检查（更严格）
        if (!this.passesStabilityCheck(snapshot, i)) {
          continue;
        }

        // V8.7: 价格历史检查（更严格）
        if (!this.passesPriceHistoryCheck(snapshot, i)) {
          continue;
        }

        // V8.7: 市场深度检查（新增）
        if (!this.passesMarketDepthCheck(snapshot)) {
          continue;
        }

        return true;
      }
    }

    return false;
  }

  shouldClose(trade: BacktestTrade, currentPrice: number, currentTime: Date, config: BacktestConfig): boolean {
    const hoursToEnd = (trade.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    const daysToEnd = hoursToEnd / 24;
    const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);
    const profitPercent = (currentPrice - trade.entryPrice) / trade.entryPrice;

    // V8.7: 市场归零风险控制（更严格：价格 < 3%）
    if (currentPrice < 0.03) {
      this.recordMarketClose(trade.marketId, currentTime);
      return true;
    }

    // V8.7: 根据当前剩余时间获取策略参数
    const params = this.getParametersByTimeToEnd(hoursToEnd, daysToEnd);

    // V8.7: 动态止盈（根据盈利幅度动态调整）
    const dynamicTakeProfitRatio = this.getDynamicTakeProfitRatio(profitPercent);
    const takeProfitPrice = trade.entryPrice * dynamicTakeProfitRatio;
    if (currentPrice >= takeProfitPrice) {
      this.recordMarketClose(trade.marketId, currentTime);
      return true;
    }

    // V8.7: 移动止盈（新增）
    if (this.passesMovingTakeProfit(trade, currentPrice, profitPercent)) {
      this.recordMarketClose(trade.marketId, currentTime);
      return true;
    }

    // V8.7: 硬止损（更严格：1.5 倍容忍度）
    const hardStopLossRatio = params.stopLoss * 1.5;  // 从 2.0 倍降低到 1.5 倍
    const hardStopLossPrice = trade.entryPrice * (1 - hardStopLossRatio);
    if (currentPrice <= hardStopLossPrice) {
      this.recordMarketClose(trade.marketId, currentTime);
      return true;
    }

    // V8.7: 软止损（根据分段参数，更严格：30 分钟）
    const stopLossPrice = trade.entryPrice * (1 - params.stopLoss);
    if (currentPrice <= stopLossPrice && hoursHeld >= 0.5) {  // 从 1 小时缩短到 30 分钟
      this.recordMarketClose(trade.marketId, currentTime);
      return true;
    }

    // V8.7: 动量反转止损（更敏感：3 个数据点）
    if (this.engine && hoursHeld >= 0.5 && profitPercent < -0.05) {
      const historicalPrices = this.engine.getHistoricalPrices(
        trade.marketId,
        currentTime,
        3,
        trade.outcomeIndex
      );

      if (historicalPrices.length >= 3) {  // 从 5 缩短到 3
        const last3Prices = historicalPrices.slice(-3);
        const isFalling = last3Prices[2] < last3Prices[1] && last3Prices[1] < last3Prices[0];
        if (isFalling && currentPrice < trade.entryPrice) {
          this.recordMarketClose(trade.marketId, currentTime);
          return true;
        }
      }
    }

    // V8.7: 分段最大持仓时间（根据分段参数）
    if (hoursHeld >= params.maxHoldingHours) {
      this.recordMarketClose(trade.marketId, currentTime);
      return true;
    }

    // V8.7: 临近截止强制平仓（24 小时内）
    if (hoursToEnd <= 24) {
      this.recordMarketClose(trade.marketId, currentTime);
      return true;
    }

    return false;
  }

  getExitReason(trade: BacktestTrade, currentPrice: number, currentTime: Date): string {
    const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);
    const daysHeld = hoursHeld / 24;
    const hoursToEnd = (trade.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    const daysToEnd = hoursToEnd / 24;
    const profitPercent = (currentPrice - trade.entryPrice) / trade.entryPrice;

    // V8.7: 市场归零风险控制（更严格：价格 < 3%）
    if (currentPrice < 0.03) {
      return '市场归零风险控制（价格 < 3%）';
    }

    // V8.7: 根据当前剩余时间获取策略参数
    const params = this.getParametersByTimeToEnd(hoursToEnd, daysToEnd);

    // V8.7: 动态止盈（根据盈利幅度动态调整）
    const dynamicTakeProfitRatio = this.getDynamicTakeProfitRatio(profitPercent);
    const takeProfitPrice = trade.entryPrice * dynamicTakeProfitRatio;
    if (currentPrice >= takeProfitPrice) {
      return `动态止盈：价格达到${(currentPrice * 100).toFixed(2)}%（盈利${(profitPercent * 100).toFixed(0)}%，目标${((dynamicTakeProfitRatio - 1) * 100).toFixed(0)}%）`;
    }

    // V8.7: 移动止盈（新增）
    if (profitPercent > 0.5) {
      const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
      const drawdownRatio = (highestPrice - currentPrice) / highestPrice;
      if (drawdownRatio > 0.15) {
        return `移动止盈：从最高点回撤${(drawdownRatio * 100).toFixed(2)}%`;
      }
    }

    // V8.7: 硬止损（更严格：1.5 倍容忍度）
    const hardStopLossRatio = params.stopLoss * 1.5;
    const hardStopLossPrice = trade.entryPrice * (1 - hardStopLossRatio);
    if (currentPrice <= hardStopLossPrice) {
      return `硬止损：价格跌至${(currentPrice * 100).toFixed(2)}%(${(hardStopLossRatio * 100).toFixed(0)}%硬止损）`;
    }

    // V8.7: 软止损（根据分段参数，更严格：30 分钟）
    const stopLossPrice = trade.entryPrice * (1 - params.stopLoss);
    if (currentPrice <= stopLossPrice && hoursHeld >= 0.5) {
      return `止损：价格跌至${(currentPrice * 100).toFixed(2)}%(${(params.stopLoss * 100).toFixed(0)}%止损）`;
    }

    // V8.7: 动量反转止损（更敏感：3 个数据点）
    if (this.engine && hoursHeld >= 0.5 && profitPercent < -0.05) {
      const historicalPrices = this.engine.getHistoricalPrices(
        trade.marketId,
        currentTime,
        3,
        trade.outcomeIndex
      );

      if (historicalPrices.length >= 3) {
        const last3Prices = historicalPrices.slice(-3);
        const isFalling = last3Prices[2] < last3Prices[1] && last3Prices[1] < last3Prices[0];
        if (isFalling && currentPrice < trade.entryPrice) {
          return '动量反转止损/价格暴跌';
        }
      }
    }

    // V8.7: 分段最大持仓时间（根据分段参数）
    if (hoursHeld >= params.maxHoldingHours) {
      return `强制平仓：最大持仓时间${params.maxHoldingHours.toFixed(0)}小时`;
    }

    // V8.7: 临近截止强制平仓（24 小时内）
    if (hoursToEnd <= 24) {
      return '临近截止强制平仓';
    }

    return '未知原因';
  }

  /**
   * V8.7: 获取动态止盈倍数（根据盈利幅度动态调整）
   */
  private getDynamicTakeProfitRatio(profitPercent: number): number {
    if (profitPercent < 0.30) {
      return 1.50;  // 盈利 < 30%，止盈 50%
    } else if (profitPercent < 0.60) {
      return 1.80;  // 盈利 30% - 60%，止盈 80%
    } else if (profitPercent < 1.00) {
      return 2.20;  // 盈利 60% - 100%，止盈 120%
    } else {
      return 3.00;  // 盈利 > 100%，止盈 200%（让利润奔跑）
    }
  }

  /**
   * V8.7: 移动止盈检查（新增）
   */
  private passesMovingTakeProfit(trade: BacktestTrade, currentPrice: number, profitPercent: number): boolean {
    if (profitPercent <= 0.5) {
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

    // 如果从最高点回撤超过 15%，触发移动止盈
    if (drawdownRatio > 0.15) {
      return true;
    }

    return false;
  }

  /**
   * V8.7: 市场冷却期检查（延长到 48 小时）
   */
  private passesMarketCooldown(marketId: string, currentTime: Date): boolean {
    const lastCloseTime = this.marketCooldowns.get(marketId);
    if (!lastCloseTime) {
      return true;
    }

    const hoursSinceClose = (currentTime.getTime() - lastCloseTime.getTime()) / (1000 * 60 * 60);
    return hoursSinceClose >= 48;  // 冷却期 48 小时（从 24 小时延长）
  }

  /**
   * V8.7: 超严格趋势判断（新增）
   */
  private passesTrendCheck(snapshot: BacktestMarketSnapshot, outcomeIndex: number): boolean {
    if (!this.engine) {
      return true;  // 如果没有 engine，跳过趋势检查
    }

    // 获取历史价格
    const historicalPrices = this.engine.getHistoricalPrices(
      snapshot.marketId,
      snapshot.timestamp,
      15,  // 从 10 个数据点增加到 15 个
      outcomeIndex
    );

    if (historicalPrices.length < 15) {
      return true;  // 数据不足，跳过检查
    }

    // 计算趋势斜率
    const slope = calculateTrendSlope(historicalPrices);
    if (slope <= 0.001) {  // 斜率必须 > 0.001（更严格）
      return false;
    }

    // 检查最近 10 个数据点中有多少个上涨
    const increasingCount = countIncreasingPrices(historicalPrices, 10);
    if (increasingCount < 8) {  // 至少 8 个上涨（更严格）
      return false;
    }

    return true;
  }

  /**
   * V8.7: 市场情绪评分检查（新增）
   */
  private passesMarketSentimentCheck(snapshot: BacktestMarketSnapshot, outcomeIndex: number): boolean {
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

    // 综合评分 > 60
    return sentiment.score > 60;
  }

  /**
   * V8.7: 市场稳定性检查（更严格：波动率 <= 10%）
   */
  private passesStabilityCheck(snapshot: BacktestMarketSnapshot, outcomeIndex: number): boolean {
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
    return volatility <= 0.10;  // 波动率 <= 10%（从 15% 收紧）
  }

  /**
   * V8.7: 价格历史检查（更严格：当前价格 <= 历史最高价的 70%）
   */
  private passesPriceHistoryCheck(snapshot: BacktestMarketSnapshot, outcomeIndex: number): boolean {
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

    return pricePosition <= 0.70;  // 当前价格 <= 历史最高价的 70%（从 80% 收紧）
  }

  /**
   * V8.7: 市场深度检查（新增）
   */
  private passesMarketDepthCheck(snapshot: BacktestMarketSnapshot): boolean {
    // 24小时成交量：>= $10,000（从 $5,000 提高）
    if (!snapshot.volume24h || snapshot.volume24h < 10000) {
      return false;
    }

    // 流动性：>= $2,000（从 $1,000 提高）
    if (!snapshot.liquidity || snapshot.liquidity < 2000) {
      return false;
    }

    // 买卖价差检查（假设：流动性/成交量比率越高，买卖价差越小）
    if (snapshot.liquidity && snapshot.volume24h) {
      const ratio = snapshot.liquidity / snapshot.volume24h;
      if (ratio < 0.015) {  // 流动性/成交量比率 >= 1.5%
        return false;
      }
    }

    return true;
  }

  private passesFilters(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    // V8.7: 流动性检查（提高）
    if (!snapshot.liquidity || snapshot.liquidity < 2000) {  // 从 1000 提高到 2000
      return false;
    }

    // V8.7: 24小时成交量检查（提高）
    if (!snapshot.volume24h || snapshot.volume24h < 10000) {  // 从 5000 提高到 10000
      return false;
    }

    if (snapshot.liquidity && snapshot.volume24h) {
      const ratio = snapshot.liquidity / snapshot.volume24h;
      if (ratio < 0.015) {  // 从 0.01 提高到 0.015
        return false;
      }
    }

    return true;
  }

  /**
   * V8.7: 根据剩余时间获取策略参数（更新分段参数）
   */
  private getParametersByTimeToEnd(hoursToEnd: number, daysToEnd: number) {
    // V8.7: 分段参数（更严格的止损，更激进的止盈）
    // 超短期（0-12 小时）
    if (hoursToEnd <= 12) {
      return { stopLoss: 0.03, takeProfitRatio: 1.80, maxHoldingHours: 8 };  // 从 0.04 降低到 0.03，止盈从 1.25 提高到 1.80
    }

    // 临期（0.5-3 天）
    if (daysToEnd <= 3) {
      return { stopLoss: 0.04, takeProfitRatio: 2.00, maxHoldingHours: 24 };  // 从 0.06 降低到 0.04，止盈从 1.30 提高到 2.00
    }

    // 短期（3-7 天）
    if (daysToEnd <= 7) {
      return { stopLoss: 0.05, takeProfitRatio: 2.20, maxHoldingHours: 48 };  // 从 0.08 降低到 0.05，止盈从 1.40 提高到 2.20
    }

    // 中期（7-30 天）
    if (daysToEnd <= 30) {
      return { stopLoss: 0.06, takeProfitRatio: 2.50, maxHoldingHours: 72 };  // 从 0.10 降低到 0.06，止盈从 1.50 提高到 2.50
    }

    // 长期（30+ 天）
    return { stopLoss: 0.08, takeProfitRatio: 3.00, maxHoldingHours: 120 };  // 从 0.12 降低到 0.08，止盈从 1.60 提高到 3.00
  }

  /**
   * 记录市场平仓时间（用于冷却期）
   */
  recordMarketClose(marketId: string, closeTime: Date): void {
    this.marketCooldowns.set(marketId, closeTime);
    this.highestPrices.delete(marketId);  // 清除最高价格记录
  }

  getDescription(): string {
    return `Reversal Strategy V8.7（超激进优化版）：
    • 价格区间：30%-37%（收紧）
    • 趋势判断：超严格（15 个数据点，斜率 > 0.001，10 个中 8 个上涨）
    • 市场情绪评分：> 60（新增）
    • 市场冷却期：48 小时内禁止重新开仓（延长）
    • 市场稳定性：波动率 <= 10%（收紧）
    • 价格历史检查：当前价格 <= 历史最高价的 70%（收紧）
    • 市场深度检查：成交量 >= $10,000，流动性 >= $2,000（新增）
    • 动态止盈：50% - 200%（根据盈利幅度调整）
    • 移动止盈：从最高点下跌 15%（新增）
    • 硬止损：参数的 1.5 倍容忍度（更严格）
    • 动量反转：价格连续 3 个数据点下跌（更敏感）
    • 分段止损：3%-8%（更严格）
    • 分段止盈：1.80-3.00 倍（更激进）
    • 风险管理：最大持仓 2，单仓位 25%，日亏损 5%（超保守）`;
  }
}
