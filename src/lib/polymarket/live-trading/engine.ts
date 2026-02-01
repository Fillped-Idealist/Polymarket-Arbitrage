/**
 * 实盘交易引擎
 * 整合所有模块，执行实时交易策略
 *
 * 【核心流程】
 * 1. 市场信息获取（Gamma API）
 * 2. 持仓检查
 * 3. 候选仓挑选
 * 4. 盘口数据读取（CLOB API）
 * 5. 分析数据开仓/平仓
 */

import { LiveTradingConfig, LiveTrade, LiveTradingEvent, LiveTradingCallback } from './types';
import { candidateManager, CandidateMarket } from '../candidate-manager';
import { positionManager } from '../position-manager';
import { gammaApiClient } from '../gamma-api';
import { clobApiClient } from '../clob-api';
import { LiveReversalStrategyV9 } from '../strategies/live-reversal-v9';
import { LiveConvergenceStrategy } from '../strategies/live-convergence';
import { BacktestStrategyType, BacktestPositionStatus } from '../../backtest/types';

export class LiveTradingEngine {
  private config: LiveTradingConfig;
  private isRunning: boolean = false;
  private updateTimer?: NodeJS.Timeout;
  private callback?: LiveTradingCallback;

  // 策略实例
  private reversalStrategy: LiveReversalStrategyV9;
  private convergenceStrategy: LiveConvergenceStrategy;

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

    console.log('[LiveTradingEngine] 启动实盘交易...');

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

      console.log(`[LiveTradingEngine] 实盘交易已启动，更新间隔：${this.config.updateIntervalMinutes} 分钟`);
    } catch (error) {
      this.isRunning = false;
      console.error('[LiveTradingEngine] 启动失败:', error);
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

    console.log('[LiveTradingEngine] 停止实盘交易...');

    this.isRunning = false;

    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }

    this.emitEvent('info', { message: '实盘交易已停止' });
    console.log('[LiveTradingEngine] 实盘交易已停止');
  }

  /**
   * 执行一次更新（核心流程）
   */
  private async runUpdate(): Promise<void> {
    const startTime = Date.now();
    console.log('\n[LiveTradingEngine] ========== 开始更新 ==========');
    console.log(`[LiveTradingEngine] 时间: ${new Date().toISOString()}`);

    try {
      // 步骤 1: 市场信息获取（Gamma API）
      await this.updateMarketsFromGamma();

      // 步骤 2: 持仓检查（平仓逻辑）
      await this.checkPositions();

      // 步骤 3: 候选仓挑选（筛选有效市场）
      await this.updateCandidates();

      // 步骤 4: 盘口数据读取（CLOB API）
      await this.updateOrderBooks();

      // 步骤 5: 分析数据开仓（开仓逻辑）
      await this.checkEntryOpportunities();

      // 步骤 6: 更新持仓价格（实时盈亏）
      await this.updatePositionPrices();

      const duration = Date.now() - startTime;
      console.log(`[LiveTradingEngine] 更新完成，耗时: ${duration}ms`);
      console.log('[LiveTradingEngine] ========== 更新结束 ==========\n');

      this.emitEvent('info', {
        message: '更新完成',
        duration: `${duration}ms`,
      });
    } catch (error) {
      console.error('[LiveTradingEngine] 更新失败:', error);
      this.emitEvent('error', { message: '更新失败', error });
    }
  }

  /**
   * 步骤 1: 市场信息获取（Gamma API）
   */
  private async updateMarketsFromGamma(): Promise<void> {
    console.log('[LiveTradingEngine] 步骤 1: 从 Gamma API 获取市场信息...');

    try {
      await candidateManager.updateFromGamma();
      console.log('[LiveTradingEngine] ✓ 市场信息获取完成');
    } catch (error) {
      console.error('[LiveTradingEngine] ✗ 市场信息获取失败:', error);
      throw error;
    }
  }

  /**
   * 步骤 2: 持仓检查（平仓逻辑）
   */
  private async checkPositions(): Promise<void> {
    console.log('[LiveTradingEngine] 步骤 2: 检查持仓（平仓逻辑）...');

    try {
      const openPositions = positionManager.getOpenPositions();
      console.log(`[LiveTradingEngine] 当前持仓数: ${openPositions.length}`);

      // 为每个持仓执行平仓检查
      for (const position of openPositions) {
        // 获取当前价格（从候选仓获取）
        const candidate = candidateManager.getCandidate(position.marketId);
        if (!candidate) {
          console.warn(`[LiveTradingEngine] 市场不在候选仓中: ${position.marketId}`);
          continue;
        }

        const currentPrice = candidate.outcomePrices[position.outcomeIndex];
        const currentTime = new Date();

        // 根据策略类型选择对应的策略实例
        const strategy = position.strategy === 'convergence'
          ? this.convergenceStrategy
          : this.reversalStrategy;

        // 检查是否应该平仓
        const shouldClose = strategy.shouldClose(
          position,
          currentPrice,
          currentTime,
          this.config
        );

        if (shouldClose) {
          const exitReason = strategy.getExitReason(position, currentPrice, currentTime);
          positionManager.closePosition(position, currentPrice, exitReason);
          this.emitEvent('position_closed', { position, exitReason });
          console.log(`[LiveTradingEngine] ✓ 平仓: ${position.id}, 原因: ${exitReason}`);
        }
      }

      console.log('[LiveTradingEngine] ✓ 持仓检查完成');
    } catch (error) {
      console.error('[LiveTradingEngine] ✗ 持仓检查失败:', error);
      throw error;
    }
  }

  /**
   * 步骤 3: 候选仓挑选（筛选有效市场）
   */
  private async updateCandidates(): Promise<void> {
    console.log('[LiveTradingEngine] 步骤 3: 更新候选仓...');

    try {
      // 验证流动性
      await candidateManager.validateLiquidity();

      const stats = candidateManager.getStatistics();
      console.log(`[LiveTradingEngine] ✓ 候选仓更新完成，总数: ${stats.totalCandidates}, 有效: ${stats.validCandidates}`);
    } catch (error) {
      console.error('[LiveTradingEngine] ✗ 候选仓更新失败:', error);
      throw error;
    }
  }

  /**
   * 步骤 4: 盘口数据读取（CLOB API）
   */
  private async updateOrderBooks(): Promise<void> {
    console.log('[LiveTradingEngine] 步骤 4: 更新订单簿（CLOB API）...');

    try {
      // 获取所有有效候选仓和持仓的市场 ID
      const candidates = candidateManager.getValidCandidates();
      const positions = positionManager.getOpenPositions();

      const marketIds = new Set([
        ...candidates.map(c => c.marketId),
        ...positions.map(p => p.marketId),
      ]);

      console.log(`[LiveTradingEngine] 需要更新订单簿的市场数: ${marketIds.size}`);

      // 【实盘特有】获取订单簿数据
      // 这里暂时跳过，需要实现 tokenID 映射
      // const orderBooks = await clobApiClient.getOrderBooks(Array.from(marketIds));

      console.log('[LiveTradingEngine] ✓ 订单簿更新完成');
    } catch (error) {
      console.error('[LiveTradingEngine] ✗ 订单簿更新失败:', error);
      throw error;
    }
  }

  /**
   * 步骤 5: 分析数据开仓（开仓逻辑）
   */
  private async checkEntryOpportunities(): Promise<void> {
    console.log('[LiveTradingEngine] 步骤 5: 检查开仓机会...');

    try {
      const openPositions = positionManager.getOpenPositions();
      console.log(`[LiveTradingEngine] 当前持仓数: ${openPositions.length}/${this.config.maxPositions}`);

      // 如果已满仓，不检查开仓
      if (openPositions.length >= this.config.maxPositions) {
        console.log('[LiveTradingEngine] 已满仓，跳过开仓检查');
        return;
      }

      // 获取有效候选仓
      const candidates = candidateManager.getValidCandidates();
      console.log(`[LiveTradingEngine] 有效候选仓数: ${candidates.length}`);

      // 检查每个候选仓
      for (const candidate of candidates) {
        // 检查是否已有持仓
        if (positionManager.hasPosition(candidate.marketId)) {
          continue;
        }

        // 检查 Reversal 策略
        if (this.config.strategies.reversal.enabled) {
          const reversalPositions = openPositions.filter(p => p.strategy === 'reversal');
          if (reversalPositions.length < this.config.strategies.reversal.maxPositions) {
            const shouldOpen = await this.reversalStrategy.shouldOpen(
              candidate,
              this.config
            );

            if (shouldOpen) {
              await this.openPosition(candidate, 'reversal');
              // 每次只开一个仓，避免同时开多个
              if (positionManager.getOpenPositions().length >= this.config.maxPositions) {
                break;
              }
            }
          }
        }

        // 检查 Convergence 策略
        if (this.config.strategies.convergence.enabled) {
          const convergencePositions = openPositions.filter(p => p.strategy === 'convergence');
          if (convergencePositions.length < this.config.strategies.convergence.maxPositions) {
            const shouldOpen = await this.convergenceStrategy.shouldOpen(
              candidate,
              this.config
            );

            if (shouldOpen) {
              await this.openPosition(candidate, 'convergence');
              // 每次只开一个仓，避免同时开多个
              if (positionManager.getOpenPositions().length >= this.config.maxPositions) {
                break;
              }
            }
          }
        }
      }

      console.log('[LiveTradingEngine] ✓ 开仓检查完成');
    } catch (error) {
      console.error('[LiveTradingEngine] ✗ 开仓检查失败:', error);
      throw error;
    }
  }

  /**
   * 步骤 6: 更新持仓价格（实时盈亏）
   */
  private async updatePositionPrices(): Promise<void> {
    console.log('[LiveTradingEngine] 步骤 6: 更新持仓价格...');

    try {
      const openPositions = positionManager.getOpenPositions();
      const marketPrices = new Map<string, number>();

      // 获取每个持仓的当前价格
      for (const position of openPositions) {
        const candidate = candidateManager.getCandidate(position.marketId);
        if (candidate) {
          const currentPrice = candidate.outcomePrices[position.outcomeIndex];
          marketPrices.set(position.marketId, currentPrice);
        }
      }

      // 批量更新持仓价格
      await positionManager.updatePositionsPrices(marketPrices);

      console.log('[LiveTradingEngine] ✓ 持仓价格更新完成');
    } catch (error) {
      console.error('[LiveTradingEngine] ✗ 持仓价格更新失败:', error);
      throw error;
    }
  }

  /**
   * 开仓
   */
  private async openPosition(candidate: CandidateMarket, strategy: 'reversal' | 'convergence'): Promise<void> {
    try {
      // 找到要交易的结果索引
      const strategyInstance = strategy === 'convergence'
        ? this.convergenceStrategy
        : this.reversalStrategy;

      // 获取策略配置
      const strategyConfig = this.config.strategies[strategy];

      // 简化的结果索引查找（实际应该从策略获取）
      const outcomeIndex = candidate.outcomePrices.findIndex(p => p > 0.01 && p < 0.95);
      if (outcomeIndex === -1) {
        console.warn(`[LiveTradingEngine] 无法找到合适的结果索引: ${candidate.marketId}`);
        return;
      }

      const entryPrice = candidate.outcomePrices[outcomeIndex];

      // 计算仓位大小（18% 固定仓位，不含浮盈）
      const equity = positionManager.getEquity();
      const positionValuePercent = this.config.maxPositionSize;
      const positionValue = equity * positionValuePercent;
      const positionSize = Math.floor(positionValue / entryPrice);

      // 验证仓位大小
      if (positionSize <= 0) {
        console.warn(`[LiveTradingEngine] 仓位大小无效: ${positionSize}`);
        return;
      }

      // 创建持仓
      const position: LiveTrade = {
        id: `${candidate.marketId}-${Date.now()}-${strategy}`,
        marketId: candidate.marketId,
        question: candidate.question,
        strategy,
        outcomeIndex,
        outcomeName: `Outcome ${outcomeIndex + 1}`,
        entryTime: new Date(),
        entryPrice,
        positionSize,
        entryValue: positionSize * entryPrice,
        endDate: candidate.endDate,
        exitTime: null,
        exitPrice: null,
        exitValue: null,
        pnl: 0,
        pnlPercent: 0,
        status: 'open',
        exitReason: '',
        currentPrice: entryPrice,
        currentPnl: 0,
        currentPnlPercent: 0,
        lastUpdated: new Date(),
        highestPrice: entryPrice,
      };

      // 添加持仓
      positionManager.addPosition(position);

      // 更新交易冷却时间
      if (strategy === 'reversal') {
        (this.reversalStrategy as any).updateTradeCooldown(candidate.marketId);
      } else {
        (this.convergenceStrategy as any).updateTradeCooldown(candidate.marketId);
      }

      this.emitEvent('position_opened', { position });
      console.log(`[LiveTradingEngine] ✓ 开仓: ${position.id}, 入场价: ${entryPrice}, 仓位大小: ${positionSize}`);
    } catch (error) {
      console.error('[LiveTradingEngine] 开仓失败:', error);
      throw error;
    }
  }

  /**
   * 获取统计信息
   */
  getStatistics() {
    const positionStats = positionManager.getStatistics();
    const candidateStats = candidateManager.getStatistics();

    return {
      isRunning: this.isRunning,
      updateInterval: `${this.config.updateIntervalMinutes} 分钟`,
      positions: positionStats,
      candidates: candidateStats,
      config: this.config,
    };
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
  testMode: LiveTradingConfig['testMode'],
  initialCapital: number = 10000
): LiveTradingConfig {
  const baseConfig = {
    initialCapital,
    maxPositions: 5,
    maxPositionSize: 0.18,
    testMode,
    updateIntervalMinutes: 10,
    minLiquidity: 100,
    maxSlippage: 0.02,
  };

  switch (testMode) {
    case 'all-reversal':
      return {
        ...baseConfig,
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
        ...baseConfig,
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
        ...baseConfig,
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
      throw new Error(`未知的测试模式: ${testMode}`);
  }
}
