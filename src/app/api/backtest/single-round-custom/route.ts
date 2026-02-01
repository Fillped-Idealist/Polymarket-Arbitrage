import { NextRequest, NextResponse } from 'next/server';
import { OptimizedBacktestEngine } from '@/lib/backtest/optimized-engine';
import { BacktestConfig, BacktestStrategyType } from '@/lib/backtest/types';

/**
 * 单轮回测API - 支持自定义参数
 * POST /api/backtest/single-round-custom
 */

interface CustomParams {
  reversal?: {
    maxPositions?: number;
    stopLoss?: number;
    takeProfit?: number;
    minPrice?: number;
    maxPrice?: number;
    signalThreshold?: number;
  };
  convergence?: {
    maxPositions?: number;
    stopLoss?: number;
    takeProfit?: number;
    minPrice?: number;
    maxPrice?: number;
    signalThreshold?: number;
  };
}

export async function POST(request: NextRequest) {
  let body: any = null;
  try {
    body = await request.json();
    const {
      dataFile = 'backtest_data_2zip.json',
      round = 1,
      customParams = {},
    } = body;

    console.log(`🚀 第 ${round} 轮回测开始（自定义参数）`);

    // 读取数据文件
    const fs = require('fs');
    const path = require('path');
    const dataFilePath = path.join(process.cwd(), 'data', 'imported', dataFile);

    if (!fs.existsSync(dataFilePath)) {
      return NextResponse.json(
        { error: `数据文件不存在: ${dataFile}` },
        { status: 404 }
      );
    }

    // 加载数据
    const rawData = fs.readFileSync(dataFilePath, 'utf8');
    const parsedData = JSON.parse(rawData);

    let snapshots;
    if (Array.isArray(parsedData)) {
      snapshots = parsedData;
    } else if (parsedData.snapshots && Array.isArray(parsedData.snapshots)) {
      snapshots = parsedData.snapshots;
    } else {
      return NextResponse.json(
        { error: '数据格式不正确' },
        { status: 400 }
      );
    }

    // 转换数据格式
    const convertedSnapshots = snapshots
      .map((snap: any) => {
        if (!snap.timestamp || !snap.endDate || !snap.marketId) {
          return null;
        }
        return {
          ...snap,
          timestamp: new Date(snap.timestamp),
          endDate: new Date(snap.endDate),
        };
      })
      .filter((snap: any) => snap !== null);

    // 动态设置日期范围
    let minDate = new Date('2020-01-01');
    let maxDate = new Date('2030-01-01');

    if (convertedSnapshots.length > 0) {
      const timestamps = convertedSnapshots.map((s: any) => s.timestamp.getTime()).sort((a: number, b: number) => a - b);
      minDate = new Date(timestamps[0]);
      maxDate = new Date(timestamps[timestamps.length - 1]);
      minDate = new Date(minDate.getTime() - 24 * 60 * 60 * 1000);
      maxDate = new Date(maxDate.getTime() + 24 * 60 * 60 * 1000);
    }

    // 构建配置（合并自定义参数）
    const config: BacktestConfig = {
      initialCapital: 10000,
      maxPositions: 25,
      maxPositionSize: 0.2,
      intervalMinutes: 10,
      startDate: minDate,
      endDate: maxDate,
      strategies: {
        [BacktestStrategyType.CONVERGENCE]: {
          enabled: true,
          maxPositions: customParams.convergence?.maxPositions ?? 15,
          maxPositionSize: 0.15,
          stopLoss: customParams.convergence?.stopLoss ?? 0.15,
          takeProfit: customParams.convergence?.takeProfit ?? 1.0,
        },
        [BacktestStrategyType.ARBITRAGE]: {
          enabled: false,
          maxPositions: 10,
          maxPositionSize: 0.1,
        },
        [BacktestStrategyType.REVERSAL]: {
          enabled: true,
          maxPositions: customParams.reversal?.maxPositions ?? 10,
          maxPositionSize: 0.1,
          stopLoss: customParams.reversal?.stopLoss ?? 0.40,
          takeProfit: customParams.reversal?.takeProfit ?? 1.0,
        },
        [BacktestStrategyType.TREND_FOLLOWING]: {
          enabled: false,
          maxPositions: 5,
          maxPositionSize: 0.15,
        },
        [BacktestStrategyType.MEAN_REVERSION]: {
          enabled: false,
          maxPositions: 5,
          maxPositionSize: 0.15,
        },
      },
      dailyLossLimit: 0.05,
      maxDrawdown: 0.3,
      filters: {
        minVolume: 10000,
        minLiquidity: 3000,
        minDaysToEnd: 0,
        maxDaysToEnd: 90,
      },
    };

    // 创建回测引擎
    const engine = new OptimizedBacktestEngine(config);

    // 加载数据
    await engine.loadData(convertedSnapshots);

    // 运行回测
    const result = await engine.run();

    // 计算月利润率（返回小数形式，便于优化脚本处理）
    const months = result.period.duration / 30;
    const monthlyReturn = months > 0 ? result.pnl.totalPercent / months / 100 : result.pnl.totalPercent / 100;

    // 计算盈亏交易数
    const profitTrades = result.tradesList.filter(t => t.pnl > 0).length;
    const lossTrades = result.tradesList.filter(t => t.pnl <= 0).length;

    // 计算平均盈亏
    const profitTradesData = result.tradesList.filter(t => t.pnl > 0);
    const lossTradesData = result.tradesList.filter(t => t.pnl <= 0);
    const avgProfit = profitTradesData.length > 0
      ? profitTradesData.reduce((sum: number, t) => sum + t.pnl, 0) / profitTradesData.length
      : 0;
    const avgLoss = lossTradesData.length > 0
      ? lossTradesData.reduce((sum: number, t) => sum + t.pnl, 0) / lossTradesData.length
      : 0;

    console.log(`✅ 第 ${round} 轮完成:`);
    console.log(`   月利润率: ${(monthlyReturn * 100).toFixed(2)}%`);
    console.log(`   胜率: ${(result.trades.winRate * 100).toFixed(2)}%`);
    console.log(`   夏普比率: ${result.pnl.sharpeRatio.toFixed(2)}`);
    console.log(`   交易数: ${result.trades.total}`);
    console.log(`   盈利交易: ${profitTrades}, 亏损交易: ${lossTrades}\n`);

    return NextResponse.json({
      success: true,
      round,
      customParams,
      result: {
        totalReturn: result.pnl.totalPercent / 100,
        monthlyReturn,
        winRate: result.trades.winRate,
        sharpeRatio: result.pnl.sharpeRatio,
        maxDrawdown: result.pnl.maxDrawdownPercent / 100,
        totalTrades: result.trades.total,
        profitTrades,
        lossTrades,
        avgProfit,
        avgLoss,
        startDate: result.period.start,
        endDate: result.period.end,
      },
    });

  } catch (error) {
    console.error(`❌ 第 ${body?.round || '?'} 轮失败:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        round: body?.round || '?',
      },
      { status: 500 }
    );
  }
}
