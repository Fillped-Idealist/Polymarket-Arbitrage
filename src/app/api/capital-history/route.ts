import { NextResponse } from 'next/server';
import { capitalHistory } from '@/lib/polymarket/capital-history';
import { positionManager } from '@/lib/polymarket/position-manager-v2';

/**
 * GET /api/capital-history
 * 获取资金历史数据
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const maxPoints = Math.max(1, parseInt(searchParams.get('maxPoints') || '50'));
    const intervalMinutes = Math.max(1, parseInt(searchParams.get('intervalMinutes') || '10'));
    const days = Math.max(1, parseInt(searchParams.get('days') || '7'));

    // 获取资金历史（带采样）
    const historyData = capitalHistory.getHistory(maxPoints, intervalMinutes);

    // 获取每日盈亏
    const dailyPnL = capitalHistory.getDailyPnL(days);

    // 获取当前统计信息
    const stats = positionManager.getStatistics();
    const initialCapital = positionManager.getInitialCapital();

    // 构建响应
    const response = {
      success: true,
      data: {
        initialCapital,
        currentCapital: stats.totalAssets,
        equity: stats.equity,
        realizedPnl: stats.totalPnl,
        floatingPnl: stats.floatingPnl,
        history: historyData || [], // 确保永远返回数组
        dailyPnL: dailyPnL || [],
        totalPoints: historyData.length,
        openPositions: stats.openCount,
      },
      message: '获取资金历史成功',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[API] 获取资金历史失败:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: '获取资金历史失败',
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/capital-history/reset
 * 重置资金历史
 */
export async function POST(request: Request) {
  try {
    const { initialCapital } = await request.json();

    if (initialCapital !== undefined) {
      // 设置初始资金并清空历史
      positionManager.clear(initialCapital);
    } else {
      // 只清空历史
      capitalHistory.clear();
    }

    return NextResponse.json({
      success: true,
      message: '重置资金历史成功',
    });
  } catch (error) {
    console.error('[API] 重置资金历史失败:', error);
    return NextResponse.json(
      {
        success: false,
        message: '重置资金历史失败',
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
