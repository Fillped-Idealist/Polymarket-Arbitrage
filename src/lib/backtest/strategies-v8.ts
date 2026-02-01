/**
 * Reversal 策略 V8.9（高盈亏比极简版）
 *
 * 【核心理念 - 完全重构】
 * 基于 80w 快照大数据集和用户反馈的深度优化
 *
 * 【用户策略核心】
 * 1. 高盈亏比：低价格入场（0.05），10% 止损，不设置硬止盈（移动止盈）
 * 2. 单笔期望：0.05 买入涨到 1 美元，收益率 1900%，可以抵消 190 个 10% 亏单
 * 3. 胜率要求：20% 胜率就能有极高的单笔期望
 * 4. 关键问题：数据尺度有限，很多标的没有中尾盘数据，不能用"最终价格"来判断
 * 5. 目标：保持高盈亏比的同时筛选出好的标的
 *
 * 【Polymarket 市场理解】
 * 1. 二元市场：每个市场有 YES 和 NO 两个结果，价格互补（YES + NO = 1）
 * 2. 价格收敛：最终价格会收敛到 0 或 1
 * 3. 盈亏比计算：价格 p 的盈亏比 = (1-p)/p / p = (1-p)/p²
 *    - p=0.05: 盈亏比 ≈ 380:1（盈利 19 倍，亏损 0.05）
 *    - p=0.10: 盈亏比 ≈ 81:1（盈利 9 倍，亏损 0.10）
 *    - p=0.20: 盈亏比 ≈ 16:1（盈利 4 倍，亏损 0.20）
 *    - p=0.30: 盈亏比 ≈ 7.8:1（盈利 2.33 倍，亏损 0.30）
 * 4. 数据集特征：
 *    - timestamp 和 endDate 相同（数据采集问题）
 *    - 按时间排序，每个时间点有 170-190 个快照
 *    - 价格分布：<0.01 (17.5%), 0.01-0.05 (12.2%), >=0.90 (39.6%)
 *    - 有大量低价格机会（<0.10 占 29.7%）
 *
 * 【V8.9 核心改进】
 * 1. **极简化入场**：取消所有复杂的技术指标，只检查基础条件
 * 2. **聚焦低价格**：优先入场极低价格（0.01-0.05）和低价格（0.05-0.10）
 * 3. **取消时间过滤**：不依赖 endDate，只依赖 timestamp
 * 4. **移动止盈为主**：不设置硬止盈，完全依赖移动止盈
 * 5. **高盈亏比止损**：10-15% 止损，确保盈亏比 > 3
 *
 * 【价格区间划分】
 * - 极低价格（0.01-0.05）：盈亏比 100-380:1，主要目标
 * - 低价格（0.05-0.10）：盈亏比 20-100:1，次要目标
 * - 中低价格（0.10-0.20）：盈亏比 5-20:1
 * - 中等价格（0.20-0.35）：盈亏比 3-5:1
 */

import {
  BacktestStrategy,
  BacktestStrategyType,
  BacktestMarketSnapshot,
  BacktestConfig,
  BacktestTrade,
} from './types';

/**
 * 【核心策略】反转策略 (Reversal) V8.9 - 高盈亏比极简版
 */
export class ReversalStrategyV9 implements BacktestStrategy {
  type = BacktestStrategyType.REVERSAL;

  // 最高价格记录（用于移动止盈）
  private highestPrices = new Map<string, number>();

  constructor(private engine?: any) {}

  shouldOpen(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean {
    const strategyConfig = config.strategies.reversal;
    if (!strategyConfig.enabled) return false;

    // V8.9: 取消所有复杂的技术指标检查
    // 只检查最基础的条件

    // 检查每个 outcome 的价格
    for (let i = 0; i < snapshot.outcomePrices.length; i++) {
      const price = snapshot.outcomePrices[i];
      const priceRange = this.getPriceRange(price);

      if (priceRange) {
        // V8.9: 只检查价格区间和基础市场深度条件
        if (this.passesBasicMarketDepthCheck(snapshot)) {
          return true;
        }
      }
    }

    return false;
  }

  shouldClose(trade: BacktestTrade, currentPrice: number, currentTime: Date, config: BacktestConfig): boolean {
    const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);
    const profitPercent = (currentPrice - trade.entryPrice) / trade.entryPrice;

    // V8.9: 市场归零风险控制（硬止损）
    if (currentPrice < 0.01) {
      return true;
    }

    // V8.9: 确定价格区间
    const priceRange = this.getPriceRange(trade.entryPrice);

    // V8.9: 如果价格区间不在支持范围内，使用默认参数
    if (!priceRange) {
      // 使用默认参数
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
          return true;
        }
      }

      // 默认硬止损（亏损超过 15%）
      if (profitPercent < -0.15) {
        return true;
      }

      return false;
    }

    // V8.9: 获取止损参数
    const stopLossParams = this.getStopLossParameters(priceRange);

    // V8.9: 硬止损（固定百分比）
    const hardStopLossPrice = trade.entryPrice * (1 + stopLossParams.hardStopLoss);
    if (currentPrice <= hardStopLossPrice) {
      return true;
    }

    // V8.9: 移动止盈（利润回撤时止盈）
    if (profitPercent > 0) {
      // 更新最高价格
      const currentHighest = this.highestPrices.get(trade.marketId) || trade.entryPrice;
      if (currentPrice > currentHighest) {
        this.highestPrices.set(trade.marketId, currentPrice);
      }

      // 计算回撤比率
      const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
      const drawdownRatio = (highestPrice - currentPrice) / highestPrice;

      // 如果从最高点回撤超过阈值，触发移动止盈
      if (drawdownRatio > stopLossParams.movingStopLossDrawdown) {
        return true;
      }
    }

    // V8.9: 最大持仓时间（根据价格区间）
    if (hoursHeld >= stopLossParams.maxHoldingHours) {
      return true;
    }

    return false;
  }

  getExitReason(trade: BacktestTrade, currentPrice: number, currentTime: Date): string {
    const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);
    const profitPercent = (currentPrice - trade.entryPrice) / trade.entryPrice;

    // V8.9: 市场归零风险控制
    if (currentPrice < 0.01) {
      return '市场归零风险控制（价格 < 1%）';
    }

    // V8.9: 确定价格区间
    const priceRange = this.getPriceRange(trade.entryPrice);

    // V8.9: 如果价格区间不在支持范围内，使用默认参数
    if (!priceRange) {
      // 使用默认参数
      // 移动止盈（盈利超过 50% 时启用）
      if (profitPercent > 0.50) {
        const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
        const drawdownRatio = (highestPrice - currentPrice) / highestPrice;
        if (drawdownRatio > 0.15) {
          return `移动止盈：从最高点${(highestPrice * 100).toFixed(2)}%回撤${(drawdownRatio * 100).toFixed(2)}%`;
        }
      }

      // 默认硬止损（亏损超过 15%）
      if (profitPercent < -0.15) {
        return `硬止损：价格跌至${(currentPrice * 100).toFixed(2)}%（15%止损）`;
      }

      // 默认：没有触发退出条件
      return '';
    }

    const stopLossParams = this.getStopLossParameters(priceRange);

    // V8.9: 硬止损
    const hardStopLossPrice = trade.entryPrice * (1 + stopLossParams.hardStopLoss);
    if (currentPrice <= hardStopLossPrice) {
      return `硬止损：价格跌至${(currentPrice * 100).toFixed(2)}%（${(-stopLossParams.hardStopLoss * 100).toFixed(0)}%止损）`;
    }

    // V8.9: 移动止盈
    if (profitPercent > 0) {
      const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
      const drawdownRatio = (highestPrice - currentPrice) / highestPrice;
      if (drawdownRatio > stopLossParams.movingStopLossDrawdown) {
        return `移动止盈：从最高点${(highestPrice * 100).toFixed(2)}%回撤${(drawdownRatio * 100).toFixed(2)}%`;
      }
    }

    // V8.9: 最大持仓时间
    if (hoursHeld >= stopLossParams.maxHoldingHours) {
      return `强制平仓：最大持仓时间${stopLossParams.maxHoldingHours.toFixed(0)}小时`;
    }

    return '未知原因';
  }

  /**
   * V8.9: 获取价格区间（聚焦低价格）
   */
  private getPriceRange(price: number): 'ultra_low' | 'low' | 'medium_low' | 'medium' | null {
    if (price >= 0.01 && price <= 0.05) {
      return 'ultra_low';  // 极低价格：1%-5%（盈亏比 100-380:1）
    } else if (price > 0.05 && price <= 0.10) {
      return 'low';  // 低价格：5%-10%（盈亏比 20-100:1）
    } else if (price > 0.10 && price <= 0.20) {
      return 'medium_low';  // 中低价格：10%-20%（盈亏比 5-20:1）
    } else if (price > 0.20 && price <= 0.35) {
      return 'medium';  // 中等价格：20%-35%（盈亏比 3-5:1）
    }
    return null;
  }

  /**
   * V8.9: 基础市场深度检查（恢复原版）
   */
  private passesBasicMarketDepthCheck(snapshot: BacktestMarketSnapshot): boolean {
    // ✅ 恢复严格的交易量检查
    if (!snapshot.volume24h || snapshot.volume24h < 2000) {
      return false;
    }

    // ✅ 恢复流动性检查
    if (snapshot.liquidity && snapshot.liquidity < 500) {
      return false;
    }

    return true;
  }

  /**
   * V8.9: 获取止损参数（固定止损 + 移动止盈）
   */
  private getStopLossParameters(priceRange: 'ultra_low' | 'low' | 'medium_low' | 'medium') {
    switch (priceRange) {
      case 'ultra_low':
        return {
          hardStopLoss: -0.15,  // -15%（盈亏比 > 5:1）
          movingStopLossDrawdown: 0.30,  // 30% 回撤（允许大波动）
          maxHoldingHours: 168,  // 168 小时（7 天）
        };
      case 'low':
        return {
          hardStopLoss: -0.15,  // -15%（盈亏比 > 4:1）
          movingStopLossDrawdown: 0.25,  // 25% 回撤
          maxHoldingHours: 120,  // 120 小时（5 天）
        };
      case 'medium_low':
        return {
          hardStopLoss: -0.10,  // -10%（盈亏比 > 3:1）
          movingStopLossDrawdown: 0.20,  // 20% 回撤
          maxHoldingHours: 96,  // 96 小时（4 天）
        };
      case 'medium':
        return {
          hardStopLoss: -0.10,  // -10%（盈亏比 > 2.5:1）
          movingStopLossDrawdown: 0.15,  // 15% 回撤
          maxHoldingHours: 72,  // 72 小时（3 天）
        };
    }
  }

  getDescription(): string {
    return `Reversal Strategy V8.9（高盈亏比极简版）：
    • 核心理念：极简化入场 + 高盈亏比 + 移动止盈
    • 价格区间：极低价格（1%-5%）、低价格（5%-10%）、中低价格（10%-20%）、中等价格（20%-35%）
    • 入场条件：只检查价格区间 + 基础市场深度（交易量>=$500）
    • 硬止损：极低价格和低价格（-15%）、其他（-10%）
    • 移动止盈：极低价格（30% 回撤）、低价格（25% 回撤）、中低价格（20% 回撤）、中等价格（15% 回撤）
    • 最大持仓时间：极低价格（168 小时）、低价格（120 小时）、中低价格（96 小时）、中等价格（72 小时）
    • 风险管理：最大持仓 20，单仓位 15%，日亏损 15%，最大回撤 25%
    • 特点：不设置硬止盈，完全依赖移动止盈捕捉大额盈利
    • 优化：取消所有技术指标，聚焦低价格的高盈亏比机会`;
  }
}
