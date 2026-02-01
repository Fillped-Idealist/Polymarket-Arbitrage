/**
 * Reversal 策略 V8.6（优化版）
 * 
 * 基于 V8.5 的深度分析和优化
 * 
 * 【核心改进】
 * 1. 添加趋势判断：只在上升趋势中开仓
 * 2. 防止重复开仓：同一市场 24 小时内禁止重新开仓
 * 3. 收紧入场价格区间：从 10%-40% 收紧到 25%-38%
 * 4. 放宽止损容忍度：硬止损从 1.2 倍提高到 2.0 倍
 * 5. 延长动量反转条件：从 2 个数据点延长到 5 个数据点
 * 6. 添加市场稳定性检查：波动率 <= 15%
 * 7. 添加价格历史检查：当前价格 <= 历史最高价的 80%
 * 
 * 【问题解决】
 * - 解决"入场后立即下跌"问题（趋势判断）
 * - 解决"重复开仓"问题（市场冷却期）
 * - 解决"入场价格过宽"问题（收紧价格区间）
 * - 解决"止损过于激进"问题（放宽止损容忍度）
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
 * 【核心策略】反转策略 (Reversal) V8.6 - 优化版
 * 
 * 基于 V8.5 的深度分析和优化
 */
export class ReversalStrategyV5 implements BacktestStrategy {
  type = BacktestStrategyType.REVERSAL;

  // 市场冷却期记录：市场ID -> 最近平仓时间
  private marketCooldowns = new Map<string, Date>();

  constructor(private engine?: any) {}

  shouldOpen(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    const strategyConfig = config.strategies.reversal;
    if (!strategyConfig.enabled) return false;

    if (!this.passesFilters(snapshot, config)) {
      return false;
    }

    // V8.6: 检查市场冷却期
    if (!this.passesMarketCooldown(snapshot.marketId, snapshot.timestamp)) {
      return false;
    }

    // V8.6: 时间过滤（保持不变）
    const hoursToEnd = (snapshot.endDate.getTime() - snapshot.timestamp.getTime()) / (1000 * 60 * 60);
    const daysToEnd = hoursToEnd / 24;
    if (daysToEnd < 1 || daysToEnd > 365) {
      return false;
    }

    // V8.6: 价格区间（收紧到 25%-38%）
    for (let i = 0; i < snapshot.outcomePrices.length; i++) {
      const price = snapshot.outcomePrices[i];

      if (price >= 0.25 && price <= 0.38) {  // 从 10%-40% 收紧到 25%-38%
        // V8.6: 趋势判断（新增）
        if (!this.passesTrendCheck(snapshot, i)) {
          continue;
        }

        // V8.6: 市场稳定性检查（新增）
        if (!this.passesStabilityCheck(snapshot, i)) {
          continue;
        }

        // V8.6: 价格历史检查（新增）
        if (!this.passesPriceHistoryCheck(snapshot, i)) {
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

    // V8.6: 市场归零风险控制（保持不变）
    if (currentPrice < 0.05) {
      return true;
    }

    // V8.6: 根据当前剩余时间获取策略参数
    const params = this.getParametersByTimeToEnd(hoursToEnd, daysToEnd);

    // V8.6: 分段止盈（保持不变）
    const takeProfitPrice = trade.entryPrice * params.takeProfitRatio;
    if (currentPrice >= takeProfitPrice) {
      return true;
    }

    // V8.6: 硬止损（放宽到 2.0 倍）
    const hardStopLossRatio = params.stopLoss * 2.0;  // 从 1.2 倍放宽到 2.0 倍
    const hardStopLossPrice = trade.entryPrice * (1 - hardStopLossRatio);
    if (currentPrice <= hardStopLossPrice) {
      return true;
    }

    // V8.6: 软止损（根据分段参数，保持不变）
    const stopLossPrice = trade.entryPrice * (1 - params.stopLoss);
    if (currentPrice <= stopLossPrice && hoursHeld >= 1) {
      return true;
    }

    // V8.6: 动量反转止损（延长到 5 个数据点）
    if (this.engine && hoursHeld >= 1 && profitPercent < -0.05) {
      const historicalPrices = this.engine.getHistoricalPrices(
        trade.marketId,
        currentTime,
        5,  // 从 5 个延长到 5 个（保持不变）
        trade.outcomeIndex
      );

      if (historicalPrices.length >= 5) {  // 从 3 延长到 5
        const last5Prices = historicalPrices.slice(-5);
        const isFalling = last5Prices[4] < last5Prices[3] && 
                         last5Prices[3] < last5Prices[2] && 
                         last5Prices[2] < last5Prices[1] && 
                         last5Prices[1] < last5Prices[0];
        if (isFalling && currentPrice < trade.entryPrice) {
          return true;
        }
      }
    }

    // V8.6: 分段最大持仓时间（根据分段参数，保持不变）
    if (hoursHeld >= params.maxHoldingHours) {
      return true;
    }

    // V8.6: 临近截止强制平仓（24 小时内，保持不变）
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

    // V8.6: 市场归零风险控制（保持不变）
    if (currentPrice < 0.05) {
      return '市场归零风险控制（价格 < 5%）';
    }

    // V8.6: 根据当前剩余时间获取策略参数
    const params = this.getParametersByTimeToEnd(hoursToEnd, daysToEnd);

    // V8.6: 分段止盈（保持不变）
    const takeProfitPrice = trade.entryPrice * params.takeProfitRatio;
    if (currentPrice >= takeProfitPrice) {
      return `止盈：价格达到${(currentPrice * 100).toFixed(2)}%（盈利${((params.takeProfitRatio - 1) * 100).toFixed(0)}%）`;
    }

    // V8.6: 硬止损（放宽到 2.0 倍）
    const hardStopLossRatio = params.stopLoss * 2.0;
    const hardStopLossPrice = trade.entryPrice * (1 - hardStopLossRatio);
    if (currentPrice <= hardStopLossPrice) {
      return `硬止损：价格跌至${(currentPrice * 100).toFixed(2)}%(${(hardStopLossRatio * 100).toFixed(0)}%硬止损）`;
    }

    // V8.6: 软止损（根据分段参数，保持不变）
    const stopLossPrice = trade.entryPrice * (1 - params.stopLoss);
    if (currentPrice <= stopLossPrice && hoursHeld >= 1) {
      return `止损：价格跌至${(currentPrice * 100).toFixed(2)}%(${(params.stopLoss * 100).toFixed(0)}%止损）`;
    }

    // V8.6: 动量反转止损（延长到 5 个数据点）
    if (this.engine && hoursHeld >= 1 && profitPercent < -0.05) {
      const historicalPrices = this.engine.getHistoricalPrices(
        trade.marketId,
        currentTime,
        5,
        trade.outcomeIndex
      );

      if (historicalPrices.length >= 5) {
        const last5Prices = historicalPrices.slice(-5);
        const isFalling = last5Prices[4] < last5Prices[3] && 
                         last5Prices[3] < last5Prices[2] && 
                         last5Prices[2] < last5Prices[1] && 
                         last5Prices[1] < last5Prices[0];
        if (isFalling && currentPrice < trade.entryPrice) {
          return '动量反转止损/价格暴跌';
        }
      }
    }

    // V8.6: 分段最大持仓时间（根据分段参数，保持不变）
    if (hoursHeld >= params.maxHoldingHours) {
      return `强制平仓：最大持仓时间${params.maxHoldingHours.toFixed(0)}小时`;
    }

    // V8.6: 临近截止强制平仓（24 小时内，保持不变）
    if (hoursToEnd <= 24) {
      return '临近截止强制平仓';
    }

    return '未知原因';
  }

  /**
   * V8.6: 市场冷却期检查（新增）
   * 防止在同一市场连续开仓
   */
  private passesMarketCooldown(marketId: string, currentTime: Date): boolean {
    const lastCloseTime = this.marketCooldowns.get(marketId);
    if (!lastCloseTime) {
      return true;
    }

    const hoursSinceClose = (currentTime.getTime() - lastCloseTime.getTime()) / (1000 * 60 * 60);
    return hoursSinceClose >= 24;  // 冷却期 24 小时
  }

  /**
   * V8.6: 趋势判断（新增）
   * 只在上升趋势中开仓
   */
  private passesTrendCheck(snapshot: BacktestMarketSnapshot, outcomeIndex: number): boolean {
    if (!this.engine) {
      return true;  // 如果没有 engine，跳过趋势检查
    }

    // 获取历史价格
    const historicalPrices = this.engine.getHistoricalPrices(
      snapshot.marketId,
      snapshot.timestamp,
      10,  // 最近 10 个数据点
      outcomeIndex
    );

    if (historicalPrices.length < 10) {
      return true;  // 数据不足，跳过检查
    }

    // 计算趋势斜率
    const slope = calculateTrendSlope(historicalPrices);
    return slope > 0;  // 只在上升趋势中开仓
  }

  /**
   * V8.6: 市场稳定性检查（新增）
   * 波动率 <= 15%
   */
  private passesStabilityCheck(snapshot: BacktestMarketSnapshot, outcomeIndex: number): boolean {
    if (!this.engine) {
      return true;  // 如果没有 engine，跳过稳定性检查
    }

    // 获取历史价格
    const historicalPrices = this.engine.getHistoricalPrices(
      snapshot.marketId,
      snapshot.timestamp,
      10,  // 最近 10 个数据点
      outcomeIndex
    );

    if (historicalPrices.length < 10) {
      return true;  // 数据不足，跳过检查
    }

    // 计算波动率
    const volatility = calculateVolatility(historicalPrices);
    return volatility <= 0.15;  // 波动率 <= 15%
  }

  /**
   * V8.6: 价格历史检查（新增）
   * 当前价格 <= 历史最高价的 80%
   */
  private passesPriceHistoryCheck(snapshot: BacktestMarketSnapshot, outcomeIndex: number): boolean {
    if (!this.engine) {
      return true;  // 如果没有 engine，跳过价格历史检查
    }

    // 获取历史价格
    const historicalPrices = this.engine.getHistoricalPrices(
      snapshot.marketId,
      snapshot.timestamp,
      20,  // 最近 20 个数据点
      outcomeIndex
    );

    if (historicalPrices.length < 20) {
      return true;  // 数据不足，跳过检查
    }

    const currentPrice = snapshot.outcomePrices[outcomeIndex];
    const highestPrice = Math.max(...historicalPrices);
    const pricePosition = currentPrice / highestPrice;

    return pricePosition <= 0.80;  // 当前价格 <= 历史最高价的 80%
  }

  private passesFilters(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    // V8.6: 流动性检查（保持不变）
    if (snapshot.liquidity && snapshot.liquidity < 1000) {
      return false;
    }

    if (!snapshot.volume24h || snapshot.volume24h < 5000) {
      return false;
    }

    if (snapshot.liquidity && snapshot.volume24h) {
      const ratio = snapshot.liquidity / snapshot.volume24h;
      if (ratio < 0.01) {
        return false;
      }
    }

    return true;
  }

  /**
   * V8.6: 根据剩余时间获取策略参数（更新分段参数）
   */
  private getParametersByTimeToEnd(hoursToEnd: number, daysToEnd: number) {
    // V8.6: 分段参数（更新止损）
    // 超短期（0-12 小时）
    if (hoursToEnd <= 12) {
      return { stopLoss: 0.04, takeProfitRatio: 1.25, maxHoldingHours: 12 };  // 从 0.02 提高到 0.04
    }

    // 临期（0.5-3 天）
    if (daysToEnd <= 3) {
      return { stopLoss: 0.06, takeProfitRatio: 1.30, maxHoldingHours: 48 };  // 从 0.03 提高到 0.06
    }

    // 短期（3-7 天）
    if (daysToEnd <= 7) {
      return { stopLoss: 0.08, takeProfitRatio: 1.40, maxHoldingHours: 96 };  // 从 0.04 提高到 0.08
    }

    // 中期（7-30 天）
    if (daysToEnd <= 30) {
      return { stopLoss: 0.10, takeProfitRatio: 1.50, maxHoldingHours: 168 };  // 从 0.06 提高到 0.10
    }

    // 长期（30+ 天）
    return { stopLoss: 0.12, takeProfitRatio: 1.60, maxHoldingHours: 336 };  // 从 0.08 提高到 0.12
  }

  /**
   * 记录市场平仓时间（用于冷却期）
   */
  recordMarketClose(marketId: string, closeTime: Date): void {
    this.marketCooldowns.set(marketId, closeTime);
  }

  getDescription(): string {
    return `Reversal Strategy V8.6（优化版）：
    • 价格区间：25%-38%（收紧）
    • 趋势判断：只在上升趋势中开仓
    • 市场冷却期：24 小时内禁止重新开仓
    • 市场稳定性：波动率 <= 15%
    • 价格历史检查：当前价格 <= 历史最高价的 80%
    • 硬止损：参数的 2.0 倍容忍度（放宽）
    • 动量反转：价格连续 5 个数据点下跌（延长）
    • 分段止损：4%-12%（提高）`;
  }
}
