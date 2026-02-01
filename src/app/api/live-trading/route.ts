import { NextRequest, NextResponse } from 'next/server';
import { LiveTradingEngineV2, createTestModeConfig } from '@/lib/polymarket/live-trading/engine-v2';
import { positionManager } from '@/lib/polymarket/position-manager-v2';
import { candidateManager } from '@/lib/polymarket/candidate-manager-v2';

// 全局交易引擎实例
let tradingEngineV2: LiveTradingEngineV2 | null = null;
let isInitializingV2 = false;

// 旧版本引擎（保留兼容性）
let tradingEngineV1: any = null;

/**
 * GET /api/live-trading?version=v2
 * 获取实盘交易状态
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const version = searchParams.get('version') || 'v1';

    if (version === 'v2') {
      const stats = {
        isRunning: tradingEngineV2 !== null,
        isInitializing: isInitializingV2,
        positions: {
          openCount: positionManager.getOpenPositions().length,
          closedCount: positionManager.getClosedPositions().length,
          openPositions: positionManager.getOpenPositions(),
          closedPositions: positionManager.getClosedPositions(),
          ...positionManager.getStatistics(),
        },
        candidates: candidateManager.getStatistics(),
        config: tradingEngineV2 ? (tradingEngineV2 as any).config : null,
        lastUpdate: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        data: stats,
        message: '获取状态成功',
      });
    } else {
      // V1 旧版本（兼容原有代码）
      if (!tradingEngineV1) {
        return NextResponse.json({
          success: true,
          isRunning: false,
          startTime: null,
          status: {
            equity: 0,
            totalPnL: 0,
            totalPnLPercent: 0,
            openPositions: 0,
            stats: {
              totalTrades: 0,
              winningTrades: 0,
              losingTrades: 0,
            },
            positions: [],
          },
        });
      }

      const statistics = tradingEngineV1.getStatistics();

      return NextResponse.json({
        success: true,
        data: statistics,
        message: '获取状态成功',
      });
    }
  } catch (error) {
    console.error('[API] 获取实盘交易状态失败:', error);
    return NextResponse.json({
      success: false,
      data: null,
      message: '获取状态失败',
      error: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
}

/**
 * POST /api/live-trading?version=v2
 * 启动实盘交易
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      testMode = 'all-reversal',
      initialCapital = 10000,
      version = 'v1',
    } = body;

    if (version === 'v2') {
      // V2 版本
      if (isInitializingV2) {
        return NextResponse.json({
          success: false,
          data: null,
          message: '正在初始化中，请稍候...',
        }, { status: 400 });
      }

      if (tradingEngineV2) {
        return NextResponse.json({
          success: false,
          data: null,
          message: '实盘交易已经在运行中',
        }, { status: 400 });
      }

      isInitializingV2 = true;

      try {
        // 清空旧数据
        positionManager.clear();
        candidateManager.clear();

        // 创建配置
        const config = createTestModeConfig(testMode, initialCapital);

        // 创建交易引擎
        tradingEngineV2 = new LiveTradingEngineV2(config, (event) => {
          console.log('[LiveTradingEngineV2] 事件:', event);
        });

        // 启动交易引擎
        await tradingEngineV2.start();

        // 等待一下让引擎初始化
        await new Promise(resolve => setTimeout(resolve, 2000));

        const stats = {
          isRunning: true,
          isInitializing: false,
          positions: {
            openCount: positionManager.getOpenPositions().length,
            closedCount: positionManager.getClosedPositions().length,
            openPositions: positionManager.getOpenPositions(),
            closedPositions: positionManager.getClosedPositions(),
            ...positionManager.getStatistics(),
          },
          candidates: candidateManager.getStatistics(),
          config,
          lastUpdate: new Date().toISOString(),
        };

        return NextResponse.json({
          success: true,
          data: stats,
          message: '实盘交易已启动',
        });
      } finally {
        isInitializingV2 = false;
      }
    } else {
      // V1 版本（旧版本，保留兼容性）
      const { LiveTradingEngine } = await import('@/lib/live-trading/engine');

      if (tradingEngineV1) {
        return NextResponse.json({
          success: false,
          data: null,
          message: '实盘交易已经在运行中',
        }, { status: 400 });
      }

      const config = createTestModeConfig(testMode, initialCapital);
      tradingEngineV1 = new LiveTradingEngine(config, () => {});
      await tradingEngineV1.start();

      const statistics = tradingEngineV1.getStatistics();

      return NextResponse.json({
        success: true,
        data: statistics,
        message: '实盘交易已启动',
      });
    }
  } catch (error) {
    console.error('[API] 启动实盘交易失败:', error);
    isInitializingV2 = false;
    return NextResponse.json({
      success: false,
      data: null,
      message: '启动失败',
      error: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/live-trading?version=v2
 * 停止实盘交易
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const version = searchParams.get('version') || 'v1';

    if (version === 'v2') {
      if (!tradingEngineV2) {
        return NextResponse.json({
          success: false,
          data: null,
          message: '实盘交易引擎未初始化',
        }, { status: 404 });
      }

      await tradingEngineV2.stop();
      tradingEngineV2 = null;

      const stats = {
        isRunning: false,
        isInitializing: false,
        positions: {
          openCount: positionManager.getOpenPositions().length,
          closedCount: positionManager.getClosedPositions().length,
          openPositions: positionManager.getOpenPositions(),
          closedPositions: positionManager.getClosedPositions(),
          ...positionManager.getStatistics(),
        },
        candidates: candidateManager.getStatistics(),
        lastUpdate: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        data: stats,
        message: '实盘交易已停止',
      });
    } else {
      if (!tradingEngineV1) {
        return NextResponse.json({
          success: false,
          data: null,
          message: '实盘交易引擎未初始化',
        }, { status: 404 });
      }

      await tradingEngineV1.stop();
      tradingEngineV1 = null;

      return NextResponse.json({
        success: true,
        data: null,
        message: '实盘交易已停止',
      });
    }
  } catch (error) {
    console.error('[API] 停止实盘交易失败:', error);
    return NextResponse.json({
      success: false,
      data: null,
      message: '停止失败',
      error: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
}
