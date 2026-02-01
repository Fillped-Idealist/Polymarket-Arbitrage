# Polymarket Arbitrage System - 项目结构说明

本文档详细说明项目的目录结构和各文件的用途。

---

## 目录树

```
Polymarket_Arbitrage/
├── docs/                          # 项目文档
│   ├── QUICKSTART.md             # 快速开始指南
│   ├── DEPLOYMENT.md             # 部署指南
│   ├── ARCHITECTURE.md           # 架构文档
│   ├── API.md                    # API 文档（待创建）
│   └── *.json                    # 测试数据文件
│
├── scripts/                       # 脚本文件
│   ├── install.sh                # Linux/macOS 安装脚本
│   ├── install.bat               # Windows 安装脚本
│   ├── start.sh                  # Linux/macOS 启动脚本
│   └── start.bat                 # Windows 启动脚本
│
├── public/                        # 静态资源
│   └── favicon.ico               # 网站图标
│
├── src/                           # 源代码目录
│   ├── app/                      # Next.js 应用目录
│   │   ├── api/                 # API 路由
│   │   │   ├── auto-trading/    # 自动交易 API
│   │   │   │   └── route.ts
│   │   │   ├── markets/         # 市场数据 API
│   │   │   │   └── route.ts
│   │   │   ├── positions/       # 持仓数据 API
│   │   │   │   └── route.ts
│   │   │   ├── backtest/        # 回测 API
│   │   │   │   ├── route.ts
│   │   │   │   ├── data/
│   │   │   │   ├── stream/
│   │   │   │   └── import/
│   │   │   └── live-trading/    # 实盘交易 API（旧版本）
│   │   │       └── route.ts
│   │   │
│   │   ├── auto-trading/        # 自动交易页面
│   │   │   └── page.tsx
│   │   ├── dashboard/           # 仪表盘页面
│   │   │   └── page.tsx
│   │   ├── backtest/            # 回测页面
│   │   │   └── page.tsx
│   │   ├── live-trading/        # 实盘交易页面（旧版本）
│   │   │   └── page.tsx
│   │   ├── live-trading-v2/     # 实盘交易页面 V2
│   │   │   └── page.tsx
│   │   ├── analysis/            # 分析页面
│   │   ├── import/              # 导入页面
│   │   ├── docs/                # 文档页面
│   │   └── strategy/            # 策略页面
│   │
│   │   ├── page.tsx             # 首页
│   │   ├── layout.tsx           # 全局布局
│   │   ├── globals.css          # 全局样式
│   │   └── robots.ts            # SEO 配置
│   │
│   ├── components/               # React 组件
│   │   └── ui/                  # shadcn/ui 组件
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── table.tsx
│   │       ├── ...（其他 UI 组件）
│   │
│   └── lib/                     # 核心代码库
│       └── polymarket/          # Polymarket 相关功能
│           ├── config.ts        # 配置文件
│           ├── gamma-api.ts     # Gamma API 客户端（旧版本）
│           ├── gamma-api-v2.ts  # Gamma API 客户端（新版本）
│           ├── clob-api.ts      # CLOB API 客户端（旧版本）
│           ├── clob-api-v2.ts   # CLOB API 客户端（新版本）
│           ├── position-manager.ts      # 持仓管理器（旧版本）
│           ├── position-manager-v2.ts   # 持仓管理器（新版本）
│           ├── candidate-manager.ts     # 候选仓管理器（旧版本）
│           ├── candidate-manager-v2.ts  # 候选仓管理器（新版本）
│           │
│           ├── live-trading/    # 实盘交易引擎
│           │   ├── engine.ts    # 交易引擎（旧版本）
│           │   ├── engine-v2.ts # 交易引擎（新版本）
│           │   └── types.ts     # 类型定义
│           │
│           └── strategies/      # 交易策略
│               ├── live-reversal-v9.ts   # 反转策略
│               └── live-convergence.ts   # 尾盘策略
│
├── .gitignore                    # Git 忽略文件
├── .npmrc                        # npm 配置
├── components.json               # shadcn/ui 配置
├── eslint.config.mjs             # ESLint 配置
├── next.config.ts                # Next.js 配置
├── next-env.d.ts                 # Next.js 类型定义
├── package.json                  # 项目依赖配置
├── postcss.config.mjs            # PostCSS 配置
├── tsconfig.json                 # TypeScript 配置
└── README.md                     # 项目说明
```

---

## 核心文件说明

### 配置文件

| 文件 | 说明 |
|------|------|
| `package.json` | 项目依赖和脚本配置 |
| `tsconfig.json` | TypeScript 编译配置 |
| `next.config.ts` | Next.js 框架配置 |
| `components.json` | shadcn/ui 组件配置 |

### API 路由

| 路由 | 说明 | 方法 |
|------|------|------|
| `/api/auto-trading` | 自动交易控制 | GET, POST |
| `/api/markets` | 获取市场数据 | GET |
| `/api/positions` | 获取持仓数据 | GET |
| `/api/backtest` | 回测功能 | GET, POST |

### 页面路由

| 路由 | 说明 |
|------|------|
| `/` | 首页 |
| `/auto-trading` | 自动交易页面 |
| `/dashboard` | 仪表盘页面 |
| `/backtest` | 回测页面 |

### 核心模块

| 模块 | 文件 | 说明 |
|------|------|------|
| 交易引擎 | `engine-v2.ts` | 核心交易引擎 |
| 持仓管理 | `position-manager-v2.ts` | 持仓和盈亏管理 |
| 候选仓管理 | `candidate-manager-v2.ts` | 候选市场管理 |
| Gamma API | `gamma-api-v2.ts` | 市场数据获取 |
| CLOB API | `clob-api-v2.ts` | 订单簿数据获取 |
| 反转策略 | `live-reversal-v9.ts` | 价格反转策略 |
| 尾盘策略 | `live-convergence.ts` | 尾盘收敛策略 |

---

## 版本说明

### V1（旧版本）

- `engine.ts`
- `position-manager.ts`
- `candidate-manager.ts`
- `gamma-api.ts`
- `clob-api.ts`

### V2（当前版本，推荐使用）

- `engine-v2.ts`
- `position-manager-v2.ts`
- `candidate-manager-v2.ts`
- `gamma-api-v2.ts`
- `clob-api-v2.ts`

---

## 数据流

```
外部 API
  ↓
API 客户端（Gamma/CLOB）
  ↓
数据解析
  ↓
业务逻辑层
  ↓
API 路由
  ↓
前端页面
```

---

## 扩展指南

### 添加新页面

1. 在 `src/app/` 下创建新目录
2. 添加 `page.tsx` 文件
3. 实现页面组件

### 添加新 API

1. 在 `src/app/api/` 下创建新目录
2. 添加 `route.ts` 文件
3. 实现 API 逻辑

### 添加新策略

1. 在 `src/lib/polymarket/strategies/` 下创建新文件
2. 实现策略类
3. 在引擎中注册

---

## 注意事项

1. **使用 V2 版本**：推荐使用 V2 版本的所有模块
2. **API 依赖**：系统依赖外部 API，需要网络连接
3. **沙盒限制**：在沙盒环境中无法访问外部 API
4. **端口配置**：默认使用 5000 端口，可自定义

---

## 相关文档

- [README.md](../README.md)
- [QUICKSTART.md](./QUICKSTART.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
