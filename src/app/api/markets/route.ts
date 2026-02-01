import { NextRequest, NextResponse } from 'next/server';
import { candidateManager } from '@/lib/polymarket/candidate-manager-v2';

/**
 * GET /api/markets
 * 获取候选仓列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const strategy = searchParams.get('strategy');

    // 获取所有候选仓
    const candidates = candidateManager.getValidCandidates();

    // 根据策略过滤
    let filteredCandidates = candidates;
    if (strategy && strategy !== 'all') {
      filteredCandidates = candidates.filter(c => c.strategy === strategy);
    }

    // 转换为前端需要的格式
    const markets = filteredCandidates.map(c => ({
      marketId: c.market_id,
      question: c.question,
      outcome: c.outcome_name,
      price: c.current_price,
      probability: c.current_price * 100,
      volume: c.volume || 0,
      liquidity: c.liquidity || 0,
      endDate: c.end_date || new Date().toISOString(),
      strategy: c.strategy,
      score: c.score || 0,
      expectedReturn: c.expected_return || 0,
      riskScore: c.risk_score || 0,
    }));

    return NextResponse.json({
      success: true,
      data: markets,
      total: markets.length,
      message: '获取成功',
    });
  } catch (error) {
    console.error('[API] 获取候选仓失败:', error);
    return NextResponse.json({
      success: false,
      data: [],
      message: '获取失败',
      error: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
}
