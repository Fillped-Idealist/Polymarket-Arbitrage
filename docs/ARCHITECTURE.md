# Polymarket Arbitrage System - 架构文档

本文档详细说明 Polymarket Arbitrage System 的系统架构、设计模式和核心组件。

---

## 目录

- [系统概述](#系统概述)
- [架构设计](#架构设计)
- [核心组件](#核心组件)
- [数据流](#数据流)
- [交易流程](#交易流程)
- [错误处理](#错误处理)
- [性能优化](#性能优化)

---

## 系统概述

### 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                       前端层 (Frontend)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │   首页   │  │自动交易  │  │ 仪表盘   │  │  回测    │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓ HTTP
┌─────────────────────────────────────────────────────────────┐
│                       API 层 (API Layer)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ /auto-trading│  │   /markets   │  │  /positions  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     业务逻辑层 (Business Layer)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  交易引擎    │  │ 持仓管理器   │  │ 候选仓管理器 │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │  策略模块    │  │  风险控制    │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     数据层 (Data Layer)                       │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ Gamma API    │  │  CLOB API    │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### 核心特性

1. **前后端分离**：前端 React + 后端 Next.js API Routes
2. **模块化设计**：各组件独立，易于扩展和维护
3. **事件驱动**：使用回调函数处理交易事件
4. **单例模式**：关键组件使用单例模式确保全局唯一
5. **实时更新**：定时刷新机制确保数据实时性

---

## 架构设计

### 设计模式

#### 1. 单例模式 (Singleton Pattern)

**应用场景**：
- `positionManager`：持仓管理器
- `candidateManager`：候选仓管理器
- `gammaApiClient`：Gamma API 客户端
- `clobApiClient`：CLOB API 客户端

**优点**：
- 全局唯一实例
- 避免资源浪费
- 确保数据一致性

**示例代码**：
```typescript
export class PositionManager {
  private static instance: PositionManager;

  private constructor() {
    // 初始化
  }

  static getInstance(): PositionManager {
    if (!PositionManager.instance) {
      PositionManager.instance = new PositionManager();
    }
    return PositionManager.instance;
  }
}

export const positionManager = PositionManager.getInstance();
```

#### 2. 策略模式 (Strategy Pattern)

**应用场景**：
- `LiveReversalStrategyV9`：反转策略
- `LiveConvergenceStrategy`：尾盘策略

**优点**：
- 策略可插拔
- 易于添加新策略
- 策略独立测试

**示例代码**：
```typescript
interface LiveStrategy {
  shouldOpen(market: ParsedMarket, config: LiveTradingConfig): Promise<boolean>;
  shouldClose(position: Position, currentPrice: number): boolean;
}

class LiveReversalStrategyV9 implements LiveStrategy {
  async shouldOpen(market: ParsedMarket, config: LiveTradingConfig): Promise<boolean> {
    // 实现反转策略逻辑
  }

  shouldClose(position: Position, currentPrice: number): boolean {
    // 实现平仓逻辑
  }
}
```

#### 3. 观察者模式 (Observer Pattern)

**应用场景**：
- 交易引擎事件通知
- 进度更新通知

**优点**：
- 解耦事件产生和处理
- 支持多个监听器
- 异步事件处理

**示例代码**：
```typescript
type LiveTradingCallback = (event: LiveTradingEvent) => void;

class LiveTradingEngineV2 {
  private callback?: LiveTradingCallback;

  constructor(config: LiveTradingConfig, callback?: LiveTradingCallback) {
    this.callback = callback;
  }

  private emitEvent(type: LiveTradingEvent['type'], data?: any): void {
    if (this.callback) {
      this.callback({
        type,
        timestamp: new Date(),
        data,
      });
    }
  }
}
```

---

## 核心组件

### 1. 交易引擎 (LiveTradingEngineV2)

**职责**：
- 协调整个交易流程
- 定时执行更新循环
- 管理策略调度

**核心方法**：
```typescript
class LiveTradingEngineV2 {
  // 启动引擎
  async start(): Promise<void>

  // 停止引擎
  async stop(): Promise<void>

  // 执行一次更新
  private async runUpdate(): Promise<void>

  // 获取进度
  getProgress(): ProgressData
}
```

### 2. 持仓管理器 (PositionManager)

**职责**：
- 管理所有持仓
- 计算盈亏
- 执行平仓操作

**核心方法**：
```typescript
class PositionManager {
  // 添加持仓
  addPosition(position: Position): void

  // 更新持仓价格
  updatePositionPrice(positionId: string, newPrice: number): void

  // 平仓
  closePosition(position: Position, exitPrice: number, exitReason: string): void

  // 获取统计信息
  getStatistics(): PositionStats

  // 清空持仓
  clear(initial_capital?: number): void
}
```

### 3. 候选仓管理器 (CandidateManager)

**职责**：
- 管理候选市场
- 验证流动性
- 移除过期候选

**核心方法**：
```typescript
class CandidateManager {
  // 添加候选
  addCandidate(candidate: Candidate): void

  // 获取有效候选
  getValidCandidates(exclude_market_ids?: Set<string>): Candidate[]

  // 验证流动性
  async validateLiquidity(): Promise<void>

  // 移除过期候选
  removeExpiredCandidates(): void
}
```

### 4. Gamma API 客户端 (GammaApiClient)

**职责**：
- 获取市场数据
- 解析市场信息
- 并发请求优化

**核心方法**：
```typescript
class GammaApiClient {
  // 获取市场数据
  async fetchMarkets(hours: number): Promise<ParsedMarket[]>

  // 获取单页数据
  private async fetchPage(url: string, index: number): Promise<GammaMarket[]>

  // 解析市场数据
  private parseMarkets(raw_markets: GammaMarket[]): ParsedMarket[]
}
```

### 5. CLOB API 客户端 (ClobApiClient)

**职责**：
- 获取订单簿数据
- 计算最佳价格
- 验证流动性

**核心方法**：
```typescript
class ClobApiClient {
  // 获取订单簿
  async fetchOrderBook(token_id: string): Promise<OrderBook | null>

  // 获取最佳价格
  getBestPrice(order_book: OrderBook): BestPrice | null

  // 检查流动性
  hasEnoughLiquidity(order_book: OrderBook, side: 'buy' | 'sell', size: number, multiplier: number): boolean
}
```

---

## 数据流

### 市场数据流

```
Gamma API → GammaApiClient → ParsedMarket[] → Market Cache → CandidateManager
                                                                    ↓
                                                             Candidate[]
```

### 持仓数据流

```
Market Data → PositionManager.updatePositionPrice() → Position.current_price
                                                            ↓
                                                     Position.current_pnl
```

### 交易数据流

```
Strategy.shouldOpen() → Engine.openPosition() → PositionManager.addPosition()
                                                                       ↓
                                                                  Position[]
```

---

## 交易流程

### 完整交易周期

```
1. 市场数据获取
   ├─ 从 Gamma API 获取市场列表
   ├─ 解析市场数据
   └─ 更新市场缓存

2. 持仓检查
   ├─ 遍历所有持仓
   ├─ 更新持仓价格
   ├─ 检查平仓条件
   └─ 执行平仓操作

3. 候选仓筛选
   ├─ 移除过期候选
   ├─ 添加新候选
   └─ 筛选有效候选

4. 盘口数据获取
   ├─ 从 CLOB API 获取订单簿
   ├─ 验证流动性
   └─ 计算最佳价格

5. 开仓检查
   ├─ 检查仓位限制
   ├─ 遍历候选仓
   ├─ 调用策略判断
   └─ 执行开仓操作

6. 价格更新
   ├─ 批量更新持仓价格
   └─ 计算实时盈亏
```

### 定时更新机制

```typescript
// 启动时立即执行一次
await this.runUpdate();

// 设置定时器（默认 10 分钟）
this.updateTimer = setInterval(async () => {
  await this.runUpdate();
}, intervalMs);
```

---

## 错误处理

### 错误类型

1. **网络错误**
   - API 请求超时
   - 网络连接失败
   - DNS 解析失败

2. **数据错误**
   - API 返回无效数据
   - 数据解析失败
   - 数据格式错误

3. **业务错误**
   - 流动性不足
   - 仓位已满
   - 资金不足

### 错误处理策略

```typescript
try {
  // 执行操作
  await this.runUpdate();
} catch (error) {
  // 记录错误
  console.error('[Engine] 更新失败:', error);

  // 发送错误事件
  this.emitEvent('error', { message: '更新失败', error });

  // 继续运行（不停止引擎）
}
```

### 重试机制

```typescript
private async fetchPage(url: string, index: number, attempt: number = 0): Promise<GammaMarket[]> {
  try {
    const data = await this.httpGet<GammaMarket[]>(url);
    return data;
  } catch (error) {
    if (attempt < this.config.retryAttempts) {
      console.warn(`[GammaAPI] 第 ${index + 1} 页获取失败，重试第 ${attempt + 1} 次`);
      await this.sleep(this.config.retryDelay);
      return this.fetchPage(url, index, attempt + 1);
    }
    throw error;
  }
}
```

---

## 性能优化

### 1. 并发请求

```typescript
// 并发获取所有页面
const fetchPromises = offsets.map((offset, index) =>
  this.fetchPage(url, index)
);

const results = await Promise.allSettled(fetchPromises);
```

### 2. 缓存机制

```typescript
// 市场缓存
private market_cache: Map<string, ParsedMarket> = new Map();

// 更新缓存
for (const market of markets) {
  this.market_cache.set(market.id, market);
}
```

### 3. 批量更新

```typescript
// 批量更新持仓价格
await positionManager.updatePositionsPrices(market_prices);
```

### 4. 定时刷新

```typescript
// 前端定时刷新（10 秒）
refreshIntervalRef.current = setInterval(() => {
  fetchEngineData();
}, 10000);
```

---

## 扩展性设计

### 添加新策略

1. 在 `strategies/` 目录下创建新策略类
2. 实现 `LiveStrategy` 接口
3. 在引擎中注册策略

```typescript
class NewStrategy implements LiveStrategy {
  async shouldOpen(market: ParsedMarket, config: LiveTradingConfig): Promise<boolean> {
    // 实现策略逻辑
  }

  shouldClose(position: Position, currentPrice: number): boolean {
    // 实现平仓逻辑
  }
}
```

### 添加新数据源

1. 创建新的 API 客户端类
2. 实现数据获取方法
3. 在引擎中集成

```typescript
class NewDataSource {
  async fetchData(): Promise<Data[]> {
    // 实现数据获取
  }
}
```

---

## 安全考虑

### 1. API 限流

- 控制并发请求数量
- 实现请求队列
- 避免触发速率限制

### 2. 数据验证

- 验证 API 返回数据
- 检查数据完整性
- 处理异常数据

### 3. 错误隔离

- 捕获所有异常
- 避免崩溃
- 记录错误日志

---

## 监控和日志

### 日志级别

```typescript
console.log('[Info] 普通信息');
console.warn('[Warning] 警告信息');
console.error('[Error] 错误信息');
```

### 关键事件

- 交易引擎启动/停止
- 开仓/平仓操作
- 错误发生
- 进度更新

---

## 总结

Polymarket Arbitrage System 采用了模块化、可扩展的架构设计，通过合理的设计模式和最佳实践，确保系统的稳定性、可维护性和可扩展性。

---

**更多文档**：
- [README.md](../README.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [API.md](./API.md)
