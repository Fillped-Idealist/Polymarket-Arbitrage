import { NextRequest, NextResponse } from 'next/server';
import { BacktestEngine } from '@/lib/backtest/engine';
import { BacktestConfig, BacktestStrategyType, BacktestResult } from '@/lib/backtest/types';
import { BacktestDataCollector } from '@/lib/backtest/data-collector';

export interface BacktestRequest {
  config?: {
    initialCapital?: number;
    maxPositions?: number;
    maxPositionSize?: number;
    strategies?: {
      convergence?: {
        enabled?: boolean;
        maxPositions?: number;
        maxPositionSize?: number;
        stopLoss?: number;
        takeProfit?: number;
      };
      arbitrage?: {
        enabled?: boolean;
        maxPositions?: number;
        maxPositionSize?: number;
        stopLoss?: number;
        takeProfit?: number;
      };
      reversal?: {
        enabled?: boolean;
        maxPositions?: number;
        maxPositionSize?: number;
        stopLoss?: number;
        takeProfit?: number;
        trailingStop?: number;
      };
      trend_following?: {
        enabled?: boolean;
        maxPositions?: number;
        maxPositionSize?: number;
        stopLoss?: number;
        takeProfit?: number;
        trailingStop?: number;
      };
      mean_reversion?: {
        enabled?: boolean;
        maxPositions?: number;
        maxPositionSize?: number;
        stopLoss?: number;
        takeProfit?: number;
        trailingStop?: number;
      };
    };
    filters?: {
      minVolume?: number;
      minLiquidity?: number;
      minDaysToEnd?: number;
      maxDaysToEnd?: number;
      tags?: string[];
    };
    days?: number;
  };
  // 真实历史数据（必需）
  historicalData?: {
    snapshots: any[];
  };
}

export interface BacktestResponse {
  success: boolean;
  result?: BacktestResult;
  error?: string;
  summary?: {
    totalReturn: string;
    winRate: string;
    sharpeRatio: string;
    maxDrawdown: string;
    totalTrades: number;
    bestStrategy: string;
  };
}

/**
 * POST /api/backtest
 * 运行回测
 */
export async function POST(request: NextRequest) {
  try {
    const body: BacktestRequest = await request.json();

    // 生成回测配置
    const config: BacktestConfig = generateConfig(body.config || {});

    console.log('🚀 开始回测 API 调用...');
    console.log('📊 配置:', JSON.stringify(config, null, 2));

    // ❌ 严禁使用模拟数据，必须传入historicalData
    if (!body.historicalData || !body.historicalData.snapshots || body.historicalData.snapshots.length === 0) {
      console.error('❌ 缺少必要的历史数据');
      return NextResponse.json({
        success: false,
        error: '必须提供真实的历史数据。请使用 /api/backtest/import 导入数据。',
      } satisfies BacktestResponse, { status: 400 });
    }

    // 使用传入的真实历史数据
    const snapshots = body.historicalData.snapshots;
    console.log(`📊 使用导入的真实历史数据，共 ${snapshots.length} 个快照`);

    // 3. 创建回测引擎
    const engine = new BacktestEngine(config);

    // 4. 加载数据
    await engine.loadData(snapshots);

    // 5. 运行回测
    const result = await engine.run();

    // 6. 生成摘要
    const summary = generateSummary(result);

    console.log('✅ 回测完成');
    console.log('📊 摘要:', summary);

    return NextResponse.json({
      success: true,
      result,
      summary,
    } satisfies BacktestResponse);
  } catch (error) {
    console.error('❌ 回测错误:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    } satisfies BacktestResponse, { status: 500 });
  }
}

/**
 * 生成回测配置
 */
function generateConfig(userConfig: BacktestRequest['config']): BacktestConfig {
  const days = userConfig?.days || 30;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const strategies = userConfig?.strategies || {};

  return {
    startDate,
    endDate,
    intervalMinutes: 60, // 每小时一个时间点

    initialCapital: userConfig?.initialCapital || 10000,
    maxPositions: userConfig?.maxPositions || 7,  // 调整为7
    maxPositionSize: userConfig?.maxPositionSize || 0.08,  // 调整为8%

    strategies: {
      [BacktestStrategyType.CONVERGENCE]: {
        enabled: strategies.convergence?.enabled ?? false,
        maxPositions: strategies.convergence?.maxPositions || 7,
        maxPositionSize: strategies.convergence?.maxPositionSize || 0.08,  // 调整为8%
        stopLoss: strategies.convergence?.stopLoss || 0.22,  // 调整为22%
        takeProfit: strategies.convergence?.takeProfit || 0.07,  // 调整为7%
      },
      [BacktestStrategyType.ARBITRAGE]: {
        enabled: strategies.arbitrage?.enabled ?? false,
        maxPositions: strategies.arbitrage?.maxPositions || 7,
        maxPositionSize: strategies.arbitrage?.maxPositionSize || 0.08,  // 调整为8%
        stopLoss: strategies.arbitrage?.stopLoss || 0.22,  // 调整为22%
        takeProfit: strategies.arbitrage?.takeProfit || 0.07,  // 调整为7%
      },
      [BacktestStrategyType.REVERSAL]: {
        enabled: strategies.reversal?.enabled ?? false,  // 默认关闭
        maxPositions: strategies.reversal?.maxPositions || 7,
        maxPositionSize: strategies.reversal?.maxPositionSize || 0.08,  // 调整为8%
        stopLoss: strategies.reversal?.stopLoss || 0.22,  // 调整为22%
        takeProfit: strategies.reversal?.takeProfit || 0.07,  // 调整为7%
        trailingStop: strategies.reversal?.trailingStop || 0.10,
      },
      [BacktestStrategyType.TREND_FOLLOWING]: {
        enabled: strategies.trend_following?.enabled ?? true,  // 默认开启
        maxPositions: strategies.trend_following?.maxPositions || 7,
        maxPositionSize: strategies.trend_following?.maxPositionSize || 0.08,  // 调整为8%
        stopLoss: strategies.trend_following?.stopLoss || 0.22,  // 调整为22%
        takeProfit: strategies.trend_following?.takeProfit || 0.07,  // 调整为7%
        trailingStop: strategies.trend_following?.trailingStop || 0.10,
      },
      [BacktestStrategyType.MEAN_REVERSION]: {
        enabled: strategies.mean_reversion?.enabled ?? true,  // 默认开启
        maxPositions: strategies.mean_reversion?.maxPositions || 7,
        maxPositionSize: strategies.mean_reversion?.maxPositionSize || 0.08,  // 调整为8%
        stopLoss: strategies.mean_reversion?.stopLoss || 0.22,  // 调整为22%
        takeProfit: strategies.mean_reversion?.takeProfit || 0.07,  // 调整为7%
        trailingStop: strategies.mean_reversion?.trailingStop || 0.10,
      },
    },

    dailyLossLimit: 0.05,
    maxDrawdown: 0.15,

    filters: {
      minVolume: userConfig?.filters?.minVolume || 30000,
      minLiquidity: userConfig?.filters?.minLiquidity || 5000,
      minDaysToEnd: userConfig?.filters?.minDaysToEnd || 1,
      maxDaysToEnd: userConfig?.filters?.maxDaysToEnd || 20,
      tags: userConfig?.filters?.tags,
    },
  };
}

/**
 * 生成摘要
 */
function generateSummary(result: BacktestResult): BacktestResponse['summary'] {
  // 找出表现最好的策略
  const strategyEntries = Object.entries(result.strategyStats);
  const bestStrategyEntry = strategyEntries.reduce((best, current) => {
    return current[1].totalPnl > best[1].totalPnl ? current : best;
  });

  return {
    totalReturn: `${result.pnl.totalPercent.toFixed(2)}%`,
    winRate: `${result.trades.winRate.toFixed(1)}%`,
    sharpeRatio: result.pnl.sharpeRatio.toFixed(2),
    maxDrawdown: `${result.pnl.maxDrawdownPercent.toFixed(2)}%`,
    totalTrades: result.trades.total,
    bestStrategy: bestStrategyEntry[0],
  };
}

/**
 * GET /api/backtest
 * 获取默认配置
 */
export async function GET() {
  return NextResponse.json({
    config: {
      initialCapital: 10000,
      maxPositions: 5,
      maxPositionSize: 0.20,
      strategies: {
        convergence: {
          enabled: true,
          maxPositions: 2,
          stopLoss: 0.25,
          takeProfit: 0.18,
        },
        arbitrage: {
          enabled: true,
          maxPositions: 1,
          stopLoss: 0.01,
          takeProfit: 0.005,
        },
        reversal: {
          enabled: true,
          maxPositions: 2,
          stopLoss: 0.08,
          takeProfit: 0.50,
          trailingStop: 0.10,
        },
      },
      filters: {
        minVolume: 30000,
        minLiquidity: 5000,
        minDaysToEnd: 1,
        maxDaysToEnd: 20,
        tags: [],
      },
      days: 30,
    },
  });
}
