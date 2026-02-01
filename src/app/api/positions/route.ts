import { NextRequest, NextResponse } from 'next/server';
import { positionManager } from '@/lib/polymarket/position-manager-v2';

/**
 * GET /api/positions
 * 获取持仓列表
 */
export async function GET() {
  try {
    const openPositions = positionManager.getOpenPositions();
    const closedPositions = positionManager.getClosedPositions();

    // 构建持仓数据
    const positions = [
      ...openPositions.map(p => ({
        id: p.id,
        marketId: p.market_id,
        question: p.question,
        outcome: p.outcome_name,
        entryPrice: p.entry_price,
        currentPrice: p.current_price,
        positionSize: p.position_size,
        pnl: p.current_pnl,
        pnlPercent: p.current_pnl_percent,
        strategy: p.strategy,
        entryTime: p.entry_time,
        status: 'active' as const,
        riskScore: p.risk_score || 0,
        expectedReturn: p.expected_return || 0,
      })),
      ...closedPositions.map(p => ({
        id: p.id,
        marketId: p.market_id,
        question: p.question,
        outcome: p.outcome_name,
        entryPrice: p.entry_price,
        currentPrice: p.exit_price || 0,
        positionSize: p.position_size,
        pnl: p.pnl || 0,
        pnlPercent: p.pnl_percent || 0,
        strategy: p.strategy,
        entryTime: p.entry_time,
        status: 'closed' as const,
        riskScore: p.risk_score || 0,
        expectedReturn: p.expected_return || 0,
      })),
    ];

    // 构建组合指标
    const stats = positionManager.getStatistics();
    const portfolioMetrics = {
      totalPositions: stats.openCount + stats.closedCount,
      totalValue: stats.totalAssets,
      totalPnl: stats.totalPnl + stats.floatingPnl,
      totalPnlPercent: ((stats.totalPnl + stats.floatingPnl) / stats.totalAssets) * 100,
      strategyDistribution: {
        convergence: openPositions.filter(p => p.strategy === 'convergence').length,
        arbitrage: 0,
        reversal: openPositions.filter(p => p.strategy === 'reversal').length,
      },
    };

    return NextResponse.json({
      success: true,
      data: positions,
      portfolioMetrics,
      message: '获取成功',
    });
  } catch (error) {
    console.error('[API] 获取持仓失败:', error);
    return NextResponse.json({
      success: false,
      data: [],
      portfolioMetrics: null,
      message: '获取失败',
      error: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
}
