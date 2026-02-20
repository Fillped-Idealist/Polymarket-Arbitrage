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
  BacktestStrategyType,
  BacktestMarketSnapshot,
  BacktestConfig,
  BacktestTrade,
} from '../../backtest/types';
// 请确保此路径指向你正确的 clob-api 文件位置
import { clobApiClient } from '../clob-api-v2';

export interface LiveStrategyConfig extends BacktestConfig {
  // 实盘特有配置
  minLiquidity?: number;  // 最小流动性要求（默认 100 shares）
  maxSlippage?: number;   // 最大滑点（默认 0.02，即 2%）
  minOrderSize?: number;  // 最小订单大小（默认 10 shares）
}

// 补充完整的配置接口定义，确保类型检查通过
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
   * 辅助方法：从不同结构的市场对象中提取价格数组
   * 【修复核心】：解决 snapshot.outcomePrices.some is not a function 报错
   * 兼容 BacktestMarketSnapshot (Array) 和 ParsedMarket (Map)
   */
  private extractPrices(snapshot: any): number[] {
    if (!snapshot) return [];

    // 1. 如果是回测结构的数组
    if (Array.isArray(snapshot.outcomePrices)) {
      return snapshot.outcomePrices;
    }

    // 2. 如果是实盘 ParsedMarket 的 Map 结构
    if (snapshot.probabilities instanceof Map) {
      return Array.from(snapshot.probabilities.values());
    }

    // 3. 如果是普通的 Object 结构
    if (snapshot.probabilities && typeof snapshot.probabilities === 'object') {
      return Object.values(snapshot.probabilities);
    }

    return [];
  }

  /**
   * 判断是否应该开仓
   * @param snapshot 市场快照
   * @param config 配置（支持 LiveStrategyConfig 或 BacktestConfig）
   * @returns 是否应该开仓
   */
  async shouldOpen(
    snapshot: any,
    config: LiveStrategyConfig | BacktestConfig
  ): Promise<boolean> {
    const strategyConfig = (config as any)?.strategies?.reversal;
    if (!strategyConfig || !strategyConfig.enabled) return false;

    const marketId = snapshot.id || snapshot.marketId;

    // 1. 黑名单和冷却检查
    if (this.marketBlacklist.has(marketId)) return false;
    const lastTradeTime = this.tradeCooldowns.get(marketId);
    if (lastTradeTime) {
      const minutes = (new Date().getTime() - lastTradeTime.getTime()) / (1000 * 60);
      if (minutes < this.COOLDOWN_MINUTES) return false;
    }

    // --- 新增：时间检查逻辑 ---
    // 检查是否存在结束时间
    if (!snapshot.endDate) {
      // console.log(`[Reversal策略] 跳过市场 ${marketId}: 无效的结束时间`);
      return false;
    }

    const endTs = new Date(snapshot.endDate).getTime();
    const nowTs = Date.now();

    // A. 基础检查：如果已经过期或无效，直接跳过
    if (isNaN(endTs) || endTs <= nowTs) {
      return false;
    }

    // B. 风险检查：距离结束时间太近不建议入场 (Reversal 策略通常需要持仓 72h-168h)
    // 如果距离结束不足 48 小时，Reversal 逻辑很难跑出利润空间且风险剧增
    const hoursToEvent = (endTs - nowTs) / (1000 * 60 * 60);
    if (hoursToEvent < 48) {
      return false;
    }
    // -----------------------

    // 2. 提取并严格验证价格
    const prices = this.extractPrices(snapshot);
    if (prices.length === 0) return false;

    // --- 修复核心：不再使用 .some()，而是直接定位具体的索引 ---
    const targetIndex = this.findOutcomeIndex(snapshot, prices);
    
    // 如果没有符合 0.01-0.35 价格区间的结果，直接拒绝
    if (targetIndex === -1) {
      return false;
    }

    // 拿到目标价格进行双重确认
    const targetPrice = parseFloat(prices[targetIndex] as any);
    if (targetPrice > 0.35 || targetPrice < 0.01) {
      return false; 
    }

    // 3. 检查市场基础深度
    if (!this.passesBasicMarketDepthCheck(snapshot)) {
      return false;
    }

    // 4. 检查流动性
    // 注意：我们将 targetIndex 逻辑下沉到 checkLiquidity 内部再次校验
    const hasLiquidity = await this.checkLiquidity(snapshot, config.initialCapital, prices);
    if (!hasLiquidity) {
      return false;
    }

    // 如果运行到这里，说明市场 ID、具体哪个 Outcome 以及价格都在 0.35 以下
    console.log(`[Reversal策略] 确认开仓信号: 价格 ${targetPrice}, 索引 ${targetIndex}`);
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
    const hoursHeld = (currentTime.getTime() - new Date(trade.entryTime).getTime()) / (1000 * 60 * 60);
    const profitPercent = (currentPrice - trade.entryPrice) / trade.entryPrice;

    // 1. 市场归零保护
    if (currentPrice < 0.01) {
      return true;
    }

    // 2. 确定价格区间
    const priceRange = this.getPriceRange(trade.entryPrice);

    // 3. 如果价格区间不在支持范围内，使用默认参数
    if (!priceRange) {
      // 默认硬止损（价格跌破15%）
      const hardStopLossPrice = trade.entryPrice * 0.85; // 15%止损
      if (currentPrice <= hardStopLossPrice) {
        return true;
      }

      // 默认移动止盈（任何盈利时都检查）
      if (profitPercent > 0) {
        // 更新最高价逻辑
        this.updateHighestPrice(trade.marketId, currentPrice);

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
      // 更新最高价逻辑
      this.updateHighestPrice(trade.marketId, currentPrice);

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
    const hoursHeld = (currentTime.getTime() - new Date(trade.entryTime).getTime()) / (1000 * 60 * 60);
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
      const hardStopLossPrice = trade.entryPrice * 0.85; // 15%止损
      if (currentPrice <= hardStopLossPrice) {
        return `硬止损：价格跌至${(currentPrice * 100).toFixed(3)}%（15%止损）`;
      }

      // 默认移动止盈（任何盈利时都检查）
      if (profitPercent > 0) {
        const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
        const drawdownRatio = (highestPrice - currentPrice) / highestPrice;
        if (drawdownRatio > 0.15) {
          return `移动止盈：从最高点${(highestPrice * 100).toFixed(3)}%回撤${(drawdownRatio * 100).toFixed(2)}%`;
        }
      }

      return '止盈：达到目标收益或风险控制退出';
    }

    const stopLossParams = this.getStopLossParameters(priceRange);

    // 4. 硬止损
    const hardStopLossPrice = trade.entryPrice * (1 + stopLossParams.hardStopLoss);
    if (currentPrice <= hardStopLossPrice) {
      return `硬止损：价格跌至${(currentPrice * 100).toFixed(3)}%（${(-stopLossParams.hardStopLoss * 100).toFixed(0)}%止损）`;
    }

    // 5. 移动止盈
    if (profitPercent > 0) {
      const highestPrice = this.highestPrices.get(trade.marketId) || trade.entryPrice;
      const drawdownRatio = (highestPrice - currentPrice) / highestPrice;
      if (drawdownRatio > stopLossParams.movingStopLossDrawdown) {
        return `移动止盈：从最高点${(highestPrice * 100).toFixed(3)}%回撤${(drawdownRatio * 100).toFixed(2)}%`;
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
   * * @param snapshot 市场快照
   * @param initialCapital 初始资金
   * @param prices 从 snapshot 提取好的价格数组
   * @returns 是否有足够的流动性
   */
  private async checkLiquidity(
    snapshot: any,
    initialCapital: number,
    prices: number[]
  ): Promise<boolean> {
    try {
      // 1. 找到符合策略价格区间的 Outcome 索引
      const outcomeIndex = this.findOutcomeIndex(snapshot, prices);
      if (outcomeIndex === -1) {
        return false;
      }

      const price = prices[outcomeIndex];
      if (price > 0.35) {
        console.log(`[风险拦截] 尝试开仓价格过高: ${price}`);
        return false; 
      }
      const priceRange = this.getPriceRange(price);

      if (!priceRange) {
        return false;
      }

      // 2. 计算需要的 shares 数量（基于最大仓位限制）
      // 使用可选链安全获取配置
      const maxPosSize = (this.config as any)?.strategies?.reversal?.maxPositionSize || 0.18;
      const positionValue = initialCapital * maxPosSize;
      const shares = Math.floor(positionValue / price);

      // 3. 检查最小订单大小 (Basic Check)
      const minOrderSize = this.config?.minOrderSize || 10;
      if (shares < minOrderSize) {
        return false;
      }

      // 4. 【实盘特有】检查 CLOB 深度 (Advanced Check)
      // 需要获取 Token ID / Asset ID
      // ParsedMarket 结构中包含 outcomeIds (Map<string, string>) 和 outcomes (Array<string>)
      let outcomeId: string | undefined;

      if (snapshot.outcomeIds && snapshot.outcomes) {
         const outcomeName = snapshot.outcomes[outcomeIndex];
         outcomeId = snapshot.outcomeIds.get(outcomeName);
      }

      if (outcomeId) {
        // 如果有真实的 Token ID，调用 CLOB API 检查买单深度
        // 确保你的 clobApiClient 已经实现了 hasEnoughLiquidity 方法
        const hasEnoughDepth = await clobApiClient.hasEnoughLiquidity(
          outcomeId,
          'buy', // 我们是买入
          shares, // 需要购买的数量
          this.config?.maxSlippage || 0.02 // 允许的最大滑点
        );

        if (!hasEnoughDepth) {
          console.log(`[LiveReversalV9] 流动性不足: Outcome ${outcomeIndex}, 需要 ${shares} shares`);
          return false;
        }
      } else {
        // 如果获取不到 outcomeId (可能是回测环境)，跳过 CLOB 深度检查，仅做基础检查
        // console.warn('[LiveReversalV9] 无法获取 Outcome ID，跳过 CLOB 深度检查');
      }

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
  private passesBasicMarketDepthCheck(snapshot: any): boolean {
    const volume = snapshot.volume24hr || snapshot.volume || 0;
    const liquidity = snapshot.liquidity || 0;

    // 24 小时交易量 >= 30000
    if (volume < 30000) {
      return false;
    }

    // 流动性 >= 10000
    if (liquidity < 10000) {
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
   * 修复：使用传入的 prices 数组，不再依赖 snapshot.outcomePrices
   */
  private findOutcomeIndex(snapshot: any, prices: number[]): number {
    for (let i = 0; i < prices.length; i++) {
      const price = parseFloat(prices[i] as any);
      // 强制增加硬性过滤：必须在 0.01 到 0.35 之间
      if (price >= 0.01 && price <= 0.35) {
        const priceRange = this.getPriceRange(price);
        if (priceRange) return i;
      }
    }
    return -1;
  }

  /**
   * 辅助方法：更新最高价格记录
   */
  private updateHighestPrice(marketId: string, currentPrice: number) {
    const currentHighest = this.highestPrices.get(marketId) || 0;
    if (currentPrice > currentHighest) {
      this.highestPrices.set(marketId, currentPrice);
    }
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