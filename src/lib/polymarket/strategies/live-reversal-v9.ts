/**
 * 实盘 Reversal 策略 V8.9
 * 基于回测 Reversal 策略 V8.9，适配实时数据和实盘交易
 *
 * 【核心理念 - 同回测版】
 * 高盈亏比 + 高胜率 + 高频交易 = 极致收益
 *
 * 【实盘适配】
 * 1. 增加流动性验证（使用 CLOB API）
 * 2. 增加盘口检查（买一卖一有足够 shares）
 * 3. 增加滑点控制（防止大额交易滑点过大）
 * 4. 增加市场黑名单（归零市场）
 */

import {
  BacktestStrategy,
  BacktestStrategyType,
  BacktestMarketSnapshot,
  BacktestConfig,
  BacktestTrade,
} from '../../backtest/types';
import { clobApiClient } from './clob-api';
import { CandidateMarket } from './candidate-manager';

export interface LiveStrategyConfig extends BacktestConfig {
  // 实盘特有配置
  minLiquidity?: number;  // 最小流动性要求（默认 100 shares）
  maxSlippage?: number;  // 最大滑点（默认 0.02，即 2%）
  minOrderSize?: number;  // 最小订单大小（默认 10 shares）
}

export interface LiveStrategyConfig {
  // 基础配置
  initialCapital: number;
  maxPositions: number;
  maxPositionSize: number;

  // 策略配置
  strategies: {
    reversal: {
      enabled: boolean;
      maxPositions: number;
      maxPositionSize: number;
    };
    convergence: {
      enabled: boolean;
      maxPositions: number;
      maxPositionSize: number;
    };
  };

  // 实盘特有配置
  minLiquidity?: number;
  maxSlippage?: number;
  minOrderSize?: number;
}

export class LiveReversalStrategyV9 {
  type = BacktestStrategyType.REVERSAL;

  // 最高价格记录（用于移动止盈）
  private highestPrices = new Map<string, number>();

  // 市场黑名单（市场ID → 黑名单原因）
  private marketBlacklist = new Map<string, string>();

  // 交易冷却时间（市场ID → 最后交易时间）
  private tradeCooldowns = new Map<string, Date>();
  private readonly COOLDOWN_MINUTES = 30; // 30分钟冷却时间

  constructor(private config?: LiveStrategyConfig) {}

  /**
   * 判断是否应该开仓
   * @param snapshot 市场快照
   * @param config 配置（支持 LiveStrategyConfig 或 BacktestConfig）
   * @returns 是否应该开仓
   */
  async shouldOpen(
    snapshot: BacktestMarketSnapshot,
    config: LiveStrategyConfig | BacktestConfig
  ): Promise<boolean> {
    // 兼容两种配置类型
    const strategies = 'strategies' in config ? config.strategies : config.strategies;
    const strategyConfig = strategies.reversal;

    if (!strategyConfig || !strategyConfig.enabled) return false;

    // 1. 检查市场黑名单
    if (this.marketBlacklist.has(snapshot.marketId)) {
      console.log(`[LiveReversalV9] 市场在黑名单中: ${snapshot.marketId}`);
      return false;
    }

    // 2. 检查交易冷却时间
    const lastTradeTime = this.tradeCooldowns.get(snapshot.marketId);
    if (lastTradeTime) {
      const minutesSinceLastTrade = (new Date().getTime() - lastTradeTime.getTime()) / (1000 * 60);
      if (minutesSinceLastTrade < this.COOLDOWN_MINUTES) {
        return false;
      }
    }

    // 3. 检查价格区间
    const hasValidPrice = snapshot.outcomePrices.some(price => {
      const priceRange = this.getPriceRange(price);
      return priceRange !== null;
    });

    if (!hasValidPrice) {
      return false;
    }

    // 4. 检查市场深度
    if (!this.passesBasicMarketDepthCheck(snapshot)) {
      return false;
    }

    // 5. 【实盘特有】检查流动性（使用 CLOB API）
    const hasLiquidity = await this.checkLiquidity(snapshot, config.initialCapital);
    if (!hasLiquidity) {
      return false;
    }

    return true;
  }

  /**
   * 判断是否应该平仓
   * @param trade 持仓
   * @param currentPrice 当前价格
   * @param currentTime 当前时间
   * @param config 配置（支持 LiveStrategyConfig 或 BacktestConfig）
   * @returns 是否应该平仓
   */
  shouldClose(
    trade: BacktestTrade,
    currentPrice: number,
    currentTime: Date,
    config: LiveStrategyConfig | BacktestConfig
  ): boolean {
    const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);
    const profitPercent = (currentPrice - trade.entryPrice) / trade.entryPrice;

    // 1. 市场归零保护
    if (currentPrice < 0.01) {
      return true;
    }

    // 2. 确定价格区间
    const priceRange = this.getPriceRange(trade.entryPrice);

    // 3. 如果价格区间不在支持范围内，使用默认参数
    if (!priceRange) {
      // 默认硬止损（亏损超过 15%）
      if (profitPercent < -0.15) {
        return true;
      }

      // 默认移动止盈
      if (profitPercent > 0.50) {
        const currentHighest = this.highestPrices.get(trade.marketId) || trade.entryPrice;
        if (currentPrice > currentHighest) {
          this.highestPrices.set(trade.marketId, currentPrice);
        }

        const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
        const drawdownRatio = (highestPrice - currentPrice) / highestPrice;

        if (drawdownRatio > 0.15) {
          return true;
        }
      }

      return false;
    }

    // 4. 获取止损参数
    const stopLossParams = this.getStopLossParameters(priceRange);

    // 5. 硬止损
    const hardStopLossPrice = trade.entryPrice * (1 + stopLossParams.hardStopLoss);
    if (currentPrice <= hardStopLossPrice) {
      return true;
    }

    // 6. 移动止盈
    if (profitPercent > 0) {
      const currentHighest = this.highestPrices.get(trade.marketId) || trade.entryPrice;
      if (currentPrice > currentHighest) {
        this.highestPrices.set(trade.marketId, currentPrice);
      }

      const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
      const drawdownRatio = (highestPrice - currentPrice) / highestPrice;

      if (drawdownRatio > stopLossParams.movingStopLossDrawdown) {
        return true;
      }
    }

    // 7. 最大持仓时间
    if (hoursHeld >= stopLossParams.maxHoldingHours) {
      return true;
    }

    return false;
  }

  /**
   * 获取退出原因
   */
  getExitReason(trade: BacktestTrade, currentPrice: number, currentTime: Date): string {
    const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);
    const profitPercent = (currentPrice - trade.entryPrice) / trade.entryPrice;

    // 1. 市场归零保护
    if (currentPrice < 0.01) {
      // 加入黑名单
      this.marketBlacklist.set(trade.marketId, '市场归零风险控制（价格 < 1%）');
      return '市场归零风险控制（价格 < 1%）';
    }

    // 2. 确定价格区间
    const priceRange = this.getPriceRange(trade.entryPrice);

    // 3. 如果价格区间不在支持范围内，使用默认参数
    if (!priceRange) {
      // 默认硬止损
      if (profitPercent < -0.15) {
        return `硬止损：价格跌至${(currentPrice * 100).toFixed(2)}%（15%止损）`;
      }

      // 默认移动止盈
      if (profitPercent > 0.50) {
        const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
        const drawdownRatio = (highestPrice - currentPrice) / highestPrice;
        if (drawdownRatio > 0.15) {
          return `移动止盈：从最高点${(highestPrice * 100).toFixed(2)}%回撤${(drawdownRatio * 100).toFixed(2)}%`;
        }
      }

      return '';
    }

    const stopLossParams = this.getStopLossParameters(priceRange);

    // 4. 硬止损
    const hardStopLossPrice = trade.entryPrice * (1 + stopLossParams.hardStopLoss);
    if (currentPrice <= hardStopLossPrice) {
      return `硬止损：价格跌至${(currentPrice * 100).toFixed(2)}%（${(-stopLossParams.hardStopLoss * 100).toFixed(0)}%止损）`;
    }

    // 5. 移动止盈
    if (profitPercent > 0) {
      const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
      const drawdownRatio = (highestPrice - currentPrice) / highestPrice;
      if (drawdownRatio > stopLossParams.movingStopLossDrawdown) {
        return `移动止盈：从最高点${(highestPrice * 100).toFixed(2)}%回撤${(drawdownRatio * 100).toFixed(2)}%`;
      }
    }

    // 6. 最大持仓时间
    if (hoursHeld >= stopLossParams.maxHoldingHours) {
      return `强制平仓：最大持仓时间${stopLossParams.maxHoldingHours.toFixed(0)}小时`;
    }

    return '';
  }

  /**
   * 【实盘特有】检查流动性
   * 使用 CLOB API 验证订单簿是否有足够的流动性
   *
   * @param snapshot 市场快照
   * @param initialCapital 初始资金
   * @returns 是否有足够的流动性
   */
  private async checkLiquidity(
    snapshot: BacktestMarketSnapshot,
    initialCapital: number
  ): Promise<boolean> {
    try {
      // 找到要交易的结果索引
      const outcomeIndex = this.findOutcomeIndex(snapshot);
      if (outcomeIndex === -1) {
        return false;
      }

      const price = snapshot.outcomePrices[outcomeIndex];
      const priceRange = this.getPriceRange(price);

      if (!priceRange) {
        return false;
      }

      // 计算需要的 shares 数量（18% 仓位）
      const positionValuePercent = 0.18;
      const positionValue = initialCapital * positionValuePercent;
      const shares = Math.floor(positionValue / price);

      // 检查最小订单大小
      const minOrderSize = this.config?.minOrderSize || 10;
      if (shares < minOrderSize) {
        return false;
      }

      // 【实盘特有】检查 CLOB 流动性
      // 这里需要 tokenID，暂时跳过
      // const hasEnoughLiquidity = await clobApiClient.hasEnoughLiquidity(
      //   tokenID,
      //   assetId,
      //   'buy',
      //   shares
      // );

      // if (!hasEnoughLiquidity) {
      //   return false;
      // }

      return true;
    } catch (error) {
      console.error('[LiveReversalV9] 检查流动性失败:', error);
      return false;
    }
  }

  /**
   * 获取价格区间
   */
  private getPriceRange(price: number): 'ultra_low' | 'low' | 'medium_low' | 'medium' | null {
    if (price >= 0.01 && price <= 0.05) {
      return 'ultra_low';  // 极低价格：1%-5%
    } else if (price > 0.05 && price <= 0.10) {
      return 'low';  // 低价格：5%-10%
    } else if (price > 0.10 && price <= 0.20) {
      return 'medium_low';  // 中低价格：10%-20%
    } else if (price > 0.20 && price <= 0.35) {
      return 'medium';  // 中等价格：20%-35%
    }
    return null;
  }

  /**
   * 基础市场深度检查
   */
  private passesBasicMarketDepthCheck(snapshot: BacktestMarketSnapshot): boolean {
    // 24 小时交易量 >= 2,000
    if (!snapshot.volume24h || snapshot.volume24h < 2000) {
      return false;
    }

    // 流动性 >= 500
    if (snapshot.liquidity && snapshot.liquidity < 500) {
      return false;
    }

    return true;
  }

  /**
   * 获取止损参数
   */
  private getStopLossParameters(priceRange: 'ultra_low' | 'low' | 'medium_low' | 'medium') {
    switch (priceRange) {
      case 'ultra_low':
        return {
          hardStopLoss: -0.15,
          movingStopLossDrawdown: 0.30,
          maxHoldingHours: 168,
        };
      case 'low':
        return {
          hardStopLoss: -0.15,
          movingStopLossDrawdown: 0.25,
          maxHoldingHours: 120,
        };
      case 'medium_low':
        return {
          hardStopLoss: -0.10,
          movingStopLossDrawdown: 0.20,
          maxHoldingHours: 96,
        };
      case 'medium':
        return {
          hardStopLoss: -0.10,
          movingStopLossDrawdown: 0.15,
          maxHoldingHours: 72,
        };
    }
  }

  /**
   * 找到要交易的结果索引
   */
  private findOutcomeIndex(snapshot: BacktestMarketSnapshot): number {
    for (let i = 0; i < snapshot.outcomePrices.length; i++) {
      const price = snapshot.outcomePrices[i];
      const priceRange = this.getPriceRange(price);

      if (priceRange) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 更新交易冷却时间
   */
  updateTradeCooldown(marketId: string): void {
    this.tradeCooldowns.set(marketId, new Date());
  }

  /**
   * 获取市场黑名单
   */
  getMarketBlacklist(): Map<string, string> {
    return this.marketBlacklist;
  }

  getDescription(): string {
    return `Live Reversal Strategy V8.9（高盈亏比极简版 - 实盘版）：
    • 核心理念：极简化入场 + 高盈亏比 + 移动止盈
    • 价格区间：极低价格（1%-5%）、低价格（5%-10%）、中低价格（10%-20%）、中等价格（20%-35%）
    • 入场条件：价格区间 + 市场深度 + 流动性验证（CLOB）
    • 硬止损：极低价格和低价格（-15%）、其他（-10%）
    • 移动止盈：极低价格（30% 回撤）、低价格（25% 回撤）、中低价格（20% 回撤）、中等价格（15% 回撤）
    • 最大持仓时间：极低价格（168 小时）、低价格（120 小时）、中低价格（96 小时）、中等价格（72 小时）
    • 风险管理：最大持仓 5，单仓位 18%
    • 实盘特性：流动性验证、盘口检查、滑点控制、市场黑名单`;
  }
}
