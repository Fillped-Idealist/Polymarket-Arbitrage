/**
 * 候选仓管理模块
 * 负责保存和管理候选市场（有效市场）
 */

import { GammaMarket, gammaApiClient } from './gamma-api';
import { clobApiClient } from './clob-api';
import { BacktestMarketSnapshot } from '../backtest/types';

export interface CandidateMarket extends BacktestMarketSnapshot {
  // 基础信息
  addedAt: Date;  // 添加到候选仓的时间
  lastUpdated: Date;  // 最后更新时间

  // 市场元数据
  tokenID?: string;  // CLOB token ID（如果有的话）
  slug?: string;  // 市场标识符

  // 流动性验证
  isLiquidityValid: boolean;  // 流动性是否有效
  lastLiquidityCheck: Date | null;  // 最后流动性检查时间

  // 过滤原因（如果被过滤掉）
  filterReason?: string;  // 过滤原因
}

/**
 * 候选仓管理类
 */
export class CandidateManager {
  private candidates: Map<string, CandidateMarket> = new Map();
  private maxCandidates: number = 1000;  // 最大候选仓数量

  /**
   * 从 Gamma API 获取并更新候选仓
   * @returns 更新的候选仓数量
   */
  async updateFromGamma(): Promise<number> {
    try {
      console.log('[CandidateManager] 开始从 Gamma API 获取市场...');

      // 1. 获取所有活跃市场
      const allMarkets = await gammaApiClient.getActiveMarkets(1000);

      // 2. 过滤有效市场
      const validMarkets = gammaApiClient.filterValidMarkets(allMarkets);

      console.log(`[CandidateManager] 获取到 ${allMarkets.length} 个市场，有效市场 ${validMarkets.length} 个`);

      // 3. 更新候选仓
      let updateCount = 0;
      const now = new Date();

      for (const market of validMarkets) {
        const existingCandidate = this.candidates.get(market.id);

        // 转换为 CandidateMarket
        const candidate: CandidateMarket = {
          ...gammaApiClient.toMarketSnapshot(market, now),
          addedAt: existingCandidate?.addedAt || now,
          lastUpdated: now,
          tokenID: market.slug,  // 使用 slug 作为 token ID
          slug: market.slug,
          isLiquidityValid: existingCandidate?.isLiquidityValid || false,
          lastLiquidityCheck: existingCandidate?.lastLiquidityCheck || null,
        };

        this.candidates.set(market.id, candidate);
        updateCount++;
      }

      // 4. 移除过期的候选仓
      this.removeExpiredCandidates();

      console.log(`[CandidateManager] 更新完成，当前候选仓数量: ${this.candidates.size}`);

      return updateCount;
    } catch (error) {
      console.error('[CandidateManager] 更新候选仓失败:', error);
      throw error;
    }
  }

  /**
   * 验证候选仓的流动性
   * 使用 CLOB API 检查订单簿
   *
   * @returns 验证的候选仓数量
   */
  async validateLiquidity(): Promise<number> {
    try {
      console.log('[CandidateManager] 开始验证候选仓流动性...');

      let validatedCount = 0;
      const now = new Date();

      for (const [marketId, candidate] of this.candidates) {
        // 跳过最近验证过的（5 分钟内）
        if (candidate.lastLiquidityCheck) {
          const minutesSinceLastCheck = (now.getTime() - candidate.lastLiquidityCheck.getTime()) / (1000 * 60);
          if (minutesSinceLastCheck < 5) {
            continue;
          }
        }

        // 验证流动性
        if (candidate.tokenID) {
          const isValid = await clobApiClient.validateMarket(candidate.tokenID, 100);

          // 更新流动性状态
          candidate.isLiquidityValid = isValid;
          candidate.lastLiquidityCheck = now;
          this.candidates.set(marketId, candidate);
          validatedCount++;
        }
      }

      console.log(`[CandidateManager] 流动性验证完成，验证数量: ${validatedCount}`);

      return validatedCount;
    } catch (error) {
      console.error('[CandidateManager] 验证流动性失败:', error);
      throw error;
    }
  }

  /**
   * 移除过期的候选仓
   * 过期条件：
   * 1. 市场已过期（endDate < 当前时间）
   * 2. 长时间未更新（24 小时）
   * 3. 流动性不足（isLiquidityValid = false，且连续 3 次验证都失败）
   */
  private removeExpiredCandidates(): void {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const expiredMarkets: string[] = [];

    for (const [marketId, candidate] of this.candidates) {
      // 1. 检查市场是否已过期
      if (candidate.endDate < now) {
        expiredMarkets.push(marketId);
        continue;
      }

      // 2. 检查是否长时间未更新
      if (candidate.lastUpdated < oneDayAgo) {
        expiredMarkets.push(marketId);
        continue;
      }

      // 3. 检查流动性（如果验证过且无效）
      if (candidate.lastLiquidityCheck && !candidate.isLiquidityValid) {
        // 如果最近 3 次验证都失败，移除
        // 这里简化处理，直接移除
        expiredMarkets.push(marketId);
        continue;
      }
    }

    // 移除过期的候选仓
    expiredMarkets.forEach(marketId => {
      this.candidates.delete(marketId);
    });

    if (expiredMarkets.length > 0) {
      console.log(`[CandidateManager] 移除了 ${expiredMarkets.length} 个过期候选仓`);
    }
  }

  /**
   * 获取所有候选仓
   * @returns 候选仓列表
   */
  getAllCandidates(): CandidateMarket[] {
    return Array.from(this.candidates.values());
  }

  /**
   * 获取有效的候选仓
   * 过滤条件：
   * 1. 流动性有效
   * 2. 市场未过期
   *
   * @returns 有效的候选仓列表
   */
  getValidCandidates(): CandidateMarket[] {
    const now = new Date();

    return Array.from(this.candidates.values()).filter(candidate => {
      // 1. 检查流动性
      if (!candidate.isLiquidityValid) {
        return false;
      }

      // 2. 检查市场是否过期
      if (candidate.endDate < now) {
        return false;
      }

      return true;
    });
  }

  /**
   * 根据市场 ID 获取候选仓
   * @param marketId 市场 ID
   * @returns 候选仓（如果存在）
   */
  getCandidate(marketId: string): CandidateMarket | undefined {
    return this.candidates.get(marketId);
  }

  /**
   * 检查市场是否在候选仓中
   * @param marketId 市场 ID
   * @returns 是否在候选仓中
   */
  hasCandidate(marketId: string): boolean {
    return this.candidates.has(marketId);
  }

  /**
   * 根据价格区间筛选候选仓
   * @param minPrice 最小价格
   * @param maxPrice 最大价格
   * @param outcomeIndex 结果索引（默认 0）
   * @returns 符合条件的候选仓列表
   */
  getCandidatesByPriceRange(
    minPrice: number,
    maxPrice: number,
    outcomeIndex: number = 0
  ): CandidateMarket[] {
    return this.getValidCandidates().filter(candidate => {
      const price = candidate.outcomePrices[outcomeIndex];
      return price >= minPrice && price <= maxPrice;
    });
  }

  /**
   * 清空候选仓
   */
  clearCandidates(): void {
    this.candidates.clear();
    console.log('[CandidateManager] 已清空候选仓');
  }

  /**
   * 获取候选仓统计信息
   * @returns 统计信息
   */
  getStatistics() {
    const candidates = Array.from(this.candidates.values());
    const validCandidates = this.getValidCandidates();

    return {
      totalCandidates: candidates.length,
      validCandidates: validCandidates.length,
      expiredCandidates: candidates.length - validCandidates.length,
      lastUpdated: candidates.length > 0
        ? Math.max(...candidates.map(c => c.lastUpdated.getTime()))
        : null,
    };
  }
}

// 创建默认实例
export const candidateManager = new CandidateManager();
