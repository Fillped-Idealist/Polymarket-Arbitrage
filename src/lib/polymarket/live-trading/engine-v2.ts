/**
 * 实盘交易引擎（V2）
 * 参考 main_3.py 实现，使用真实数据流
 */

import { LiveTradingConfig, LiveTrade, LiveTradingEvent, LiveTradingCallback, ProgressData } from './types';
import { candidateManager, Candidate } from '../candidate-manager-v2';
import { positionManager } from '../position-manager-v2';
import { gammaApiClient, ParsedMarket } from '../gamma-api-v2';
import { clobApiClient } from '../clob-api-v2';
import { LiveReversalStrategyV9 } from '../strategies/live-reversal-v9';
import { LiveConvergenceStrategy } from '../strategies/live-convergence';

export class LiveTradingEngineV2 {
  private config: LiveTradingConfig;
  private isRunning: boolean = false;
  private updateTimer?: NodeJS.Timeout;
  private callback?: LiveTradingCallback;

  // 策略实例
  private reversalStrategy: LiveReversalStrategyV9;
  private convergenceStrategy: LiveConvergenceStrategy;

  // 市场缓存
  private market_cache: Map<string, ParsedMarket> = new Map();

  // 进度状态
  private currentProgress: ProgressData = {
    step: 'idle',
    current: 0,
    total: 0,
    message: '待机中',
  };

  constructor(config: LiveTradingConfig, callback?: LiveTradingCallback) {
    this.config = config;
    this.callback = callback;

    // 初始化策略
    this.reversalStrategy = new LiveReversalStrategyV9();
    this.convergenceStrategy = new LiveConvergenceStrategy(config);
  }

  /**
   * 启动实盘交易
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.emitEvent('info', { message: '实盘交易已经在运行中' });
      return;
    }

    console.log('[LiveTradingEngineV2] 启动实盘交易...');

    try {
      this.isRunning = true;

      // 1. 立即执行一次更新
      await this.runUpdate();

      // 2. 设置定时更新
      const intervalMs = this.config.updateIntervalMinutes * 60 * 1000;
      this.updateTimer = setInterval(async () => {
        await this.runUpdate();
      }, intervalMs);

      this.emitEvent('info', {
        message: '实盘交易已启动',
        config: this.config,
        updateInterval: `${this.config.updateIntervalMinutes} 分钟`,
      });

      console.log(`[LiveTradingEngineV2] 实盘交易已启动，更新间隔：${this.config.updateIntervalMinutes} 分钟`);
    } catch (error) {
      this.isRunning = false;
      console.error('[LiveTradingEngineV2] 启动失败:', error);
      this.emitEvent('error', { message: '启动失败', error });
      throw error;
    }
  }

  /**
   * 停止实盘交易
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[LiveTradingEngineV2] 停止实盘交易...');

    this.isRunning = false;

    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }

    this.emitEvent('info', { message: '实盘交易已停止' });
    console.log('[LiveTradingEngineV2] 实盘交易已停止');
  }

  /**
   * 执行一次更新（核心流程）
   * 参考 main_3.py 的 run 实现
   */
  private async runUpdate(): Promise<void> {
    const startTime = Date.now();
    console.log('\n[LiveTradingEngineV2] ========== 开始更新 ==========');
    console.log(`[LiveTradingEngineV2] 时间: ${new Date().toISOString()}`);

    try {
      // 步骤 1: 市场信息获取（Gamma API）
      this.updateProgress({
        step: 'fetching_markets',
        current: 0,
        total: 6,
        message: '正在从 Gamma API 获取市场数据...',
      });
      const markets = await this.updateMarketsFromGamma();

      // 步骤 2: 持仓检查（平仓逻辑）
      this.updateProgress({
        step: 'checking_positions',
        current: 1,
        total: 6,
        message: '正在检查持仓（平仓逻辑）...',
      });
      await this.checkPositions(markets);

      // 步骤 3: 候选仓挑选（筛选有效市场）
      this.updateProgress({
        step: 'updating_candidates',
        current: 2,
        total: 6,
        message: '正在筛选候选市场...',
      });
      await this.updateCandidates(markets);

      // 步骤 4: 盘口数据读取（CLOB API）
      this.updateProgress({
        step: 'updating_order_books',
        current: 3,
        total: 6,
        message: '正在获取盘口数据（CLOB API）...',
      });
      await this.updateOrderBooks();

      // 步骤 5: 分析数据开仓（开仓逻辑）
      this.updateProgress({
        step: 'checking_entries',
        current: 4,
        total: 6,
        message: '正在检查开仓机会...',
      });
      await this.checkEntryOpportunities();

      // 步骤 6: 更新持仓价格（实时盈亏）
      this.updateProgress({
        step: 'updating_prices',
        current: 5,
        total: 6,
        message: '正在更新持仓价格...',
      });
      await this.updatePositionPrices(markets);

      // 完成
      this.updateProgress({
        step: 'idle',
        current: 6,
        total: 6,
        message: '更新完成',
        details: `耗时: ${Date.now() - startTime}ms`,
      });

      const duration = Date.now() - startTime;
      console.log(`[LiveTradingEngineV2] 更新完成，耗时: ${duration}ms`);
      console.log('[LiveTradingEngineV2] ========== 更新结束 ==========\n');

      this.emitEvent('info', {
        message: '更新完成',
        duration: `${duration}ms`,
      });
    } catch (error) {
      this.updateProgress({
        step: 'error',
        current: 0,
        total: 6,
        message: '更新失败',
        details: error instanceof Error ? error.message : '未知错误',
      });
      console.error('[LiveTradingEngineV2] 更新失败:', error);
      this.emitEvent('error', { message: '更新失败', error });
    }
  }

  /**
   * 步骤 1: 市场信息获取（Gamma API）
   */
  private async updateMarketsFromGamma(): Promise<ParsedMarket[]> {
    console.log('[LiveTradingEngineV2] 步骤 1: 从 Gamma API 获取市场信息...');

    try {
      const markets = await gammaApiClient.fetchMarkets(480);

      // 更新市场缓存
      for (const market of markets) {
        this.market_cache.set(market.id, market);
      }

      console.log(`[LiveTradingEngineV2] ✓ 市场信息获取完成: ${markets.length} 个市场`);

      this.updateProgress({
        step: 'fetching_markets',
        current: 0,
        total: 6,
        message: '市场数据获取完成',
        details: `共 ${markets.length} 个市场`,
      });

      return markets;
    } catch (error) {
      console.error('[LiveTradingEngineV2] ✗ 市场信息获取失败:', error);
      this.updateProgress({
        step: 'error',
        current: 0,
        total: 6,
        message: '市场信息获取失败',
        details: error instanceof Error ? error.message : '未知错误',
      });
      throw error;
    }
  }

  /**
   * 步骤 2: 持仓检查（平仓逻辑）
   */
  private async checkPositions(markets: ParsedMarket[]): Promise<void> {
    console.log('[LiveTradingEngineV2] 步骤 2: 检查持仓（平仓逻辑）...');

    try {
      const open_positions = positionManager.getOpenPositions();
      console.log(`[LiveTradingEngineV2] 当前持仓数: ${open_positions.length}`);

      const market_dict = new Map(markets.map(m => [m.id, m]));

      // 为每个持仓执行平仓检查
      for (const position of open_positions) {
        const market = market_dict.get(position.market_id);
        if (!market) {
          console.warn(`[LiveTradingEngineV2] 市场不在缓存中: ${position.market_id}`);
          continue;
        }

        const current_price = market.probabilities.get(position.outcome_name) || position.current_price;
        const current_time = new Date();

        // 根据策略类型选择对应的策略实例
        const strategy = position.strategy === 'convergence'
          ? this.convergenceStrategy
          : this.reversalStrategy;

        // 更新持仓价格
        positionManager.updatePositionPrice(position.id, current_price);

        // 检查是否应该平仓
        const should_close = strategy.shouldClose(
          position,
          current_price,
          current_time,
          this.config
        );

        if (should_close) {
          const exit_reason = strategy.getExitReason(position, current_price, current_time);
          positionManager.closePosition(position, current_price, exit_reason);
          this.emitEvent('position_closed', { position, exit_reason });
          console.log(`[LiveTradingEngineV2] ✓ 平仓: ${position.id}, 原因: ${exit_reason}`);
        }
      }

      console.log('[LiveTradingEngineV2] ✓ 持仓检查完成');
    } catch (error) {
      console.error('[LiveTradingEngineV2] ✗ 持仓检查失败:', error);
      throw error;
    }
  }

  /**
   * 步骤 3: 候选仓挑选（筛选有效市场）
   */
  private async updateCandidates(markets: ParsedMarket[]): Promise<void> {
    console.log('[LiveTradingEngineV2] 步骤 3: 更新候选仓...');

    try {
      // 移除过期候选仓
      candidateManager.removeExpiredCandidates();

      // 添加新候选仓（这里简化处理，实际应该根据策略筛选）
      // 参考 main_3.py 的 _filter_opportunities 实现
      const traded_market_ids = new Set(
        Array.from(this.market_cache.keys())
          .filter(id => positionManager.hasPosition(id))
      );

      const valid_candidates = candidateManager.getValidCandidates(traded_market_ids);
      console.log(`[LiveTradingEngineV2] ✓ 候选仓更新完成: ${valid_candidates.length} 个有效候选`);
    } catch (error) {
      console.error('[LiveTradingEngineV2] ✗ 候选仓更新失败:', error);
      throw error;
    }
  }

  /**
   * 步骤 4: 盘口数据读取（CLOB API）
   */
  private async updateOrderBooks(): Promise<void> {
    console.log('[LiveTradingEngineV2] 步骤 4: 更新订单簿（CLOB API）...');

    try {
      // 验证流动性
      await candidateManager.validateLiquidity();

      console.log('[LiveTradingEngineV2] ✓ 订单簿更新完成');
    } catch (error) {
      console.error('[LiveTradingEngineV2] ✗ 订单簿更新失败:', error);
      throw error;
    }
  }

  /**
   * 步骤 5: 分析数据开仓（开仓逻辑）
   */
  private async checkEntryOpportunities(): Promise<void> {
    console.log('[LiveTradingEngineV2] 步骤 5: 检查开仓机会...');

    try {
      const open_positions = positionManager.getOpenPositions();
      console.log(`[LiveTradingEngineV2] 当前持仓数: ${open_positions.length}/${this.config.maxPositions}`);

      // 如果已满仓，不检查开仓
      if (open_positions.length >= this.config.maxPositions) {
        console.log('[LiveTradingEngineV2] 已满仓，跳过开仓检查');
        return;
      }

      // 获取有效候选仓
      const candidates = candidateManager.getValidCandidates();
      console.log(`[LiveTradingEngineV2] 有效候选仓数: ${candidates.length}`);

      // 检查每个候选仓
      for (const candidate of candidates) {
        if (open_positions.length >= this.config.maxPositions) {
          break;
        }

        // 检查 Reversal 策略
        if (this.config.strategies.reversal.enabled) {
          const reversal_positions = open_positions.filter(p => p.strategy === 'reversal');
          if (reversal_positions.length < this.config.strategies.reversal.maxPositions) {
            const should_open = await this.reversalStrategy.shouldOpen(
              candidate.market,
              candidate.outcome_name,
              this.config
            );

            if (should_open) {
              await this.openPosition(candidate, 'reversal');
              continue;
            }
          }
        }

        // 检查 Convergence 策略
        if (this.config.strategies.convergence.enabled) {
          const convergence_positions = open_positions.filter(p => p.strategy === 'convergence');
          if (convergence_positions.length < this.config.strategies.convergence.maxPositions) {
            const should_open = await this.convergenceStrategy.shouldOpen(
              candidate.market,
              candidate.outcome_name,
              this.config
            );

            if (should_open) {
              await this.openPosition(candidate, 'convergence');
            }
          }
        }
      }

      console.log('[LiveTradingEngineV2] ✓ 开仓检查完成');
    } catch (error) {
      console.error('[LiveTradingEngineV2] ✗ 开仓检查失败:', error);
      throw error;
    }
  }

  /**
   * 步骤 6: 更新持仓价格（实时盈亏）
   */
  private async updatePositionPrices(markets: ParsedMarket[]): Promise<void> {
    console.log('[LiveTradingEngineV2] 步骤 6: 更新持仓价格...');

    try {
      const market_prices = new Map<string, Map<string, number>>();

      for (const market of markets) {
        market_prices.set(market.id, market.probabilities);
      }

      // 批量更新持仓价格
      await positionManager.updatePositionsPrices(market_prices);

      console.log('[LiveTradingEngineV2] ✓ 持仓价格更新完成');
    } catch (error) {
      console.error('[LiveTradingEngineV2] ✗ 持仓价格更新失败:', error);
      throw error;
    }
  }

  /**
   * 开仓
   * 参考 main_3.py 的 _place_order 实现
   */
  private async openPosition(candidate: Candidate, strategy: 'reversal' | 'convergence'): Promise<void> {
    try {
      const market = candidate.market;
      const outcome_id = market.outcomeIds.get(candidate.outcome_name);
      const entry_price = candidate.latest_price;

      if (!outcome_id || entry_price <= 0) {
        console.warn(`[LiveTradingEngineV2] 无效的开仓参数: ${market.id}`);
        return;
      }

      // 获取订单簿
      const order_book = await clobApiClient.fetchOrderBook(outcome_id);
      if (!order_book) {
        console.warn(`[LiveTradingEngineV2] 订单簿查询失败: ${outcome_id}`);
        return;
      }

      // 获取最佳价格
      const best_price = clobApiClient.getBestPrice(order_book);
      if (!best_price) {
        console.warn(`[LiveTradingEngineV2] 无法获取最佳价格: ${outcome_id}`);
        return;
      }

      // 使用卖一价作为入场价
      const real_entry_price = best_price.ask;
      const ask_size = best_price.ask_size;

      // 检查深度
      const equity = positionManager.getEquity();
      const position_value = equity * this.config.maxPositionSize;
      const position_size = Math.floor(position_value / real_entry_price);

      if (position_size <= 0) {
        console.warn(`[LiveTradingEngineV2] 仓位大小无效: ${position_size}`);
        return;
      }

      // 检查深度是否足够
      if (!clobApiClient.hasEnoughLiquidity(order_book, 'buy', position_size, 2)) {
        console.warn(`[LiveTradingEngineV2] 深度不足: ${ask_size} < ${position_size * 2}`);
        return;
      }

      // 计算手续费
      const fee = position_size * real_entry_price * 0.002; // 吃单手续费 0.2%
      const total_cost = position_size * real_entry_price + fee;

      // 检查可用资金
      if (total_cost > positionManager.getEquity()) {
        console.warn(`[LiveTradingEngineV2] 可用资金不足: ${total_cost} > ${positionManager.getEquity()}`);
        return;
      }

      // 找到结果索引
      const outcomes = market.outcomes;
      const outcome_index = outcomes.indexOf(candidate.outcome_name);
      if (outcome_index === -1) {
        console.warn(`[LiveTradingEngineV2] 无法找到结果索引: ${candidate.outcome_name}`);
        return;
      }

      // 创建持仓
      const position: LiveTrade = {
        id: `${market.id}-${Date.now()}-${strategy}`,
        market_id: market.id,
        question: market.question,
        strategy,
        outcome_index,
        outcome_name: candidate.outcome_name,
        entry_time: new Date(),
        entry_price: real_entry_price,
        position_size,
        entry_value: position_size * real_entry_price,
        end_date: market.endDate,
        exit_time: null,
        exit_price: null,
        exit_value: null,
        pnl: 0,
        pnl_percent: 0,
        status: 'open',
        exit_reason: '',
        current_price: real_entry_price,
        current_pnl: 0,
        current_pnl_percent: 0,
        highest_price: real_entry_price,
        last_updated: new Date(),
        trend_strength: candidate.trend_strength,
        price_drop_flag: false,
        trailing_stop_hit: false,
        trailing_tp_active: false,
        trailing_tp_hit: false,
        tp_stage: 0,
        outcome_id,
      };

      // 添加持仓
      positionManager.addPosition(position);

      this.emitEvent('position_opened', { position });
      console.log(
        `[LiveTradingEngineV2] ✓ 开仓: ${position.id}, ` +
        `入场价: ${real_entry_price.toFixed(4)}, ` +
        `仓位大小: ${position_size}, ` +
        `深度: ${ask_size.toFixed(2)}, ` +
        `手续费: ${fee.toFixed(2)}`
      );
    } catch (error) {
      console.error('[LiveTradingEngineV2] 开仓失败:', error);
      throw error;
    }
  }

  /**
   * 获取统计信息
   */
  getStatistics() {
    const position_stats = positionManager.getStatistics();
    const candidate_stats = candidateManager.getStatistics();

    return {
      isRunning: this.isRunning,
      updateInterval: `${this.config.updateIntervalMinutes} 分钟`,
      positions: position_stats,
      candidates: candidate_stats,
      config: this.config,
    };
  }

  /**
   * 获取当前进度
   */
  getProgress(): ProgressData {
    return { ...this.currentProgress };
  }

  /**
   * 更新进度
   */
  private updateProgress(progress: Partial<ProgressData>): void {
    this.currentProgress = {
      ...this.currentProgress,
      ...progress,
    };
    this.emitEvent('progress', this.currentProgress);
  }

  /**
   * 发送事件
   */
  private emitEvent(type: LiveTradingEvent['type'], data?: any): void {
    if (this.callback) {
      this.callback({
        type,
        timestamp: new Date(),
        data,
      });
    }
  }
}

// 创建测试模式配置工厂
export function createTestModeConfig(
  test_mode: LiveTradingConfig['testMode'],
  initial_capital: number = 10000
): LiveTradingConfig {
  const base_config = {
    initialCapital: initial_capital,
    maxPositions: 5,
    maxPositionSize: 0.18,
    testMode: test_mode,
    updateIntervalMinutes: 10,
    minLiquidity: 100,
    maxSlippage: 0.02,
  };

  switch (test_mode) {
    case 'all-reversal':
      return {
        ...base_config,
        strategies: {
          reversal: {
            enabled: true,
            maxPositions: 5,
            maxPositionSize: 0.18,
          },
          convergence: {
            enabled: false,
            maxPositions: 0,
            maxPositionSize: 0.18,
          },
        },
      };

    case '1-convergence-4-reversal':
      return {
        ...base_config,
        strategies: {
          reversal: {
            enabled: true,
            maxPositions: 4,
            maxPositionSize: 0.18,
          },
          convergence: {
            enabled: true,
            maxPositions: 1,
            maxPositionSize: 0.18,
          },
        },
      };

    case '2-convergence-3-reversal':
      return {
        ...base_config,
        strategies: {
          reversal: {
            enabled: true,
            maxPositions: 3,
            maxPositionSize: 0.18,
          },
          convergence: {
            enabled: true,
            maxPositions: 2,
            maxPositionSize: 0.18,
          },
        },
      };

    default:
      throw new Error(`未知的测试模式: ${test_mode}`);
  }
}
