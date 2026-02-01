import { BacktestMarketSnapshot } from './types';

// API配置
const GAMMA_API_BASE = 'https://gamma-api.polymarket.com/markets';
const CLOB_API_BASE = 'https://clob.polymarket.com';
const CLOB_PRICE_HISTORY_API = `${CLOB_API_BASE}/prices/history`;

/**
 * 历史数据收集器
 * 从Polymarket API收集市场数据用于回测
 */
export class BacktestDataCollector {
  /**
   * 获取活跃市场列表
   */
  static async getActiveMarkets(params?: {
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const queryParams = new URLSearchParams({
      active: 'true',
      closed: 'false',
      archived: 'false',
      limit: (params?.limit || 500).toString(),
      offset: (params?.offset || 0).toString(),
    });

    try {
      console.log(`[数据收集] 从Gamma API获取市场列表...`);
      const response = await fetch(`${GAMMA_API_BASE}?${queryParams}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PolymarketBacktest/1.0)',
        },
        signal: AbortSignal.timeout(30000), // 30秒超时
      });

      if (!response.ok) {
        throw new Error(`Gamma API failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[数据收集] 成功获取 ${data.length} 个市场`);
      return data;
    } catch (error) {
      console.error('[数据收集] 获取市场列表失败:', error);
      throw error; // 抛出异常而不是返回空数组
    }
  }

  /**
   * 从Clob API获取历史价格数据
   * 参考: https://docs.polymarket.com/developers/CLOB/timeseries
   */
  static async getTokenPriceHistory(tokenId: string, params?: {
    startTime?: number; // Unix timestamp in seconds
    endTime?: number;   // Unix timestamp in seconds
    interval?: string;  // '1m', '5m', '1h', '1d', etc.
  }): Promise<any[]> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.startTime) queryParams.append('start', params.startTime.toString());
      if (params?.endTime) queryParams.append('end', params.endTime.toString());
      if (params?.interval) queryParams.append('interval', params.interval);

      const url = `${CLOB_PRICE_HISTORY_API}/${tokenId}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

      console.log(`[数据收集] 获取Token历史价格: ${tokenId}`);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PolymarketBacktest/1.0)',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        console.warn(`[数据收集] 获取Token ${tokenId} 历史价格失败: ${response.status}`);
        return [];
      }

      const data = await response.json();
      console.log(`[数据收集] Token ${tokenId} 获取到 ${data.length} 条历史记录`);
      return data;
    } catch (error) {
      console.error(`[数据收集] 获取Token ${tokenId} 历史价格出错:`, error);
      return [];
    }
  }

  /**
   * 从Clob API获取订单簿数据（实时价格）
   */
  static async getOrderBooks(tokenIds: string[]): Promise<Map<string, any>> {
    try {
      if (!tokenIds || tokenIds.length === 0) {
        return new Map();
      }

      // Clob API支持批量查询，最多100个token
      const batchSize = 100;
      const orderBooks = new Map<string, any>();

      for (let i = 0; i < tokenIds.length; i += batchSize) {
        const batch = tokenIds.slice(i, i + batchSize);
        const response = await fetch(CLOB_API_BASE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch.map(id => ({ token_id: id }))),
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            data.forEach(book => {
              if (book.token_id) {
                orderBooks.set(book.token_id, book);
              }
            });
          }
        }
      }

      return orderBooks;
    } catch (error) {
      console.error('Error fetching order books:', error);
      return new Map();
    }
  }

  /**
   * 获取市场快照（实时数据）
   */
  static async getMarketSnapshot(market: any, orderBook: Map<string, any>): Promise<BacktestMarketSnapshot | null> {
    try {
      const tokenIds = market.tokenIds || [];
      const hasOrderBook = orderBook.size > 0;

      // 从订单簿或直接从market获取价格
      const prices: number[] = [];
      let totalLiquidity = 0;

      if (hasOrderBook && tokenIds.length > 0) {
        // 使用订单簿数据
        for (const tokenId of tokenIds) {
          const book = orderBook.get(tokenId);
          if (book && book.asks && book.asks.length > 0) {
            prices.push(book.asks[0].price);

            // 计算流动性（前5档）
            if (book.asks) {
              for (let i = 0; i < Math.min(5, book.asks.length); i++) {
                totalLiquidity += book.asks[i].size;
              }
            }
            if (book.bids) {
              for (let i = 0; i < Math.min(5, book.bids.length); i++) {
                totalLiquidity += book.bids[i].size;
              }
            }
          } else {
            prices.push(0);
          }
        }
      } else {
        // 使用市场提供的outcomePrices（真实数据）
        if (market.outcomePrices && Array.isArray(market.outcomePrices)) {
          prices.push(...market.outcomePrices);
          totalLiquidity = market.liquidity || 0;
        } else {
          return null;
        }
      }

      // 检查价格是否有效
      if (prices.length === 0 || prices.some(p => p === 0 || p > 1)) {
        return null;
      }

      // 确保流动性不为0
      if (totalLiquidity <= 0) {
        totalLiquidity = market.liquidity || 1000; // 使用默认值
      }

      // 提取标签
      const tags = market.tags || [];

      return {
        timestamp: new Date(),
        marketId: market.id,
        question: market.question,
        outcomePrices: prices,
        liquidity: totalLiquidity,
        volume24h: market.volume || 0,
        endDate: new Date(market.endDate),
        isBinary: prices.length === 2,
        tags,
        tokenIds: hasOrderBook ? tokenIds : undefined,
      };
    } catch (error) {
      console.error('Error creating market snapshot:', error);
      return null;
    }
  }

  /**
   * 批量获取市场快照
   */
  static async getMarketSnapshots(markets: any[]): Promise<BacktestMarketSnapshot[]> {
    // 检查是否有tokenIds
    const allTokenIds = markets
      .map(m => m.tokenIds || [])
      .flat()
      .filter(id => id);

    let orderBooks = new Map();

    // 如果有tokenIds，尝试获取orderBooks
    if (allTokenIds.length > 0) {
      orderBooks = await this.getOrderBooks(allTokenIds);
    }

    const snapshots: BacktestMarketSnapshot[] = [];

    for (const market of markets) {
      const snapshot = await this.getMarketSnapshot(market, orderBooks);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return snapshots;
  }

  /**
   * 过滤货币相关市场
   */
  static filterCryptoMarkets(markets: any[]): any[] {
    const cryptoKeywords = [
      'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'price',
      'coin', 'token', 'blockchain', 'solana', 'sol',
      'dogecoin', 'doge', 'binance', 'bnb', 'cardano', 'ada',
      'ripple', 'xrp', 'polkadot', 'dot', 'avalanche', 'avax',
      '币', '比特币', '以太坊', '加密'
    ];

    return markets.filter(market => {
      const question = (market.question || '').toLowerCase();
      const description = (market.description || '').toLowerCase();

      const hasCryptoKeyword = cryptoKeywords.some(keyword =>
        question.includes(keyword) || description.includes(keyword)
      );

      return hasCryptoKeyword;
    });
  }

  /**
   * 获取真实历史价格数据（使用CLOB时间序列API）
   * 参考: https://docs.polymarket.com/developers/CLOB/timeseries
   */
  static async getHistoricalDataFromMarkets(
    markets: any[],
    days: number = 7,
    interval: string = '1h'  // '1m', '5m', '1h', '1d'
  ): Promise<BacktestMarketSnapshot[]> {
    const snapshots: BacktestMarketSnapshot[] = [];

    console.log(`[数据收集] 开始获取 ${days} 天的真实历史数据，间隔: ${interval}`);

    // 计算时间范围
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - (days * 24 * 60 * 60);

    // 为每个市场收集历史数据
    for (const market of markets) {
      try {
        if (!market.tokenIds || market.tokenIds.length === 0) {
          console.warn(`[数据收集] 市场 ${market.id} 没有tokenIds，跳过`);
          continue;
        }

        // 为每个token获取历史价格
        const priceHistoryMap = new Map<number, Array<{ timestamp: number; price: number }>>();

        for (const tokenId of market.tokenIds) {
          const history = await this.getTokenPriceHistory(tokenId, {
            startTime,
            endTime,
            interval,
          });

          if (history && history.length > 0) {
            // 解析历史数据
            const pricePoints = history.map((point: any) => ({
              timestamp: point.t || point.timestamp || point.time,
              price: point.p || point.price || point.mid_price || (point.asks?.[0]?.price || 0),
            })).filter((p: any) => p.timestamp && p.price > 0 && p.price < 1);

            priceHistoryMap.set(market.tokenIds.indexOf(tokenId), pricePoints);
            console.log(`[数据收集] Token ${tokenId} 获取到 ${pricePoints.length} 个历史价格点`);
          }
        }

        // 如果所有token都有历史数据，创建快照
        if (priceHistoryMap.size === market.tokenIds.length) {
          // 获取所有时间戳
          const allTimestamps = new Set<number>();
          priceHistoryMap.forEach((points, index) => {
            points.forEach(point => allTimestamps.add(point.timestamp));
          });

          // 按时间戳排序
          const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

          // 为每个时间戳创建快照
          for (const timestamp of sortedTimestamps) {
            const prices: number[] = [];
            let validSnapshot = true;

            for (let i = 0; i < market.tokenIds.length; i++) {
              const points = priceHistoryMap.get(i);
              const point = points?.find(p => p.timestamp === timestamp);

              if (!point || !point.price || point.price <= 0 || point.price >= 1) {
                validSnapshot = false;
                break;
              }

              prices.push(point.price);
            }

            if (validSnapshot) {
              const snapshot: BacktestMarketSnapshot = {
                timestamp: new Date(timestamp * 1000),
                marketId: market.id,
                question: market.question,
                outcomePrices: prices,
                liquidity: market.liquidity || 0,
                volume24h: market.volume || 0,
                endDate: new Date(market.endDate),
                isBinary: prices.length === 2,
                tags: market.tags || [],
                tokenIds: market.tokenIds,
              };

              snapshots.push(snapshot);
            }
          }
        } else {
          console.warn(`[数据收集] 市场 ${market.id} 部分token没有历史数据`);
        }
      } catch (error) {
        console.error(`[数据收集] 处理市场 ${market.id} 时出错:`, error);
      }
    }

    // 按时间戳排序快照
    snapshots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    console.log(`[数据收集] 总共获取 ${snapshots.length} 个历史快照`);
    return snapshots;
  }

  /**
   * 验证市场快照有效性
   */
  static validateSnapshot(snapshot: BacktestMarketSnapshot): boolean {
    // 检查必要字段
    if (!snapshot.marketId || !snapshot.outcomePrices || snapshot.outcomePrices.length === 0) {
      console.warn(`[验证失败] 缺少必要字段: ${snapshot.marketId || 'unknown'}`);
      return false;
    }

    // 检查价格范围
    const invalidPrices = snapshot.outcomePrices.filter(p => p < 0 || p > 1);
    if (invalidPrices.length > 0) {
      console.warn(`[验证失败] 价格超出范围 [0, 1]: ${invalidPrices.join(', ')}`);
      return false;
    }

    // 检查是否已过期
    if (snapshot.endDate <= snapshot.timestamp) {
      console.warn(`[验证失败] 市场已过期: ${snapshot.marketId}`);
      return false;
    }

    // 检查流动性
    if (snapshot.liquidity <= 0) {
      console.warn(`[验证失败] 流动性为零: ${snapshot.marketId}`);
      return false;
    }

    return true;
  }

  /**
   * 验证市场数据
   */
  static validateMarket(market: any): boolean {
    if (!market || typeof market !== 'object') {
      console.warn('[验证失败] 市场数据无效');
      return false;
    }

    if (!market.id || !market.question) {
      console.warn('[验证失败] 缺少ID或问题');
      return false;
    }

    if (!market.outcomes || !Array.isArray(market.outcomes) || market.outcomes.length === 0) {
      console.warn('[验证失败] 缺少结果列表');
      return false;
    }

    if (!market.endDate) {
      console.warn('[验证失败] 缺少结束日期');
      return false;
    }

    return true;
  }

  /**
   * 批量验证市场数据
   */
  static validateMarkets(markets: any[]): { valid: any[]; invalid: number } {
    const valid = markets.filter(m => this.validateMarket(m));
    const invalid = markets.length - valid.length;

    console.log(`[数据验证] 有效市场: ${valid.length}, 无效市场: ${invalid}`);

    return { valid, invalid };
  }
}
