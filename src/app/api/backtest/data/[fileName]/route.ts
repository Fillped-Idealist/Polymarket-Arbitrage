import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const DATA_DIR = join(process.cwd(), 'data', 'imported');

/**
 * 获取特定数据文件
 * GET /api/backtest/data/[fileName]
 *
 * 返回指定数据文件的完整内容
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileName: string }> }
) {
  try {
    const { fileName } = await params;

    // 安全检查：防止路径遍历攻击
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return NextResponse.json(
        { error: '无效的文件名' },
        { status: 400 }
      );
    }

    const filePath = join(DATA_DIR, fileName);

    // 检查文件是否存在
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: '数据文件不存在' },
        { status: 404 }
      );
    }

    // 读取文件内容
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('读取数据文件失败:', error);
    return NextResponse.json(
      {
        error: '读取数据文件失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

/**
 * 删除数据文件
 * DELETE /api/backtest/data/[fileName]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileName: string }> }
) {
  try {
    const { fileName } = await params;

    // 安全检查：防止路径遍历攻击
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return NextResponse.json(
        { error: '无效的文件名' },
        { status: 400 }
      );
    }

    const filePath = join(DATA_DIR, fileName);

    // 检查文件是否存在
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: '数据文件不存在' },
        { status: 404 }
      );
    }

    // 删除文件（使用fs/promises的unlink）
    const { unlink } = await import('fs/promises');
    await unlink(filePath);

    return NextResponse.json({
      success: true,
      message: '数据文件已删除',
    });
  } catch (error) {
    console.error('删除数据文件失败:', error);
    return NextResponse.json(
      {
        error: '删除数据文件失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
