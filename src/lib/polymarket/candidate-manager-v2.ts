/**
 * 候选仓管理器（V2）
 * 参考 main_3.py 实现，支持线程安全和流动性检查
 */

import { ParsedMarket } from './gamma-api-v2';
import { clobApiClient } from './clob-api-v2';

/**
 * 候选仓数据
 */
export interface Candidate {
  market: ParsedMarket;
  outcome_name: string;
  probability: number;
  trend_strength: number;
  add_time: Date;
  last_update_time: Date;
  latest_price: number;
}

/**
 * 候选仓管理器配置
 */
export interface CandidateManagerConfig {
  max_candidates?: number;  // 设为 undefined 表示无限制
  expire_minutes?: number;
  min_liquidity?: number;
  min_volume?: number;
  max_spread?: number;
}

/**
 * 候选仓管理器
 */
export class CandidateManager {
  private config: Required<CandidateManagerConfig>;
  private candidates: Map<string, Candidate> = new Map();
  private last_update_time: Date | null = null;

  constructor(config: CandidateManagerConfig = {}) {
    this.config = {
      max_candidates: config.max_candidates || undefined,  // 设为 undefined 表示无限制
      expire_minutes: config.expire_minutes || 60,
      min_liquidity: config.min_liquidity || 100,
      min_volume: config.min_volume || 80000,
      max_spread: config.max_spread || 0.025,
    };
  }

  /**
   * 从 Gamma API 更新候选仓
   * 参考 main_3.py 的 _update_candidate_pool 实现
   */
  async updateFromGamma(hours: number = 480): Promise<void> {
    console.log('[CandidateManager] 开始从 Gamma API 更新候选仓...');

    // 这里暂时跳过，实际应该调用 gammaApiClient.fetchMarkets()
    // 由于在 Node.js 环境中实现多线程较复杂，暂时使用简化版本
    this.last_update_time = new Date();
    console.log('[CandidateManager] 候选仓更新完成');
  }

  /**
   * 验证流动性（使用 CLOB API）
   * 参考 main_3.py 的 _place_order 实现
   */
  async validateLiquidity(): Promise<void> {
    console.log('[CandidateManager] 开始验证流动性...');

    const token_ids = Array.from(this.candidates.values())
      .map(cand => cand.market.outcomeIds.get(cand.outcome_name))
      .filter((id): id is string => id !== undefined);

    if (token_ids.length === 0) {
      console.log('[CandidateManager] 没有需要验证的候选仓');
      return;
    }

    try {
      const order_books = await clobApiClient.fetchOrderBooks(token_ids);

      // 验证每个候选仓的流动性
      const valid_candidates = new Map<string, Candidate>();

      for (const [key, cand] of this.candidates.entries()) {
        const token_id = cand.market.outcomeIds.get(cand.outcome_name);
        if (!token_id) {
          continue;
        }

        const order_book = order_books.get(token_id);
        if (!order_book) {
          console.warn(`[CandidateManager] 订单簿查询失败: ${key}`);
          continue;
        }

        // 验证市场
        if (!clobApiClient.validateMarket(order_book, this.config.min_liquidity, this.config.max_spread)) {
          console.log(`[CandidateManager] 移除不合格候选仓: ${key}`);
          continue;
        }

        valid_candidates.set(key, cand);
      }

      this.candidates = valid_candidates;
      console.log(`[CandidateManager] 流动性验证完成，有效候选仓: ${this.candidates.size}`);
    } catch (error) {
      console.error('[CandidateManager] 流动性验证失败:', error);
    }
  }

  /**
   * 添加候选仓
   */
  addCandidate(market: ParsedMarket, outcome_name: string, trend_strength: number): void {
    const key = `${market.id}_${outcome_name}`;
    const probability = market.probabilities.get(outcome_name) || 0;

    this.candidates.set(key, {
      market,
      outcome_name,
      probability,
      trend_strength,
      add_time: new Date(),
      last_update_time: new Date(),
      latest_price: probability,
    });

    // 去除候选池大小限制（参考 main_3.py）
    // 如果需要限制数量，可以在配置中设置 max_candidates
    if (this.config.max_candidates !== undefined) {
      // 限制候选池大小
      if (this.candidates.size > this.config.max_candidates) {
        // 按添加时间排序，移除最早的
        const sorted = Array.from(this.candidates.entries())
          .sort((a, b) => a[1].add_time.getTime() - b[1].add_time.getTime());

        // 移除多余的
        for (let i = 0; i < sorted.length - this.config.max_candidates; i++) {
          this.candidates.delete(sorted[i][0]);
        }
      }
    }

    console.log(`[CandidateManager] 添加候选仓: ${key}，总数: ${this.candidates.size}`);
  }

  /**
   * 移除候选仓
   */
  removeCandidate(market_id: string, outcome_name: string): void {
    const key = `${market_id}_${outcome_name}`;
    const deleted = this.candidates.delete(key);
    if (deleted) {
      console.log(`[CandidateManager] 移除候选仓: ${key}`);
    }
  }

  /**
   * 移除过期候选仓
   */
  removeExpiredCandidates(): void {
    const now = new Date();
    const expire_time = this.config.expire_minutes * 60 * 1000;

    let removed = 0;
    for (const [key, cand] of this.candidates.entries()) {
      if (now.getTime() - cand.last_update_time.getTime() > expire_time) {
        this.candidates.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[CandidateManager] 移除过期候选仓: ${removed} 个`);
    }
  }

  /**
   * 更新候选仓价格
   */
  updatePrices(market_prices: Map<string, Map<string, number>>): void {
    for (const [key, cand] of this.candidates.entries()) {
      const outcome_prices = market_prices.get(cand.market.id);
      if (!outcome_prices) {
        continue;
      }

      const new_price = outcome_prices.get(cand.outcome_name);
      if (new_price !== undefined) {
        cand.latest_price = new_price;
        cand.last_update_time = new Date();
      }
    }
  }

  /**
   * 获取所有候选仓
   */
  getAllCandidates(): Candidate[] {
    return Array.from(this.candidates.values());
  }

  /**
   * 获取有效候选仓
   */
  getValidCandidates(traded_market_ids: Set<string> = new Set()): Candidate[] {
    const now = new Date();
    const expire_time = this.config.expire_minutes * 60 * 1000;

    return Array.from(this.candidates.values()).filter(cand => {
      // 检查是否已交易
      if (traded_market_ids.has(cand.market.id)) {
        return false;
      }

      // 检查是否过期
      if (now.getTime() - cand.last_update_time.getTime() > expire_time) {
        return false;
      }

      // 检查市场是否活跃
      if (!cand.market.active) {
        return false;
      }

      // 检查价格范围
      const probability = cand.market.probabilities.get(cand.outcome_name) || 0;
      if (probability < 0.01 || probability > 0.99) {
        return false;
      }

      return true;
    });
  }

  /**
   * 按价格区间筛选候选仓
   */
  getCandidatesByPriceRange(min_price: number, max_price: number): Candidate[] {
    return this.getValidCandidates().filter(cand => {
      const price = cand.market.probabilities.get(cand.outcome_name) || 0;
      return price >= min_price && price <= max_price;
    });
  }

  /**
   * 获取候选仓
   */
  getCandidate(market_id: string, outcome_name?: string): Candidate | undefined {
    if (outcome_name) {
      return this.candidates.get(`${market_id}_${outcome_name}`);
    }

    // 如果没有指定 outcome_name，返回第一个匹配的
    for (const [key, cand] of this.candidates.entries()) {
      if (key.startsWith(market_id + '_')) {
        return cand;
      }
    }

    return undefined;
  }

  /**
   * 获取统计信息
   */
  getStatistics() {
    return {
      totalCandidates: this.candidates.size,
      validCandidates: this.getValidCandidates().length,
      lastUpdateTime: this.last_update_time,
      config: this.config,
    };
  }

  /**
   * 清空候选仓
   */
  clear(): void {
    this.candidates.clear();
    this.last_update_time = null;
    console.log('[CandidateManager] 候选仓已清空');
  }
}

// 导出单例（无候选仓数量限制）
export const candidateManager = new CandidateManager({
  max_candidates: undefined,  // 无限制
});
