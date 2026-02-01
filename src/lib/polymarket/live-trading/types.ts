/**
 * 实盘交易引擎类型定义
 */

export interface LiveTradingConfig {
  // 基础配置
  initialCapital: number;  // 初始资金
  maxPositions: number;  // 最大持仓数（5）
  maxPositionSize: number;  // 单仓位比例（0.18，即 18%）

  // 测试模式
  testMode: 'all-reversal' | '1-convergence-4-reversal' | '2-convergence-3-reversal';

  // 策略配置
  strategies: {
    reversal: {
      enabled: boolean;
      maxPositions: number;
      maxPositionSize: number;
    };
    convergence: {
      enabled: boolean;
      maxPositions: number;
      maxPositionSize: number;
    };
  };

  // 实盘特有配置
  updateIntervalMinutes: number;  // 更新间隔（分钟，默认 10）
  minLiquidity: number;  // 最小流动性要求
  maxSlippage: number;  // 最大滑点
}

export interface LiveTrade {
  id: string;
  marketId: string;
  question: string;
  strategy: 'reversal' | 'convergence';
  outcomeIndex: number;
  outcomeName: string;

  // 开仓信息
  entryTime: Date;
  entryPrice: number;
  positionSize: number;
  entryValue: number;
  endDate: Date;

  // 平仓信息（初始为空）
  exitTime: Date | null;
  exitPrice: number | null;
  exitValue: number | null;

  // 盈亏（初始为0）
  pnl: number;
  pnlPercent: number;
  status: 'open' | 'closed' | 'stopped';
  exitReason: string;

  // 实时更新字段
  currentPrice?: number;
  currentPnl?: number;
  currentPnlPercent?: number;
  lastUpdated: Date;

  // 止盈止损字段
  highestPrice?: number;
}

export interface LiveTradingEvent {
  type: 'position_opened' | 'position_closed' | 'error' | 'info' | 'progress';
  timestamp: Date;
  data?: any;
}

export type LiveTradingCallback = (event: LiveTradingEvent) => void;

export interface ProgressData {
  step: string;
  current: number;
  total: number;
  message: string;
  details?: string;
}
