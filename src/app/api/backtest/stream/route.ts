import { NextRequest, NextResponse } from 'next/server';
import { BacktestEngine } from '@/lib/backtest/engine';
import { BacktestConfig, BacktestStrategyType } from '@/lib/backtest/types';

/**
 * SSE 流式回测 API
 * POST /api/backtest/stream
 *
 * 返回 Server-Sent Events (SSE) 流，实时发送回测进度
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StreamRequest {
  config: BacktestConfig;
  dataFile: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: StreamRequest = await request.json();
    const { config, dataFile } = body;

    // 验证请求
    if (!config || !dataFile) {
      return NextResponse.json(
        { error: 'Missing config or dataFile' },
        { status: 400 }
      );
    }

    // 创建 SSE 响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          const event = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(event));
        };

        try {
          // 读取数据文件
          const fs = require('fs');
          const path = require('path');
          const dataFilePath = path.join(process.cwd(), 'data', 'imported', dataFile);

          if (!fs.existsSync(dataFilePath)) {
            sendEvent({
              type: 'error',
              error: `数据文件不存在: ${dataFile}`
            });
            controller.close();
            return;
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
            sendEvent({
              type: 'error',
              error: '数据格式不正确'
            });
            controller.close();
            return;
          }

          // 转换数据格式
          const convertedSnapshots = snapshots
            .map((snap: any) => {
              // 验证必需字段
              if (!snap.timestamp || !snap.endDate || !snap.marketId || !snap.outcomePrices) {
                return null;
              }
              // 确保日期是 Date 对象
              const timestamp = snap.timestamp instanceof Date ? snap.timestamp : new Date(snap.timestamp);
              const endDate = snap.endDate instanceof Date ? snap.endDate : new Date(snap.endDate);

              // 验证日期有效性
              if (isNaN(timestamp.getTime()) || isNaN(endDate.getTime())) {
                return null;
              }

              return {
                ...snap,
                timestamp,
                endDate,
              };
            })
            .filter((snap: any) => snap !== null);

          // 发送开始事件
          sendEvent({
            type: 'start',
            step: 'initializing',
            config,
            marketsCount: new Set(convertedSnapshots.map((s: any) => s.marketId)).size,
            snapshotsCount: convertedSnapshots.length,
          });

          // 自动设置日期范围
          if (convertedSnapshots.length > 0) {
            const timestamps = convertedSnapshots.map((s: any) => s.timestamp.getTime()).sort((a: number, b: number) => a - b);
            config.startDate = new Date(timestamps[0]);
            config.endDate = new Date(timestamps[timestamps.length - 1]);
            
            // 计算平均间隔
            const intervals = [];
            for (let i = 1; i < Math.min(timestamps.length, 100); i++) {
              intervals.push(timestamps[i] - timestamps[i - 1]);
            }
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            config.intervalMinutes = avgInterval / (1000 * 60) || 10; // 默认10分钟
          } else {
            config.startDate = new Date();
            config.endDate = new Date();
            config.intervalMinutes = 10;
          }

          // 添加默认的资金和风险控制参数
          config.initialCapital = config.initialCapital || 10000;  // 默认 10000 美元
          config.maxPositions = config.maxPositions || 5;  // 🔥 默认 5 个持仓（降低杠杆）
          config.maxPositionSize = config.maxPositionSize || 0.18;  // 默认 18%
          config.dailyLossLimit = config.dailyLossLimit || 0.15;  // 默认 15%
          config.maxDrawdown = config.maxDrawdown || 0.25;  // 默认 25%

          // 🔧 确保 config.strategies 已初始化
          if (!config.strategies) {
            (config as any).strategies = {};
          }

          // 🔧 处理简化的策略配置（支持 "v8.9" 这样的字符串）
          if ((config as any).strategy && typeof (config as any).strategy === 'string') {
            const strategyStr = (config as any).strategy as string;
            
            // 启用对应的策略
            if (strategyStr.startsWith('v8') || strategyStr.startsWith('v6') || strategyStr.startsWith('v7') || strategyStr.startsWith('v5')) {
              // 这些版本对应 REVERSAL 策略
              config.strategies[BacktestStrategyType.REVERSAL] = {
                enabled: true,
                version: strategyStr,
                maxPositions: (config as any).maxOpenPositions || 5,
                maxPositionSize: (config as any).maxPositionSize || 0.15,
                stopLoss: (config as any).stopLossPercent || 0.10,
                trailingStop: (config as any).trailingStopPercent || 0.20,
              };
            }
          }

          // 确保所有策略都有默认配置
          const allStrategyTypes: BacktestStrategyType[] = [
            BacktestStrategyType.CONVERGENCE,
            BacktestStrategyType.ARBITRAGE,
            BacktestStrategyType.REVERSAL,
            BacktestStrategyType.TREND_FOLLOWING,
            BacktestStrategyType.MEAN_REVERSION
          ];
          allStrategyTypes.forEach(key => {
            if (!config.strategies[key]) {
              (config.strategies as any)[key] = {
                enabled: false,
                maxPositions: 0,
                maxPositionSize: 0.2,
              };
            } else if (config.strategies[key].maxPositionSize === undefined) {
              (config.strategies as any)[key].maxPositionSize = 0.2;
            }
          });

          // 创建回测引擎（带进度回调）
          const engine = new BacktestEngine(config, (event: any) => {
            // 转发所有进度事件
            sendEvent({
              ...event,
            });
          });

          // 加载数据到引擎
          await engine.loadData(convertedSnapshots);

          // 运行回测
          const result = await engine.run();

          // 发送完成事件
          sendEvent({
            type: 'complete',
            result: {
              totalReturn: `${result.pnl.totalPercent.toFixed(2)}%`,
              totalTrades: result.trades.total,
              winRate: `${result.trades.winRate.toFixed(1)}%`,
              bestStrategy: Object.entries(result.strategyStats)
                .reduce((best, [name, stats]) => stats.totalPnl > best.pnl ? { name, pnl: stats.totalPnl } : best, { name: '', pnl: 0 }).name,
              tradesList: result.tradesList || [],
            },
          });

          controller.close();
        } catch (error) {
          console.error('[Stream API] Error:', error);
          sendEvent({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[Stream API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
