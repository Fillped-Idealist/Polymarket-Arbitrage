#!/bin/bash

# Polymarket Arbitrage System - 启动脚本

echo "======================================"
echo "Polymarket Arbitrage System"
echo "======================================"
echo ""

# 检查 Node.js 版本
echo "检查 Node.js 版本..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    echo "请访问 https://nodejs.org/ 下载安装"
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
fi
echo "✅ pnpm 版本: $(pnpm -v)"
echo ""

# 检查依赖
echo "检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装依赖..."
    pnpm install
fi
echo "✅ 依赖已安装"
echo ""

# 选择启动模式
echo "选择启动模式:"
echo "1) 开发模式（支持热更新）"
echo "2) 生产模式"
echo "3) 构建项目"
echo ""
read -p "请输入选项 (1-3): " choice

case $choice in
    1)
        echo ""
        echo "🚀 启动开发服务器..."
        echo "访问地址: http://localhost:5000"
        echo ""
        pnpm run dev
        ;;
    2)
        echo ""
        echo "🔨 构建生产版本..."
        pnpm run build
        if [ $? -eq 0 ]; then
            echo ""
            echo "🚀 启动生产服务器..."
            echo "访问地址: http://localhost:5000"
            echo ""
            pnpm run start
        else
            echo "❌ 构建失败"
            exit 1
        fi
        ;;
    3)
        echo ""
        echo "🔨 构建项目..."
        pnpm run build
        ;;
    *)
        echo "❌ 无效选项"
        exit 1
        ;;
esac
