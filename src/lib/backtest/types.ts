// 回测系统类型定义

export enum BacktestStrategyType {
  CONVERGENCE = 'convergence',      // 尾盘收敛套利
  ARBITRAGE = 'arbitrage',          // Gamma套利（无风险）
  REVERSAL = 'reversal',            // 反转套利（高风险高收益）
  TREND_FOLLOWING = 'trend_following',  // 趋势跟随（基于价格趋势）
  MEAN_REVERSION = 'mean_reversion',    // 均值回归（基于价格波动）
}

export enum BacktestPositionStatus {
  OPEN = 'open',                    // 已开仓
  CLOSED = 'closed',                // 已平仓
  STOPPED = 'stopped',              // 止损
  TAKEN = 'taken',                  // 止盈
  EXPIRED = 'expired',              // 到期结算
}

export interface BacktestMarketSnapshot {
  timestamp: Date;
  marketId: string;
  question: string;
  outcomePrices: number[];          // 实时价格（从Clob API获取）
  liquidity: number;                // 盘口流动性
  volume24h: number;
  endDate: Date;
  isBinary: boolean;                // 是否二元市场
  tags?: string[];                  // 标签（如crypto, politics）
  tokenIds?: string[];
}

export interface BacktestConfig {
  // 时间范围
  startDate: Date;
  endDate: Date;
  intervalMinutes: number;          // 回测间隔（分钟）

  // 资金管理
  initialCapital: number;           // 初始资金
  maxPositions: number;             // 最大持仓数
  maxPositionSize: number;          // 单仓位最大占比

  // 策略配置
  strategies: {
    [key in BacktestStrategyType]: {
      enabled: boolean;
      version?: string;            // 策略版本（如 'v6' 对应 Reversal V8.7）
      maxPositions: number;
      maxPositionSize: number;      // 单策略单仓位最大占比
      stopLoss?: number;            // 止损百分比
      takeProfit?: number;          // 止盈百分比
      trailingStop?: number;        // 移动止损
    };
  };

  // 风险控制
  dailyLossLimit: number;           // 日亏损限制
  maxDrawdown: number;              // 最大回撤

  // 过滤条件
  filters: {
    minVolume: number;              // 最小成交量
    minLiquidity: number;           // 最小流动性
    minDaysToEnd: number;           // 最小到期天数
    maxDaysToEnd: number;           // 最大到期天数
    tags?: string[];                // 标签过滤（如['crypto']只看加密货币）
  };
}

export interface BacktestTrade {
  id: string;
  marketId: string;
  question: string;
  strategy: BacktestStrategyType;
  outcomeIndex: number;
  outcomeName: string;

  // 开仓信息
  entryTime: Date;
  entryPrice: number;
  positionSize: number;
  entryValue: number;
  endDate: Date;  // 事件到期时间

  // 平仓信息
  exitTime: Date | null;
  exitPrice: number | null;
  exitValue: number | null;

  // 盈亏
  pnl: number;
  pnlPercent: number;
  status: BacktestPositionStatus;
  exitReason: string;

  // 风险管理
  stopLoss: number | null;
  takeProfit: number | null;
}

export interface BacktestResult {
  // 基本信息
  period: {
    start: Date;
    end: Date;
    duration: number;               // 天数
  };

  // 交易统计
  trades: {
    total: number;
    winning: number;
    losing: number;
    winRate: number;                // 胜率
    averageTrade: number;           // 平均每笔盈亏
    bestTrade: number;              // 最佳交易
    worstTrade: number;             // 最差交易
  };

  // 盈亏统计
  pnl: {
    total: number;                  // 总盈亏
    totalPercent: number;           // 总收益率
    averageDaily: number;           // 日均收益
    maxDrawdown: number;            // 最大回撤
    maxDrawdownPercent: number;     // 最大回撤百分比
    sharpeRatio: number;            // 夏普比率（简化版）
  };

  // 按策略统计
  strategyStats: {
    [key in BacktestStrategyType]: {
      trades: number;
      winRate: number;
      totalPnl: number;
      averagePnl: number;
      maxDrawdown: number;
    };
  };

  // 资金曲线
  equityCurve: {
    timestamp: Date;
    equity: number;
    positions: number;
  }[];

  // 交易明细
  tradesList: BacktestTrade[];
}

export interface BacktestStrategy {
  type: BacktestStrategyType;
  shouldOpen(snapshot: BacktestMarketSnapshot, config: BacktestConfig): boolean;
  shouldClose(trade: BacktestTrade, currentPrice: number, currentTime: Date, config: BacktestConfig): boolean;
  getExitReason(trade: BacktestTrade, currentPrice: number, currentTime: Date): string;
}
