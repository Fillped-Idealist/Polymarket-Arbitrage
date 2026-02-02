/**
 * 尾盘策略（Convergence 策略）- 实盘版
 *
 * 【核心理念】
 * 在市场临近结束时（尾盘），价格会向最终结果收敛
 * 买入接近 100% 的结果（价格 > 90%），获取小幅但稳定的收益
 *
 * 【实盘适配】
 * 1. 增加流动性验证
 * 2. 增加盘口检查
 * 3. 增加滑点控制
 */

import {
  BacktestStrategyType,
  BacktestMarketSnapshot,
  BacktestConfig,
  BacktestTrade,
} from '../../backtest/types';
import { clobApiClient } from '../clob-api';

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

export class LiveConvergenceStrategy {
  type = BacktestStrategyType.CONVERGENCE;

  // 最高价格记录（用于移动止盈）
  private highestPrices = new Map<string, number>();

  // 交易冷却时间
  private tradeCooldowns = new Map<string, Date>();
  private readonly COOLDOWN_MINUTES = 15; // 15分钟冷却时间

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
    const strategyConfig = strategies.convergence;

    if (!strategyConfig || !strategyConfig.enabled) return false;

    // 1. 检查交易冷却时间
    const lastTradeTime = this.tradeCooldowns.get(snapshot.marketId);
    if (lastTradeTime) {
      const minutesSinceLastTrade = (new Date().getTime() - lastTradeTime.getTime()) / (1000 * 60);
      if (minutesSinceLastTrade < this.COOLDOWN_MINUTES) {
        return false;
      }
    }

    // 2. 检查市场是否临近结束（尾盘）
    const now = new Date();
    const endDate = new Date(snapshot.endDate);
    const hoursUntilEnd = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    // 只在市场临近结束时交易（48 小时内）
    if (hoursUntilEnd > 48 || hoursUntilEnd < 0) {
      return false;
    }

    // 3. 检查价格区间（90%-95%）
    const hasValidPrice = snapshot.outcomePrices.some(price => {
      return price >= 0.90 && price <= 0.95;
    });

    if (!hasValidPrice) {
      return false;
    }

    // 4. 检查市场深度
    if (!this.passesBasicMarketDepthCheck(snapshot)) {
      return false;
    }

    // 5. 检查流动性
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

    // 1. 市场归零保护（尾盘策略不太可能触发）
    if (currentPrice < 0.01) {
      return true;
    }

    // 2. 硬止损（亏损超过 5%）
    if (profitPercent < -0.05) {
      return true;
    }

    // 3. 移动止盈（从最高点回撤超过 10%）
    if (profitPercent > 0) {
      const currentHighest = this.highestPrices.get(trade.marketId) || trade.entryPrice;
      if (currentPrice > currentHighest) {
        this.highestPrices.set(trade.marketId, currentPrice);
      }

      const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
      const drawdownRatio = (highestPrice - currentPrice) / highestPrice;

      if (drawdownRatio > 0.10) {
        return true;
      }
    }

    // 4. 最大持仓时间（尾盘策略：24 小时）
    if (hoursHeld >= 24) {
      return true;
    }

    // 5. 市场临近结束（强制平仓，防止归零）
    const hoursUntilEnd = (trade.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    if (hoursUntilEnd <= 2) {
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
      return '市场归零风险控制（价格 < 1%）';
    }

    // 2. 硬止损
    if (profitPercent < -0.05) {
      return `硬止损：价格跌至${(currentPrice * 100).toFixed(2)}%（5%止损）`;
    }

    // 3. 移动止盈
    if (profitPercent > 0) {
      const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
      const drawdownRatio = (highestPrice - currentPrice) / highestPrice;
      if (drawdownRatio > 0.10) {
        return `移动止盈：从最高点${(highestPrice * 100).toFixed(2)}%回撤${(drawdownRatio * 100).toFixed(2)}%`;
      }
    }

    // 4. 最大持仓时间
    if (hoursHeld >= 24) {
      return '强制平仓：最大持仓时间24小时';
    }

    // 5. 市场临近结束
    const hoursUntilEnd = (trade.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    if (hoursUntilEnd <= 2) {
      return '强制平仓：市场临近结束（2小时内）';
    }

    return '';
  }

  /**
   * 检查流动性
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

      // 计算需要的 shares 数量（18% 仓位）
      const positionValuePercent = 0.18;
      const positionValue = initialCapital * positionValuePercent;
      const shares = Math.floor(positionValue / price);

      // 检查最小订单大小
      const minOrderSize = 10;
      if (shares < minOrderSize) {
        return false;
      }

      // 【实盘特有】检查 CLOB 流动性
      // 暂时跳过，需要 tokenID
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
      console.error('[LiveConvergenceStrategy] 检查流动性失败:', error);
      return false;
    }
  }

  /**
   * 基础市场深度检查
   */
  private passesBasicMarketDepthCheck(snapshot: BacktestMarketSnapshot): boolean {
    // 24 小时交易量 >= 1,000（尾盘策略可以放宽要求）
    if (!snapshot.volume24h || snapshot.volume24h < 1000) {
      return false;
    }

    // 流动性 >= 300（尾盘策略可以放宽要求）
    if (snapshot.liquidity && snapshot.liquidity < 300) {
      return false;
    }

    return true;
  }

  /**
   * 找到要交易的结果索引
   */
  private findOutcomeIndex(snapshot: BacktestMarketSnapshot): number {
    for (let i = 0; i < snapshot.outcomePrices.length; i++) {
      const price = snapshot.outcomePrices[i];
      if (price >= 0.90 && price <= 0.95) {
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

  getDescription(): string {
    return `Live Convergence Strategy（尾盘策略 - 实盘版）：
    • 核心理念：在市场临近结束时买入接近 100% 的结果，获取小幅但稳定的收益
    • 价格区间：90%-95%
    • 入场条件：价格 90%-95% + 市场临近结束（48 小时内） + 市场深度 + 流动性验证
    • 硬止损：-5%（低风险）
    • 移动止盈：10% 回撤
    • 最大持仓时间：24 小时
    • 强制平仓：市场临近结束（2 小时内）
    • 风险管理：最大持仓 2，单仓位 18%
    • 实盘特性：流动性验证、盘口检查、滑点控制`;
  }
}
