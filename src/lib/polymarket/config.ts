/**
 * 环境变量类型定义
 */

export interface EnvConfig {
  // Polymarket Gamma API 配置
  POLYMARKET_GAMMA_API_URL: string;

  // Polymarket CLOB API 配置
  POLYMARKET_CLOB_API_URL: string;
  POLYMARKET_CLOB_API_KEY?: string;
  POLYMARKET_CLOB_API_SECRET?: string;

  // CLOB API Token ID 映射表
  POLYMARKET_TOKEN_ID_MAPPING?: string;

  // 数据库配置
  DATABASE_URL?: string;

  // Redis 配置
  REDIS_URL?: string;

  // 日志配置
  LOG_LEVEL?: string;
  LOG_FILE_PATH?: string;

  // API 限流配置
  GAMMA_API_RATE_LIMIT?: number;
  CLOB_API_RATE_LIMIT?: number;

  // WebSocket 配置
  POLYMARKET_CLOB_WS_URL?: string;

  // 测试环境配置
  IS_TESTING?: boolean;

  // 实盘交易配置
  ENABLE_LIVE_TRADING?: boolean;

  // 初始资金
  INITIAL_CAPITAL?: number;

  // 最大持仓数
  MAX_POSITIONS?: number;

  // 单仓位比例
  MAX_POSITION_SIZE?: number;

  // 测试模式
  TEST_MODE?: 'all-reversal' | '1-convergence-4-reversal' | '2-convergence-3-reversal';

  // 更新间隔
  UPDATE_INTERVAL_MINUTES?: number;

  // 最小流动性
  MIN_LIQUIDITY?: number;

  // 最大滑点
  MAX_SLIPPAGE?: number;

  // 最小订单大小
  MIN_ORDER_SIZE?: number;

  // 市场黑名单
  POLYMARKET_MARKET_BLACKLIST?: string;
}

/**
 * 从环境变量读取配置
 */
export function getEnvConfig(): Partial<EnvConfig> {
  return {
    POLYMARKET_GAMMA_API_URL: process.env.POLYMARKET_GAMMA_API_URL,
    POLYMARKET_CLOB_API_URL: process.env.POLYMARKET_CLOB_API_URL,
    POLYMARKET_CLOB_API_KEY: process.env.POLYMARKET_CLOB_API_KEY,
    POLYMARKET_CLOB_API_SECRET: process.env.POLYMARKET_CLOB_API_SECRET,
    POLYMARKET_TOKEN_ID_MAPPING: process.env.POLYMARKET_TOKEN_ID_MAPPING,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_FILE_PATH: process.env.LOG_FILE_PATH,
    GAMMA_API_RATE_LIMIT: process.env.GAMMA_API_RATE_LIMIT
      ? parseInt(process.env.GAMMA_API_RATE_LIMIT)
      : undefined,
    CLOB_API_RATE_LIMIT: process.env.CLOB_API_RATE_LIMIT
      ? parseInt(process.env.CLOB_API_RATE_LIMIT)
      : undefined,
    POLYMARKET_CLOB_WS_URL: process.env.POLYMARKET_CLOB_WS_URL,
    IS_TESTING: process.env.IS_TESTING === 'true',
    ENABLE_LIVE_TRADING: process.env.ENABLE_LIVE_TRADE === 'true',
    INITIAL_CAPITAL: process.env.INITIAL_CAPITAL
      ? parseFloat(process.env.INITIAL_CAPITAL)
      : undefined,
    MAX_POSITIONS: process.env.MAX_POSITIONS
      ? parseInt(process.env.MAX_POSITIONS)
      : undefined,
    MAX_POSITION_SIZE: process.env.MAX_POSITION_SIZE
      ? parseFloat(process.env.MAX_POSITION_SIZE)
      : undefined,
    TEST_MODE: process.env.TEST_MODE as any,
    UPDATE_INTERVAL_MINUTES: process.env.UPDATE_INTERVAL_MINUTES
      ? parseInt(process.env.UPDATE_INTERVAL_MINUTES)
      : undefined,
    MIN_LIQUIDITY: process.env.MIN_LIQUIDITY
      ? parseFloat(process.env.MIN_LIQUIDUTY)
      : undefined,
    MAX_SLIPPAGE: process.env.MAX_SLIPPAGE
      ? parseFloat(process.env.MAX_SLIPPAGE)
      : undefined,
    MIN_ORDER_SIZE: process.env.MIN_ORDER_SIZE
      ? parseInt(process.env.MIN_ORDER_SIZE)
      : undefined,
    POLYMARKET_MARKET_BLACKLIST: process.env.POLYMARKET_MARKET_BLACKLIST,
  };
}

/**
 * 解析 Token ID 映射表
 */
export function parseTokenIdMapping(mappingStr?: string): Map<string, string> {
  if (!mappingStr) {
    return new Map();
  }

  try {
    const mapping = JSON.parse(mappingStr);
    return new Map(Object.entries(mapping));
  } catch (error) {
    console.error('Failed to parse token ID mapping:', error);
    return new Map();
  }
}

/**
 * 解析市场黑名单
 */
export function parseMarketBlacklist(blacklistStr?: string): string[] {
  if (!blacklistStr) {
    return [];
  }

  try {
    return JSON.parse(blacklistStr);
  } catch (error) {
    console.error('Failed to parse market blacklist:', error);
    return [];
  }
}
