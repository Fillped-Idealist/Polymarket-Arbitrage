/**
 * 实盘交易引擎（V2）
 * 完整修复版：修正了方法嵌套导致的语法错误，并打通了数据流
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
  private clobCheckTimer?: NodeJS.Timeout; // CLOB 批量价格检测定时器
  private callback?: LiveTradingCallback;
  private isUpdating: boolean = false; // 防止重入的标志

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
      this.isUpdating = false;

      // 1. 立即执行一次更新
      await this.runUpdate();

      // 2. 设置定时更新（市场数据更新）
      const intervalMs = this.config.updateIntervalMinutes * 60 * 1000;
      this.updateTimer = setInterval(async () => {
        // 防止重入：如果上一次更新还在进行，跳过这次更新
        if (!this.isUpdating && this.isRunning) {
          await this.runUpdate();
        } else if (this.isUpdating) {
          console.warn('[LiveTradingEngineV2] 上一次更新尚未完成，跳过本次更新');
        }
      }, intervalMs);

      // 3. 设置独立的 CLOB 批量价格检测定时器（每2分钟）
      const clobCheckIntervalMs = 2 * 60 * 1000; // 2分钟
      this.clobCheckTimer = setInterval(async () => {
        if (this.isRunning && !this.isUpdating) {
          await this.checkClobEmergencyStop();
        }
      }, clobCheckIntervalMs);

      this.emitEvent('info', {
        message: '实盘交易已启动',
        config: this.config,
        updateInterval: `${this.config.updateIntervalMinutes} 分钟`,
        clobCheckInterval: '2 分钟',
      });

      console.log(`[LiveTradingEngineV2] 实盘交易已启动，更新间隔：${this.config.updateIntervalMinutes} 分钟，CLOB检测间隔：2分钟`);
    } catch (error) {
      this.isRunning = false;
      this.isUpdating = false;
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

    if (this.clobCheckTimer) {
      clearInterval(this.clobCheckTimer);
      this.clobCheckTimer = undefined;
    }

    this.emitEvent('info', { message: '实盘交易已停止' });
    console.log('[LiveTradingEngineV2] 实盘交易已停止');
  }

  /**
   * 执行一次更新（核心流程）
   */
  private async runUpdate(): Promise<void> {
    // 防止重入
    if (this.isUpdating) {
      console.warn('[LiveTradingEngineV2] 上一次更新尚未完成，跳过本次更新');
      return;
    }

    const startTime = Date.now();
    console.log('\n[LiveTradingEngineV2] ========== 开始更新 ==========');
    console.log(`[LiveTradingEngineV2] 时间: ${new Date().toISOString()}`);

    this.isUpdating = true;

    // 添加超时控制
    const timeoutMs = 5 * 60 * 1000; // 5分钟超时
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('更新超时（5分钟）'));
      }, timeoutMs);
    });

    try {
      const updatePromise = (async () => {
        // 步骤 1: 市场信息获取
        this.updateProgress({
          step: 'fetching_markets',
          current: 0,
          total: 5,
          message: '正在从 Gamma API 获取市场数据...',
        });
        const markets = await this.updateMarketsFromGamma();

        // 步骤 2: 持仓检查（平仓逻辑）
        this.updateProgress({
          step: 'checking_positions',
          current: 1,
          total: 5,
          message: '正在检查持仓（平仓逻辑）...',
        });
        await this.checkPositions(markets);

        // 步骤 3: 更新候选仓 (已打通数据流)
        this.updateProgress({
          step: 'updating_candidates',
          current: 2,
          total: 5,
          message: '正在筛选候选市场...',
        });
        await this.updateCandidates(markets);

        // 步骤 4: 盘口数据读取
        this.updateProgress({
          step: 'updating_order_books',
          current: 3,
          total: 5,
          message: '正在获取盘口数据（CLOB API）...',
        });
        await this.updateOrderBooks();

        // 步骤 5: 分析数据开仓
        this.updateProgress({
          step: 'checking_entries',
          current: 4,
          total: 5,
          message: '正在检查开仓机会...',
        });
        await this.checkEntryOpportunities();

        // 步骤 6: 更新持仓价格
        this.updateProgress({
          step: 'updating_prices',
          current: 5,
          total: 5,
          message: '正在更新持仓价格...',
        });
        await this.updatePositionPrices(markets);

        this.updateProgress({
          step: 'idle',
          current: 5,
          total: 5,
          message: '更新完成',
          details: `耗时: ${Date.now() - startTime}ms`,
        });

        console.log(`[LiveTradingEngineV2] 更新完成，耗时: ${Date.now() - startTime}ms`);
        console.log('[LiveTradingEngineV2] ========== 更新结束 ==========\n');
      })();

      // 使用 Promise.race 实现超时控制
      await Promise.race([updatePromise, timeoutPromise]);

    } catch (error) {
      this.updateProgress({
        step: 'error',
        current: 0,
        total: 6,
        message: '更新失败',
        details: error instanceof Error ? error.message : '未知错误',
      });
      console.error('[LiveTradingEngineV2] 更新失败:', error);

      // 如果是网络错误，延迟一段时间再重试
      if (error instanceof Error && (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED') || error.message.includes('timeout'))) {
        console.warn('[LiveTradingEngineV2] 检测到网络错误，将在下一次定时更新时重试');
      }
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * 步骤 1: 市场信息获取
   */
  private async updateMarketsFromGamma(): Promise<ParsedMarket[]> {
    console.log('[LiveTradingEngineV2] 步骤 1: 从 Gamma API 获取市场信息...');
    const markets = await gammaApiClient.fetchMarkets(480);
    for (const market of markets) {
      this.market_cache.set(market.id, market);
    }
    console.log(`[LiveTradingEngineV2] ✓ 市场信息获取完成: ${markets.length} 个市场`);
    return markets;
  }

  /**
   * 步骤 2: 持仓检查
   */
  private async checkPositions(markets: ParsedMarket[]): Promise<void> {
    const open_positions = positionManager.getOpenPositions();
    const market_dict = new Map(markets.map(m => [m.id, m]));

    for (const position of open_positions) {
      const market = market_dict.get(position.market_id);
      if (!market) continue;

      const current_price = market.probabilities.get(position.outcome_name) || position.current_price;
      const strategy = position.strategy === 'convergence' ? this.convergenceStrategy : this.reversalStrategy;

      positionManager.updatePositionPrice(position.id, current_price);

      if (strategy.shouldClose(position, current_price, new Date(), this.config)) {
        const exit_reason = strategy.getExitReason(position, current_price, new Date());
        positionManager.closePosition(position, current_price, exit_reason);
        this.emitEvent('position_closed', { position, exit_reason });
      }
    }
  }

  /**
   * 步骤 3: 候选仓挑选 (关键修复点：接收数据并正确执行)
   */
  private async updateCandidates(markets: ParsedMarket[]): Promise<void> {
    console.log('[LiveTradingEngineV2] 步骤 3: 更新候选仓...');
    try {
      // 核心修复：调用 candidateManager 注入数据
      await candidateManager.updateFromGamma(markets);

      const traded_market_ids = new Set(
        Array.from(this.market_cache.keys()).filter(id => positionManager.hasPosition(id))
      );

      const valid_candidates = candidateManager.getValidCandidates(traded_market_ids);
      console.log(`[LiveTradingEngineV2] ✓ 候选仓更新完成: ${valid_candidates.length} 个有效候选`);
    } catch (error) {
      console.error('[LiveTradingEngineV2] ✗ 候选仓更新失败:', error);
    }
  }

  /**
   * 步骤 4: 盘口数据验证
   */
  private async updateOrderBooks(): Promise<void> {
    console.log('[LiveTradingEngineV2] 步骤 4: 更新订单簿...');
    await candidateManager.validateLiquidity();
  }

  /**
   * 步骤 5: 分析数据开仓
   */
  private async checkEntryOpportunities(): Promise<void> {
    console.log('[LiveTradingEngineV2] 步骤 5: 检查开仓机会...');
    const open_positions = positionManager.getOpenPositions();

    if (open_positions.length >= this.config.maxPositions) {
      console.log('[LiveTradingEngineV2] 已满仓，跳过开仓检查');
      return;
    }
    
    const candidates = candidateManager.getValidCandidates();
    for (const candidate of candidates) {
      if (positionManager.getOpenPositions().length >= this.config.maxPositions) break;

      // 检查 Reversal 策略
      if (this.config.strategies.reversal.enabled) {
        // 1. 获取当前市场的最新价格数组
        const prices = (this.reversalStrategy as any).extractPrices(candidate.market);
        // 2. 找到策略真正认可的那个 Outcome 索引
        const targetIndex = (this.reversalStrategy as any).findOutcomeIndex(candidate.market, prices);
        const rev_count = positionManager.getOpenPositions().filter(p => p.strategy === 'reversal').length;

        if (targetIndex !== -1 && rev_count < this.config.strategies.reversal.maxPositions) {
          // 3. 只有当策略明确表示可以开仓时
          if (await this.reversalStrategy.shouldOpen(candidate.market, this.config)) {
            // 4. 【核心修复】修正 candidate 的 outcome，确保下单是 targetIndex 对应的那个
            const correctOutcomeName = candidate.market.outcomes[targetIndex];
            const correctedCandidate = {
              ...candidate,
              outcome_name: correctOutcomeName
            };
            
            console.log(`[Engine] 修正开仓目标: 原${candidate.outcome_name} -> 现${correctOutcomeName}`);
            await this.openPosition(correctedCandidate, 'reversal');
            continue;
          }
        }
      }

      // 检查 Convergence 策略
      if (this.config.strategies.convergence.enabled) {
        const con_count = positionManager.getOpenPositions().filter(p => p.strategy === 'convergence').length;
        if (con_count < this.config.strategies.convergence.maxPositions) {
          
          // 1. 同样获取价格并找到策略认可的索引
          // 注意：确保你的 LiveConvergenceStrategy 有 findOutcomeIndex 方法且是 public 或者能被访问
          const conIndex = (this.convergenceStrategy as any).findOutcomeIndex(candidate.market);

          if (conIndex !== -1 && await this.convergenceStrategy.shouldOpen(candidate.market, this.config)) {
            // 2. 【关键修正】将开仓目标修正为策略锁定的那个 Outcome
            const correctOutcomeName = candidate.market.outcomes[conIndex];
            const correctedCandidate = {
              ...candidate,
              outcome_name: correctOutcomeName
            };

            console.log(`[Engine] Convergence 修正目标: ${correctOutcomeName} (索引:${conIndex})`);
            await this.openPosition(correctedCandidate, 'convergence');
            continue; // 开仓后跳到下一个 candidate
          }
        }
      }
    }
  }

  /**
   * 步骤 6: 更新价格
   */
  private async updatePositionPrices(markets: ParsedMarket[]): Promise<void> {
    const market_prices = new Map<string, Map<string, number>>();
    markets.forEach(m => market_prices.set(m.id, m.probabilities));
    await positionManager.updatePositionsPrices(market_prices);
  }

  /**
   * 开仓执行
   */
  private async openPosition(candidate: Candidate, strategy: 'reversal' | 'convergence'): Promise<void> {
    try {
      const market = candidate.market;
      const outcome_id = market.outcomeIds.get(candidate.outcome_name);
      if (!outcome_id) return;

      const order_book = await clobApiClient.fetchOrderBook(outcome_id);
      const best_price = order_book ? clobApiClient.getBestPrice(order_book) : null;

      if (!best_price) return;

      // --- 新增：价差过滤逻辑 ---
      const ask = best_price.ask;
      const bid = best_price.bid || 0;
      const mid_price = (ask + bid) / 2 || market.probabilities.get(candidate.outcome_name) || ask;
      
      // 计算实际价差百分比 (基于中间价)
      const current_spread = ask - bid;
      const current_spread_2 = (ask - mid_price) / mid_price;
      
      // 设定价差容忍度(2.5%)
      const max_allowed_spread = 0.025;
      const max_allowed_spread_2 = 0.05;

      if (current_spread > max_allowed_spread || current_spread_2 > max_allowed_spread_2) {
        console.log(`[Engine] ✗ 放弃开仓: 价差过大 (${(current_spread * 100).toFixed(2)}% > ${(max_allowed_spread * 100).toFixed(2)}%) | (${(current_spread_2 * 100).toFixed(2)}% > ${(max_allowed_spread_2 * 100).toFixed(2)}%) | ${market.question}`);
        return; 
      }

      const real_entry_price = best_price.ask;
      const equity = positionManager.getEquity();
      const position_size = Math.floor((equity * this.config.maxPositionSize) / real_entry_price);

      if (position_size <= 0) return;

      const position: LiveTrade = {
        id: `${market.id}-${Date.now()}-${strategy}`,
        market_id: market.id,
        question: market.question,
        strategy,
        outcome_index: market.outcomes.indexOf(candidate.outcome_name),
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

      positionManager.addPosition(position);
      this.emitEvent('position_opened', { position });
      console.log(`[LiveTradingEngineV2] ✓ 开仓成功: ${market.question}`);
    } catch (error) {
      console.error('[LiveTradingEngineV2] 开仓失败:', error);
    }
  }

  getStatistics() {
    return {
      isRunning: this.isRunning,
      updateInterval: `${this.config.updateIntervalMinutes} 分钟`,
      positions: positionManager.getStatistics(),
      candidates: candidateManager.getStatistics(),
      config: this.config,
    };
  }

  getProgress(): ProgressData { return { ...this.currentProgress }; }

  private updateProgress(progress: Partial<ProgressData>): void {
    this.currentProgress = { ...this.currentProgress, ...progress };
    this.emitEvent('progress', this.currentProgress);
  }

  private emitEvent(type: LiveTradingEvent['type'], data?: any): void {
    if (this.callback) this.callback({ type, timestamp: new Date(), data });
  }

  /**
   * CLOB 批量价格检测（防止短期暴跌）
   * 独立于原有检测机制，每2分钟检测一次
   * 只检查持仓，不检查其他市场和候选仓
   * 止损幅度是原来阶段止损的1.5倍
   */
  private async checkClobEmergencyStop(): Promise<void> {
    try {
      const openPositions = positionManager.getOpenPositions();
      if (openPositions.length === 0) {
        return;
      }

      console.log('[LiveTradingEngineV2] CLOB 批量价格检测（防止短期暴跌）...');

      // 收集所有持仓的 token ID
      const tokenIds = openPositions
        .map(p => p.outcome_id)
        .filter(id => id) as string[];

      if (tokenIds.length === 0) {
        console.log('[LiveTradingEngineV2] 没有需要检测的 token ID');
        return;
      }

      // 批量获取订单簿
      const orderBooks = await clobApiClient.fetchOrderBooks(tokenIds);
      console.log(`[LiveTradingEngineV2] CLOB 批量价格检测完成: ${orderBooks.size}/${tokenIds.length}`);

      // 检查每个持仓
      for (const position of openPositions) {
        const orderBook = orderBooks.get(position.outcome_id);
        if (!orderBook) {
          continue;
        }

        // 获取最佳价格（卖一价，因为我们要卖出）
        const bestPrice = clobApiClient.getBestPrice(orderBook);
        if (!bestPrice || bestPrice.ask === 0) {
          continue;
        }

        // 计算跌幅
        const dropPercent = (bestPrice.ask - position.entry_price) / position.entry_price;

        // 根据策略和入场价格计算止损阈值
        let hardStopThreshold: number;

        if (position.strategy === 'convergence') {
          // Convergence 策略：硬止损是 -5%，乘以 1.5 = -7.5%
          hardStopThreshold = -0.05 * 1.5; // -7.5%
        } else {
          // Reversal 策略：根据入场价格区间确定阶段止损，然后乘以 1.5
          const priceRange = this.getPriceRangeForReversal(position.entry_price);
          const baseStopLoss = this.getBaseStopLossForPriceRange(priceRange);
          hardStopThreshold = baseStopLoss * 1.5; // 原阶段止损的 1.5 倍
        }

        // 如果跌幅超过硬止损的1.5倍，强制平仓
        if (dropPercent < hardStopThreshold) {
          const exitReason = `CLOB紧急止损：价格从 ${(position.entry_price * 100).toFixed(3)}% 跌至 ${(bestPrice.ask * 100).toFixed(3)}% (跌幅${(dropPercent * 100).toFixed(2)}%，超过原阶段止损${(-hardStopThreshold / 1.5 * 100).toFixed(0)}%的1.5倍即${(-hardStopThreshold * 100).toFixed(1)}%)`;
          console.warn(`[LiveTradingEngineV2] ${exitReason}`);

          positionManager.closePosition(position, bestPrice.ask, exitReason);
          this.emitEvent('position_closed', { position, exit_reason: exitReason });
        }
      }

      console.log('[LiveTradingEngineV2] CLOB 批量价格检测完成');
    } catch (error) {
      console.error('[LiveTradingEngineV2] CLOB 批量价格检测失败:', error);
      // 不影响主流程，只记录错误
    }
  }

  /**
   * 辅助方法：根据入场价格确定 Reversal 策略的价格区间
   */
  private getPriceRangeForReversal(entryPrice: number): 'ultra_low' | 'low' | 'medium_low' | 'medium' | null {
    if (entryPrice >= 0.01 && entryPrice <= 0.05) return 'ultra_low';  // 极低价格：1%-5%
    if (entryPrice > 0.05 && entryPrice <= 0.10) return 'low';  // 低价格：5%-10%
    if (entryPrice > 0.10 && entryPrice <= 0.20) return 'medium_low';  // 中低价格：10%-20%
    if (entryPrice > 0.20 && entryPrice <= 0.35) return 'medium';  // 中等价格：20%-35%
    return null;
  }

  /**
   * 辅助方法：根据价格区间获取基础止损比例
   */
  private getBaseStopLossForPriceRange(priceRange: 'ultra_low' | 'low' | 'medium_low' | 'medium' | null): number {
    switch (priceRange) {
      case 'ultra_low':
        return -0.15; // -15%
      case 'low':
        return -0.15; // -15%
      case 'medium_low':
        return -0.10; // -10%
      case 'medium':
        return -0.10; // -10%
      default:
        return -0.15; // 默认 -15%
    }
  }
}

/**
 * 辅助：创建测试配置
 */
export function createTestModeConfig(test_mode: LiveTradingConfig['testMode'], initial_capital: number = 10000): LiveTradingConfig {
  const base_config = {
    initialCapital: initial_capital,
    maxPositions: 5,
    maxPositionSize: 0.18,
    testMode: test_mode,
    updateIntervalMinutes: 10,
    minLiquidity: 100,
    maxSlippage: 0.02,
  };

  const strat_configs: Record<string, any> = {
    'all-reversal': { r: { e: true, m: 5 }, c: { e: false, m: 0 } },
    '1-convergence-4-reversal': { r: { e: true, m: 4 }, c: { e: true, m: 1 } },
    '2-convergence-3-reversal': { r: { e: true, m: 3 }, c: { e: true, m: 2 } },
  };

  const selected = strat_configs[test_mode] || strat_configs['all-reversal'];

  return {
    ...base_config,
    strategies: {
      reversal: { enabled: selected.r.e, maxPositions: selected.r.m, maxPositionSize: 0.18 },
      convergence: { enabled: selected.c.e, maxPositions: selected.c.m, maxPositionSize: 0.18 },
    },
  };
}
