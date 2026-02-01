/**
 * Polymarket CLOB API 客户端
 * 负责获取订单簿、盘口数据等
 *
 * API 文档：https://docs.polymarket.com/
 */

export interface CLOBOrder {
  price: number;  // 价格（0-1）
  size: number;   // 数量（shares）
  maker: string;
}

export interface CLOBOrderBook {
  tokenID: string;  // 市场标识
  assetID: string;  // 资产标识（outcome 的 ID）
  bids: CLOBOrder[];  // 买单（价格从高到低）
  asks: CLOBOrder[];  // 卖单（价格从低到高）
}

export interface CLOBBestPrice {
  bid: {
    price: number;  // 最高买价
    size: number;   // 最高买价的可用数量
  };
  ask: {
    price: number;  // 最低卖价
    size: number;   // 最低卖价的可用数量
  };
  spread: number;   // 买卖价差
}

export interface CLOBMarketOrderBook {
  marketId: string;
  outcomes: {
    outcomeId: string;
    outcomeName: string;
    orderBook: CLOBOrderBook;
    bestPrice: CLOBBestPrice;
  }[];
}

/**
 * CLOB API 客户端类
 */
export class ClobApiClient {
  private baseUrl: string;
  private apiKey?: string;
  private walletAddress?: string;

  constructor(apiKey?: string, walletAddress?: string) {
    this.baseUrl = 'https://clob.polymarket.com';
    this.apiKey = apiKey;
    this.walletAddress = walletAddress;
  }

  /**
   * 获取市场的订单簿
   * @param tokenID 市场 token ID
   * @returns 订单簿
   */
  async getOrderBook(tokenID: string): Promise<CLOBOrderBook | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/orderbook?tokenID=${tokenID}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
          },
        }
      );

      if (!response.ok) {
        console.warn(`[ClobApiClient] 获取订单簿 ${tokenID} 失败: ${response.status}`);
        return null;
      }

      const data: CLOBOrderBook = await response.json();
      return data;
    } catch (error) {
      console.error(`[ClobApiClient] 获取订单簿 ${tokenID} 失败:`, error);
      return null;
    }
  }

  /**
   * 获取市场的最佳价格
   * @param tokenID 市场 token ID
   * @returns 最佳价格（买一、卖一、价差）
   */
  async getBestPrice(tokenID: string): Promise<CLOBBestPrice | null> {
    try {
      const orderBook = await this.getOrderBook(tokenID);

      if (!orderBook || !orderBook.bids || !orderBook.asks) {
        return null;
      }

      // 获取最高买价（bids[0]）
      const bestBid = orderBook.bids[0];
      // 获取最低卖价（asks[0]）
      const bestAsk = orderBook.asks[0];

      if (!bestBid || !bestAsk) {
        return null;
      }

      // 计算价差
      const spread = bestAsk.price - bestBid.price;

      return {
        bid: {
          price: bestBid.price,
          size: bestBid.size,
        },
        ask: {
          price: bestAsk.price,
          size: bestAsk.size,
        },
        spread,
      };
    } catch (error) {
      console.error(`[ClobApiClient] 获取最佳价格 ${tokenID} 失败:`, error);
      return null;
    }
  }

  /**
   * 检查订单簿是否有足够的流动性
   * 用于验证开仓时是否有足够的 shares
   *
   * @param tokenID 市场 token ID
   * @param outcomeId 资产 ID（outcome 的 ID）
   * @param orderType 订单类型（"buy" 或 "sell"）
   * @param shares 需要的 shares 数量
   * @returns 是否有足够的流动性
   */
  async hasEnoughLiquidity(
    tokenID: string,
    outcomeId: string,
    orderType: 'buy' | 'sell',
    shares: number
  ): Promise<boolean> {
    try {
      const orderBook = await this.getOrderBook(tokenID);

      if (!orderBook) {
        return false;
      }

      // 检查买单（买入需要卖单有足够的 shares）
      if (orderType === 'buy') {
        // 计算卖单的总可用 shares（价格从低到高）
        const totalAskShares = orderBook.asks.reduce((sum, ask) => sum + ask.size, 0);
        return totalAskShares >= shares;
      }
      // 检查卖单（卖出需要买单有足够的 shares）
      else if (orderType === 'sell') {
        // 计算买单的总可用 shares（价格从高到低）
        const totalBidShares = orderBook.bids.reduce((sum, bid) => sum + bid.size, 0);
        return totalBidShares >= shares;
      }

      return false;
    } catch (error) {
      console.error(`[ClobApiClient] 检查流动性失败:`, error);
      return false;
    }
  }

  /**
   * 获取多个市场的订单簿
   * @param tokenIDs 市场 token ID 列表
   * @returns 订单簿列表
   */
  async getOrderBooks(tokenIDs: string[]): Promise<Map<string, CLOBOrderBook>> {
    const orderBooks = new Map<string, CLOBOrderBook>();

    // 并发获取所有市场的订单簿
    const promises = tokenIDs.map(async (tokenID) => {
      const orderBook = await this.getOrderBook(tokenID);
      if (orderBook) {
        orderBooks.set(tokenID, orderBook);
      }
    });

    await Promise.all(promises);

    return orderBooks;
  }

  /**
   * 验证市场是否适合交易
   * 检查：
   * 1. 订单簿是否存在
   * 2. 买卖价差是否合理（< 0.05，即 5%）
   * 3. 买卖单是否有足够的流动性
   *
   * @param tokenID 市场 token ID
   * @param minLiquidity 最小流动性要求
   * @returns 是否适合交易
   */
  async validateMarket(
    tokenID: string,
    minLiquidity: number = 100
  ): Promise<boolean> {
    try {
      const bestPrice = await this.getBestPrice(tokenID);

      if (!bestPrice) {
        return false;
      }

      // 1. 检查买卖价差（< 5%）
      if (bestPrice.spread > 0.05) {
        return false;
      }

      // 2. 检查买单流动性
      if (bestPrice.bid.size < minLiquidity) {
        return false;
      }

      // 3. 检查卖单流动性
      if (bestPrice.ask.size < minLiquidity) {
        return false;
      }

      return true;
    } catch (error) {
      console.error(`[ClobApiClient] 验证市场失败:`, error);
      return false;
    }
  }
}

// 创建默认实例
export const clobApiClient = new ClobApiClient(
  process.env.NEXT_PUBLIC_POLYMARKET_API_KEY,
  process.env.NEXT_PUBLIC_POLYMARKET_WALLET_ADDRESS
);
