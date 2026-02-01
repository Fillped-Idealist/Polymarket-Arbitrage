/**
 * Polymarket 实盘交易系统 - 使用文档
 */

# Polymarket 实盘交易系统使用指南

## 概述

Polymarket 实盘交易系统是一个自动化交易系统，支持多种交易策略，包括 Reversal 策略和 Convergence 策略。系统会自动从 Polymarket 获取实时市场数据，分析并执行交易。

## 快速开始

### 1. 环境配置

复制 `.env.example` 到 `.env` 并配置环境变量：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下必要参数：

```env
# Polymarket API 配置
POLYMARKET_GAMMA_API_URL=https://gamma-api.polymarket.com
POLYMARKET_CLOB_API_URL=https://clob.polymarket.com

# 如果需要实际下单，配置 API 密钥
POLYMARKET_CLOB_API_KEY=your_clob_api_key_here
POLYMARKET_CLOB_API_SECRET=your_clob_api_secret_here

# 测试模式
TEST_MODE=all-reversal

# 初始资金
INITIAL_CAPITAL=10000

# 更新间隔（分钟）
UPDATE_INTERVAL_MINUTES=10
```

### 2. 启动项目

```bash
# 安装依赖
pnpm install

# 启动开发环境
pnpm dev
```

### 3. 访问仪表盘

打开浏览器，访问：`http://localhost:5000/live-trading`

## 测试模式

系统支持三种测试模式：

### 模式 1：全部 Reversal

- 配置：5 个 Reversal 策略仓位
- 适用场景：捕捉从低价格（1%-35%）突然上涨的机会
- 风险：中等

### 模式 2：1 Convergence + 4 Reversal

- 配置：1 个 Convergence 策略仓位 + 4 个 Reversal 策略仓位
- 适用场景：平衡策略，既捕捉低价格机会，也捕捉尾盘收敛
- 风险：中等

### 模式 3：2 Convergence + 3 Reversal

- 配置：2 个 Convergence 策略仓位 + 3 个 Reversal 策略仓位
- 适用场景：侧重尾盘收敛，相对保守
- 风险：低

## 策略说明

### Reversal 策略（V8.9）

**核心逻辑**：捕捉从低价格（1%-35%）突然上涨的机会

**价格区间判断**：
- 极低价格（1%-5%）：高风险高回报
- 低价格（5%-10%）：中高风险高回报
- 中低价格（10%-20%）：中等风险中等回报
- 中等价格（20%-35%）：低风险低回报

**市场深度要求**：
- 交易量 >= $2,000
- 流动性 >= $500

**止损参数**：
| 价格区间 | 硬止损 | 移动止盈 | 最大持仓时间 |
|---------|--------|---------|-------------|
| 1%-5%   | -15%   | 30%回撤 | 168小时     |
| 5%-10%  | -15%   | 25%回撤 | 120小时     |
| 10%-20% | -10%   | 20%回撤 | 96小时      |
| 20%-35% | -10%   | 15%回撤 | 72小时      |

**特殊保护**：
- 市场归零保护（价格 < 1%）
- 交易冷却时间：30 分钟
- 市场黑名单：归零市场加入黑名单

### Convergence 策略（尾盘）

**核心逻辑**：捕捉市场即将结束时的价格收敛机会

**价格区间判断**：90%-95%

**市场深度要求**：
- 交易量 >= $1,000（放宽）
- 流动性 >= $300（放宽）

**止损参数**：
- 硬止损：-5%
- 移动止盈：10% 回撤
- 最大持仓时间：24 小时

**特殊保护**：
- 强制平仓：市场临近结束（2 小时内）
- 交易冷却时间：15 分钟

## 仓位管理

### 最大持仓数

- 总共 5 个仓位
- 单仓位比例：18%
- 总杠杆：90%

### 开仓逻辑

1. 检查是否满仓
2. 检查市场是否在持仓中
3. 检查策略是否启用
4. 检查策略是否达到最大持仓数
5. 调用策略的 `shouldOpen` 方法
6. 检查交易冷却时间
7. 查找结果索引
8. 计算仓位大小（18% 固定仓位，不含浮盈）
9. 验证仓位大小
10. 检查最小订单大小
11. 检查 CLOB 流动性（待实现）
12. 检查买一卖一（待实现）
13. 创建持仓记录

### 平仓逻辑

1. 获取当前持仓列表
2. 遍历每个持仓
3. 获取候选仓（获取当前价格）
4. 调用策略的 `shouldClose` 方法
5. 获取退出原因
6. 计算盈亏
7. 更新持仓状态
8. 更新权益（已实现盈亏）
9. 从持仓列表移除

## API 文档

### 获取状态

```http
GET /api/live-trading/status
```

**响应**：
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "updateInterval": "10 分钟",
    "positions": {
      "openCount": 3,
      "closedCount": 5,
      "openPositions": [...],
      "closedPositions": [...]
    },
    "candidates": {
      "totalCandidates": 1000,
      "validCandidates": 500
    },
    "config": {...}
  },
  "message": "获取状态成功"
}
```

### 启动交易

```http
POST /api/live-trading/start
Content-Type: application/json

{
  "testMode": "all-reversal",
  "initialCapital": 10000
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "config": {...},
    "statistics": {...}
  },
  "message": "实盘交易已启动"
}
```

### 停止交易

```http
DELETE /api/live-trading/stop
```

**响应**：
```json
{
  "success": true,
  "data": null,
  "message": "实盘交易已停止"
}
```

## 数据更新

### 更新频率

- 定时更新：每 10 分钟调用一次 Gamma 和 CLOB API
- 实时更新：仪表盘每 30 秒刷新一次状态

### 数据来源

1. **Gamma API**：
   - 市场信息
   - 价格数据
   - 交易量
   - 流动性

2. **CLOB API**（待完善）：
   - 订单簿数据
   - 买一卖一
   - 实时流动性

## 风险提示

1. **API 限流**：Gamma 和 CLOB API 可能有访问频率限制
2. **网络延迟**：API 调用可能有延迟，影响实时性
3. **数据不一致**：不同 API 的数据可能不一致
4. **滑点风险**：实际交易可能存在滑点
5. **流动性风险**：市场流动性不足可能导致无法成交

## 待实现功能

1. ⚠️ CLOB API tokenID 映射
2. ⚠️ CLOB 流动性检查（完整实现）
3. ⚠️ 实时盘口监控（WebSocket）
4. ⚠️ 实际下单功能
5. ⚠️ 数据持久化（数据库）
6. ⚠️ 风险管理（止损、止盈）

## 常见问题

### Q: 如何切换测试模式？

A: 在仪表盘配置面板中选择测试模式，然后点击"启动交易"。

### Q: 如何查看交易历史？

A: 在仪表盘的"历史持仓"标签页中查看。

### Q: 如何停止交易？

A: 点击仪表盘右上角的"停止交易"按钮。

### Q: 系统会自动平仓吗？

A: 会。系统会根据策略的止损参数自动平仓，包括硬止损、移动止盈、最大持仓时间等。

### Q: 如何自定义策略参数？

A: 修改对应策略文件的参数配置，例如 `src/lib/polymarket/strategies/live-reversal-v9.ts`。

## 技术支持

如有问题，请查看：
- 逻辑检查文档：`docs/live-trading-logic-check.md`
- 代码注释：各个策略文件中的详细注释
- 日志文件：`/app/work/logs/bypass/live-trading.log`

## 许可证

本项目仅供学习和研究使用，不构成投资建议。使用本系统进行交易的风险由用户自行承担。
