import { NextRequest, NextResponse } from 'next/server';

interface PriceHistoryPoint {
  t: number; // timestamp in seconds
  p: number; // price
}

interface PriceHistoryResponse {
  history: PriceHistoryPoint[];
}

interface PriceData {
  timestamp: Date;
  price: number;
}

// 数据采样函数：控制数据点数量
function samplePriceData(history: PriceHistoryPoint[], maxPoints: number = 100): PriceData[] {
  if (!history || history.length === 0) return [];

  // 如果数据点少于最大值，直接返回
  if (history.length <= maxPoints) {
    return history.map((point) => ({
      timestamp: new Date(point.t * 1000),
      price: point.p,
    }));
  }

  // 如果数据点太多，按时间间隔采样
  const sampleInterval = Math.ceil(history.length / maxPoints);
  const sampled: PriceData[] = [];

  for (let i = 0; i < history.length; i += sampleInterval) {
    sampled.push({
      timestamp: new Date(history[i].t * 1000),
      price: history[i].p,
    });
  }

  // 确保包含最后一个数据点
  if (sampled[sampled.length - 1].timestamp.getTime() !== history[history.length - 1].t * 1000) {
    sampled.push({
      timestamp: new Date(history[history.length - 1].t * 1000),
      price: history[history.length - 1].p,
    });
  }

  return sampled;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tokenId = searchParams.get('tokenId');
    const startTs = searchParams.get('startTs');
    const endTs = searchParams.get('endTs');
    const entryPrice = searchParams.get('entryPrice');

    if (!tokenId) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameter: tokenId' },
        { status: 400 }
      );
    }

    // 构建 API 请求参数
    const params: Record<string, string> = {
      market: tokenId,
      interval: 'max',
      fidelity: '1',
    };

    // 如果提供了时间范围，添加时间参数
    if (startTs) {
      params.startTs = startTs;
    }
    if (endTs) {
      params.endTs = endTs;
    }

    // 构建查询字符串
    const queryString = new URLSearchParams(params).toString();
    const apiUrl = `https://clob.polymarket.com/prices-history?${queryString}`;

    // 发送请求到 CLOB History API
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0 Safari/537.36',
      },
      next: { revalidate: 30 }, // 缓存 30 秒
    });

    if (!response.ok) {
      throw new Error(`CLOB API returned ${response.status}`);
    }

    const data: PriceHistoryResponse = await response.json();
    const history = data.history || [];

    // 采样数据，控制在 100 个数据点以内
    const sampledData = samplePriceData(history, 100);

    return NextResponse.json({
      success: true,
      data: {
        tokenId,
        entryPrice: entryPrice ? parseFloat(entryPrice) : null,
        history: sampledData,
        totalPoints: history.length,
        sampledPoints: sampledData.length,
      },
    });
  } catch (error) {
    console.error('Error fetching price history:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch price history',
      },
      { status: 500 }
    );
  }
}
