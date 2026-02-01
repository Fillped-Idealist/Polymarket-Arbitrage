import { NextRequest, NextResponse } from 'next/server';
import { BacktestMarketSnapshot } from '@/lib/backtest/types';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// 数据存储目录
const DATA_DIR = join(process.cwd(), 'data', 'imported');

/**
 * 导入历史数据（文件上传）
 * POST /api/backtest/import
 *
 * 支持两种方式：
 * 1. 文件上传（multipart/form-data）：上传JSON文件
 * 2. JSON请求体：直接提供snapshots数据
 *
 * 文件上传示例（curl）:
 * curl -X POST http://localhost:5000/api/backtest/import \
 *   -F "file=@backtest_data.json"
 *
 * JSON请求示例:
 * curl -X POST http://localhost:5000/api/backtest/import \
 *   -H "Content-Type: application/json" \
 *   -d '{"snapshots": [...]}'
 */
export async function POST(request: NextRequest) {
  try {
    // 确保数据目录存在
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
    }

    let snapshots: any[];

    // 检查请求类型
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // 处理文件上传
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json(
          { error: '请上传JSON文件' },
          { status: 400 }
        );
      }

      // 验证文件类型
      if (!file.name.endsWith('.json')) {
        return NextResponse.json(
          { error: '只支持JSON格式文件' },
          { status: 400 }
        );
      }

      // 读取文件内容
      const fileContent = await file.text();
      const jsonData = JSON.parse(fileContent);

      // 检查是否是包含snapshots的格式
      if (jsonData.snapshots && Array.isArray(jsonData.snapshots)) {
        snapshots = jsonData.snapshots;
      } else if (Array.isArray(jsonData)) {
        // 直接是快照数组
        snapshots = jsonData;
      } else {
        return NextResponse.json(
          { error: '文件格式无效，必须包含snapshots数组' },
          { status: 400 }
        );
      }
    } else {
      // 处理JSON请求体
      const body = await request.json();
      snapshots = body.snapshots;

      if (!snapshots || !Array.isArray(snapshots)) {
        return NextResponse.json(
          { error: '缺少或无效的snapshots数据' },
          { status: 400 }
        );
      }
    }

    // 验证并转换数据
    const validSnapshots: BacktestMarketSnapshot[] = [];
    const errors: string[] = [];

    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];

      try {
        // 验证必要字段
        if (!snapshot.timestamp || !snapshot.marketId || !snapshot.outcomePrices) {
          errors.push(`快照${i}: 缺少必要字段`);
          continue;
        }

        // 转换日期
        const timestamp = new Date(snapshot.timestamp);
        const endDate = snapshot.endDate ? new Date(snapshot.endDate) : new Date();

        // 验证价格
        if (!Array.isArray(snapshot.outcomePrices) || snapshot.outcomePrices.length === 0) {
          errors.push(`快照${i}: 价格数据无效`);
          continue;
        }

        const validPrices = snapshot.outcomePrices.filter((p: number) => p > 0 && p < 1);
        if (validPrices.length === 0) {
          errors.push(`快照${i}: 所有价格都在有效范围(0, 1)之外`);
          continue;
        }

        // 创建标准快照
        const standardSnapshot: BacktestMarketSnapshot = {
          timestamp,
          marketId: snapshot.marketId,
          question: snapshot.question || '',
          outcomePrices: validPrices,
          liquidity: snapshot.liquidity || 0,
          volume24h: snapshot.volume24h || 0,
          endDate,
          isBinary: validPrices.length === 2,
          tags: snapshot.tags || [],
          tokenIds: snapshot.tokenIds,
        };

        validSnapshots.push(standardSnapshot);
      } catch (error) {
        errors.push(`快照${i}: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    // 按时间戳排序
    validSnapshots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // 统计信息
    const uniqueMarkets = new Set(validSnapshots.map(s => s.marketId)).size;
    const startDate = validSnapshots[0]?.timestamp || new Date();
    const endDate = validSnapshots[validSnapshots.length - 1]?.timestamp || new Date();

    // 保存数据到文件
    const timestamp = Date.now();
    const fileName = `backtest_data_${timestamp}.json`;
    const filePath = join(DATA_DIR, fileName);

    const dataToSave = {
      meta: {
        importedAt: new Date().toISOString(),
        snapshotCount: validSnapshots.length,
        marketCount: uniqueMarkets,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      },
      snapshots: validSnapshots,
    };

    await writeFile(filePath, JSON.stringify(dataToSave, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      message: `成功导入 ${validSnapshots.length} 个快照`,
      stats: {
        totalSnapshots: validSnapshots.length,
        uniqueMarkets,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      },
      fileName,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('导入数据失败:', error);
    return NextResponse.json(
      {
        error: '导入数据失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/backtest/import
 * 返回数据导入模板和说明
 */
export async function GET() {
  return NextResponse.json({
    message: '数据导入接口说明',
    endpoint: '/api/backtest/import',
    method: 'POST',
    description: '导入真实的Polymarket历史数据用于回测',
    format: {
      snapshots: [
        {
          timestamp: 'ISO 8601格式的时间戳',
          marketId: '市场唯一标识符',
          question: '市场问题描述',
          outcomePrices: '[价格1, 价格2, ...] - 每个结果的价格(0-1之间)',
          liquidity: '市场流动性(可选)',
          volume24h: '24小时成交量(可选)',
          endDate: '市场结束日期(可选)',
          isBinary: '是否为二元市场(可选，自动推断)',
          tags: '市场标签数组(可选)',
          tokenIds: 'Token ID数组(可选)',
        },
      ],
    },
    example: {
      snapshots: [
        {
          timestamp: '2024-01-01T00:00:00.000Z',
          marketId: 'bitcoin-100k-jan2024',
          question: 'Will Bitcoin reach $100,000 by January 31, 2024?',
          outcomePrices: [0.45, 0.55],
          liquidity: 50000,
          volume24h: 100000,
          endDate: '2024-01-31T23:59:59.999Z',
          tags: ['crypto', 'bitcoin'],
          tokenIds: ['yes-token-id', 'no-token-id'],
        },
      ],
    },
    notes: [
      '价格必须在0到1之间',
      '时间戳使用ISO 8601格式',
      'outcomePrices数组长度应与市场结果数量一致',
      '如果缺少liquidity或volume24h，将使用默认值0',
    ],
  });
}
