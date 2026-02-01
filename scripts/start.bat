@echo off
REM Polymarket Arbitrage System - Windows 启动脚本

echo ======================================
echo Polymarket Arbitrage System
echo ======================================
echo.

REM 检查 Node.js
echo 检查 Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js 未安装
    echo 请访问 https://nodejs.org/ 下载安装
    pause
    exit /b 1
)
echo ✅ Node.js 版本:
node -v
echo.

REM 检查 pnpm
echo 检查 pnpm...
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  pnpm 未安装，正在安装...
    call npm install -g pnpm
)
echo ✅ pnpm 版本:
pnpm -v
echo.

REM 检查依赖
echo 检查依赖...
if not exist "node_modules" (
    echo 📦 正在安装依赖...
    call pnpm install
)
echo ✅ 依赖已安装
echo.

REM 选择启动模式
echo 选择启动模式:
echo 1) 开发模式（支持热更新）
echo 2) 生产模式
echo 3) 构建项目
echo.
set /p choice="请输入选项 (1-3): "

if "%choice%"=="1" (
    echo.
    echo 🚀 启动开发服务器...
    echo 访问地址: http://localhost:5000
    echo.
    call pnpm run dev
) else if "%choice%"=="2" (
    echo.
    echo 🔨 构建生产版本...
    call pnpm run build
    if %errorlevel% equ 0 (
        echo.
        echo 🚀 启动生产服务器...
        echo 访问地址: http://localhost:5000
        echo.
        call pnpm run start
    ) else (
        echo ❌ 构建失败
        pause
        exit /b 1
    )
) else if "%choice%"=="3" (
    echo.
    echo 🔨 构建项目...
    call pnpm run build
) else (
    echo ❌ 无效选项
    pause
    exit /b 1
)

pause
