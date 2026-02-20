import { NextRequest, NextResponse } from 'next/server';
import { ProxyAgent } from 'undici'; // Next.js 自带 undici，如果没有请 npm install undici

// --- 代理配置 (与 Gamma API 保持一致) ---
const PROXY_URL = 'http://127.0.0.1:7897';
const dispatcher = new ProxyAgent(PROXY_URL);


interface HistoryDataPoint {
  t: number; // timestamp
  p: number; // price
}

interface PositionData {
  id: string;
  marketId: string;
  question: string;
  outcome: string;
  outcomeTokenId?: string;
  entryPrice: number;
  currentPrice: number;
  positionSize: number;
  entryTime: string;
  endDate?: string;
}

// 数据采样函数：控制数据点数量
function sampleHistoryData(data: HistoryDataPoint[], maxPoints: number = 150): HistoryDataPoint[] {
  if (data.length <= maxPoints) {
    return data;
  }

  const sampled: HistoryDataPoint[] = [];
  const step = Math.ceil(data.length / maxPoints);

  for (let i = 0; i < data.length; i += step) {
    sampled.push(data[i]);
  }

  // 确保最后一个点总是包含的
  if (data.length > 0 && (sampled.length === 0 || sampled[sampled.length - 1].t !== data[data.length - 1].t)) {
    sampled.push(data[data.length - 1]);
  }

  return sampled;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const positionId = searchParams.get('positionId');

    if (!positionId) {
      return NextResponse.json(
        { success: false, message: 'positionId is required' },
        { status: 400 }
      );
    }

    // 从实际数据源获取持仓信息（这里使用模拟数据）
    // 在实际应用中，应该从数据库或交易引擎获取
    const positionData: PositionData = {
      id: positionId,
      marketId: 'market-123',
      question: 'Bitcoin price exceeds $100,000 by end of 2025',
      outcome: 'Yes',
      outcomeTokenId: positionId,
      entryPrice: 0.52,
      currentPrice: 0.65,
      positionSize: 1000,
      entryTime: '2025-01-01T10:00:00Z',
      endDate: '2025-12-31T23:59:59Z',
    };

    // 如果没有 outcomeTokenId，返回错误
    if (!positionData.outcomeTokenId) {
      return NextResponse.json(
        { success: false, message: 'outcomeTokenId not found for this position' },
        { status: 404 }
      );
    }

    // 从 CLOB History API 获取历史价格
    const historyUrl = 'https://clob.polymarket.com/prices-history';
    const params = new URLSearchParams({
      market: positionData.outcomeTokenId,
      interval: 'max',
      fidelity: '1',
    });
    console.log(`url = ${historyUrl}?${params}`)

    const response = await fetch(`${historyUrl}?${params}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0 Safari/537.36',
      },
      next: { revalidate: 60 }, // 缓存 60 秒
      dispatcher: dispatcher, // 注入代理
    }as any);

    if (!response.ok) {
      console.error('CLOB History API error:', response.status, await response.text());
      return NextResponse.json(
        { success: false, message: 'Failed to fetch price history from CLOB API' },
        { status: response.status }
      );
    }

    const result = await response.json();
    const rawHistory: HistoryDataPoint[] = result.history || [];

    // 获取前端传来的买入时间戳 (秒)
    const startTsParam = searchParams.get('startTs');
    const entryTs = startTsParam ? parseInt(startTsParam) : 0;

    // 执行筛选：如果是为了看“买入后”，先过滤出买入后的数据
    const filteredHistory = entryTs > 0 
    ? rawHistory.filter(p => p.t >= entryTs - 3600) // 往前多看一小时
    : rawHistory;

    // 筛选采样
    const sampledHistory = sampleHistoryData(filteredHistory, 150);



    // 格式化返回数据
    const formattedHistory = sampledHistory.map((point) => ({
      timestamp: point.t,
      date: new Date(point.t * 1000).toISOString(),
      price: point.p,
    }));

    return NextResponse.json({
      success: true,
      data: {
        position: positionData,
        history: formattedHistory,
        totalPoints: rawHistory.length,
        sampledPoints: sampledHistory.length,
      },
    });
  } catch (error) {
    console.error('Error fetching position history:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
