import { NextRequest, NextResponse } from 'next/server';
import { positionManager } from '@/lib/polymarket/position-manager-v2';

/**
 * GET /api/positions
 * 获取持仓列表 - 已适配前端仪表盘与后端 LiveTrade 模型
 */
export async function GET() {
  try {
    const openPositions = positionManager.getOpenPositions();
    const closedPositions = positionManager.getClosedPositions();
    const stats = positionManager.getStatistics();

    // 1. 构建持仓数据列表
    const positions = [
      ...openPositions.map(p => ({
        id: p.id,
        marketId: p.market_id,
        outcome_id: p.outcome_id,
        question: p.market_question,
        outcome: p.outcome_name,
        entryPrice: p.entry_price,
        currentPrice: p.current_price,
        positionSize: p.position_size,
        pnl: p.current_pnl || 0,
        pnlPercent: p.current_pnl_percent || 0,
        strategy: p.strategy,
        // 关键修复：Date 对象必须转换为 ISO 字符串，否则前端可能报错
        entryTime: p.entry_time instanceof Date ? p.entry_time.toISOString() : p.entry_time,
        status: 'active' as const,
        riskScore: 5, // 默认风险评分
        expectedReturn: 0,
      })),
      ...closedPositions.map(p => ({
        id: p.id,
        marketId: p.market_id,
        outcome_id: p.outcome_id,
        question: p.market_question,
        outcome: p.outcome_name,
        entryPrice: p.entry_price,
        currentPrice: p.exit_price || 0,
        positionSize: p.position_size,
        pnl: p.pnl || 0,
        pnlPercent: p.pnl_percent || 0,
        strategy: p.strategy,
        entryTime: p.entry_time instanceof Date ? p.entry_time.toISOString() : p.entry_time,
        status: 'closed' as const,
        riskScore: 5,
        expectedReturn: 0,
      })),
    ];

    /**
     * 2. 构建组合指标 (Portfolio Metrics)
     * 修复点：确保对应 positionManager 返回的 stats 字段名
     */
    const totalPnl = (stats.totalPnl || 0) + (stats.floatingPnl || 0);
    const totalEquity = stats.totalAssets || 10000; // 兜底资金

    const portfolioMetrics = {
      totalPositions: openPositions.length, // 仪表盘通常只统计“当前”活跃仓位数
      totalValue: totalEquity,
      totalPnl: totalPnl,
      totalPnlPercent: totalEquity > 0 ? (totalPnl / totalEquity) * 100 : 0,
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

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ success: false, error: 'ID missing' });

  // 重点：在这里调用 positionManager 的平仓逻辑
  // 查找该持仓对象
  const openPositions = positionManager.getOpenPositions();
  const target = openPositions.find(p => p.id === id);

  if (target) {
    // 调用你 position-manager-v2.ts 中的方法
    // 假设手动平仓价格使用当前价格
    positionManager.closePosition(target, target.current_price, 'Manual Close');
    
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: 'Position not found' }, { status: 404 });
}