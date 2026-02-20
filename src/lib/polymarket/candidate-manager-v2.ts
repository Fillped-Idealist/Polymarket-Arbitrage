/**
 * 候选仓管理器（CandidateManager V2）
 * 完整修复版：支持从 Engine 接收 ParsedMarket 数组并修复类型报错
 */

import { ParsedMarket, gammaApiClient } from './gamma-api-v2';
import { clobApiClient } from './clob-api-v2';

/**
 * 候选仓数据模型
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
 * 筛选器配置
 */
export interface CandidateManagerConfig {
  max_candidates?: number;
  expire_minutes?: number;
  min_liquidity?: number;
  min_volume?: number;
  max_spread?: number;
  min_price?: number;
  max_price?: number;
}

export class CandidateManager {
  private config: Required<CandidateManagerConfig>;
  private candidates: Map<string, Candidate> = new Map();
  private last_update_time: Date | null = null;

  constructor(config: CandidateManagerConfig = {}) {
    this.config = {
      max_candidates: config.max_candidates || 5000,
      expire_minutes: config.expire_minutes || 60,
      min_liquidity: config.min_liquidity || 100,
      min_volume: config.min_volume || 10000,    // 建议设为 0 进行测试，通了再调高
      max_spread: config.max_spread || 0.025,
      min_price: config.min_price || 0.01,
      max_price: config.max_price || 0.95,
    };
  }

  /**
   * 1. 泵入数据并进行初步筛选
   * 修复点：修改参数类型为 number | ParsedMarket[] 以处理 Engine 的调用
   */
  async updateFromGamma(input: number | ParsedMarket[] = 480): Promise<void> {
    const now = new Date();
    let allMarkets: ParsedMarket[] = [];

    try {
      if (Array.isArray(input)) {
        // 如果输入是数组（来自 Engine 的注入）
        allMarkets = input;
        console.log(`[CandidateManager] 接收到 Engine 注入的 ${allMarkets.length} 个市场进行筛选...`);
      } else {
        // 如果输入是数字（自行抓取）
        console.log(`[CandidateManager] 正在从 Gamma 获取近 ${input} 小时内的活跃市场...`);
        allMarkets = await gammaApiClient.fetchMarkets(input);
      }

      if (!allMarkets || allMarkets.length === 0) {
        console.warn('[CandidateManager] 未发现有效市场数据。');
        return;
      }

      let newCount = 0;
      let skipVolume = 0;
      let skipPrice = 0;

      // 核心筛选循环
      for (const market of allMarkets) {
        if (!market.active) continue;
        if (!market.endDate || market.endDate.trim() === "") {
          continue; // 未定义结束时间，跳过当前市场
        }

        // 筛选 A: 成交量
        if (market.volume < this.config.min_volume) {
          skipVolume++;
          continue;
        }

        for (const outcomeName of market.outcomes) {
          const key = `${market.id}_${outcomeName}`;
          const currentPrice = market.probabilities.get(outcomeName) || 0;

          // 筛选 B: 价格区间
          if (currentPrice < this.config.min_price || currentPrice > this.config.max_price) {
            skipPrice++;
            continue;
          }

          const tokenId = market.outcomeIds.get(outcomeName);
          if (!tokenId) continue;

          // 筛选 C: 计算趋势/策略评分
          const trend_strength = (market.liquidity / (market.volume + 1)) * (1 - (market.spread || 0));

          this.candidates.set(key, {
            market,
            outcome_name: outcomeName,
            probability: currentPrice,
            trend_strength,
            add_time: this.candidates.get(key)?.add_time || now,
            last_update_time: now,
            latest_price: currentPrice,
          });
          newCount++;
        }
      }

      this.last_update_time = now;
      console.log(`[CandidateManager] 筛选完成: 池总数 ${this.candidates.size} (成交量过滤:${skipVolume}, 价格过滤:${skipPrice})`);

      // 维护池
      this.removeExpiredCandidates();
      this.prunePool();

    } catch (error) {
      console.error('[CandidateManager] 更新异常:', error);
    }
  }

  /**
   * 2. 流动性验证（CLOB 深度校验）
   */
  async validateLiquidity(): Promise<void> {
    if (this.candidates.size === 0) return;

    const tokenIds = Array.from(this.candidates.values())
      .map(c => c.market.outcomeIds.get(c.outcome_name))
      .filter((id): id is string => !!id);

    try {
      const orderBooks = await clobApiClient.fetchOrderBooks(tokenIds);
      const validCandidates = new Map<string, Candidate>();

      for (const [key, cand] of this.candidates.entries()) {
        const tokenId = cand.market.outcomeIds.get(cand.outcome_name);
        if (!tokenId) continue;

        const book = orderBooks.get(tokenId);

        if (book && clobApiClient.validateMarket(book, this.config.min_liquidity, this.config.max_spread)) {
          validCandidates.set(key, cand);
        }
      }

      this.candidates = validCandidates;
      console.log(`[CandidateManager] 深度验证完成，最终合格: ${this.candidates.size}`);
    } catch (error) {
      console.error('[CandidateManager] 流动性验证失败:', error);
    }
  }

  /**
   * 3. 维护：清理过期
   */
  removeExpiredCandidates(): void {
    const now = new Date();
    const expireMs = this.config.expire_minutes * 60 * 1000;
    for (const [key, cand] of this.candidates.entries()) {
      const isEnded = new Date(cand.market.endDate) < now;
      const isStale = (now.getTime() - cand.last_update_time.getTime()) > expireMs;
      if (isEnded || isStale) this.candidates.delete(key);
    }
  }

  /**
   * 4. 维护：大小限制
   */
  private prunePool(): void {
    if (this.candidates.size > this.config.max_candidates) {
      const sorted = Array.from(this.candidates.entries())
        .sort((a, b) => b[1].trend_strength - a[1].trend_strength);
      this.candidates = new Map(sorted.slice(0, this.config.max_candidates));
    }
  }

  // --- API ---

  getValidCandidates(tradedMarketIds: Set<string> = new Set()): Candidate[] {
    return Array.from(this.candidates.values()).filter(cand => {
      return !tradedMarketIds.has(cand.market.id) && cand.market.active;
    });
  }

  getAllCandidates(): Candidate[] {
    return Array.from(this.candidates.values());
  }

  updatePrices(marketPrices: Map<string, Map<string, number>>): void {
    for (const [key, cand] of this.candidates.entries()) {
      const outcomePrices = marketPrices.get(cand.market.id);
      if (outcomePrices) {
        const newPrice = outcomePrices.get(cand.outcome_name);
        if (newPrice !== undefined) {
          cand.latest_price = newPrice;
          cand.last_update_time = new Date();
        }
      }
    }
  }

  getStatistics() {
    return {
      totalCandidates: this.candidates.size,
      config: this.config,
    };
  }

  clear(): void {
    this.candidates.clear();
    this.last_update_time = null;
  }
}

// 导出单例，测试阶段 min_volume 设为 0
export const candidateManager = new CandidateManager({
  max_candidates: 5000,
  min_volume: 10000,
  min_liquidity: 100
});