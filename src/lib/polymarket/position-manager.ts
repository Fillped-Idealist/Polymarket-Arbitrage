/**
 * 持仓管理模块
 * 负责管理现有的持仓
 */

import {
  BacktestTrade,
  BacktestPositionStatus,
  BacktestStrategyType,
} from '../backtest/types';
import { clobApiClient } from './clob-api';

export interface LivePosition extends BacktestTrade {
  // 实盘特有字段
  orderId?: string;  // 订单 ID（实际交易时使用）
  filledSize?: number;  // 成交数量（可能和预期不同）
  slippage?: number;  // 滑点（实际价格 vs 预期价格）

  // 实时更新字段
  currentPrice?: number;  // 当前价格
  currentPnl?: number;  // 当前盈亏
  currentPnlPercent?: number;  // 当前盈亏百分比
  lastUpdated: Date;  // 最后更新时间

  // 止盈止损字段
  highestPrice?: number;  // 最高价格（用于移动止盈）
}

/**
 * 持仓管理类
 */
export class PositionManager {
  private positions: Map<string, LivePosition> = new Map();
  private equity: number;  // 当前权益（只包含已实现盈亏）
  private initialCapital: number;  // 初始资金

  constructor(initialCapital: number = 10000) {
    this.initialCapital = initialCapital;
    this.equity = initialCapital;
  }

  /**
   * 添加持仓
   * @param position 持仓
   */
  addPosition(position: LivePosition): void {
    // 设置最后更新时间
    position.lastUpdated = new Date();

    // 初始化最高价格（用于移动止盈）
    position.highestPrice = position.entryPrice;

    this.positions.set(position.id, position);

    console.log(`[PositionManager] 添加持仓: ${position.id}, 市场ID: ${position.marketId}, 入场价: ${position.entryPrice}, 仓位大小: ${position.positionSize}`);
  }

  /**
   * 移除持仓
   * @param positionId 持仓 ID
   * @returns 被移除的持仓
   */
  removePosition(positionId: string): LivePosition | undefined {
    const position = this.positions.get(positionId);
    if (position) {
      this.positions.delete(positionId);
      console.log(`[PositionManager] 移除持仓: ${positionId}`);
    }
    return position;
  }

  /**
   * 获取持仓
   * @param positionId 持仓 ID
   * @returns 持仓
   */
  getPosition(positionId: string): LivePosition | undefined {
    return this.positions.get(positionId);
  }

  /**
   * 根据市场 ID 获取持仓
   * @param marketId 市场 ID
   * @returns 持仓
   */
  getPositionByMarket(marketId: string): LivePosition | undefined {
    return Array.from(this.positions.values()).find(p => p.marketId === marketId);
  }

  /**
   * 获取所有持仓
   * @returns 持仓列表
   */
  getAllPositions(): LivePosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * 获取未平仓的持仓
   * @returns 未平仓的持仓列表
   */
  getOpenPositions(): LivePosition[] {
    return Array.from(this.positions.values()).filter(
      p => p.status === BacktestPositionStatus.OPEN
    );
  }

  /**
   * 获取已平仓的持仓
   * @returns 已平仓的持仓列表
   */
  getClosedPositions(): LivePosition[] {
    return Array.from(this.positions.values()).filter(
      p => p.status !== BacktestPositionStatus.OPEN
    );
  }

  /**
   * 根据策略类型获取持仓
   * @param strategyType 策略类型
   * @returns 持仓列表
   */
  getPositionsByStrategy(strategyType: BacktestStrategyType): LivePosition[] {
    return Array.from(this.positions.values()).filter(
      p => p.strategy === strategyType
    );
  }

  /**
   * 更新持仓的实时价格和盈亏
   * @param marketId 市场 ID
   * @param currentPrice 当前价格
   */
  async updatePositionPrice(marketId: string, currentPrice: number): Promise<void> {
    const position = this.getPositionByMarket(marketId);

    if (!position || position.status !== BacktestPositionStatus.OPEN) {
      return;
    }

    // 更新当前价格
    position.currentPrice = currentPrice;

    // 计算当前盈亏
    const currentValue = position.positionSize * currentPrice;
    position.currentPnl = currentValue - position.entryValue;
    position.currentPnlPercent = (position.currentPnl / position.entryValue) * 100;

    // 更新最高价格（用于移动止盈）
    if (currentPrice > (position.highestPrice || 0)) {
      position.highestPrice = currentPrice;
    }

    // 更新最后更新时间
    position.lastUpdated = new Date();

    this.positions.set(position.id, position);
  }

  /**
   * 批量更新持仓价格
   * @param marketPrices 市场 ID 到价格的映射
   */
  async updatePositionsPrices(marketPrices: Map<string, number>): Promise<void> {
    const promises = Array.from(marketPrices.entries()).map(
      async ([marketId, price]) => {
        await this.updatePositionPrice(marketId, price);
      }
    );

    await Promise.all(promises);
  }

  /**
   * 平仓
   * @param position 持仓
   * @param exitPrice 平仓价格
   * @param exitReason 平仓原因
   * @returns 平仓后的持仓
   */
  closePosition(
    position: LivePosition,
    exitPrice: number,
    exitReason: string
  ): LivePosition {
    // 计算盈亏
    const exitValue = position.positionSize * exitPrice;
    const pnl = exitValue - position.entryValue;
    const pnlPercent = (pnl / position.entryValue) * 100;

    // 更新持仓状态
    position.exitTime = new Date();
    position.exitPrice = exitPrice;
    position.exitValue = exitValue;
    position.pnl = pnl;
    position.pnlPercent = pnlPercent;
    position.exitReason = exitReason;
    position.status = pnl > 0 ? BacktestPositionStatus.CLOSED : BacktestPositionStatus.STOPPED;
    position.lastUpdated = new Date();

    // 更新持仓
    this.positions.set(position.id, position);

    // 更新权益（只包含已实现盈亏）
    this.updateEquity();

    console.log(`[PositionManager] 平仓: ${position.id}, 平仓价: ${exitPrice}, 盈亏: ${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%), 原因: ${exitReason}`);

    return position;
  }

  /**
   * 更新权益
   * 只包含已实现盈亏，不包含浮盈
   */
  updateEquity(): void {
    const closedPositions = this.getClosedPositions();
    const realizedPnl = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);

    this.equity = this.initialCapital + realizedPnl;

    // 破产保护
    if (this.equity < 0) {
      console.warn(`[PositionManager] 权益为负数，重置为 0`);
      this.equity = 0;
    }
  }

  /**
   * 获取权益
   * @returns 当前权益（只包含已实现盈亏）
   */
  getEquity(): number {
    this.updateEquity();
    return this.equity;
  }

  /**
   * 获取总权益（包含浮盈）
   * @returns 总权益（包含浮盈）
   */
  getTotalEquity(): number {
    const closedPositions = this.getClosedPositions();
    const openPositions = this.getOpenPositions();

    const realizedPnl = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
    const unrealizedPnl = openPositions.reduce((sum, p) => sum + (p.currentPnl || 0), 0);

    return this.initialCapital + realizedPnl + unrealizedPnl;
  }

  /**
   * 检查是否可以开仓
   * 条件：
   * 1. 未达到最大持仓数
   * 2. 市场不在持仓中（禁止重复开仓）
   * 3. 策略未达到最大持仓数
   *
   * @param maxPositions 最大持仓数
   * @param strategyConfig 策略配置
   * @returns 是否可以开仓
   */
  canOpenPosition(
    maxPositions: number,
    strategyConfig: { enabled: boolean; maxPositions: number },
    marketId?: string
  ): boolean {
    const openPositions = this.getOpenPositions();

    // 1. 检查是否达到最大持仓数
    if (openPositions.length >= maxPositions) {
      return false;
    }

    // 2. 检查市场是否在持仓中
    if (marketId && this.getPositionByMarket(marketId)) {
      return false;
    }

    // 3. 检查策略是否达到最大持仓数
    // 这里需要传入 strategyType，暂时跳过
    // const strategyPositions = openPositions.filter(p => p.strategy === strategyType);
    // if (strategyPositions.length >= strategyConfig.maxPositions) {
    //   return false;
    // }

    return true;
  }

  /**
   * 检查市场是否有持仓
   * @param marketId 市场 ID
   * @returns 是否有持仓
   */
  hasPosition(marketId: string): boolean {
    return this.getPositionByMarket(marketId) !== undefined;
  }

  /**
   * 获取持仓统计信息
   * @returns 统计信息
   */
  getStatistics() {
    const openPositions = this.getOpenPositions();
    const closedPositions = this.getClosedPositions();

    const winningPositions = closedPositions.filter(p => p.pnl && p.pnl > 0);
    const losingPositions = closedPositions.filter(p => p.pnl && p.pnl < 0);

    const totalPnl = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
    const winRate = closedPositions.length > 0 ? (winningPositions.length / closedPositions.length) * 100 : 0;

    return {
      totalPositions: this.positions.size,
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      winningPositions: winningPositions.length,
      losingPositions: losingPositions.length,
      winRate,
      totalPnl,
      equity: this.getEquity(),
      totalEquity: this.getTotalEquity(),
      initialCapital: this.initialCapital,
    };
  }

  /**
   * 清空持仓
   */
  clearPositions(): void {
    this.positions.clear();
    console.log('[PositionManager] 已清空持仓');
  }
}

// 创建默认实例
export const positionManager = new PositionManager(10000);
