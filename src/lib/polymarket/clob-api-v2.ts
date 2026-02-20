/**
 * Polymarket CLOB API 客户端
 * 改进点：集成代理、增强调试信息、健壮的 JSON 解析
 */

import http, { RequestOptions } from 'http';
import https, { RequestOptions as HttpsRequestOptions } from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

// --- 代理配置 (与 Gamma API 保持一致) ---
const PROXY_URL = 'http://127.0.0.1:7897';
const proxyAgent = new HttpsProxyAgent(PROXY_URL, {
  keepAlive: true,
  maxSockets: 10,
  timeout: 60000,
});

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
  bid: number;      // 最高买价
  bid_size: number; // 买一深度
  ask: number;      // 最低卖价
  ask_size: number; // 卖一深度
  spread: number;   // 价差
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
      timeout: config.timeout || 15000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
    };
  }

  /**
   * 获取单个 Token 的订单簿
   */
  async fetchOrderBook(token_id: string): Promise<OrderBook | null> {
    console.log(`[ClobAPI] 正在请求单代币订单簿: ${token_id.slice(0, 10)}...`);
    const url = `${this.config.baseUrl}/books`;
    const payload = [{ token_id }];

    try {
      const data = await this.httpPost<OrderBook[]>(url, payload);
      if (Array.isArray(data) && data.length > 0) {
        return data[0];
      }
      console.warn(`[ClobAPI] 预期返回数组但为空: ${token_id}`);
      return null;
    } catch (error: any) {
      console.error(`[ClobAPI] 获取单订单簿失败 [${token_id.slice(0, 8)}]: ${error.message}`);
      return null;
    }
  }

  /**
   * 批量获取订单簿 (优化了并发控制)
   */
  async fetchOrderBooks(token_ids: string[]): Promise<Map<string, OrderBook>> {
    const order_books = new Map<string, OrderBook>();
    if (token_ids.length === 0) return order_books;

    // 分批处理，Polymarket CLOB 批量接口通常建议每批 20-50 个
    const batch_size = 500;
    const total_batches = Math.ceil(token_ids.length / batch_size);

    console.log(`[ClobAPI] 开始批量获取 ${token_ids.length} 个 Token 的订单簿, 共 ${total_batches} 批...`);

    for (let i = 0; i < token_ids.length; i += batch_size) {
      const batch = token_ids.slice(i, i + batch_size);
      const url = `${this.config.baseUrl}/books`;
      const payload = batch.map(id => ({ token_id: id }));

      const current_batch_num = Math.floor(i / batch_size) + 1;

      try {
        const data = await this.httpPost<OrderBook[]>(url, payload);
        if (Array.isArray(data)) {
          data.forEach((book, index) => {
            if (book && (book.asks || book.bids)) {
              order_books.set(batch[index], book);
            }
          });
          console.log(`[ClobAPI] 第 ${current_batch_num}/${total_batches} 批成功 (${data.length} 条)`);
        }
      } catch (error: any) {
        console.error(`[ClobAPI] 第 ${current_batch_num} 批失败: ${error.message}`);
      }

      // 批量请求之间微小延迟，防止被风控
      if (i + batch_size < token_ids.length) await this.sleep(200);
    }

    console.log(`[ClobAPI] 批量获取完成: 成功抓取 ${order_books.size}/${token_ids.length} 个订单簿`);
    return order_books;
  }

  /**
   * 计算最佳价格
   */
  getBestPrice(order_book: OrderBook): BestPrice | null {
    if (!order_book || (!order_book.asks?.length && !order_book.bids?.length)) {
      return null;
    }

    // 处理卖单 (Asks) -> 价格从低到高
    const valid_asks = (order_book.asks || [])
      .map(level => ({ price: parseFloat(level.price.toString()), size: parseFloat(level.size.toString()) }))
      .filter(l => l.price > 0 && l.size > 0)
      .sort((a, b) => a.price - b.price);

    // 处理买单 (Bids) -> 价格从高到低
    const valid_bids = (order_book.bids || [])
      .map(level => ({ price: parseFloat(level.price.toString()), size: parseFloat(level.size.toString()) }))
      .filter(l => l.price > 0 && l.size > 0)
      .sort((a, b) => b.price - a.price);

    const best_ask = valid_asks[0] || { price: 0, size: 0 };
    const best_bid = valid_bids[0] || { price: 0, size: 0 };

    return {
      bid: best_bid.price,
      bid_size: best_bid.size,
      ask: best_ask.price,
      ask_size: best_ask.size,
      spread: best_ask.price > 0 && best_bid.price > 0 ? best_ask.price - best_bid.price : 1,
    };
  }

  /**
   * 验证流动性和价差
   */
  validateMarket(order_book: OrderBook, min_liquidity: number = 100, max_spread: number = 0.025): boolean {
    const bp = this.getBestPrice(order_book);
    if (!bp || bp.ask === 0 || bp.bid === 0) return false;

    // 调试日志：只有在真正进入交易逻辑前才打印
    if (bp.spread > max_spread) {
        // console.log(`[DEBUG] 价差过大: ${bp.spread.toFixed(4)} > ${max_spread}`);
        return false;
    }

    if (bp.bid_size < min_liquidity || bp.ask_size < min_liquidity) {
        return false;
    }

    return true;
  }

  /**
   * 检查指定 Token 是否有足够的流动性执行特定规模的交易
   * @param token_id Token ID
   * @param side 'buy' 或 'sell'
   * @param sharesToTrade 需要成交的份数
   * @param maxSlippage 允许的最大滑点百分比 (例如 0.02 代表 2%)
   */
  async hasEnoughLiquidity(
    token_id: string, 
    side: 'buy' | 'sell', 
    sharesToTrade: number, 
    maxSlippage: number = 0.02
  ): Promise<boolean> {
    try {
      const orderBook = await this.fetchOrderBook(token_id);
      if (!orderBook) return false;

      // 如果是买入，我们要吃掉卖单 (asks)；如果是卖出，吃掉买单 (bids)
      const levels = side === 'buy' ? orderBook.asks : orderBook.bids;
      if (!levels || levels.length === 0) return false;

      // 1. 转换并排序
      // 买入时：价格从小到大排列（先吃便宜的）
      // 卖出时：价格从大到小排列（先卖高价的）
      const sortedLevels = levels
        .map(l => ({ price: parseFloat(l.price.toString()), size: parseFloat(l.size.toString()) }))
        .sort((a, b) => side === 'buy' ? a.price - b.price : b.price - a.price);

      const bestPrice = sortedLevels[0].price;
      const limitPrice = side === 'buy' 
        ? bestPrice * (1 + maxSlippage) 
        : bestPrice * (1 - maxSlippage);

      let accumulatedShares = 0;
      let totalPrice = 0;

      // 2. 模拟吃单
      for (const level of sortedLevels) {
        // 如果当前档位价格已经超出滑点限制，停止计算
        if (side === 'buy' && level.price > limitPrice) break;
        if (side === 'sell' && level.price < limitPrice) break;

        const remainingNeed = sharesToTrade - accumulatedShares;
        const take = Math.min(level.size, remainingNeed);

        accumulatedShares += take;
        totalPrice += take * level.price;

        if (accumulatedShares >= sharesToTrade) {
          // 计算平均成交价并校验最终滑点（可选）
          const avgPrice = totalPrice / accumulatedShares;
          const totalSlippage = Math.abs(avgPrice - bestPrice) / bestPrice;
          
          if (totalSlippage <= maxSlippage) {
            return true;
          }
          break;
        }
      }

      // console.log(`[ClobAPI] 流动性不足: ${token_id} 需要 ${sharesToTrade}, 仅能满足 ${accumulatedShares}`);
      return false;
    } catch (error) {
      console.error(`[ClobAPI] 检查流动性异常:`, error);
      return false;
    }
  }

  /**
   * 别名方法，用于向后兼容或简化调用
   */
  async getOrderBook(token_id: string): Promise<OrderBook | null> {
    return this.fetchOrderBook(token_id);
  }

  /**
   * 通用 POST 请求（带代理和重试）
   */
  private async httpPost<T>(url: string, payload: any, attempt: number = 0): Promise<T> {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const protocol = isHttps ? https : http;
      const bodyData = JSON.stringify(payload);

      const options: any = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyData),
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: this.config.timeout,
        agent: proxyAgent, // 注入代理
      };

      const req = protocol.request(url, options, (res) => {
        let responseBody = '';
        res.on('data', chunk => responseBody += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(responseBody));
            } catch (e) {
              reject(new Error(`JSON解析失败: ${responseBody.slice(0, 50)}...`));
            }
          } else {
            // 记录 429 (频率限制) 等特殊状态
            const msg = `HTTP ${res.statusCode}: ${responseBody.slice(0, 100)}`;
            reject(new Error(msg));
          }
        });
      });

      req.on('error', async (err) => {
        if (attempt < this.config.retryAttempts) {
          await this.sleep(this.config.retryDelay);
          resolve(this.httpPost<T>(url, payload, attempt + 1));
        } else {
          reject(err);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('ETIMEDOUT'));
      });

      req.write(bodyData);
      req.end();
    });
  }

  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
}

export const clobApiClient = new ClobApiClient();