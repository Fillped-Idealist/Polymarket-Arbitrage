import { NextRequest, NextResponse } from 'next/server';
import { LiveTradingEngineV2, createTestModeConfig } from '@/lib/polymarket/live-trading/engine-v2';
import { positionManager } from '@/lib/polymarket/position-manager-v2';
import { candidateManager } from '@/lib/polymarket/candidate-manager-v2';

// 全局交易引擎实例
let tradingEngineV2: LiveTradingEngineV2 | null = null;
let isInitializingV2 = false;

/**
 * 初始化默认配置
 */
function getDefaultConfig() {
  return {
    totalCapital: 10000,
    maxTotalPositions: 5,
    maxTotalExposure: 0.90,
    strategies: {
      convergence: { enabled: true, maxPositions: 2, maxPositionSize: 0.18 },
      reversal: { enabled: true, maxPositions: 3, maxPositionSize: 0.18 },
    },
    autoTradingEnabled: true,
    autoRefreshInterval: 10,
  };
}

/**
 * 获取当前配置（尝试从 positionManager 获取）
 */
function getCurrentConfig() {
  const stats = positionManager.getStatistics();
  return {
    totalCapital: stats.equity,
    maxTotalPositions: 5,
    maxTotalExposure: 0.90,
    strategies: {
      convergence: { enabled: true, maxPositions: 2, maxPositionSize: 0.18 },
      reversal: { enabled: true, maxPositions: 3, maxPositionSize: 0.18 },
    },
    autoTradingEnabled: true,
    autoRefreshInterval: 10,
  };
}

/**
 * GET /api/auto-trading
 * 获取引擎状态
 */
export async function GET() {
  try {
    const stats = {
      isRunning: tradingEngineV2 !== null,
      isInitializing: isInitializingV2,
      positions: {
        openCount: positionManager.getOpenPositions().length,
        closedCount: positionManager.getClosedPositions().length,
        openPositions: positionManager.getOpenPositions().map(p => ({
          id: p.id,
          marketId: p.market_id,
          strategy: p.strategy,
          status: 'active',
          entryPrice: p.entry_price,
          currentPrice: p.current_price,
          pnl: p.current_pnl,
          pnlPercent: p.current_pnl_percent,
          entryTime: p.entry_time,
          exitTime: null,
        })),
        closedPositions: positionManager.getClosedPositions().map(p => ({
          id: p.id,
          marketId: p.market_id,
          strategy: p.strategy,
          status: 'closed',
          entryPrice: p.entry_price,
          currentPrice: p.exit_price || 0,
          pnl: p.pnl || 0,
          pnlPercent: p.pnl_percent || 0,
          entryTime: p.entry_time,
          exitTime: p.exit_time || null,
        })),
        ...positionManager.getStatistics(),
      },
      candidates: candidateManager.getStatistics(),
      config: tradingEngineV2 ? (tradingEngineV2 as any).config : getCurrentConfig(),
      lastUpdate: new Date().toISOString(),
    };

    // 构建统计数据
    const engineStats = {
      totalTrades: stats.positions.closedCount,
      winningTrades: stats.positions.winCount,
      losingTrades: stats.positions.lossCount,
      winRate: stats.positions.winRate * 100,
      currentEquity: stats.positions.equity,
      totalPnl: stats.positions.totalPnl,
      currentDrawdown: stats.positions.floatingPnl < 0 ? -stats.positions.floatingPnl : 0,
      maxDrawdown: 0,
      dailyPnl: stats.positions.totalPnl + stats.positions.floatingPnl,
      peakEquity: stats.positions.totalAssets,
    };

    // 获取进度信息
    const progress = tradingEngineV2 ? (tradingEngineV2 as any).getProgress() : null;

    return NextResponse.json({
      success: true,
      isRunning: stats.isRunning,
      isInitializing: stats.isInitializing,
      stats: engineStats,
      positions: stats.positions.openPositions,
      config: stats.config,
      progress,
    });
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
 * POST /api/auto-trading
 * 启动/停止引擎
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'start') {
      // 启动引擎
      if (isInitializingV2) {
        return NextResponse.json({
          success: false,
          error: '正在初始化中，请稍候...',
        }, { status: 400 });
      }

      if (tradingEngineV2) {
        return NextResponse.json({
          success: false,
          error: '实盘交易已经在运行中',
        }, { status: 400 });
      }

      isInitializingV2 = true;

      try {
        // 清空旧数据（传递初始资金）
        const initialCapital = body.initialCapital || 10000;
        positionManager.clear(initialCapital);
        candidateManager.clear();

        // 创建配置
        const testMode = body.testMode || '1-convergence-4-reversal';
        const config = createTestModeConfig(testMode, initialCapital);

        // 创建交易引擎
        tradingEngineV2 = new LiveTradingEngineV2(config, (event) => {
          console.log('[LiveTradingEngineV2] 事件:', event);
        });

        // 启动交易引擎
        await tradingEngineV2.start();

        // 等待一下让引擎初始化
        await new Promise(resolve => setTimeout(resolve, 2000));

        return NextResponse.json({
          success: true,
          message: '实盘交易已启动',
          config: config,
        });
      } finally {
        isInitializingV2 = false;
      }
    } else if (action === 'stop') {
      // 停止引擎
      if (!tradingEngineV2) {
        return NextResponse.json({
          success: false,
          error: '实盘交易引擎未初始化',
        }, { status: 404 });
      }

      await tradingEngineV2.stop();
      tradingEngineV2 = null;

      return NextResponse.json({
        success: true,
        message: '实盘交易已停止',
      });
    } else if (action === 'update_config') {
      // 更新配置
      if (!tradingEngineV2) {
        return NextResponse.json({
          success: false,
          error: '实盘交易引擎未运行',
        }, { status: 404 });
      }

      // 这里可以添加更新配置的逻辑
      return NextResponse.json({
        success: true,
        message: '配置已更新',
      });
    } else {
      return NextResponse.json({
        success: false,
        error: '未知的操作',
      }, { status: 400 });
    }
  } catch (error) {
    console.error('[API] 操作失败:', error);
    isInitializingV2 = false;
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
}
