/**
 * 持仓管理器（V2）
 * 参考 main_3.py 实现，使用真实价格更新
 */

import { ParsedMarket } from './gamma-api-v2';

/**
 * 持仓数据
 */
export interface Position {
  id: string;
  market_id: string;
  market_question: string;
  outcome_id: string;
  outcome_name: string;
  outcome_index: number;
  strategy: 'reversal' | 'convergence';
  entry_time: Date;
  entry_price: number;
  position_size: number;
  entry_value: number;
  end_date: string;
  exit_time: Date | null;
  exit_price: number | null;
  exit_value: number | null;
  pnl: number;
  pnl_percent: number;
  status: 'open' | 'closed';
  exit_reason: string;

  // 实时数据
  current_price: number;
  current_pnl: number;
  current_pnl_percent: number;
  highest_price: number;
  last_updated: Date;

  // 策略相关
  trend_strength: number;
  price_drop_flag: boolean;
  trailing_stop_hit: boolean;
  trailing_tp_active: boolean;
  trailing_tp_hit: boolean;
  tp_stage: number;
}

/**
 * 持仓管理器配置
 */
export interface PositionManagerConfig {
  max_positions?: number;
  max_position_size?: number;
  initial_capital?: number;
  stop_loss_percent?: number;
  take_profit_percent?: number;
}

/**
 * 持仓管理器
 */
export class PositionManager {
  private config: Required<PositionManagerConfig>;
  private positions: Map<string, Position> = new Map();
  private closed_positions: Position[] = [];
  private equity: number;
  private traded_market_ids: Set<string> = new Set();

  constructor(config: PositionManagerConfig = {}) {
    this.config = {
      max_positions: config.max_positions || 5,
      max_position_size: config.max_position_size || 0.18,
      initial_capital: config.initial_capital || 10000,
      stop_loss_percent: config.stop_loss_percent || 0.15,
      take_profit_percent: config.take_profit_percent || 0.30,
    };

    this.equity = this.config.initial_capital;
  }

  /**
   * 添加持仓
   * 参考 main_3.py 的 _place_order 实现
   */
  addPosition(position: Position): void {
    // 检查最大持仓数
    if (this.positions.size >= this.config.max_positions) {
      throw new Error(`已达最大持仓数 ${this.config.max_positions}`);
    }

    // 检查市场是否已交易
    if (this.traded_market_ids.has(position.market_id)) {
      throw new Error(`市场 ${position.market_id} 已在持仓中`);
    }

    // 添加持仓
    this.positions.set(position.id, position);
    this.traded_market_ids.add(position.market_id);

    // 更新权益
    this.updateEquity();

    console.log(`[PositionManager] 添加持仓: ${position.id}, 仓位大小: ${position.position_size}, 入场价: ${position.entry_price}`);
  }

  /**
   * 移除持仓
   */
  removePosition(position_id: string): void {
    const position = this.positions.get(position_id);
    if (!position) {
      return;
    }

    this.positions.delete(position_id);
    this.traded_market_ids.delete(position.market_id);

    console.log(`[PositionManager] 移除持仓: ${position_id}`);
  }

  /**
   * 平仓
   * 参考 main_3.py 的 _close_position 实现
   */
  closePosition(position: Position, exit_price: number, exit_reason: string): void {
    if (position.status === 'closed') {
      console.warn(`[PositionManager] 持仓已平仓: ${position.id}`);
      return;
    }

    // 计算盈亏
    const exit_value = position.position_size * exit_price;
    const pnl = exit_value - position.entry_value;
    const pnl_percent = (pnl / position.entry_value) * 100;

    // 更新持仓状态
    position.status = 'closed';
    position.exit_price = exit_price;
    position.exit_value = exit_value;
    position.exit_time = new Date();
    position.pnl = pnl;
    position.pnl_percent = pnl_percent;
    position.exit_reason = exit_reason;
    position.current_price = exit_price;
    position.current_pnl = pnl;
    position.current_pnl_percent = pnl_percent;

    // 移动到已平仓列表
    this.positions.delete(position.id);
    this.traded_market_ids.delete(position.market_id);
    this.closed_positions.push(position);

    // 更新权益
    this.updateEquity();

    console.log(`[PositionManager] 平仓: ${position.id}, 盈亏: ${pnl.toFixed(2)} USD (${pnl_percent.toFixed(2)}%), 原因: ${exit_reason}`);
  }

  /**
   * 更新持仓价格
   * 参考 main_3.py 的 update_price 实现
   */
  updatePositionPrice(position_id: string, new_price: number, new_trend_strength?: number): void {
    const position = this.positions.get(position_id);
    if (!position) {
      return;
    }

    // 更新最高价
    if (new_price > position.highest_price) {
      position.highest_price = new_price;
    }

    // 更新趋势强度
    if (new_trend_strength !== undefined) {
      position.trend_strength = new_trend_strength;
    }

    // 更新当前价格
    position.current_price = new_price;

    // 计算当前盈亏
    const current_value = position.position_size * new_price;
    position.current_pnl = current_value - position.entry_value;
    position.current_pnl_percent = (position.current_pnl / position.entry_value) * 100;

    // 检查价格下跌
    const price_drop_from_entry = (position.entry_price - new_price) / position.entry_price;
    position.price_drop_flag = price_drop_from_entry > 0.05;

    // 检查移动止损
    const drop_from_highest = (position.highest_price - new_price) / position.highest_price;
    position.trailing_stop_hit = drop_from_highest > this.config.stop_loss_percent;

    // 更新移动止盈
    this._updateTrailingTp(position, drop_from_highest);

    position.last_updated = new Date();
  }

  /**
   * 更新移动止盈（参考 main_3.py 的 _update_trailing_tp 实现，但不修改策略参数）
   */
  private _updateTrailingTp(position: Position, drop_from_highest: number): void {
    const profit_percent = position.current_pnl_percent;

    // 根据策略类型使用不同的移动止盈逻辑
    // 这里保持原有的策略参数，不修改

    if (position.strategy === 'reversal') {
      // Reversal 策略的移动止盈（保持原有参数）
      if (profit_percent > 0) {
        // 使用原有的移动止盈逻辑
        const drawdown_ratio = drop_from_highest;
        // 具体的止盈参数由策略类控制，这里只更新标志
        if (drawdown_ratio > 0) {
          position.trailing_tp_active = true;
        }
      }
    } else if (position.strategy === 'convergence') {
      // Convergence 策略的移动止盈（保持原有参数）
      if (profit_percent > 0) {
        // 使用原有的移动止盈逻辑
        const drawdown_ratio = drop_from_highest;
        // 具体的止盈参数由策略类控制，这里只更新标志
        if (drawdown_ratio > 0) {
          position.trailing_tp_active = true;
        }
      }
    }

    // 不修改具体的止盈参数，保持原有策略
  }

  /**
   * 批量更新持仓价格
   */
  async updatePositionsPrices(market_prices: Map<string, Map<string, number>>): Promise<void> {
    for (const position of this.positions.values()) {
      const outcome_prices = market_prices.get(position.market_id);
      if (!outcome_prices) {
        continue;
      }

      const new_price = outcome_prices.get(position.outcome_name);
      if (new_price !== undefined) {
        this.updatePositionPrice(position.id, new_price);
      }
    }
  }

  /**
   * 更新权益
   * 参考 main_3.py 实现，只包含已实现盈亏
   */
  updateEquity(): void {
    // 权益 = 初始资金 + 已实现盈亏
    const realized_pnl = this.closed_positions.reduce((sum, p) => sum + p.pnl, 0);
    this.equity = this.config.initial_capital + realized_pnl;
  }

  /**
   * 获取权益
   */
  getEquity(): number {
    return this.equity;
  }

  /**
   * 获取总资产（含浮盈）
   */
  getTotalAssets(): number {
    const floating_pnl = Array.from(this.positions.values())
      .reduce((sum, p) => sum + p.current_pnl, 0);
    return this.equity + floating_pnl;
  }

  /**
   * 获取持仓
   */
  getPosition(position_id: string): Position | undefined {
    return this.positions.get(position_id);
  }

  /**
   * 获取市场持仓
   */
  getMarketPosition(market_id: string): Position | undefined {
    for (const position of this.positions.values()) {
      if (position.market_id === market_id) {
        return position;
      }
    }
    return undefined;
  }

  /**
   * 检查是否有持仓
   */
  hasPosition(market_id: string): boolean {
    return this.traded_market_ids.has(market_id);
  }

  /**
   * 检查是否可以开仓
   */
  canOpenPosition(market_id: string): boolean {
    if (this.positions.size >= this.config.max_positions) {
      return false;
    }
    if (this.hasPosition(market_id)) {
      return false;
    }
    return true;
  }

  /**
   * 获取所有持仓
   */
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * 获取开放持仓
   */
  getOpenPositions(): Position[] {
    return Array.from(this.positions.values()).filter(p => p.status === 'open');
  }

  /**
   * 获取已平仓持仓
   */
  getClosedPositions(): Position[] {
    return [...this.closed_positions];
  }

  /**
   * 获取统计信息
   */
  getStatistics() {
    const open_positions = this.getOpenPositions();
    const closed_positions = this.getClosedPositions();

    const total_pnl = closed_positions.reduce((sum, p) => sum + p.pnl, 0);
    const floating_pnl = open_positions.reduce((sum, p) => sum + p.current_pnl, 0);
    const winCount = closed_positions.filter(p => p.pnl > 0).length;
    const lossCount = closed_positions.filter(p => p.pnl < 0).length;

    return {
      openCount: open_positions.length,
      closedCount: closed_positions.length,
      totalPnl: total_pnl,
      floatingPnl: floating_pnl,
      equity: this.equity,
      totalAssets: this.getTotalAssets(),
      winCount,
      lossCount,
      winRate: closed_positions.length > 0 ? winCount / closed_positions.length : 0,
    };
  }

  /**
   * 清空持仓
   */
  clear(initial_capital?: number): void {
    this.positions.clear();
    this.closed_positions = [];
    this.traded_market_ids.clear();

    // 如果提供了新的初始资金，更新配置
    if (initial_capital !== undefined) {
      this.config.initial_capital = initial_capital;
      this.equity = initial_capital;
    } else {
      this.equity = this.config.initial_capital;
    }

    console.log(`[PositionManager] 持仓已清空, 初始资金: ${this.config.initial_capital}`);
  }
}

// 导出单例
export const positionManager = new PositionManager();
