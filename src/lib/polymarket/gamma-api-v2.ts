/**
 * Polymarket Gamma API 客户端
 * 参考 main_3.py 实现，使用多线程和线程保护
 */

import http, { RequestOptions } from 'http';
import https, { RequestOptions as HttpsRequestOptions } from 'https';

// 市场数据接口
export interface GammaMarket {
  id: string;
  question: string;
  endDate: string;
  active: boolean;
  spread: number;
  outcomePrices: number[];
  liquidity: number;
  volume: number;
  outcomes: string[];
  clobTokenIds: string[];
}

// 解析后的市场数据
export interface ParsedMarket {
  id: string;
  question: string;
  endDate: string;
  active: boolean;
  spread: number;
  outcomePrices: Map<string, number>;
  liquidity: number;
  volume: number;
  outcomes: string[];
  outcomeIds: Map<string, string>;
  probabilities: Map<string, number>;
}

/**
 * Gamma API 配置
 */
export interface GammaApiConfig {
  baseUrl?: string;
  maxWorkers?: number;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * Gamma API 客户端
 */
export class GammaApiClient {
  private config: Required<GammaApiConfig>;

  constructor(config: GammaApiConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'https://gamma-api.polymarket.com',
      maxWorkers: config.maxWorkers || 6,  // 降低并发数，从 12 降到 6
      timeout: config.timeout || 30000,  // 增加超时时间，从 15 秒增加到 30 秒
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 2000,
    };
  }

  /**
   * 获取活跃市场列表（多线程并发）
   * @param hours - 获取未来多少小时的市场数据（已废弃，保留参数兼容性）
   */
  async fetchMarkets(hours: number = 480): Promise<ParsedMarket[]> {
    // 分页获取
    const limit = 500;
    const max_total = 15000;
    const offsets: number[] = [];
    for (let offset = 0; offset < max_total; offset += limit) {
      offsets.push(offset);
    }

    console.log(`[GammaAPI] 启动 ${Math.min(this.config.maxWorkers, offsets.length)} 个线程并发获取 ${offsets.length} 页数据...`);

    // 并发获取所有页面（使用正确的参数格式）
    const all_markets: GammaMarket[] = [];
    const fetchPromises = offsets.map((offset, index) =>
      this.fetchPage(`${this.config.baseUrl}/markets?status=active&limit=500&offset=${offset}`, index)
    );

    const results = await Promise.allSettled(fetchPromises);

    // 处理结果
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        all_markets.push(...result.value);
      } else {
        console.error('[GammaAPI] 页面获取失败:', result.reason);
      }
    });

    console.log(`[GammaAPI] 原始数据获取完成：共收集到 ${all_markets.length} 个市场数据`);

    // 解析市场数据
    const parsed_markets = this.parseMarkets(all_markets);
    console.log(`[GammaAPI] 市场数据解析完成：${parsed_markets.length} 个有效市场`);

    return parsed_markets;
  }

  /**
   * 获取单页数据
   */
  private async fetchPage(url: string, index: number, attempt: number = 0): Promise<GammaMarket[]> {
    try {
      const data = await this.httpGet<GammaMarket[]>(url);
      console.log(`[GammaAPI] 第 ${index + 1} 页获取成功，返回 ${data.length} 个市场`);
      return data;
    } catch (error) {
      if (attempt < this.config.retryAttempts) {
        console.warn(`[GammaAPI] 第 ${index + 1} 页获取失败，重试第 ${attempt + 1} 次`);
        await this.sleep(this.config.retryDelay);
        return this.fetchPage(url, index, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * 解析市场数据
   */
  private parseMarkets(raw_markets: GammaMarket[]): ParsedMarket[] {
    const parsed_markets: ParsedMarket[] = [];

    for (const market of raw_markets) {
      try {
        if (!market.id || !market.question) {
          continue;
        }

        // 解析 outcomes
        const outcomes = this.parseJsonField(market.outcomes);
        const outcome_prices_strs = this.parseJsonField(market.outcomePrices);
        const outcome_ids_list = this.parseJsonField(market.clobTokenIds);

        // 验证数据完整性
        if (
          outcomes.length !== outcome_prices_strs.length ||
          outcomes.length !== outcome_ids_list.length ||
          outcomes.length < 2
        ) {
          continue;
        }

        // 解析结果价格和概率
        const probabilities = new Map<string, number>();
        const outcome_ids = new Map<string, string>();
        const outcome_prices = new Map<string, number>();
        let valid_outcomes = 0;

        for (let i = 0; i < outcomes.length; i++) {
          const name = outcomes[i];
          const price_str = outcome_prices_strs[i];
          const outcome_id = outcome_ids_list[i];

          try {
            const price = parseFloat(price_str);
            if (isNaN(price) || price < 0 || price > 1) {
              continue;
            }

            probabilities.set(name, price);
            outcome_ids.set(name, outcome_id);
            outcome_prices.set(name, price);
            valid_outcomes++;
          } catch {
            continue;
          }
        }

        if (valid_outcomes < 2) {
          continue;
        }

        // 解析市场基本信息
        const liquidity = parseFloat(market.liquidity.toString()) || 0;
        const volume = parseFloat(market.volume.toString()) || 0;
        const spread = parseFloat(market.spread.toString()) || 0;

        parsed_markets.push({
          id: market.id,
          question: market.question,
          endDate: market.endDate,
          active: market.active,
          spread,
          outcomePrices: outcome_prices,
          liquidity,
          volume,
          outcomes,
          outcomeIds: outcome_ids,
          probabilities,
        });
      } catch (error) {
        console.error('[GammaAPI] 解析市场数据失败:', error);
        continue;
      }
    }

    return parsed_markets;
  }

  /**
   * 解析 JSON 字段
   */
  private parseJsonField<T>(value: any, default_value: T = [] as any): T {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return default_value;
      }
    }
    return Array.isArray(value) ? value : default_value;
  }

  /**
   * HTTP GET 请求
   */
  private async httpGet<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const options: RequestOptions & HttpsRequestOptions = {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        timeout: this.config.timeout,
      };

      const req = protocol.request(url, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as T);
            } catch (error) {
              reject(new Error(`JSON 解析失败: ${error}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
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
export const gammaApiClient = new GammaApiClient();
