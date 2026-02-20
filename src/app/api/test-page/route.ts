import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const response = await fetch('http://localhost:5000', {
      method: 'GET',
      headers: {
        'Content-Type': 'text/html',
      },
    });

    const text = await response.text();

    // 检查页面内容
    const hasAnalyticsPro = text.includes('Analytics Pro');
    const hasDashboard = text.includes('Dashboard');
    const hasReversal = text.includes('Reversal');
    const hasConvergence = text.includes('Convergence');

    return NextResponse.json({
      success: true,
      pageLength: text.length,
      checks: {
        hasAnalyticsPro,
        hasDashboard,
        hasReversal,
        hasConvergence,
      },
      preview: text.substring(0, 1000),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
