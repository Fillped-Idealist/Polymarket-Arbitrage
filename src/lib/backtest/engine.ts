import {
  BacktestConfig,
  BacktestMarketSnapshot,
  BacktestResult,
  BacktestStrategy,
  BacktestStrategyType,
  BacktestTrade,
  BacktestPositionStatus,
} from './types';
import { StrategyFactory } from './strategies-v4';

/**
 * 回测进度事件
 */
export interface BacktestProgressEvent {
  type: 'start' | 'data_loaded' | 'snapshot_processed' | 'trade_opened' | 'trade_closed' | 'complete' | 'error' | 'trades_batch' | 'equity_curve';
  timestamp: Date;
  data?: any;
}

/**
 * 进度回调函数
 */
export type ProgressCallback = (event: BacktestProgressEvent) => void;

/**
 * 回测引擎
 * 基于历史数据模拟交易策略的表现
 */
export class BacktestEngine {
  private config: BacktestConfig;
  private snapshots: BacktestMarketSnapshot[] = [];
  private strategies: Map<BacktestStrategyType, BacktestStrategy> = new Map();
  private trades: BacktestTrade[] = [];
  private equity: number;
  private peakEquity: number;
  private maxDrawdown: number;

  // 🔥 性能优化：索引结构
  // Map<市场ID, 该市场所有快照按时间排序的数组>
  private marketSnapshotsIndex: Map<string, BacktestMarketSnapshot[]> = new Map();
  // Map<市场ID, 快照时间戳数组（用于二分查找）>
  private marketTimestampsIndex: Map<string, number[]> = new Map();

  // 统计信息
  private stats = {
    totalSnapshots: 0,
    processedSnapshots: 0,
    marketsScanned: 0,
    candidatesFound: 0,
    priceRangeFiltered: 0,  // 价格区间过滤掉的数量
    marketDepthFiltered: 0,  // 市场深度过滤掉的数量
    maxPositionsFiltered: 0,  // 最大持仓数量过滤掉的数量
    riskManagementFiltered: 0,  // 风险管理过滤掉的数量
    tradesOpened: 0,
    tradesClosed: 0,
  };

  // 交易冷却时间（市场ID → 最后交易时间）
  private tradeCooldowns: Map<string, Date> = new Map();
  private readonly COOLDOWN_MINUTES = 30; // 30分钟冷却时间

  // 🔥 市场黑名单（市场ID → 黑名单原因）
  // 例如：市场归零后加入黑名单，不再重复开仓
  private marketBlacklist: Map<string, string> = new Map();

  // 进度回调
  private progressCallback?: ProgressCallback;

  constructor(config: BacktestConfig, progressCallback?: ProgressCallback) {
    this.config = config;
    this.equity = config.initialCapital;
    this.peakEquity = config.initialCapital;
    this.maxDrawdown = 0;
    this.progressCallback = progressCallback;

    // 初始化策略（传入 engine 参数，以便策略可以访问历史价格）
    Object.values(BacktestStrategyType).forEach(type => {
      const strategyVersion = this.config.strategies[type].version;
      this.strategies.set(type, StrategyFactory.getStrategy(type, this, strategyVersion));
    });
  }

  /**
   * 发送进度事件
   */
  private emitProgress(event: BacktestProgressEvent): void {
    if (this.progressCallback) {
      this.progressCallback(event);
    }
  }

  /**
   * 加载历史数据
   */
  async loadData(snapshots: BacktestMarketSnapshot[]): Promise<void> {
    this.emitProgress({
      type: 'start',
      timestamp: new Date(),
      data: {
        message: '开始加载数据...',
        totalSnapshots: snapshots.length,
      },
    });

    // 过滤无效快照
    this.snapshots = snapshots.filter(s => {
      // 检查时间范围
      if (s.timestamp < this.config.startDate || s.timestamp > this.config.endDate) {
        return false;
      }

      // 检查有效性
      if (!this.validateSnapshot(s)) {
        return false;
      }

      return true;
    });

    // 按时间排序
    this.snapshots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // 🔥 构建市场快照索引（性能优化核心）
    this.buildMarketSnapshotsIndex();

    this.stats.totalSnapshots = this.snapshots.length;

    this.emitProgress({
      type: 'data_loaded',
      timestamp: new Date(),
      data: {
        message: `数据加载完成，共 ${this.snapshots.length} 个市场快照`,
        totalSnapshots: this.snapshots.length,
        startDate: this.config.startDate,
        endDate: this.config.endDate,
      },
    });
  }

  /**
   * 🔥 构建市场快照索引（性能优化核心）
   */
  private buildMarketSnapshotsIndex(): void {
    // 清空现有索引
    this.marketSnapshotsIndex.clear();
    this.marketTimestampsIndex.clear();

    // 遍历所有快照，按市场分组
    for (const snapshot of this.snapshots) {
      const marketId = snapshot.marketId;

      // 如果市场索引不存在，创建新的数组
      if (!this.marketSnapshotsIndex.has(marketId)) {
        this.marketSnapshotsIndex.set(marketId, []);
        this.marketTimestampsIndex.set(marketId, []);
      }

      // 添加快照到索引
      this.marketSnapshotsIndex.get(marketId)!.push(snapshot);
      this.marketTimestampsIndex.get(marketId)!.push(snapshot.timestamp.getTime());
    }
  }

  /**
   * 运行回测
   */
  async run(): Promise<BacktestResult> {
    this.emitProgress({
      type: 'start',
      timestamp: new Date(),
      data: {
        message: '🚀 开始回测...',
        config: {
          initialCapital: this.config.initialCapital,
          maxPositions: this.config.maxPositions,
          strategies: Object.entries(this.config.strategies)
            .filter(([_, config]) => config.enabled)
            .map(([name, config]) => ({ name, enabled: config.enabled })),
        },
      },
    });

    // 重置状态
    this.trades = [];
    this.equity = this.config.initialCapital;
    this.peakEquity = this.config.initialCapital;
    this.maxDrawdown = 0;

    // 重置统计
    this.stats = {
      totalSnapshots: this.snapshots.length,
      processedSnapshots: 0,
      marketsScanned: 0,
      candidatesFound: 0,
      priceRangeFiltered: 0,  // 价格区间过滤掉的数量
      marketDepthFiltered: 0,  // 市场深度过滤掉的数量
      maxPositionsFiltered: 0,  // 最大持仓数量过滤掉的数量
      riskManagementFiltered: 0,  // 风险管理过滤掉的数量
      tradesOpened: 0,
      tradesClosed: 0,
    };

    // 资金曲线
    const equityCurve: { timestamp: Date; equity: number; positions: number; returnPercent: number }[] = [];
    let lastRecordedSecond = -1;  // 记录上次记录的秒级时间戳（Unix 时间戳，精确到秒）

    // 按时间顺序处理每个快照
    for (let i = 0; i < this.snapshots.length; i++) {
      const snapshot = this.snapshots[i];

      // 1. 检查现有持仓是否需要平仓
      await this.checkExitConditions(snapshot);

      // 2. 检查是否有新的开仓机会
      await this.checkEntryConditions(snapshot);

      // 3. 更新权益和回撤（必须在记录资金曲线之前）
      await this.updateEquity(snapshot);

      // 4. 记录资金曲线（仅在每个秒级时间点的最后一个快照时记录）
      const currentSecond = Math.floor(snapshot.timestamp.getTime() / 1000);

      // 如果是新的秒级时间点，或者是回测结束前的最后一个快照
      if (currentSecond !== lastRecordedSecond) {
        const openPositions = this.trades.filter(t => t.status === BacktestPositionStatus.OPEN);

        // 计算总 equity（含浮盈）
        const closedTrades = this.trades.filter(t => t.status !== BacktestPositionStatus.OPEN);
        const realizedPnl = closedTrades.reduce((sum: number, t) => sum + t.pnl, 0);

        let unrealizedPnl = 0;
        for (const trade of openPositions) {
          // 使用当前快照的价格计算浮盈
          let currentPrice = null;

          if (snapshot.marketId === trade.marketId && snapshot.outcomePrices && snapshot.outcomePrices.length > trade.outcomeIndex) {
            currentPrice = snapshot.outcomePrices[trade.outcomeIndex];
          } else {
            // 查找该市场最新的快照
            const marketSnapshots = this.marketSnapshotsIndex.get(trade.marketId);
            if (marketSnapshots && marketSnapshots.length > 0) {
              const latestSnapshot = marketSnapshots[marketSnapshots.length - 1];
              if (latestSnapshot.outcomePrices && latestSnapshot.outcomePrices.length > trade.outcomeIndex) {
                currentPrice = latestSnapshot.outcomePrices[trade.outcomeIndex];
              }
            }
          }

          if (currentPrice !== null && isFinite(currentPrice)) {
            const currentValue = trade.positionSize * currentPrice;
            const tradeUnrealizedPnl = currentValue - trade.entryValue;
            unrealizedPnl += tradeUnrealizedPnl;
          }
        }

        const totalEquity = this.config.initialCapital + realizedPnl + unrealizedPnl;

        equityCurve.push({
          timestamp: snapshot.timestamp,
          equity: totalEquity,
          positions: openPositions.length,
          returnPercent: ((totalEquity - this.config.initialCapital) / this.config.initialCapital) * 100,
        });

        lastRecordedSecond = currentSecond;
      }

      // 更新进度统计
      this.stats.processedSnapshots = i + 1;
      this.stats.marketsScanned++;

      // 发送进度事件（每5%发送一次）
      if (i > 0 && (i % Math.max(1, Math.floor(this.snapshots.length / 20))) === 0) {
        const progress = ((i + 1) / this.snapshots.length) * 100;
        const currentOpenPositions = this.trades.filter(t => t.status === BacktestPositionStatus.OPEN);

        this.emitProgress({
          type: 'snapshot_processed',
          timestamp: new Date(),
          data: {
            progress: progress.toFixed(1),
            currentSnapshot: i + 1,
            totalSnapshots: this.snapshots.length,
            stats: { ...this.stats },
            currentEquity: this.equity,
            openPositions: currentOpenPositions.length,
          },
        });
      }
    }

    // 处理所有未平仓的持仓（强制平仓）
    await this.forceCloseAllPositions(
      this.snapshots[this.snapshots.length - 1]?.timestamp || this.config.endDate
    );

    const result = this.generateResult(equityCurve);

    this.emitProgress({
      type: 'complete',
      timestamp: new Date(),
      data: {
        message: '✅ 回测完成',
        result: {
          totalReturn: `${result.pnl.totalPercent.toFixed(2)}%`,
          totalTrades: result.trades.total,
          winRate: `${result.trades.winRate.toFixed(1)}%`,
          bestStrategy: Object.entries(result.strategyStats)
            .reduce((best, [name, stats]) => stats.totalPnl > best.pnl ? { name, pnl: stats.totalPnl } : best, { name: '', pnl: 0 }).name,
        },
      },
    });

    return result;
  }

  /**
   * 🔥 使用二分查找快速定位快照（性能优化核心）
   * 时间复杂度：O(log n) vs 原来的 O(n)
   */
  private findSnapshotByTimestamp(
    marketId: string,
    targetTimestamp: number
  ): BacktestMarketSnapshot | null {
    const marketSnapshots = this.marketSnapshotsIndex.get(marketId);
    const timestamps = this.marketTimestampsIndex.get(marketId);

    if (!marketSnapshots || !timestamps || timestamps.length === 0) {
      return null;
    }

    // 二分查找：找到 <= targetTimestamp 的最大时间戳
    let left = 0;
    let right = timestamps.length - 1;
    let resultIndex = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (timestamps[mid] <= targetTimestamp) {
        resultIndex = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return resultIndex !== -1 ? marketSnapshots[resultIndex] : null;
  }

  /**
   * 检查平仓条件（优化版）
   */
  private async checkExitConditions(snapshot: BacktestMarketSnapshot): Promise<void> {
    const openTrades = this.trades.filter(t => t.status === BacktestPositionStatus.OPEN);

    for (const trade of openTrades) {
      // 找到该交易对应的市场快照
      // 如果当前快照的市场ID匹配，使用当前快照
      // 否则，查找该交易市场的最新快照（在当前快照时间点之前）
      let tradeSnapshot: BacktestMarketSnapshot | null = null;

      if (trade.marketId === snapshot.marketId) {
        // 市场ID匹配，使用当前快照
        tradeSnapshot = snapshot;
      } else {
        // 🔥 优化：使用二分查找快速定位快照
        tradeSnapshot = this.findSnapshotByTimestamp(
          trade.marketId,
          snapshot.timestamp.getTime()
        );
      }

      if (!tradeSnapshot) {
        // 没有找到合适的快照，跳过
        continue;
      }

      // 检查快照时间：如果快照时间等于或早于开仓时间，跳过
      // 这避免了在同一快照开仓后立即平仓
      if (tradeSnapshot.timestamp.getTime() <= trade.entryTime.getTime()) {
        continue;
      }

      // 获取策略
      const strategy = this.strategies.get(trade.strategy);
      if (!strategy) continue;

      // 获取当前价格
      const currentPrice = tradeSnapshot.outcomePrices[trade.outcomeIndex];

      // 检查是否需要平仓
      const shouldClose = strategy.shouldClose(trade, currentPrice, snapshot.timestamp, this.config);

      if (shouldClose) {
        // 平仓
        await this.closeTrade(trade, currentPrice, snapshot.timestamp, strategy);
      }
    }
  }

  /**
   * 检查开仓条件（优化版 - 添加详细统计）
   */
  private async checkEntryConditions(snapshot: BacktestMarketSnapshot): Promise<void> {
    // 🔥 检查市场黑名单（禁止重复开仓）
    if (this.marketBlacklist.has(snapshot.marketId)) {
      const reason = this.marketBlacklist.get(snapshot.marketId);
      this.stats.riskManagementFiltered++;
      return;
    }



    // 检查是否达到最大持仓数
    const openPositions = this.trades.filter(t => t.status === BacktestPositionStatus.OPEN);
    if (openPositions.length >= this.config.maxPositions) {
      this.stats.maxPositionsFiltered++;
      return;
    }

    // 检查每个策略
    for (const [strategyType, strategy] of this.strategies) {
      const strategyConfig = this.config.strategies[strategyType];

      // 检查策略是否启用
      if (!strategyConfig.enabled) {
        continue;
      }

      // 检查该策略的最大持仓数
      const strategyPositions = openPositions.filter(t => t.strategy === strategyType);
      if (strategyPositions.length >= strategyConfig.maxPositions) {
        continue;
      }

      // 检查是否应该开仓
      const shouldOpen = strategy.shouldOpen(snapshot, this.config);

      if (shouldOpen) {
        // 检查交易冷却时间（严格模式：市场级别冷却，不区分策略）
        const lastTradeTime = this.tradeCooldowns.get(snapshot.marketId);
        if (lastTradeTime) {
          const minutesSinceLastTrade = (snapshot.timestamp.getTime() - lastTradeTime.getTime()) / (1000 * 60);
          if (minutesSinceLastTrade < this.COOLDOWN_MINUTES) {
            // 仍在冷却期，跳过
            continue;
          }
        }

        // 检查是否已经持仓同一市场（避免重复开仓）
        const hasExistingPosition = openPositions.some(t => t.marketId === snapshot.marketId);
        if (hasExistingPosition) {
          continue;
        }

        // 找到要交易的结果
        const outcomeIndex = this.findOutcomeIndexForStrategy(strategyType, snapshot);
        if (outcomeIndex === -1) {
          this.stats.priceRangeFiltered++;
          continue;
        }

        this.stats.candidatesFound++;

        // 开仓
        await this.openTrade(snapshot, strategyType, outcomeIndex);
      } else {
        // 🔧 统计：记录为什么 shouldOpen 返回 false
        // 通过检查价格和市场深度，判断是哪个条件过滤掉了
        if (strategy.type === BacktestStrategyType.REVERSAL) {
          // Reversal 策略的过滤条件
          const priceRange = (strategy as any).getPriceRange?.(snapshot.outcomePrices[0]);
          if (!priceRange) {
            this.stats.priceRangeFiltered++;
          } else if (!(strategy as any).passesBasicMarketDepthCheck?.(snapshot)) {
            this.stats.marketDepthFiltered++;
          }
        }
      }
    }
  }

  /**
   * 开仓
   */
  private async openTrade(
    snapshot: BacktestMarketSnapshot,
    strategyType: BacktestStrategyType,
    outcomeIndex: number
  ): Promise<void> {
    const strategyConfig = this.config.strategies[strategyType];

    // 🔍 记录开仓时的配置值（前 5 笔）
    if (this.stats.tradesOpened < 5) {
      console.log(`[开仓配置 #${this.stats.tradesOpened}] equity: ${this.equity}, ` +
        `strategyConfig.maxPositionSize: ${strategyConfig?.maxPositionSize}, ` +
        `config.maxPositionSize: ${this.config.maxPositionSize}, ` +
        `marketId: ${snapshot.marketId}, entryPrice: ${snapshot.outcomePrices[outcomeIndex]}`);
    }

    // 获取entryPrice
    let entryPrice = snapshot.outcomePrices[outcomeIndex];

    // 检查数据类型，确保是数字
    if (typeof entryPrice === 'string') {
      entryPrice = parseFloat(entryPrice);
    }

    // 验证价格
    if (!isFinite(entryPrice) || entryPrice <= 0 || entryPrice >= 1) {
      this.emitProgress({
        type: 'error',
        timestamp: new Date(),
        data: {
          message: '开仓失败：entryPrice无效',
          entryPrice,
          outcomeIndex,
          strategyType,
          marketId: snapshot.marketId,
        },
      });
      return; // 价格无效，直接返回
    }

    // 🔍 验证 equity 是否有效
    if (!isFinite(this.equity) || this.equity < 0 || Math.abs(this.equity) > this.config.initialCapital * 100) {
      console.error(`[开仓失败：equity 异常] equity: ${this.equity}, initialCapital: ${this.config.initialCapital}, ` +
        `marketId: ${snapshot.marketId}, entryPrice: ${entryPrice}`);
      // 🔥 拒绝开仓
      return;
    }

    // 🔍 详细日志：开仓前的状态（仅前 10 笔）
    if (this.stats.tradesOpened < 10) {
      console.log(`\n[开仓前 #${this.trades.length}] equity: ${this.equity.toFixed(2)}, ` +
        `openPositions: ${this.trades.filter(t => t.status === BacktestPositionStatus.OPEN).length}, ` +
        `totalTrades: ${this.trades.length}`);
    }

    // 🔥 计算仓位大小（18%，去除浮盈）
    // 如果本金10000块，第一个仓位入1800
    // 如果涨到11800，在未平仓的情况下开新仓也是入1800
    // 如果盈利确定平仓了才开11800*18%
    const positionValuePercent = 0.18; // 18%
    const positionValue = this.equity * positionValuePercent;

    const positionSize = positionValue / entryPrice;

    // 🔍 详细日志：开仓计算参数（仅前 10 笔）
    if (this.stats.tradesOpened < 10) {
      console.log(`[开仓计算 #${this.stats.tradesOpened}] ` +
        `equity: ${this.equity.toFixed(2)}, ` +
        `positionValue: ${positionValue.toFixed(2)}, ` +
        `positionSize: ${positionSize.toFixed(2)}, ` +
        `entryPrice: ${entryPrice}`);
    }

    // 验证positionSize
    if (!isFinite(positionSize) || positionSize <= 0) {
      this.emitProgress({
        type: 'error',
        timestamp: new Date(),
        data: {
          message: '开仓失败：positionSize无效',
          positionSize,
          positionValue,
          entryPrice,
          equity: this.equity,
        },
      });
      return; // positionSize无效，直接返回
    }

    // 创建交易
    const trade: BacktestTrade = {
      id: `${snapshot.marketId}-${snapshot.timestamp.getTime()}-${strategyType}`,
      marketId: snapshot.marketId,
      question: snapshot.question,
      strategy: strategyType,
      outcomeIndex,
      outcomeName: 'Outcome ' + (outcomeIndex + 1),
      entryTime: snapshot.timestamp,
      entryPrice,
      positionSize,
      entryValue: positionValue,
      endDate: snapshot.endDate,  // 添加事件到期时间
      exitTime: null,
      exitPrice: null,
      exitValue: null,
      pnl: 0,
      pnlPercent: 0,
      status: BacktestPositionStatus.OPEN,
      exitReason: '',
      stopLoss: strategyConfig.stopLoss ? entryPrice * (1 - strategyConfig.stopLoss) : null,
      takeProfit: strategyConfig.takeProfit ? entryPrice * (1 + strategyConfig.takeProfit) : null,
    };

    this.trades.push(trade);
    this.stats.tradesOpened++;

    // 更新冷却时间（市场级别冷却，不区分策略）
    this.tradeCooldowns.set(snapshot.marketId, snapshot.timestamp);

    console.log(`[开仓成功] 交易ID: ${trade.id}, 入场价: ${entryPrice}, 仓位大小: ${positionSize}`);

    this.emitProgress({
      type: 'trade_opened',
      timestamp: new Date(),
      data: {
        strategy: strategyType,
        question: snapshot.question.substring(0, 50) + '...',
        entryPrice: (entryPrice * 100).toFixed(2) + '%',
        positionSize: positionSize.toFixed(2),
        entryValue: positionValue.toFixed(2),
        tradeId: trade.id,
      },
    });
  }

  /**
   * 平仓
   */
  private async closeTrade(
    trade: BacktestTrade,
    exitPrice: number,
    exitTime: Date,
    strategy: BacktestStrategy
  ): Promise<void> {
    // 🔍 详细日志：平仓前的状态（仅前 10 笔）
    if (this.stats.tradesClosed < 10) {
      const openPositionsBefore = this.trades.filter(t => t.status === BacktestPositionStatus.OPEN).length;
      console.log(`\n[平仓前 #${this.stats.tradesClosed}] 交易ID: ${trade.id}, equity: ${this.equity.toFixed(2)}, ` +
        `openPositions: ${openPositionsBefore}`);
    }

    // 计算盈亏
    const exitValue = trade.positionSize * exitPrice;
    const pnl = exitValue - trade.entryValue;
    const pnlPercent = (pnl / trade.entryValue) * 100;

    // 🔍 详细日志：平仓计算（仅前 10 笔）
    if (this.stats.tradesClosed < 10) {
      console.log(`[平仓计算 #${this.stats.tradesClosed}] ` +
        `tradeId: ${trade.id}, ` +
        `positionSize: ${trade.positionSize.toFixed(2)}, ` +
        `entryPrice: ${trade.entryPrice}, ` +
        `exitPrice: ${exitPrice}, ` +
        `entryValue: ${trade.entryValue.toFixed(2)}, ` +
        `exitValue: ${exitValue.toFixed(2)}, ` +
        `pnl: ${pnl.toFixed(2)}, ` +
        `pnlPercent: ${pnlPercent.toFixed(2)}`);
    }

    // 验证 pnl 的有效性
    if (!isFinite(pnl) || !isFinite(pnlPercent)) {
      console.error(`[平仓异常] tradeId: ${trade.id}, entryValue: ${trade.entryValue}, exitValue: ${exitValue}, ` +
        `exitPrice: ${exitPrice}, positionSize: ${trade.positionSize}, pnl: ${pnl}, pnlPercent: ${pnlPercent}`);
      // 如果计算无效，设置 pnl 为 0（虽然不是最佳方案，但可以防止 NaN 传播）
      trade.pnl = 0;
      trade.pnlPercent = 0;
    } else {
      trade.pnl = pnl;
      trade.pnlPercent = pnlPercent;
    }

    // 更新交易
    trade.exitTime = exitTime;
    trade.exitPrice = exitPrice;
    trade.exitValue = exitValue;

    // 🔥 市场归零保护：如果市场归零，加入黑名单
    if (exitPrice < 0.01) {
      this.marketBlacklist.set(trade.marketId, '市场归零风险控制（价格 < 1%）');
      console.log(`[市场归零] 市场ID: ${trade.marketId}, 价格: ${exitPrice}, 已加入黑名单`);
    }

    // 🔍 记录平仓的盈亏（如果异常大）
    if (Math.abs(pnl) > 1000000) {  // 如果单笔盈亏超过 100 万
      console.error(`[极端平仓] 交易ID: ${trade.id}, pnl: ${pnl}, pnlPercent: ${pnlPercent}, ` +
        `entryPrice: ${trade.entryPrice}, exitPrice: ${exitPrice}, positionSize: ${trade.positionSize}, ` +
        `entryValue: ${trade.entryValue}, exitValue: ${exitValue}`);
    }
    trade.status = pnl > 0 ? BacktestPositionStatus.CLOSED : BacktestPositionStatus.STOPPED;
    trade.exitReason = strategy.getExitReason(trade, exitPrice, exitTime);

    // 注意：不在这里更新equity，避免重复计算
    // equity完全由updateEquity()方法负责计算

    this.stats.tradesClosed++;

    this.emitProgress({
      type: 'trade_closed',
      timestamp: new Date(),
      data: {
        strategy: trade.strategy,
        pnl: pnl.toFixed(2),
        pnlPercent: pnlPercent.toFixed(2),
        exitReason: trade.exitReason,
        entryPrice: (trade.entryPrice * 100).toFixed(2) + '%',
        exitPrice: (exitPrice * 100).toFixed(2) + '%',
        tradeId: trade.id,
      },
    });

    // 🔍 详细日志：平仓后的状态（仅前 10 笔）
    if (this.stats.tradesClosed - 1 < 10) {
      const openPositionsAfter = this.trades.filter(t => t.status === BacktestPositionStatus.OPEN).length;
      console.log(`[平仓后 #${this.stats.tradesClosed - 1}] equity: ${this.equity.toFixed(2)}, ` +
        `openPositions: ${openPositionsAfter}, (equity 将在 updateEquity 中更新)`);
    }
  }

  /**
   * 强制平仓所有持仓（优化版）
   */
  private async forceCloseAllPositions(timestamp: Date, reason: string = '强制平仓'): Promise<void> {
    const openTrades = this.trades.filter(t => t.status === BacktestPositionStatus.OPEN);
    console.warn(`[强制平仓] 平仓 ${openTrades.length} 个持仓，原因: ${reason}`);

    for (const trade of openTrades) {
      // 🔥 使用索引快速获取最新快照
      const marketSnapshots = this.marketSnapshotsIndex.get(trade.marketId);
      const lastSnapshot = marketSnapshots && marketSnapshots.length > 0
        ? marketSnapshots[marketSnapshots.length - 1]
        : null;

      // 使用最后一个快照的价格，如果没有找到则假设价格为0
      const exitPrice = lastSnapshot?.outcomePrices[trade.outcomeIndex] || 0;

      const strategy = this.strategies.get(trade.strategy);
      if (strategy) {
        await this.closeTrade(trade, exitPrice, timestamp, strategy);
      }
    }
  }

  /**
   * 更新权益
   */
  private async updateEquity(currentSnapshot?: BacktestMarketSnapshot): Promise<void> {
    // 当前权益 = 初始资金 + 已实现盈亏 + 未实现盈亏
    let unrealizedPnl = 0;
    const openTrades = this.trades.filter(t => t.status === BacktestPositionStatus.OPEN);

    // 如果没有未平仓交易，简化计算
    if (openTrades.length === 0) {
      const closedTrades = this.trades.filter(t => t.status !== BacktestPositionStatus.OPEN);
      
      // 🔍 检查是否有异常的 pnl 值（包括 Infinity）
      const invalidTrades = closedTrades.filter(t => !isFinite(t.pnl));
      if (invalidTrades.length > 0) {
        console.error(`[发现无效 pnl] 总共 ${closedTrades.length} 笔交易，${invalidTrades.length} 笔异常。` +
          `前 3 笔异常: ${invalidTrades.slice(0, 3).map(t => 
            `{id: ${t.id}, pnl: ${t.pnl}, entryValue: ${t.entryValue}, exitValue: ${t.exitValue}}`
          ).join(', ')}`);
        // 🔍 修复无效的 pnl 值（设置为 0）
        invalidTrades.forEach(t => {
          console.warn(`[修复无效 pnl] 将交易 ${t.id} 的 pnl 从 ${t.pnl} 修复为 0`);
          t.pnl = 0;
          t.pnlPercent = 0;
        });
      }

      // 🔍 检查是否有极端的 pnl 值（但不一定是 Infinity）
      const extremeTrades = closedTrades.filter(t => Math.abs(t.pnl) > this.config.initialCapital * 100);
      if (extremeTrades.length > 0) {
        console.error(`[发现极端 pnl] 总共 ${closedTrades.length} 笔交易，${extremeTrades.length} 笔极端。` +
          `前 3 笔极端: ${extremeTrades.slice(0, 3).map(t => 
            `{id: ${t.id}, pnl: ${t.pnl}, entryValue: ${t.entryValue}, exitValue: ${t.exitValue}, positionSize: ${t.positionSize}}`
          ).join(', ')}`);
      }

      const realizedPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);

      // 🔍 关键日志：updateEquity（无持仓时，仅前 10 次或 equity 变化异常时）
      if (this.stats.processedSnapshots % 100000 === 0 || Math.abs(realizedPnl) > 1000000 || this.stats.processedSnapshots < 10) {
        console.log(`[updateEquity #${this.stats.processedSnapshots}] 无持仓, ` +
          `closedTrades: ${closedTrades.length}, ` +
          `realizedPnl: ${realizedPnl.toFixed(2)}, ` +
          `equity: ${(this.config.initialCapital + realizedPnl).toFixed(2)}`);
      }

      // 🔍 检查 realizedPnl 是否异常（包括 NaN 和 Infinity）
      if (!isFinite(realizedPnl)) {
        console.error(`[realizedPnl 异常] realizedPnl: ${realizedPnl}, initialCapital: ${this.config.initialCapital}, ` +
          `closedTrades: ${closedTrades.length}. 前 5 笔交易: ${closedTrades.slice(0, 5).map(t => 
            `{pnl: ${t.pnl}, isFinite: ${isFinite(t.pnl)}, entry: ${t.entryValue}, exit: ${t.exitValue}}`
          ).join(', ')}`);
        this.equity = this.config.initialCapital;
      } else {
        // 🔍 不再截断 realizedPnl，允许策略追求高盈亏比
        this.equity = this.config.initialCapital + realizedPnl;
      }
    } else {
      // 有未平仓交易，计算未实现盈亏
      for (const trade of openTrades) {
        // 如果提供了当前快照，优先使用当前快照的价格
        let currentPrice = null;

        if (currentSnapshot && currentSnapshot.marketId === trade.marketId) {
          // 使用当前快照的价格
          if (currentSnapshot.outcomePrices && currentSnapshot.outcomePrices.length > trade.outcomeIndex) {
            currentPrice = currentSnapshot.outcomePrices[trade.outcomeIndex];
          }
        }

        // 如果没有当前快照或当前快照不是同一市场，查找该市场最新的快照
        if (currentPrice === null) {
          // 🔥 使用索引快速获取最新快照
          const marketSnapshots = this.marketSnapshotsIndex.get(trade.marketId);
          
          if (!marketSnapshots || marketSnapshots.length === 0) {
            // 没有找到快照，假设价格为0（最坏情况）
            unrealizedPnl -= trade.entryValue;
            continue;
          }

          // 获取最新的快照
          const latestSnapshot = marketSnapshots[marketSnapshots.length - 1];
          if (!latestSnapshot || !latestSnapshot.outcomePrices || latestSnapshot.outcomePrices.length <= trade.outcomeIndex) {
            // 快照无效，假设价格为0
            unrealizedPnl -= trade.entryValue;
            continue;
          }

          currentPrice = latestSnapshot.outcomePrices[trade.outcomeIndex];
        }

        // 验证价格有效性
        if (typeof currentPrice !== 'number' || !isFinite(currentPrice) || currentPrice < 0 || currentPrice > 1) {
          // 价格无效，假设价格为0
          unrealizedPnl -= trade.entryValue;
          continue;
        }

        const currentValue = trade.positionSize * currentPrice;
        const tradeUnrealizedPnl = currentValue - trade.entryValue;
        unrealizedPnl += tradeUnrealizedPnl;
      }

      // 计算已实现盈亏
      const closedTrades = this.trades.filter(t => t.status !== BacktestPositionStatus.OPEN);
      
      // 🔍 检查是否有无效的 pnl 值（包括 Infinity）
      const invalidClosedTrades = closedTrades.filter(t => !isFinite(t.pnl));
      if (invalidClosedTrades.length > 0) {
        console.error(`[发现无效 pnl（有持仓）] 总共 ${closedTrades.length} 笔已平仓交易，${invalidClosedTrades.length} 笔异常。` +
          `前 3 笔异常: ${invalidClosedTrades.slice(0, 3).map(t => 
            `{id: ${t.id}, pnl: ${t.pnl}, entryValue: ${t.entryValue}, exitValue: ${t.exitValue}}`
          ).join(', ')}`);
        // 🔍 修复无效的 pnl 值（设置为 0）
        invalidClosedTrades.forEach(t => {
          console.warn(`[修复无效 pnl（有持仓）] 将交易 ${t.id} 的 pnl 从 ${t.pnl} 修复为 0`);
          t.pnl = 0;
          t.pnlPercent = 0;
        });
      }

      const realizedPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);

      // 🔍 关键日志：updateEquity（有持仓时，仅前 10 次或 equity 变化异常时）
      if (this.stats.processedSnapshots % 100000 === 0 || Math.abs(realizedPnl) > 1000000 || this.stats.processedSnapshots < 10) {
        const totalEquity = this.config.initialCapital + realizedPnl + unrealizedPnl;
        console.log(`[updateEquity #${this.stats.processedSnapshots}] 有持仓, ` +
          `openTrades: ${openTrades.length}, ` +
          `realizedPnl: ${realizedPnl.toFixed(2)}, ` +
          `unrealizedPnl: ${unrealizedPnl.toFixed(2)}, ` +
          `equity (不含浮盈): ${(this.config.initialCapital + realizedPnl).toFixed(2)}, ` +
          `totalEquity (含浮盈): ${totalEquity.toFixed(2)}`);
      }

      // 🔍 检查 unrealizedPnl 是否异常
      if (!isFinite(unrealizedPnl) || Math.abs(unrealizedPnl) > this.config.initialCapital * 1000) {
        console.error(`[异常 unrealizedPnl] unrealizedPnl: ${unrealizedPnl}, openTrades: ${openTrades.length}`);
        // 🔍 重置 unrealizedPnl
        unrealizedPnl = 0;
      }

      // 🔍 检查 realizedPnl 是否异常
      if (!isFinite(realizedPnl)) {
        console.error(`[异常 realizedPnl（有持仓）] realizedPnl: ${realizedPnl}, initialCapital: ${this.config.initialCapital}, ` +
          `closedTrades: ${closedTrades.length}. 前 5 笔交易: ${closedTrades.slice(0, 5).map(t =>
            `{pnl: ${t.pnl}, isFinite: ${isFinite(t.pnl)}, entry: ${t.entryValue}, exit: ${t.exitValue}}`
          ).join(', ')}`);
        // 🔍 重置 equity 为初始资金（不包含浮盈）
        this.equity = this.config.initialCapital;
      } else {
        // ✅ 关键修复：equity 不包含浮盈（只用已实现盈亏）
        // 浮盈只用于显示和统计，不用于开仓决策
        this.equity = this.config.initialCapital + realizedPnl;
      }
    }

    // 🔍 调试：检测异常的 equity 值
    if (!isFinite(this.equity) || this.equity < -this.config.initialCapital * 100) {
      console.error(`[异常 equity] equity: ${this.equity}, initialCapital: ${this.config.initialCapital}, ` +
        `realizedPnl: ${this.trades.filter(t => t.status !== BacktestPositionStatus.OPEN).reduce((sum, t) => sum + t.pnl, 0)}, ` +
        `openTrades: ${this.trades.filter(t => t.status === BacktestPositionStatus.OPEN).length}`);
    }

    // 🔧 防止 equity 变成负数（破产保护）
    if (this.equity < 0) {
      console.warn(`[ equity 过低] equity: ${this.equity}, 低于 0，重置为 0（最多亏完本金）`);
      // 将 equity 重置为 0（最多亏完本金，不会变成负数）
      this.equity = 0;
    }

    // 更新峰值和回撤
    if (this.equity > this.peakEquity) {
      this.peakEquity = this.equity;
    }
    const drawdown = (this.peakEquity - this.equity) / this.peakEquity;
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }
  }

  /**
   * 找到交易对应的市场快照
   */
  private findSnapshotForTrade(trade: BacktestTrade, currentSnapshot: BacktestMarketSnapshot): BacktestMarketSnapshot | null {
    // 检查市场ID是否匹配
    if (trade.marketId === currentSnapshot.marketId) {
      return currentSnapshot;
    }

    // 市场ID不匹配，返回null
    return null;
  }

  /**
   * 找到策略对应的交易结果索引
   */
  private findOutcomeIndexForStrategy(strategyType: BacktestStrategyType, snapshot: BacktestMarketSnapshot): number {
    switch (strategyType) {
      case BacktestStrategyType.CONVERGENCE:
        // 找到价格在75%-95%区间的结果（与shouldOpen保持一致）
        for (let i = 0; i < snapshot.outcomePrices.length; i++) {
          const price = snapshot.outcomePrices[i];
          if (price >= 0.75 && price <= 0.95) {
            return i;
          }
        }
        break;

      case BacktestStrategyType.ARBITRAGE:
        // Gamma套利：买入Yes（索引0）
        return 0;

      case BacktestStrategyType.REVERSAL:
        // V7.0: 找到价格在5%-40%区间的结果（与shouldOpen保持一致）
        for (let i = 0; i < snapshot.outcomePrices.length; i++) {
          const price = snapshot.outcomePrices[i];
          if (price >= 0.05 && price <= 0.40) {
            return i;
          }
        }
        break;

      case BacktestStrategyType.TREND_FOLLOWING:
        // 趋势跟随：根据历史价格趋势选择
        // 如果价格上涨趋势，买入价格较低的结果（<0.5）
        // 如果价格下跌趋势，买入价格较高的结果（>0.5）
        const historicalPrices = this.getHistoricalPrices(snapshot.marketId, snapshot.timestamp, 4);
        if (historicalPrices.length >= 4) {
          const priceChange = (historicalPrices[historicalPrices.length - 1] - historicalPrices[0]) / historicalPrices[0];
          if (priceChange > 0.03) {
            // 上涨趋势，买入价格较低的结果
            for (let i = 0; i < snapshot.outcomePrices.length; i++) {
              if (snapshot.outcomePrices[i] < 0.5) {
                return i;
              }
            }
          } else if (priceChange < -0.03) {
            // 下跌趋势，买入价格较高的结果
            for (let i = 0; i < snapshot.outcomePrices.length; i++) {
              if (snapshot.outcomePrices[i] > 0.5) {
                return i;
              }
            }
          }
        }
        break;

      case BacktestStrategyType.MEAN_REVERSION:
        // 均值回归：选择偏离均值最大的结果
        const meanPrices = this.getHistoricalPrices(snapshot.marketId, snapshot.timestamp, 5);
        if (meanPrices.length >= 5) {
          const mean = meanPrices.reduce((sum, p) => sum + p, 0) / meanPrices.length;
          const stdDev = Math.sqrt(meanPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / meanPrices.length);
          
          // 找到偏离均值最大的结果
          let maxDeviation = 0;
          let selectedIndex = -1;
          
          for (let i = 0; i < snapshot.outcomePrices.length; i++) {
            const price = snapshot.outcomePrices[i];
            const deviation = Math.abs((price - mean) / (stdDev || 1));
            if (deviation > maxDeviation) {
              maxDeviation = deviation;
              selectedIndex = i;
            }
          }
          
          if (selectedIndex !== -1 && maxDeviation > 0.15) {
            return selectedIndex;
          }
        }
        break;
    }

    return -1;
  }

  /**
   * 验证市场快照
   */
  private validateSnapshot(snapshot: BacktestMarketSnapshot): boolean {
    if (!snapshot.marketId || !snapshot.outcomePrices || snapshot.outcomePrices.length === 0) {
      return false;
    }

    if (snapshot.outcomePrices.some(p => p < 0 || p > 1)) {
      return false;
    }

    return true;
  }

  /**
   * 🔥 获取历史价格数据（用于高级策略）
   * 返回指定市场在当前时间之前的历史价格序列
   *
   * @param marketId 市场ID
   * @param currentTime 当前时间点
   * @param lookback 回溯的快照数量（默认10个）
   * @param outcomeIndex 结果索引（默认0）
   * @returns 历史价格数组（从旧到新排序）
   */
  public getHistoricalPrices(
    marketId: string,
    currentTime: Date,
    lookback: number = 10,
    outcomeIndex: number = 0
  ): number[] {
    const marketSnapshots = this.marketSnapshotsIndex.get(marketId);
    const timestamps = this.marketTimestampsIndex.get(marketId);

    if (!marketSnapshots || !timestamps || timestamps.length === 0) {
      return [];
    }

    const currentTimeMs = currentTime.getTime();

    // 二分查找：找到 <= currentTime 的最大时间戳索引
    let left = 0;
    let right = timestamps.length - 1;
    let resultIndex = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (timestamps[mid] <= currentTimeMs) {
        resultIndex = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    if (resultIndex === -1) {
      return []; // 没有找到符合条件的快照
    }

    // 获取最近的lookback个快照（从旧到新排序）
    const startIndex = Math.max(0, resultIndex - lookback + 1);
    const historicalSnapshots = marketSnapshots.slice(startIndex, resultIndex + 1);

    // 提取价格
    return historicalSnapshots
      .map(snapshot => {
        if (!snapshot.outcomePrices || snapshot.outcomePrices.length <= outcomeIndex) {
          return null;
        }
        return snapshot.outcomePrices[outcomeIndex];
      })
      .filter((price): price is number => price !== null && isFinite(price) && price >= 0 && price <= 1);
  }

  /**
   * 🔥 获取历史流动性数据
   * 用于流动性稳定性检查
   */
  public getHistoricalLiquidity(
    marketId: string,
    currentTime: Date,
    lookback: number = 10
  ): number[] {
    const marketSnapshots = this.marketSnapshotsIndex.get(marketId);
    const timestamps = this.marketTimestampsIndex.get(marketId);

    if (!marketSnapshots || !timestamps || timestamps.length === 0) {
      return [];
    }

    const currentTimeMs = currentTime.getTime();

    // 二分查找：找到 <= currentTime 的最大时间戳索引
    let left = 0;
    let right = timestamps.length - 1;
    let resultIndex = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (timestamps[mid] <= currentTimeMs) {
        resultIndex = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    if (resultIndex === -1) {
      return []; // 没有找到符合条件的快照
    }

    // 获取最近的lookback个快照（从旧到新排序）
    const startIndex = Math.max(0, resultIndex - lookback + 1);
    const historicalSnapshots = marketSnapshots.slice(startIndex, resultIndex + 1);

    // 提取流动性
    return historicalSnapshots
      .map(snapshot => snapshot.liquidity)
      .filter((liquidity): liquidity is number => liquidity !== null && liquidity !== undefined && liquidity >= 0);
  }

  /**
   * 🔥 获取市场快照列表（用于高级策略）
   * 返回指定市场在当前时间之前的历史快照
   *
   * @param marketId 市场ID
   * @param currentTime 当前时间点
   * @param lookback 回溯的快照数量（默认10个）
   * @returns 历史快照数组（从旧到新排序）
   */
  public getHistoricalSnapshots(
    marketId: string,
    currentTime: Date,
    lookback: number = 10
  ): BacktestMarketSnapshot[] {
    const marketSnapshots = this.marketSnapshotsIndex.get(marketId);
    const timestamps = this.marketTimestampsIndex.get(marketId);

    if (!marketSnapshots || !timestamps || timestamps.length === 0) {
      return [];
    }

    const currentTimeMs = currentTime.getTime();

    // 二分查找：找到 <= currentTime 的最大时间戳索引
    let left = 0;
    let right = timestamps.length - 1;
    let resultIndex = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (timestamps[mid] <= currentTimeMs) {
        resultIndex = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    if (resultIndex === -1) {
      return []; // 没有找到符合条件的快照
    }

    // 获取最近的lookback个快照（从旧到新排序）
    const startIndex = Math.max(0, resultIndex - lookback + 1);
    return marketSnapshots.slice(startIndex, resultIndex + 1);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 格式化货币
   */
  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  /**
   * 生成回测结果
   */
  private generateResult(equityCurve: { timestamp: Date; equity: number; positions: number }[]): BacktestResult {
    console.log('\n[generateResult] 开始生成回测结果...');
    console.log(`  - totalTrades: ${this.trades.length}`);
    console.log(`  - equity: ${this.equity.toFixed(2)}`);

    // 计算时间范围
    const closedTrades = this.trades.filter(t => t.status !== BacktestPositionStatus.OPEN);
    const winningTrades = closedTrades.filter(t => t.pnl > 0);
    const losingTrades = closedTrades.filter(t => t.pnl < 0);

    const totalPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalPnlPercent = (totalPnl / this.config.initialCapital) * 100;
    const averageTrade = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;
    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;

    const bestTrade = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0;
    const worstTrade = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0;

    // 计算策略统计
    const strategyStats: any = {};
    Object.values(BacktestStrategyType).forEach(type => {
      const typeTrades = closedTrades.filter(t => t.strategy === type);
      const typeWinning = typeTrades.filter(t => t.pnl > 0);
      const typeTotalPnl = typeTrades.reduce((sum, t) => sum + t.pnl, 0);

      strategyStats[type] = {
        trades: typeTrades.length,
        winRate: typeTrades.length > 0 ? (typeWinning.length / typeTrades.length) * 100 : 0,
        totalPnl: typeTotalPnl,
        averagePnl: typeTrades.length > 0 ? typeTotalPnl / typeTrades.length : 0,
        maxDrawdown: 0, // 简化处理
      };
    });

    // 计算夏普比率（简化版）
    const returns = equityCurve.map((point, i) => {
      if (i === 0 || point.equity === null || point.equity === undefined) return 0;
      const prevEquity = equityCurve[i - 1].equity;
      if (prevEquity === null || prevEquity === undefined || prevEquity <= 0) return 0;
      return (point.equity - prevEquity) / prevEquity;
    }).filter(r => r !== 0); // 过滤掉无效数据

    const avgReturn = returns.length > 0 ? returns.reduce((sum, r) => sum + r, 0) / returns.length : 0;
    const stdReturn = returns.length > 0 ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length) : 0;
    const sharpeRatio = stdReturn > 0 && returns.length > 0 ? (avgReturn / stdReturn) * Math.sqrt(365 * 24) : 0;

    // 计算回测期间
    const startDate = equityCurve[0]?.timestamp || this.config.startDate;
    const endDate = equityCurve[equityCurve.length - 1]?.timestamp || this.config.endDate;
    const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    // 🔍 打印详细统计信息
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                         回测统计信息（详细版）                              ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ 数据集信息：                                                              ║
║   • 总快照数: ${this.stats.totalSnapshots.toLocaleString()}                                         ║
║   • 已处理: ${this.stats.processedSnapshots.toLocaleString()}                                        ║
║   • 发现市场: ${this.stats.marketsScanned}                                         ║
║   • 候选交易: ${this.stats.candidatesFound}                                         ║
║                                                                           ║
║ 过滤统计：                                                                ║
║   • 价格区间过滤: ${this.stats.priceRangeFiltered.toLocaleString()}                                    ║
║   • 市场深度过滤: ${this.stats.marketDepthFiltered.toLocaleString()}                                    ║
║   • 最大持仓过滤: ${this.stats.maxPositionsFiltered.toLocaleString()}                                    ║
║   • 风险管理过滤: ${this.stats.riskManagementFiltered.toLocaleString()}                                    ║
║                                                                           ║
║ 交易结果：                                                                ║
║   • 总交易数: ${closedTrades.length}                                        ║
║   • 胜率: ${winRate.toFixed(2)}%                                     ║
║   • 总盈亏: ${totalPnlPercent > 0 ? '+' : ''}${totalPnlPercent.toFixed(2)}%                              ║
║   • 最终 Equity: $${this.equity.toFixed(2)}                                   ║
╚═════════════════════════════════════════════════════════════════════════╝
    `);

    // 🔍 导出交易明细和 equity 曲线到文件
    this.exportToFiles(equityCurve);

    return {
      period: {
        start: startDate,
        end: endDate,
        duration: Math.max(1, duration),
      },
      trades: {
        total: closedTrades.length,
        winning: winningTrades.length,
        losing: losingTrades.length,
        winRate,
        averageTrade,
        bestTrade,
        worstTrade,
      },
      pnl: {
        total: totalPnl,
        totalPercent: totalPnlPercent,
        averageDaily: duration > 0 ? totalPnl / duration : 0,
        maxDrawdown: this.peakEquity - this.equity,
        maxDrawdownPercent: this.maxDrawdown * 100,
        sharpeRatio,
      },
      strategyStats,
      equityCurve,
      tradesList: this.trades,
    };

    // 🔍 打印详细统计信息
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                         回测统计信息（详细版）                              ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ 数据集信息：                                                              ║
║   • 总快照数: ${this.stats.totalSnapshots.toLocaleString()}                                         ║
║   • 已处理: ${this.stats.processedSnapshots.toLocaleString()}                                        ║
║   • 发现市场: ${this.stats.marketsScanned}                                         ║
║   • 候选交易: ${this.stats.candidatesFound}                                         ║
║                                                                           ║
║ 过滤统计：                                                                ║
║   • 价格区间过滤: ${this.stats.priceRangeFiltered.toLocaleString()}                                    ║
║   • 市场深度过滤: ${this.stats.marketDepthFiltered.toLocaleString()}                                    ║
║   • 最大持仓过滤: ${this.stats.maxPositionsFiltered.toLocaleString()}                                    ║
║   • 风险管理过滤: ${this.stats.riskManagementFiltered.toLocaleString()}                                    ║
║                                                                           ║
    return {
      period: {
        start: startDate,
        end: endDate,
        duration: Math.max(1, duration),
      },
      trades: {
        total: closedTrades.length,
        winning: winningTrades.length,
        losing: losingTrades.length,
        winRate,
        averageTrade,
        bestTrade,
        worstTrade,
      },
      pnl: {
        total: totalPnl,
        totalPercent: totalPnlPercent,
        averageDaily: duration > 0 ? totalPnl / duration : 0,
        maxDrawdown: this.peakEquity - this.equity,
        maxDrawdownPercent: this.maxDrawdown * 100,
        sharpeRatio,
      },
      strategyStats,
      equityCurve,
      tradesList: this.trades,
    };
║ 交易结果：                                                                ║
║   • 总交易数: ${closedTrades.length}                                        ║
║   • 胜率: ${winRate.toFixed(2)}%                                     ║
║   • 总盈亏: ${totalPnlPercent > 0 ? '+' : ''}${totalPnlPercent.toFixed(2)}%                              ║
║   • 最终 Equity: $${this.equity.toFixed(2)}                                   ║
╚═══════════════════════════════════════════════════════════════════════════╝
    `);

    // 🔍 导出交易明细和 equity 曲线到文件
    this.exportToFiles(equityCurve);
  }

  /**
   * 🔍 导出交易明细和 equity 曲线到文件
   */
  private exportToFiles(equityCurve: { timestamp: Date; equity: number; positions: number }[]): void {
    const fs = require('fs');
    const path = require('path');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // 创建导出目录
    const exportDir = path.join(process.cwd(), 'data', 'exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    // 1. 导出交易明细（完整版）
    const tradesFile = path.join(exportDir, `trades-${timestamp}.json`);
    const tradesData = {
      exportTime: new Date().toISOString(),
      config: this.config,
      summary: {
        totalTrades: this.trades.length,
        closedTrades: this.trades.filter(t => t.status !== BacktestPositionStatus.OPEN).length,
        totalPnl: this.trades.filter(t => t.status !== BacktestPositionStatus.OPEN).reduce((sum, t) => sum + t.pnl, 0),
        finalEquity: this.equity,
        initialCapital: this.config.initialCapital,
        totalReturnPercent: ((this.equity - this.config.initialCapital) / this.config.initialCapital * 100).toFixed(2),
      },
      trades: this.trades.map(trade => ({
        id: trade.id,
        marketId: trade.marketId,
        question: trade.question,
        strategy: trade.strategy,
        entry: {
          time: trade.entryTime,
          price: trade.entryPrice,
          size: trade.positionSize,
          value: trade.entryValue,
        },
        exit: trade.exitTime ? {
          time: trade.exitTime,
          price: trade.exitPrice,
          value: trade.exitValue,
        } : null,
        pnl: trade.pnl,
        pnlPercent: trade.pnlPercent,
        status: trade.status,
        exitReason: trade.exitReason,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
      })),
    };
    fs.writeFileSync(tradesFile, JSON.stringify(tradesData, null, 2));

    // 2. 导出 equity 曲线（完整版）
    const equityFile = path.join(exportDir, `equity-${timestamp}.json`);
    const equityData = {
      exportTime: new Date().toISOString(),
      config: this.config,
      summary: {
        finalEquity: this.equity,
        initialCapital: this.config.initialCapital,
        totalReturnPercent: ((this.equity - this.config.initialCapital) / this.config.initialCapital * 100).toFixed(2),
        peakEquity: this.peakEquity,
        maxDrawdown: this.maxDrawdown,
        maxDrawdownPercent: (this.maxDrawdown * 100).toFixed(2),
      },
      equityCurve: equityCurve.map(point => ({
        timestamp: point.timestamp,
        equity: point.equity,
        equityPercent: ((point.equity - this.config.initialCapital) / this.config.initialCapital * 100).toFixed(2),
        positions: point.positions,
        returnPercent: ((point.equity - this.config.initialCapital) / this.config.initialCapital * 100),
      })),
    };
    fs.writeFileSync(equityFile, JSON.stringify(equityData, null, 2));

    // 3. 导出 equity 曲线（CSV 格式，便于 Excel 分析）
    const equityCsvFile = path.join(exportDir, `equity-${timestamp}.csv`);
    const csvHeader = 'Timestamp,Equity,EquityPercent,Positions,ReturnPercent\n';
    const csvBody = equityCurve.map(point => 
      `${point.timestamp.toISOString()},${point.equity},${((point.equity - this.config.initialCapital) / this.config.initialCapital * 100).toFixed(2)},${point.positions},${((point.equity - this.config.initialCapital) / this.config.initialCapital * 100)}`
    ).join('\n');
    fs.writeFileSync(equityCsvFile, csvHeader + csvBody);

    // 4. 导出交易明细（CSV 格式，便于 Excel 分析）
    const tradesCsvFile = path.join(exportDir, `trades-${timestamp}.csv`);
    const tradesCsvHeader = 'ID,Market,Question,Strategy,EntryTime,EntryPrice,ExitTime,ExitPrice,PositionSize,EntryValue,ExitValue,PnL,PnLPercent,Status,ExitReason\n';
    const tradesCsvBody = this.trades.map(trade => 
      `${trade.id},${trade.marketId},"${trade.question.replace(/"/g, '""')}",${trade.strategy},${trade.entryTime.toISOString()},${trade.entryPrice},${trade.exitTime ? trade.exitTime.toISOString() : ''},${trade.exitPrice || ''},${trade.positionSize},${trade.entryValue},${trade.exitValue || ''},${trade.pnl},${trade.pnlPercent},${trade.status},${trade.exitReason || ''}`
    ).join('\n');
    fs.writeFileSync(tradesCsvFile, tradesCsvHeader + tradesCsvBody);

    console.log(`\n✅ 导出完成：`);
    console.log(`  - 交易明细（JSON）: ${tradesFile}`);
    console.log(`  - Equity 曲线（JSON）: ${equityFile}`);
    console.log(`  - Equity 曲线（CSV）: ${equityCsvFile}`);
    console.log(`  - 交易明细（CSV）: ${tradesCsvFile}`);
    console.log(`\n💡 提示：可以用 Excel 打开 CSV 文件分析 equity 曲线和交易明细`);
  }
}
