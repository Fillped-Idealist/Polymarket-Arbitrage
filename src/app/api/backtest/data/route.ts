import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const DATA_DIR = join(process.cwd(), 'data', 'imported');

/**
 * 获取已导入的数据列表
 * GET /api/backtest/data
 *
 * 返回所有已导入的数据文件及其基本信息
 */
export async function GET() {
  try {
    // 检查数据目录是否存在
    if (!existsSync(DATA_DIR)) {
      return NextResponse.json({
        success: true,
        data: [],
        message: '暂无已导入的数据',
      });
    }

    // 读取目录中的所有文件
    const files = await readdir(DATA_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: '暂无已导入的数据',
      });
    }

    // 读取每个文件的元信息
    const dataList = await Promise.all(
      jsonFiles.map(async (fileName) => {
        const filePath = join(DATA_DIR, fileName);
        try {
          const content = await readFile(filePath, 'utf-8');
          const data = JSON.parse(content);

          return {
            fileName,
            importedAt: data.meta?.importedAt,
            snapshotCount: data.meta?.snapshotCount || 0,
            marketCount: data.meta?.marketCount || 0,
            dateRange: data.meta?.dateRange,
          };
        } catch (error) {
          return {
            fileName,
            error: '读取失败',
          };
        }
      })
    );

    // 按导入时间排序（最新的在前）
    dataList.sort((a, b) => {
      const timeA = a.importedAt ? new Date(a.importedAt).getTime() : 0;
      const timeB = b.importedAt ? new Date(b.importedAt).getTime() : 0;
      return timeB - timeA;
    });

    return NextResponse.json({
      success: true,
      data: dataList,
      count: dataList.length,
    });
  } catch (error) {
    console.error('获取数据列表失败:', error);
    return NextResponse.json(
      {
        error: '获取数据列表失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
