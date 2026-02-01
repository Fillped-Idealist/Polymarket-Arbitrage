/**
 * Polymarket CLOB API 客户端
 * 参考 main_3.py 实现，支持 tokenID 映射和真实订单簿
 */

import http, { RequestOptions } from 'http';
import https, { RequestOptions as HttpsRequestOptions } from 'https';

// 订单挂单
export interface OrderLevel {
  price: number;
  size: number;
}

// 订单簿
export interface OrderBook {
  asks: OrderLevel[]; // 卖单
  bids: OrderLevel[]; // 买单
}

// 最佳价格
export interface BestPrice {
  bid: number; // 最高买价
  bid_size: number; // 买一深度
  ask: number; // 最低卖价
  ask_size: number; // 卖一深度
  spread: number; // 价差
}

/**
 * CLOB API 配置
 */
export interface ClobApiConfig {
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * CLOB API 客户端
 */
export class ClobApiClient {
  private config: Required<ClobApiConfig>;

  constructor(config: ClobApiConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'https://clob.polymarket.com',
      timeout: config.timeout || 10000,
      retryAttempts: config.retryAttempts || 2,
      retryDelay: config.retryDelay || 500,
    };
  }

  /**
   * 获取订单簿（单个 token）
   * 参考 main_3.py 的 _fetch_order_book 实现
   */
  async fetchOrderBook(token_id: string): Promise<OrderBook | null> {
    const url = `${this.config.baseUrl}/books`;
    const payload = [{ token_id }];
    const data = await this.httpPost<OrderBook[]>(url, payload);

    // 确认返回为 list，取第一个元素
    if (Array.isArray(data) && data.length > 0) {
      return data[0];
    }

    console.warn(`[ClobAPI] 订单簿数据格式异常（非 list 或为空）: ${token_id}`);
    return null;
  }

  /**
   * 批量获取订单簿
   */
  async fetchOrderBooks(token_ids: string[]): Promise<Map<string, OrderBook>> {
    const order_books = new Map<string, OrderBook>();

    // 分批获取（每批 10 个）
    const batch_size = 10;
    for (let i = 0; i < token_ids.length; i += batch_size) {
      const batch = token_ids.slice(i, i + batch_size);
      const url = `${this.config.baseUrl}/books`;
      const payload = batch.map(token_id => ({ token_id }));

      try {
        const data = await this.httpPost<OrderBook[]>(url, payload);
        if (Array.isArray(data)) {
          data.forEach((order_book, index) => {
            order_books.set(batch[index].token_id, order_book);
          });
        }
      } catch (error) {
        console.error('[ClobAPI] 批量获取订单簿失败:', error);
      }
    }

    return order_books;
  }

  /**
   * 获取最佳价格（买一和卖一）
   * 参考 main_3.py 的 _place_order 实现
   */
  getBestPrice(order_book: OrderBook): BestPrice | null {
    if (!order_book) {
      return null;
    }

    // 1. 处理卖单（asks）：按价格升序排序，取最低卖价（卖一）
    const asks = order_book.asks || [];
    const valid_asks = asks
      .filter(ask => ask.price > 0 && ask.size > 0)
      .map(ask => ({ price: parseFloat(ask.price.toString()), size: parseFloat(ask.size.toString()) }))
      .sort((a, b) => a.price - b.price);

    const best_ask = valid_asks[0] || { price: 0, size: 0 };

    // 2. 处理买单（bids）：按价格降序排序，取最高买价（买一）
    const bids = order_book.bids || [];
    const valid_bids = bids
      .filter(bid => bid.price > 0 && bid.size > 0)
      .map(bid => ({ price: parseFloat(bid.price.toString()), size: parseFloat(bid.size.toString()) }))
      .sort((a, b) => b.price - a.price);

    const best_bid = valid_bids[0] || { price: 0, size: 0 };

    // 3. 计算价差
    const spread = best_ask.price - best_bid.price;

    return {
      bid: best_bid.price,
      bid_size: best_bid.size,
      ask: best_ask.price,
      ask_size: best_ask.size,
      spread,
    };
  }

  /**
   * 检查流动性（是否有足够的 shares）
   * 参考 main_3.py 的 _place_order 实现
   */
  hasEnoughLiquidity(
    order_book: OrderBook,
    side: 'buy' | 'sell',
    size: number,
    multiplier: number = 2
  ): boolean {
    if (!order_book) {
      return false;
    }

    const best_price = this.getBestPrice(order_book);
    if (!best_price) {
      return false;
    }

    // 买入时检查卖一深度，卖出时检查买一深度
    if (side === 'buy') {
      return best_price.ask_size >= size * multiplier;
    } else {
      return best_price.bid_size >= size * multiplier;
    }
  }

  /**
   * 验证市场是否适合交易
   */
  validateMarket(order_book: OrderBook, min_liquidity: number = 100, max_spread: number = 0.025): boolean {
    const best_price = this.getBestPrice(order_book);
    if (!best_price) {
      return false;
    }

    // 检查价差
    if (best_price.spread < 0 || best_price.spread > max_spread) {
      console.warn(`[ClobAPI] 价差异常: ${best_price.spread}`);
      return false;
    }

    // 检查深度
    if (best_price.bid_size < min_liquidity || best_price.ask_size < min_liquidity) {
      console.warn(`[ClobAPI] 深度不足: bid=${best_price.bid_size}, ask=${best_price.ask_size}`);
      return false;
    }

    return true;
  }

  /**
   * HTTP POST 请求
   */
  private async httpPost<T>(url: string, payload: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const data = JSON.stringify(payload);

      const options: RequestOptions & HttpsRequestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data).toString(),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0 Safari/537.36',
        },
        timeout: this.config.timeout,
      };

      const req = protocol.request(url, options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body) as T);
            } catch (error) {
              reject(new Error(`JSON 解析失败: ${error}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时'));
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 导出单例
export const clobApiClient = new ClobApiClient();
