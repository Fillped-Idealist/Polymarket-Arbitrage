import { NextRequest, NextResponse } from 'next/server';
import { candidateManager } from '@/lib/polymarket/candidate-manager-v2';

/**
 * GET /api/markets
 * 获取候选仓列表 - 已修复字段映射
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const strategyFilter = searchParams.get('strategy');

    // 获取所有候选仓（目前 c 为后端 Candidate 类型）
    const rawCandidates = candidateManager.getValidCandidates();

    // 转换为仪表盘所需的格式 (CandidatePosition 接口)
    const markets = rawCandidates.map(c => {
      // 1. 计算期望收益率（简单模型）
      const expectedReturn = c.latest_price > 0
        ? ((1 / c.latest_price) - 1) * 100
        : 0;

      // 2. 将后端嵌套结构映射到前端扁平结构
      return {
        marketId: c.market.id,           // 修复点：c.market_id -> c.market.id
        question: c.market.question,     // 修复点：c.question -> c.market.question
        outcome: c.outcome_name,         // 修复点：c.outcome_name
        price: c.latest_price,           // 修复点：c.current_price -> c.latest_price
        probability: c.latest_price * 100,
        volume: c.market.volume || 0,
        liquidity: c.market.liquidity || 0,
        endDate: c.market.endDate || new Date().toISOString(),
        strategy: 'reversal' as const,   // 默认策略标签
        score: Math.min(10, Number((c.trend_strength * 10).toFixed(1))), // 转换为10分制
        expectedReturn: expectedReturn,
        riskScore: 5,                    // 初始风险评分
      };
    });

    // 根据前端选择的策略进行过滤
    let filteredData = markets;
    if (strategyFilter && strategyFilter !== 'all') {
      filteredData = markets.filter(m => m.strategy === strategyFilter);
    }

    return NextResponse.json({
      success: true,
      data: filteredData,
      total: filteredData.length,
      message: '获取成功',
    });
  } catch (error) {
    console.error('[API/Markets] Error:', error);
    return NextResponse.json({
      success: false,
      data: [],
      message: '获取失败',
      error: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
}