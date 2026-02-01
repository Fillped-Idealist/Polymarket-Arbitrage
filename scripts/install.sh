#!/bin/bash

# Polymarket Arbitrage System - 安装脚本

echo "======================================"
echo "Polymarket Arbitrage System"
echo "安装脚本"
echo "======================================"
echo ""

# 检查 Node.js
echo "检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    echo "请访问 https://nodejs.org/ 下载安装 Node.js >= 24.0.0"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 24 ]; then
    echo "❌ Node.js 版本过低（需要 >= 24.0.0）"
    echo "当前版本: $(node -v)"
    exit 1
fi
echo "✅ Node.js 版本: $(node -v)"
echo ""

# 检查 pnpm
echo "检查 pnpm..."
if ! command -v pnpm &> /dev/null; then
    echo "⚠️  pnpm 未安装，正在安装..."
    npm install -g pnpm
    if [ $? -ne 0 ]; then
        echo "❌ pnpm 安装失败"
        exit 1
    fi
fi
echo "✅ pnpm 版本: $(pnpm -v)"
echo ""

# 安装依赖
echo "📦 安装项目依赖..."
echo ""
pnpm install
if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo "下一步："
echo "  运行启动脚本: ./scripts/start.sh"
echo "  或手动启动: pnpm run dev"
echo ""
