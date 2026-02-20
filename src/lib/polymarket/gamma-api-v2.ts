/**
 * Polymarket Gamma API 客户端
 * 完整版：集成 Worker Pool 并发控制 + HttpsProxyAgent 代理支持
 */

import http, { RequestOptions } from 'http';
import https, { RequestOptions as HttpsRequestOptions } from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

// --- 代理配置 ---
// 请确保已安装：pnpm add https-proxy-agent
const PROXY_URL = 'http://127.0.0.1:7897';
const proxyAgent = new HttpsProxyAgent(PROXY_URL, {
  keepAlive: true,
  maxSockets: 20,
  timeout: 60000,
});

// 市场数据接口
export interface GammaMarket {
  id: string;
  question: string;
  endDate: string;
  active: boolean;
  spread: number;
  outcomePrices: number[] | string;
  liquidity: number | string;
  volume: number | string;
  volume24hr: number | string;
  outcomes: string[] | string;
  clobTokenIds: string[] | string;
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
  volume24hr: number;
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
      maxWorkers: config.maxWorkers || 12,
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 2000,
    };
  }

  /**
   * 获取活跃市场列表（真正意义上的并发控制）
   */
  async fetchMarkets(hours: number = 480): Promise<ParsedMarket[]> {
    const limit = 500;
    const max_total = 15000;
    const offsets: number[] = [];
    for (let offset = 0; offset < max_total; offset += limit) {
      offsets.push(offset);
    }

    console.log(`[GammaAPI] 使用代理: ${PROXY_URL}`);
    console.log(`[GammaAPI] 启动工作池并发获取，Worker数量: ${this.config.maxWorkers}`);

    const all_markets: GammaMarket[] = [];
    const queue = [...offsets]; // 任务队列

    /**
     * 并发执行的工作者
     */
    const worker = async (workerId: number) => {
      while (queue.length > 0) {
        const offset = queue.shift();
        if (offset === undefined) break;

        const index = offsets.indexOf(offset);
        const url = `${this.config.baseUrl}/markets?active=true&closed=false&archived=false&limit=${limit}&offset=${offset}`;

        try {
          const data = await this.fetchPage(url, index);
          if (data && data.length > 0) {
            all_markets.push(...data);
          } else {
            // 如果某一页返回空，说明后续没有数据了，清空队列提前退出
            queue.length = 0;
          }
        } catch (error) {
          console.error(`[GammaAPI] Worker ${workerId} 最终放弃第 ${index + 1} 页`);
        }
      }
    };

    // 启动指定数量的工作者并行执行
    const workerPromises = Array.from(
      { length: Math.min(this.config.maxWorkers, offsets.length) },
      (_, i) => worker(i)
    );

    await Promise.all(workerPromises);

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
    } catch (error: any) {
      if (attempt < this.config.retryAttempts) {
        console.warn(`[GammaAPI] 第 ${index + 1} 页获取失败 (${error.message || error}), 重试第 ${attempt + 1} 次`);
        await this.sleep(this.config.retryDelay);
        return this.fetchPage(url, index, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * 解析市场数据 (完全还原你的原始逻辑)
   */
  private parseMarkets(raw_markets: GammaMarket[]): ParsedMarket[] {
    const parsed_markets: ParsedMarket[] = [];

    for (const market of raw_markets) {
      try {
        if (!market.id || !market.question) {
          continue;
        }

        // 解析 outcomes, prices, ids
        const outcomes = this.parseJsonField<string[]>(market.outcomes);
        const outcome_prices_strs = this.parseJsonField<any[]>(market.outcomePrices);
        const outcome_ids_list = this.parseJsonField<string[]>(market.clobTokenIds);

        // 验证数据完整性
        if (
          !Array.isArray(outcomes) ||
          !Array.isArray(outcome_prices_strs) ||
          outcomes.length !== outcome_prices_strs.length ||
          outcomes.length < 2
        ) {
          continue;
        }

        const probabilities = new Map<string, number>();
        const outcome_ids = new Map<string, string>();
        const outcome_prices = new Map<string, number>();
        let valid_outcomes = 0;

        for (let i = 0; i < outcomes.length; i++) {
          const name = outcomes[i];
          const price_str = outcome_prices_strs[i];
          const outcome_id = Array.isArray(outcome_ids_list) ? outcome_ids_list[i] : '';

          try {
            const price = parseFloat(price_str);
            if (isNaN(price) || price < 0 || price > 1) {
              continue;
            }

            probabilities.set(name, price);
            if (outcome_id) outcome_ids.set(name, outcome_id);
            outcome_prices.set(name, price);
            valid_outcomes++;
          } catch {
            continue;
          }
        }

        if (valid_outcomes < 2) {
          continue;
        }

        // 解析数值
        const liquidity = parseFloat(market.liquidity?.toString() || '0') || 0;
        const volume = parseFloat(market.volume?.toString() || '0') || 0;
        const spread = parseFloat(market.spread?.toString() || '0') || 0;
        const volume24hr = parseFloat((market as any).volume24hr?.toString() || 
                             (market as any).volume24h?.toString() || 
                             '0' || 0);

        parsed_markets.push({
          id: market.id,
          question: market.question,
          endDate: market.endDate,
          active: market.active,
          spread,
          outcomePrices: outcome_prices,
          liquidity,
          volume,
          volume24hr,
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
   * HTTP GET 请求 (集成代理与 DEBUG 日志)
   */
  private async httpGet<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const protocol = isHttps ? https : http;

      const options: any = {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        timeout: this.config.timeout,
        agent: proxyAgent, // 强制走代理 Agent
      };

      const req = protocol.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as T);
            } catch (e) {
              reject(new Error(`JSON解析失败: ${(e as Error).message}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', (err: any) => {
        console.log(`[DEBUG] 网络错误: ${err.code} - ${err.message}`);
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        console.log(`[DEBUG] 请求超时 ${this.config.timeout}ms`);
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