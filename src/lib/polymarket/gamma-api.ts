/**
 * Polymarket Gamma API 客户端
 * 负责获取市场信息、市场列表等数据
 *
 * API 文档：https://gamma-api.polymarket.com/
 */

export interface GammaMarket {
  id: string;
  question: string;
  description: string;
  slug: string;
  creator: string;
  isActive: boolean;
  isPending: boolean;
  image: string;
  endDate: string;  // ISO 8601 格式
  liquidity: number;
  volume24h: number;
  tags: string[];
  outcomes: GammaOutcome[];
}

export interface GammaOutcome {
  name: string;
  price: number;  // 0-1 之间的价格
  ticker?: string;
  type: string;
}

export interface GammaMarketsResponse {
  markets: GammaMarket[];
  nextCursor?: string;
}

/**
 * Gamma API 客户端类
 */
export class GammaApiClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.baseUrl = 'https://gamma-api.polymarket.com';
    this.apiKey = apiKey;
  }

  /**
   * 获取所有活跃市场
   * @param limit 返回的市场数量限制
   * @returns 市场列表
   */
  async getActiveMarkets(limit: number = 1000): Promise<GammaMarket[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/markets?limit=${limit}&active=true`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Gamma API 请求失败: ${response.status} ${response.statusText}`);
      }

      const data: GammaMarketsResponse = await response.json();
      return data.markets;
    } catch (error) {
      console.error('[GammaApiClient] 获取活跃市场失败:', error);
      throw error;
    }
  }

  /**
   * 根据 ID 获取单个市场
   * @param marketId 市场 ID
   * @returns 市场信息
   */
  async getMarket(marketId: string): Promise<GammaMarket | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/markets?id=${marketId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
          },
        }
      );

      if (!response.ok) {
        console.warn(`[GammaApiClient] 获取市场 ${marketId} 失败: ${response.status}`);
        return null;
      }

      const data: GammaMarketsResponse = await response.json();
      return data.markets[0] || null;
    } catch (error) {
      console.error(`[GammaApiClient] 获取市场 ${marketId} 失败:`, error);
      return null;
    }
  }

  /**
   * 过滤有效市场
   * 排除：
   * 1. 已过期的市场（endDate < 当前时间）
   * 2. 长时间未更新的市场（24 小时内没有交易量）
   * 3. 低流动性市场（liquidity < 500）
   * 4. 低交易量市场（volume24h < 2000）
   *
   * @param markets 市场列表
   * @returns 有效的市场列表
   */
  filterValidMarkets(markets: GammaMarket[]): GammaMarket[] {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return markets.filter(market => {
      // 1. 检查市场是否活跃
      if (!market.isActive) {
        return false;
      }

      // 2. 检查市场是否已过期
      const endDate = new Date(market.endDate);
      if (endDate < now) {
        return false;
      }

      // 3. 检查市场是否即将过期（30 分钟内）
      const thirtyMinutesLater = new Date(now.getTime() + 30 * 60 * 1000);
      if (endDate < thirtyMinutesLater) {
        return false;  // 即将过期的市场不参与交易
      }

      // 4. 检查流动性（liquidity >= 500）
      if (!market.liquidity || market.liquidity < 500) {
        return false;
      }

      // 5. 检查交易量（volume24h >= 2000）
      if (!market.volume24h || market.volume24h < 2000) {
        return false;
      }

      // 6. 检查 outcome 价格（必须有有效的价格）
      if (!market.outcomes || market.outcomes.length === 0) {
        return false;
      }

      const hasValidPrices = market.outcomes.every(outcome =>
        outcome.price !== null &&
        outcome.price !== undefined &&
        outcome.price >= 0 &&
        outcome.price <= 1
      );

      if (!hasValidPrices) {
        return false;
      }

      // 7. 检查问题是否有效（不能为空）
      if (!market.question || market.question.trim() === '') {
        return false;
      }

      // 8. 检查 outcomes 数量（必须是二元市场，2 个结果）
      if (market.outcomes.length !== 2) {
        return false;
      }

      return true;
    });
  }

  /**
   * 将 GammaMarket 转换为 BacktestMarketSnapshot 格式
   * @param market Gamma 市场
   * @param timestamp 快照时间戳
   * @returns 市场快照
   */
  toMarketSnapshot(market: GammaMarket, timestamp: Date = new Date()) {
    return {
      marketId: market.id,
      question: market.question,
      timestamp,
      endDate: new Date(market.endDate),
      outcomePrices: market.outcomes.map(o => o.price),
      volume24h: market.volume24h || 0,
      liquidity: market.liquidity || 0,
    };
  }
}

// 创建默认实例
export const gammaApiClient = new GammaApiClient(
  process.env.NEXT_PUBLIC_POLYMARKET_API_KEY
);
