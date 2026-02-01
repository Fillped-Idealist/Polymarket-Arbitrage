/**
 * Polymarket 套利策略系统 V4.0（重构版）
 *
 * 【设计理念 - 多学科视角】
 *
 * 1. 量化工程师视角：
 *    - Polymarket是二元市场，最终价格会收敛到0或1
 *    - 理论最大收益：低价格入场（0.05→1）= 1900%，高价格入场（0.95→1）= 5%
 *    - 风险收益比：低价格市场盈亏比高（盈亏比可达20:1），高价格市场盈亏比低（1:19）
 *    - 动态仓位：根据价格区间调整仓位大小，低价格高仓位，高价格低仓位
 *
 * 2. 金融研究员视角：
 *    - Polymarket定价基于市场对事件结果的认知
 *    - 当信息不对称或市场认知偏差时，会出现定价错误
 *    - 随着事件进展，市场信息越来越充分，价格逐渐反映真实概率
 *    - 低价格（<0.20）市场通常代表小概率事件，波动性极大，但也可能代表被市场忽视的"黑天鹅"
 *    - 高价格（>0.80）市场通常代表大概率事件，波动性较小，但可能被过度定价
 *
 * 3. 数学家视角：
 *    - 二元市场的价格收敛过程：P(t) → 0或1
 *    - 如果赌对，价格从p到1，收益 = (1-p)/p
 *    - 如果赌错，价格从p到0，损失 = p
 *    - 期望收益 = (1-p)/p * Prob(赌对) - p * Prob(赌错)
 *    - 要期望收益 > 0，需要 Prob(赌对) > p²
 *    - 例如：p=0.05时，只要Prob(赌对) > 0.25%，期望收益就为正
 *
 * 4. 统计学家视角：
 *    - 低价格市场的波动性远高于高价格市场
 *    - 止损应该设置为绝对价格（如入场价-50%），而不是百分比
 *    - 需要更严格的风控：低价格市场高风险高回报，需要更高的胜率要求
 *    - 止盈应该分阶段：0.90→0.95→0.99，而不是一次到0.999
 *
 * 【策略定位（V4.0）】
 * - Reversal：主力策略，捕捉概率反转，动态止盈止损
 * - Convergence：填补策略，捕捉概率收敛，低风险稳健收益
 * - Trend和Mean：仅作为辅助筛选，增强信号质量，不独立开仓
 *
 * 【止盈止损重构（重点）】
 * - Reversal策略：
 *   - 止盈：分阶段止盈（0.90→0.95→0.99）
 *   - 止损：基于价格区间的动态止损（低价格市场：入场价-30%，高价格市场：入场价-10%）
 *   - 移动止损：使用ATR（平均真实波幅）计算移动止损，让利润奔跑
 *
 * - Convergence策略：
 *   - 止盈：0.95（保守）或0.99（激进）
 *   - 止损：入场价-10%（更严格，因为盈利空间小）
 *   - 移动止损：锁定利润
 */

import {
  BacktestStrategy,
  BacktestStrategyType,
  BacktestMarketSnapshot,
  BacktestConfig,
  BacktestTrade,
} from './types';

// 导入 V6 策略（Reversal V8.7）、V7 策略（Reversal V8.8）、V8 策略（Reversal V8.9）
// 使用动态导入以避免循环依赖问题
import { ReversalStrategyV6 } from './strategies-v6';
import { ReversalStrategyV8 } from './strategies-v7';
import { ReversalStrategyV9 } from './strategies-v8';

// ==================== 辅助函数 ====================

/**
 * 计算RSI（相对强弱指标）
 * 用于判断市场超买超卖状态
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
 * 计算ATR（平均真实波幅）
 * 用于动态止盈止损
 */
function calculateATR(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 0;

  let trSum = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const high = prices[i];
    const low = prices[i];
    const prevClose = prices[i - 1];

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSum += tr;
  }

  return trSum / period;
}

/**
 * 计算动量
 * 用于判断价格趋势
 */
function calculateMomentum(prices: number[], period: number = 10): number {
  if (prices.length < period + 1) return 0;
  return prices[prices.length - 1] - prices[prices.length - 1 - period];
}

/**
 * 计算布林带
 * 用于判断价格偏离度
 */
function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): {
  upper: number;
  middle: number;
  lower: number;
} {
  if (prices.length < period) {
    const currentPrice = prices[prices.length - 1];
    return { upper: currentPrice * 1.1, middle: currentPrice, lower: currentPrice * 0.9 };
  }

  const recentPrices = prices.slice(-period);
  const sma = recentPrices.reduce((a, b) => a + b, 0) / period;
  const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  const std = Math.sqrt(variance);

  return {
    upper: sma + stdDev * std,
    middle: sma,
    lower: sma - stdDev * std,
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
  isOverbought: boolean;
  isOversold: boolean;
  trendStrength: number;
} {
  if (prices.length < 14) {
    return { score: 0, confidence: 0, isOverbought: false, isOversold: false, trendStrength: 0 };
  }

  const rsi = calculateRSI(prices, 14);
  const momentum = calculateMomentum(prices, 10);
  const bb = calculateBollingerBands(prices, 20, 2);
  const currentPrice = prices[prices.length - 1];

  // RSI得分：超卖（RSI<30）买入信号，超买（RSI>70）卖出信号
  const rsiScore = rsi < 30 ? (30 - rsi) * 2 : rsi > 70 ? -(rsi - 70) * 2 : 0;

  // 动量得分：正动量看多，负动量看空
  const momentumScore = momentum * 100;

  // 布林带得分：价格接近下轨买入，接近上轨卖出
  const bbPercent = (currentPrice - bb.lower) / (bb.upper - bb.lower);
  const bbScore = (0.5 - bbPercent) * 50;

  // 综合得分
  const score = rsiScore + momentumScore + bbScore;

  // 置信度：基于价格波动性和数据长度
  const confidence = Math.min(1, prices.length / 30);

  return {
    score,
    confidence,
    isOverbought: rsi > 70 || bbPercent > 0.9,
    isOversold: rsi < 30 || bbPercent < 0.1,
    trendStrength: Math.abs(momentum),
  };
}

/**
 * 趋势分析（辅助函数）
 * 用于判断价格趋势方向和强度
 */
function analyzeTrend(prices: number[]): {
  direction: 'up' | 'down' | 'sideways';
  strength: number;
  isStrong: boolean;
} {
  if (prices.length < 10) {
    return { direction: 'sideways', strength: 0, isStrong: false };
  }

  const recentPrices = prices.slice(-10);
  const firstPrice = recentPrices[0];
  const lastPrice = recentPrices[recentPrices.length - 1];
  const change = (lastPrice - firstPrice) / firstPrice;

  let upCount = 0;
  let downCount = 0;
  for (let i = 1; i < recentPrices.length; i++) {
    if (recentPrices[i] > recentPrices[i - 1]) upCount++;
    else if (recentPrices[i] < recentPrices[i - 1]) downCount++;
  }

  const direction = upCount > downCount * 1.5 ? 'up' : downCount > upCount * 1.5 ? 'down' : 'sideways';
  const strength = Math.abs(change) * 100;
  const isStrong = strength > 10 && (direction === 'up' || direction === 'down');

  return { direction, strength, isStrong };
}

/**
 * 均值回归分析（辅助函数）
 * 用于判断价格是否偏离均值
 */
function analyzeMeanReversion(prices: number[]): {
  shouldRevert: boolean;
  deviation: number;
  expectedReversion: number;
} {
  if (prices.length < 20) {
    return { shouldRevert: false, deviation: 0, expectedReversion: 0 };
  }

  const recentPrices = prices.slice(-20);
  const mean = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const currentPrice = prices[prices.length - 1];
  const deviation = (currentPrice - mean) / mean;

  // 如果价格偏离均值超过2个标准差，预期会回归
  const std = Math.sqrt(recentPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / recentPrices.length);
  const shouldRevert = Math.abs(deviation) > 2;
  const expectedReversion = mean - currentPrice;

  return { shouldRevert, deviation, expectedReversion };
}

// ==================== 策略实现 ====================

/**
 * 【核心策略】反转套利策略 (Reversal) V8.3 - 波动性过滤版
 *
 * 核心思想：简化价格反转逻辑 + 超短期分段检测 + 波动性过滤
 *
 * V8.3 改进（基于 V8.2 回测结果）：
 * - 添加波动性过滤：避免在极端波动的市场开仓
 * - 添加历史价格变化检查：最近 10 个数据点的价格变化幅度不能超过 30%
 * - 添加趋势一致性检查：最近 5 个数据点的趋势要一致（避免价格剧烈波动时开仓）
 * - 添加极端波动止损：如果价格变化超过 50%，立即止损
 * - 保持 V8.2 的超短期分段逻辑
 *
 * 策略逻辑：
 * 1. 检查价格是否在 5%-40% 区间
 * 2. 检查波动性是否在合理范围（过滤极端波动）
 * 3. 根据剩余时间确定分段参数
 * 4. 开仓，使用分段参数进行止盈止损
 *
 * 风险控制（分段）：
 * - 超短期（0-12 小时）：止损 2%，止盈 25%，最大持仓 12 小时
 * - 临期（0.5-3 天）：止损 3%，止盈 30%，最大持仓 2 天
 * - 短期（3-7 天）：止损 4%，止盈 40%，最大持仓 4 天
 * - 中期（7-30 天）：止损 6%，止盈 50%，最大持仓 7 天
 * - 长期（30+ 天）：止损 8%，止盈 60%，最大持仓 14 天
 *
 * 波动性过滤：
 * - 最近 10 个数据点的价格变化幅度 < 30%
 * - 最近 5 个数据点的价格变化率 < 10%/小时
 * - 极端波动保护：价格变化 > 50% 时立即平仓
 */
export class ReversalStrategyV4 implements BacktestStrategy {
  type = BacktestStrategyType.REVERSAL;

  constructor(private engine?: any) {}

  /**
   * 根据剩余时间获取策略参数（支持小时级别分段）
   */
  private getParametersByTimeToEnd(
    hoursToEnd: number,
    daysToEnd: number
  ): {
    stopLoss: number;
    takeProfitRatio: number;  // 止盈倍数（如 1.30 表示 30% 止盈）
    maxHoldingHours: number;  // 最大持仓小时数
  } {
    // V8.2: 超短期分段（0-12 小时）
    if (hoursToEnd <= 12) {
      return {
        stopLoss: 0.02,      // 2% 止损（极低）
        takeProfitRatio: 1.25,  // 25% 止盈
        maxHoldingHours: 12, // 最大持仓 12 小时
      };
    } else if (daysToEnd <= 3) {
      // 临期（0.5-3 天）：极快速交易
      return {
        stopLoss: 0.03,      // 3% 止损（更低）
        takeProfitRatio: 1.30,  // 30% 止盈（更高）
        maxHoldingHours: 48,  // 最大持仓 48 小时（2 天）
      };
    } else if (daysToEnd <= 7) {
      // 短期（3-7 天）：快速交易
      return {
        stopLoss: 0.04,      // 4% 止损
        takeProfitRatio: 1.40,  // 40% 止盈
        maxHoldingHours: 96,  // 最大持仓 96 小时（4 天）
      };
    } else if (daysToEnd <= 30) {
      // 中期（7-30 天）：标准交易
      return {
        stopLoss: 0.06,      // 6% 止损
        takeProfitRatio: 1.50,  // 50% 止盈
        maxHoldingHours: 168,  // 最大持仓 168 小时（7 天）
      };
    } else {
      // 长期（30+ 天）：保守交易
      return {
        stopLoss: 0.08,      // 8% 止损
        takeProfitRatio: 1.60,  // 60% 止盈
        maxHoldingHours: 336, // 最大持仓 336 小时（14 天）
      };
    }
  }

  shouldOpen(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    const strategyConfig = config.strategies.reversal;
    if (!strategyConfig.enabled) return false;

    if (!this.passesFilters(snapshot, config)) {
      return false;
    }

    // V8.3: 移除时间限制（允许任何时间范围）
    const daysToEnd = (snapshot.endDate.getTime() - snapshot.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    const hoursToEnd = daysToEnd * 24;
    
    // V8.3: 根据剩余时间获取策略参数（用于记录，不影响开仓）
    const params = this.getParametersByTimeToEnd(hoursToEnd, daysToEnd);

    // V8.3: 价格区间（5%-40%）
    for (let i = 0; i < snapshot.outcomePrices.length; i++) {
      const price = snapshot.outcomePrices[i];

      // V8.4: 价格过低过滤（避免在价格 < 10% 时开仓，防止市场归零风险）
      if (price < 0.10) {
        continue;
      }

      if (price >= 0.10 && price <= 0.40) {
        // V8.3: 添加波动性过滤
        if (!this.passesVolatilityCheck(snapshot, i)) {
          return false;
        }

        return true;
      }
    }

    return false;
  }

  /**
   * V8.3: 波动性检查
   * 避免在极端波动的市场开仓
   */
  private passesVolatilityCheck(snapshot: BacktestMarketSnapshot, outcomeIndex: number): boolean {
    if (!this.engine) {
      return true;  // 如果没有 engine，跳过波动性检查
    }

    // 获取历史价格
    const historicalPrices = this.engine.getHistoricalPrices(
      snapshot.marketId,
      snapshot.timestamp,
      10,  // 最近 10 个数据点
      outcomeIndex
    );

    if (historicalPrices.length < 5) {
      return true;  // 数据不足，跳过检查
    }

    // V8.3: 检查 1：最近 10 个数据点的价格变化幅度不能超过 30%
    const recent10Prices = historicalPrices.slice(-10);
    const minPrice = Math.min(...recent10Prices);
    const maxPrice = Math.max(...recent10Prices);
    const priceRange = (maxPrice - minPrice) / minPrice;  // 价格变化幅度

    if (priceRange > 0.30) {  // 价格变化幅度超过 30%
      return false;
    }

    // V8.3: 检查 2：最近 5 个数据点的价格变化率不能超过 10%/小时
    const recent5Prices = historicalPrices.slice(-5);
    const firstPrice = recent5Prices[0];
    const lastPrice = recent5Prices[recent5Prices.length - 1];
    const priceChange = Math.abs((lastPrice - firstPrice) / firstPrice);  // 价格变化率

    // 假设最近 5 个数据点代表约 2 小时的时间范围
    // 如果价格变化率超过 10%，说明波动过于剧烈
    if (priceChange > 0.10) {
      return false;
    }

    return true;
  }

  shouldClose(trade: BacktestTrade, currentPrice: number, currentTime: Date, config: BacktestConfig): boolean {
    const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);
    const daysHeld = hoursHeld / 24;
    const hoursToEnd = (trade.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    const daysToEnd = hoursToEnd / 24;
    const profitPercent = (currentPrice - trade.entryPrice) / trade.entryPrice;

    // V8.3: 市场归零风险控制（价格 < 5% 立即平仓）
    if (currentPrice < 0.05) {
      return true;
    }

    // V8.3: 根据当前剩余时间获取策略参数（动态调整）
    const params = this.getParametersByTimeToEnd(hoursToEnd, daysToEnd);

    // V8.3: 最小持仓时间（超短期可以更短）
    if (hoursToEnd <= 12 && profitPercent > 0) {
      // 超短期：没有最小持仓时间限制
    } else if (daysHeld < 1 && profitPercent > 0) {
      return false;  // 持仓 < 1 天，即使盈利也不平仓
    }

    // V8.3: 分段止盈（根据分段参数）
    const takeProfitPrice = trade.entryPrice * params.takeProfitRatio;
    const profitPercentTarget = (params.takeProfitRatio - 1) * 100;
    if (currentPrice >= takeProfitPrice && profitPercent >= profitPercentTarget / 100) {
      return true;
    }

    // V8.4: 硬止损（严格限制亏损，减少容忍度从 1.5 倍改为 1.2 倍）
    const hardStopLossRatio = params.stopLoss * 1.2; // 减少 50% 容忍度
    const hardStopLossPrice = trade.entryPrice * (1 - hardStopLossRatio);
    if (currentPrice <= hardStopLossPrice) {
      return true;
    }

    // V8.3: 软止损（根据分段参数）
    const stopLossPrice = trade.entryPrice * (1 - params.stopLoss);
    if (currentPrice <= stopLossPrice) {
      // 检查是否达到最小持仓时间
      if (hoursHeld >= 1) {
        return true;
      }
    }

    // V8.4: 价格暴跌检测（短时间内跌幅 > 20%，立即止损）
    if (this.engine && hoursHeld >= 1 && profitPercent < -0.05) {
      const historicalPrices = this.engine.getHistoricalPrices(
        trade.marketId,
        currentTime,
        10,
        trade.outcomeIndex
      );

      if (historicalPrices.length >= 3) {
        const recentPrices = historicalPrices.slice(-3);
        const priceDropRatio = (recentPrices[0] - recentPrices[2]) / recentPrices[0];
        if (priceDropRatio > 0.20) {  // 短时间内跌幅 > 20%
          return true;
        }
      }
    }

    // V8.3: 如果价格跌破近期最低点且亏损 > 5%，立即止损
    if (this.engine && hoursHeld >= 1 && profitPercent < -0.05) {
      const historicalPrices = this.engine.getHistoricalPrices(
        trade.marketId,
        currentTime,
        10,
        trade.outcomeIndex
      );

      if (historicalPrices.length >= 5) {
        const lowestPrice = Math.min(...historicalPrices);
        if (currentPrice <= lowestPrice * 1.01) {  // 价格接近近期最低点
          return true;
        }
      }
    }

    // V8.3: 动量反转止损（如果价格连续下跌 2 个数据点且亏损 > 5%，立即止损）
    if (this.engine && hoursHeld >= 1 && profitPercent < -0.05) {
      const historicalPrices = this.engine.getHistoricalPrices(
        trade.marketId,
        currentTime,
        5,
        trade.outcomeIndex
      );

      if (historicalPrices.length >= 3) {
        const last3Prices = historicalPrices.slice(-3);
        const isFalling = last3Prices[2] < last3Prices[1] && last3Prices[1] < last3Prices[0];
        if (isFalling && currentPrice < trade.entryPrice) {
          return true;
        }
      }
    }

    // V8.3: 分段最大持仓时间（根据分段参数）
    if (hoursHeld >= params.maxHoldingHours) {
      return true;
    }

    // 临近截止强制平仓（24 小时内）
    if (hoursToEnd <= 24) {
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

    // V8.3: 市场归零风险控制
    if (currentPrice < 0.05) {
      return '市场归零风险控制（价格 < 5%）';
    }

    // V8.3: 根据当前剩余时间获取策略参数
    const params = this.getParametersByTimeToEnd(hoursToEnd, daysToEnd);

    // V8.3: 分段止盈
    const takeProfitPrice = trade.entryPrice * params.takeProfitRatio;
    const profitPercentTarget = (params.takeProfitRatio - 1) * 100;
    if (currentPrice >= takeProfitPrice && profitPercent >= profitPercentTarget / 100) {
      return `止盈：价格达到${(currentPrice*100).toFixed(2)}%（盈利${(profitPercent * 100).toFixed(0)}%）`;
    }

    // V8.4: 硬止损（减少容忍度）
    const hardStopLossRatio = params.stopLoss * 1.2;
    const hardStopLossPrice = trade.entryPrice * (1 - hardStopLossRatio);
    if (currentPrice <= hardStopLossPrice) {
      return `硬止损：价格跌至${(currentPrice * 100).toFixed(1)}%（${(hardStopLossRatio * 100).toFixed(0)}%硬止损）`;
    }

    // V8.3: 软止损
    const stopLossPrice = trade.entryPrice * (1 - params.stopLoss);
    if (currentPrice <= stopLossPrice) {
      return `止损：价格跌至${(currentPrice * 100).toFixed(1)}%（${(params.stopLoss * 100).toFixed(0)}%止损）`;
    }

    // V8.3: 分段最大持仓时间
    if (hoursHeld >= params.maxHoldingHours) {
      const maxHoldingDays = (params.maxHoldingHours / 24).toFixed(1);
      return `强制平仓：最大持仓时间${maxHoldingDays}天`;
    }

    if (hoursToEnd <= 24) {
      return '临近截止强制平仓';
    }

    return '动量反转止损/价格暴跌';
  }

  /**
   * V8.4: 增强的流动性检查
   * 确保市场有足够的流动性和交易活跃度
   */
  private passesFilters(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    // V8.4: 基础流动性检查
    if (snapshot.liquidity && snapshot.liquidity < 1000) {
      return false;
    }

    // V8.4: 24小时成交量检查
    if (!snapshot.volume24h || snapshot.volume24h < 5000) {
      return false;
    }

    // V8.4: 流动性与成交量的比率检查（避免流动性过低但成交量高的情况）
    if (snapshot.liquidity && snapshot.volume24h) {
      const liquidityToVolumeRatio = snapshot.liquidity / snapshot.volume24h;
      if (liquidityToVolumeRatio < 0.01) {  // 流动性占成交量比例过低（< 1%）
        return false;
      }
    }

    // V8.4: 价格稳定性检查（避免流动性突然暴跌）
    if (this.engine && snapshot.liquidity) {
      const historicalLiquidity = this.engine.getHistoricalLiquidity(
        snapshot.marketId,
        snapshot.timestamp,
        5  // 最近 5 个数据点
      );

      if (historicalLiquidity.length >= 3) {
        const recentLiquidity = historicalLiquidity.slice(-3);
        const avgLiquidity = recentLiquidity.reduce((sum: number, val: number) => sum + val, 0) / recentLiquidity.length;
        const liquidityDropRatio = (avgLiquidity - snapshot.liquidity) / avgLiquidity;

        if (liquidityDropRatio > 0.50) {  // 流动性下降超过 50%
          return false;
        }
      }
    }

    return true;
  }

  toString(): string {
    return `ReversalStrategy(v8.4-流动性增强版)
分段逻辑（根据剩余时间动态调整）：
  • 超短期（0-12 小时）：止损2%，止盈25%，最大持仓12小时
  • 临期（0.5-3 天）：止损3%，止盈30%，最大持仓2天
  • 短期（3-7 天）：止损4%，止盈40%，最大持仓4天
  • 中期（7-30 天）：止损6%，止盈50%，最大持仓7天
  • 长期（30+ 天）：止损8%，止盈60%，最大持仓14天

入场条件：
  • 价格区间：10%-40%（V8.4 提高下限）
  • 时间范围：不限制（移除时间限制）
  • 流动性检查：>= $1,000
  • 24小时成交量：>= $5,000
  • 流动性与成交量比率：>= 1%
  • 流动性稳定性：最近3个数据点流动性下降不超过 50%
  • 波动性过滤：最近10个数据点价格变化 < 30%
  • 价格波动率：最近5个数据点价格变化率 < 10%/小时

出场条件：
  • 市场归零风险控制：价格 < 5% 立即平仓（V8.4 新增）
  • 止盈：根据分段参数动态调整（25%-60%）
  • 硬止损：参数的 1.2 倍容忍度（V8.4 降低容忍度）
  • 软止损：根据分段参数动态调整（2%-8%）
  • 价格暴跌检测：短时间内跌幅 > 20%（V8.4 新增）
  • 动量反转：价格连续2个数据点下跌且低于入场价
  • 最大持仓：根据分段参数动态调整（12小时-14天）
  • 临近截止：距到期24小时内强制平仓`;
  }
}

/**
 * 【核心策略】收敛套利策略 (Convergence) V5.3 - 保守版
 *
 * 核心思想：填补空余仓位，捕捉概率收敛，专注于高概率事件
 *
 * V5.3 改进（保守版）：
 * 1. 更严格的开仓条件：
 *    - 价格区间：85%-98%（更窄，只选择极大概率事件）
 *    - 时间范围：6-48 小时（更短，减少持仓时间）
 *    - 信号强度：>= 15（更严格）
 * 2. 更严格的风险控制：
 *    - 止损：入场价-5%（更严格）
 *    - 最大持仓时间：24 小时（强制平仓）
 *    - 避免在价格跌破入场价时继续持仓
 * 3. 更保守的止盈：
 *    - 价格达到 98% 即止盈（保守）
 *    - 分阶段止盈：95% -> 97% -> 98%
 * 4. 趋势确认：只在上升趋势中开仓
 */
export class ConvergenceStrategyV4 implements BacktestStrategy {
  type = BacktestStrategyType.CONVERGENCE;

  constructor(private engine?: any) {}

  shouldOpen(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    const strategyConfig = config.strategies.convergence;
    if (!strategyConfig.enabled) return false;

    if (!this.passesFilters(snapshot, config)) {
      return false;
    }

    // V5.3: 时间过滤（更窄的范围）
    const hoursToEnd = (snapshot.endDate.getTime() - snapshot.timestamp.getTime()) / (1000 * 60 * 60);
    if (hoursToEnd < 6 || hoursToEnd > 48) {  // 从 12-72 小时调整为 6-48 小时
      return false;
    }

    // V5.3: 价格区间（更宽的范围）
    // 80%-98% 区间，选择高概率事件
    for (let i = 0; i < snapshot.outcomePrices.length; i++) {
      const price = snapshot.outcomePrices[i];

      if (price >= 0.80 && price <= 0.98) {  // 从 85%-98% 放宽到 80%-98%
        // V5.3: 增强开仓信号筛选
        if (this.engine) {
          const historicalPrices = this.engine.getHistoricalPrices(
            snapshot.marketId,
            snapshot.timestamp,
            20
          );

          if (historicalPrices.length >= 10) {  // 从 15 降低到 10
            const sentiment = calculateMarketSentimentScore(historicalPrices);
            const trend = analyzeTrend(historicalPrices);

            // V5.3: 只要满足以下任一条件即可开仓：
            // 1. 趋势向上 + 波动性低
            // 2. 超买 + 波动性低
            const recentPrices = historicalPrices.slice(-10);
            const meanPrice = recentPrices.reduce((a: number, b: number) => a + b, 0) / recentPrices.length;
            const variance = recentPrices.reduce((sum: number, p: number) => sum + Math.pow(p - meanPrice, 2), 0) / recentPrices.length;
            const volatility = Math.sqrt(variance) / meanPrice;

            // 条件1：上升趋势 + 低波动性
            if (trend.direction === 'up' && volatility < 0.04) {  // 从 0.03 放宽到 0.04
              // 检查是否接近近期高点
              const highestPrice = Math.max(...historicalPrices.slice(-5));
              const nearHigh = price >= highestPrice * 0.90;  // 从 0.95 放宽到 0.90

              if (nearHigh) {
                return true;
              }
            }

            // 条件2：超买且稳定
            if (sentiment.isOverbought && volatility < 0.03) {
              return true;
            }
          }
        }

        // 默认情况：如果价格 > 90%，也可以开仓
        if (price >= 0.90) {
          return true;
        }
      }
    }

    return false;
  }

  shouldClose(trade: BacktestTrade, currentPrice: number, currentTime: Date, config: BacktestConfig): boolean {
    const hoursToEnd = (trade.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);

    // V5.3: 更严格的止损（入场价-5%）
    const stopLossPrice = trade.entryPrice * 0.95;
    if (currentPrice <= stopLossPrice) {
      return true;
    }

    // V5.3: 如果价格跌破入场价，且距离开仓超过 6 小时，平仓
    if (currentPrice <= trade.entryPrice && hoursHeld > 6) {
      return true;
    }

    // V5.3: 分阶段止盈（更保守）
    if (currentPrice >= 0.985) {
      return true;  // 价格接近确定，立即平仓
    }

    if (hoursToEnd <= 12 && currentPrice >= 0.97) {
      return true;  // 临近截止，价格达到 97%
    }

    if (hoursToEnd <= 24 && currentPrice >= 0.96) {
      return true;  // 24小时内，价格达到 96%
    }

    if (hoursToEnd <= 48 && currentPrice >= 0.95) {
      return true;  // 48小时内，价格达到 95%
    }

    // V5.3: 最大持仓时间 24 小时（强制平仓）
    if (hoursHeld >= 24) {
      return true;
    }

    // 临近截止强制平仓
    if (hoursToEnd <= 4) {
      return true;
    }

    return false;
  }

  getExitReason(trade: BacktestTrade, currentPrice: number, currentTime: Date): string {
    const hoursToEnd = (trade.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);

    // V5.3: 分阶段止盈（更保守）
    if (currentPrice >= 0.985) {
      return '止盈：价格收敛至98.5%+';
    }

    if (hoursToEnd <= 12 && currentPrice >= 0.97) {
      return '止盈：价格达到97%（临近截止）';
    }

    if (hoursToEnd <= 24 && currentPrice >= 0.96) {
      return '止盈：价格达到96%（24小时内）';
    }

    if (hoursToEnd <= 48 && currentPrice >= 0.95) {
      return '止盈：价格达到95%（48小时内）';
    }

    // V5.3: 更严格的止损（入场价-5%）
    const stopLossPrice = trade.entryPrice * 0.95;
    if (currentPrice <= stopLossPrice) {
      return '止损：价格跌至95%入场价';
    }

    // V5.3: 价格跌破入场价，且持仓超过 6 小时
    if (currentPrice <= trade.entryPrice && hoursHeld > 6) {
      return '止损：价格跌破入场价（6小时）';
    }

    // V5.3: 最大持仓时间 24 小时
    if (hoursHeld >= 24) {
      return '强制平仓：最大持仓时间24小时';
    }

    return '临近截止强制平仓';
  }

  private passesFilters(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    if (snapshot.liquidity && snapshot.liquidity < 1000) {
      return false;
    }

    if (!snapshot.volume24h || snapshot.volume24h < 5000) {
      return false;
    }

    return true;
  }
}

// ==================== 辅助策略（不独立开仓，仅用于筛选）====================

/**
 * 趋势跟随策略（V4.0：仅用于辅助筛选）
 * 不独立开仓，而是用于增强Reversal和Convergence的信号质量
 */
export class TrendFollowingStrategyV4 implements BacktestStrategy {
  type = BacktestStrategyType.TREND_FOLLOWING;

  constructor(private engine?: any) {}

  shouldOpen(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    // V4.0：不独立开仓
    return false;
  }

  shouldClose(trade: BacktestTrade, currentPrice: number, currentTime: Date, config: BacktestConfig): boolean {
    return false;
  }

  getExitReason(): string {
    return '';
  }
}

/**
 * 均值回归策略（V4.0：仅用于辅助筛选）
 * 不独立开仓，而是用于增强Reversal和Convergence的信号质量
 */
export class MeanReversionStrategyV4 implements BacktestStrategy {
  type = BacktestStrategyType.MEAN_REVERSION;

  constructor(private engine?: any) {}

  shouldOpen(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    // V4.0：不独立开仓
    return false;
  }

  shouldClose(trade: BacktestTrade, currentPrice: number, currentTime: Date, config: BacktestConfig): boolean {
    return false;
  }

  getExitReason(): string {
    return '';
  }
}

// ==================== 策略工厂 ====================

export class StrategyFactory {
  static getStrategy(type: BacktestStrategyType, engine?: any, version?: string): BacktestStrategy {
    return StrategyFactory.createStrategy(type, engine, version);
  }

  static createStrategy(type: BacktestStrategyType, engine?: any, version?: string): BacktestStrategy {
    switch (type) {
      case BacktestStrategyType.ARBITRAGE:
        // Arbitrage策略已禁用
        return new class implements BacktestStrategy {
          type = BacktestStrategyType.ARBITRAGE;
          shouldOpen() { return false; }
          shouldClose() { return false; }
          getExitReason() { return '禁用'; }
        }();
      case BacktestStrategyType.REVERSAL:
        // 根据版本选择策略（v6 对应 Reversal V8.7，v7 对应 Reversal V8.8，v8/v8.x 对应 Reversal V8.9）
        if (version?.startsWith('v8') && ReversalStrategyV9) {
          return new ReversalStrategyV9(engine);
        } else if (version?.startsWith('v8')) {
          console.warn('警告：V8 策略未正确加载，使用 V4 策略代替');
        } else if (version?.startsWith('v7') && ReversalStrategyV8) {
          return new ReversalStrategyV8(engine);
        } else if (version?.startsWith('v7')) {
          console.warn('警告：V7 策略未正确加载，使用 V4 策略代替');
        } else if (version?.startsWith('v6') && ReversalStrategyV6) {
          return new ReversalStrategyV6(engine);
        } else if (version?.startsWith('v6')) {
          console.warn('警告：V6 策略未正确加载，使用 V4 策略代替');
        }
        return new ReversalStrategyV4(engine);
      case BacktestStrategyType.CONVERGENCE:
        return new ConvergenceStrategyV4(engine);
      case BacktestStrategyType.TREND_FOLLOWING:
        return new TrendFollowingStrategyV4(engine);
      case BacktestStrategyType.MEAN_REVERSION:
        return new MeanReversionStrategyV4(engine);
      default:
        throw new Error(`Unknown strategy type: ${type}`);
    }
  }
}
