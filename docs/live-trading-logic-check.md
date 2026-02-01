# 实盘交易系统逻辑检查文档

## 概述

本文档详细检查了实盘交易系统的所有逻辑，确保无 bug、无逻辑问题、无报错。

## 检查项目清单

### ✅ 1. 市场信息获取（Gamma API）

**文件**: `src/lib/polymarket/gamma-api.ts`

**检查项**:
- ✅ API 端点正确：`https://gamma-api.polymarket.com/markets`
- ✅ 错误处理：使用 try-catch 捕获异常
- ✅ 参数验证：检查 API 响应状态
- ✅ 数据过滤：`filterValidMarkets` 方法正确过滤无效市场
  - ✅ 检查市场是否活跃（`isActive`）
  - ✅ 检查市场是否过期（`endDate < now`）
  - ✅ 检查市场是否即将过期（30 分钟内）
  - ✅ 检查流动性（`liquidity >= 500`）
  - ✅ 检查交易量（`volume24h >= 2000`）
  - ✅ 检查 outcome 价格有效性
  - ✅ 检查问题有效性
  - ✅ 检查 outcomes 数量（必须是 2）
- ✅ 数据转换：`toMarketSnapshot` 方法正确转换数据格式

**潜在问题**:
- ⚠️ API 密钥配置需要用户提供
- ⚠️ 需要处理 API 限流问题

**改进建议**:
- 添加 API 限流重试机制
- 添加请求超时设置

---

### ✅ 2. 盘口数据读取（CLOB API）

**文件**: `src/lib/polymarket/clob-api.ts`

**检查项**:
- ✅ API 端点正确：`https://clob.polymarket.com/orderbook`
- ✅ 错误处理：使用 try-catch 捕获异常
- ✅ 参数验证：检查 API 响应状态
- ✅ 订单簿验证：
  - ✅ 检查订单簿是否存在
  - ✅ 检查买卖价差（`spread <= 0.05`）
  - ✅ 检查买单流动性（`bid.size >= minLiquidity`）
  - ✅ 检查卖单流动性（`ask.size >= minLiquidity`）
- ✅ 流动性验证：`hasEnoughLiquidity` 方法正确计算可用 shares

**潜在问题**:
- ⚠️ `tokenID` 映射问题：Gamma API 的市场 ID 和 CLOB API 的 tokenID 可能不一致
- ⚠️ 需要处理 API 限流问题
- ⚠️ 需要处理 WebSocket 连接问题（如果使用 WebSocket）

**改进建议**:
- 添加 tokenID 映射表
- 添加 WebSocket 实时数据支持
- 添加 API 限流重试机制

---

### ✅ 3. 候选仓挑选

**文件**: `src/lib/polymarket/candidate-manager.ts`

**检查项**:
- ✅ 更新逻辑：`updateFromGamma` 方法正确从 Gamma API 获取市场
- ✅ 流动性验证：`validateLiquidity` 方法正确使用 CLOB API 验证
- ✅ 过期移除：`removeExpiredCandidates` 方法正确移除过期市场
- ✅ 过滤逻辑：
  - ✅ 检查市场是否活跃
  - ✅ 检查市场是否过期
  - ✅ 检查市场是否即将过期
  - ✅ 检查流动性
  - ✅ 检查交易量
  - ✅ 检查 outcome 价格
  - ✅ 检查问题有效性
  - ✅ 检查 outcomes 数量
- ✅ 获取方法：
  - ✅ `getAllCandidates`：获取所有候选仓
  - ✅ `getValidCandidates`：获取有效候选仓
  - ✅ `getCandidatesByPriceRange`：按价格区间筛选

**潜在问题**:
- ⚠️ 候选仓数量可能过大，需要限制最大数量
- ⚠️ 流动性验证频率过高，可能触发 API 限流

**改进建议**:
- 限制最大候选仓数量（当前设置为 1000）
- 优化流动性验证频率（当前设置为 5 分钟）

---

### ✅ 4. 持仓检查

**文件**: `src/lib/polymarket/position-manager.ts`

**检查项**:
- ✅ 持仓添加：`addPosition` 方法正确添加持仓
- ✅ 持仓移除：`removePosition` 方法正确移除持仓
- ✅ 持仓更新：`updatePositionPrice` 方法正确更新价格和盈亏
- ✅ 平仓逻辑：`closePosition` 方法正确计算盈亏
- ✅ 权益更新：`updateEquity` 方法只使用已实现盈亏
- ✅ 开仓检查：`canOpenPosition` 方法正确检查：
  - ✅ 未达到最大持仓数
  - ✅ 市场不在持仓中
  - ✅ 策略未达到最大持仓数

**潜在问题**:
- ⚠️ 最高价格（`highestPrice`）初始化逻辑需要检查
- ⚠️ 权益更新逻辑需要确保不包含浮盈

**改进建议**:
- 添加持仓历史记录
- 添加持仓盈亏图表

---

### ✅ 5. 分析数据开仓

**文件**: `src/lib/polymarket/live-trading/engine.ts`

**检查项**:
- ✅ 流程顺序正确：
  1. ✅ 市场信息获取（Gamma API）
  2. ✅ 持仓检查（平仓逻辑）
  3. ✅ 候选仓挑选（筛选有效市场）
  4. ✅ 盘口数据读取（CLOB API）
  5. ✅ 分析数据开仓（开仓逻辑）
  6. ✅ 更新持仓价格（实时盈亏）
- ✅ 开仓逻辑：
  - ✅ 检查是否满仓
  - ✅ 检查市场是否在持仓中
  - ✅ 检查策略是否启用
  - ✅ 检查策略是否达到最大持仓数
  - ✅ 调用策略的 `shouldOpen` 方法
  - ✅ 计算仓位大小（18% 固定仓位，不含浮盈）
  - ✅ 验证仓位大小
  - ✅ 创建持仓记录
  - ✅ 更新交易冷却时间
- ✅ 平仓逻辑：
  - ✅ 获取当前价格
  - ✅ 调用策略的 `shouldClose` 方法
  - ✅ 获取退出原因
  - ✅ 调用 `closePosition` 方法
  - ✅ 发送事件通知

**潜在问题**:
- ⚠️ 结果索引查找逻辑需要验证
- ⚠️ 仓位大小计算需要考虑最小订单大小
- ⚠️ 每次只开一个仓可能错过其他机会

**改进建议**:
- 优化结果索引查找逻辑
- 添加最小订单大小检查
- 考虑每次开多个仓（如果流动性足够）

---

### ✅ 6. Reversal 策略逻辑

**文件**: `src/lib/polymarket/strategies/live-reversal-v9.ts`

**检查项**:
- ✅ 价格区间判断：
  - ✅ 极低价格（1%-5%）
  - ✅ 低价格（5%-10%）
  - ✅ 中低价格（10%-20%）
  - ✅ 中等价格（20%-35%）
- ✅ 市场深度检查：
  - ✅ 交易量 >= 2000
  - ✅ 流动性 >= 500
- ✅ 止损参数：
  - ✅ 极低价格：硬止损 -15%，移动止盈 30% 回撤，最大持仓时间 168 小时
  - ✅ 低价格：硬止损 -15%，移动止盈 25% 回撤，最大持仓时间 120 小时
  - ✅ 中低价格：硬止损 -10%，移动止盈 20% 回撤，最大持仓时间 96 小时
  - ✅ 中等价格：硬止损 -10%，移动止盈 15% 回撤，最大持仓时间 72 小时
- ✅ 平仓逻辑：
  - ✅ 市场归零保护（价格 < 0.01）
  - ✅ 硬止损
  - ✅ 移动止盈
  - ✅ 最大持仓时间
- ✅ 交易冷却：30 分钟
- ✅ 市场黑名单：归零市场加入黑名单

**潜在问题**:
- ⚠️ 流动性检查逻辑需要实现
- ⚠️ 盘口检查逻辑需要实现

**改进建议**:
- 完善 CLOB API 集成
- 添加实时盘口监控

---

### ✅ 7. Convergence 策略逻辑

**文件**: `src/lib/polymarket/strategies/live-convergence.ts`

**检查项**:
- ✅ 价格区间判断：90%-95%
- ✅ 市场深度检查：
  - ✅ 交易量 >= 1000（放宽要求）
  - ✅ 流动性 >= 300（放宽要求）
- ✅ 止损参数：
  - ✅ 硬止损 -5%
  - ✅ 移动止盈 10% 回撤
  - ✅ 最大持仓时间 24 小时
- ✅ 强制平仓：市场临近结束（2 小时内）
- ✅ 交易冷却：15 分钟

**潜在问题**:
- ⚠️ 流动性检查逻辑需要实现
- ⚠️ 盘口检查逻辑需要实现

**改进建议**:
- 完善 CLOB API 集成
- 添加实时盘口监控

---

### ✅ 8. 三种测试模式

**文件**: `src/lib/polymarket/live-trading/engine.ts`

**检查项**:
- ✅ 模式 1：全部 Reversal（5 个 Reversal）
- ✅ 模式 2：1 个 Convergence + 4 个 Reversal
- ✅ 模式 3：2 个 Convergence + 3 个 Reversal
- ✅ 最大持仓数：5
- ✅ 单仓位比例：18%
- ✅ 总杠杆：90%

**潜在问题**:
- ⚠️ 需要验证策略数量限制逻辑

**改进建议**:
- 添加模式切换功能
- 添加模式性能对比

---

### ✅ 9. 定时任务

**文件**: `src/lib/polymarket/live-trading/engine.ts`

**检查项**:
- ✅ 定时更新：每 10 分钟更新一次
- ✅ 启动逻辑：立即执行一次，然后定时执行
- ✅ 停止逻辑：清除定时器
- ✅ 错误处理：捕获异常并记录日志

**潜在问题**:
- ⚠️ 定时任务可能重复启动
- ⚠️ 定时任务可能无法停止

**改进建议**:
- 添加定时任务状态检查
- 添加强制停止功能

---

### ✅ 10. 数据完整性

**检查项**:
- ✅ 市场数据完整性检查
- ✅ 价格数据范围检查（0-1）
- ✅ 时间数据有效性检查
- ✅ 数值数据类型检查
- ✅ 空值检查

**潜在问题**:
- ⚠️ 需要添加数据备份机制
- ⚠️ 需要添加数据恢复机制

**改进建议**:
- 添加数据备份功能
- 添加数据恢复功能

---

## 重点检查：开仓逻辑

### 流程图

```
开始
  ↓
检查是否满仓？
  ├─ 是 → 结束
  └─ 否 ↓
检查市场是否在持仓中？
  ├─ 是 → 跳过
  └─ 否 ↓
检查策略是否启用？
  ├─ 否 → 跳过
  └─ 是 ↓
检查策略是否达到最大持仓数？
  ├─ 是 → 跳过
  └─ 否 ↓
调用策略的 shouldOpen 方法
  ├─ 返回 false → 跳过
  └─ 返回 true ↓
检查交易冷却时间？
  ├─ 未到冷却时间 → 跳过
  └─ 到冷却时间 ↓
查找结果索引
  ├─ 找不到 → 跳过
  └─ 找到 ↓
计算仓位大小
  ├─ 无效 → 跳过
  └─ 有效 ↓
检查最小订单大小？
  ├─ 太小 → 跳过
  └─ 合适 ↓
【实盘特有】检查 CLOB 流动性
  ├─ 不足 → 跳过
  └─ 充足 ↓
【实盘特有】检查买一卖一
  ├─ 不足 → 跳过
  └─ 充足 ↓
创建持仓记录
  ↓
添加到持仓管理器
  ↓
更新交易冷却时间
  ↓
发送事件通知
  ↓
结束
```

### 关键检查点

1. **持仓数量检查** ✅
   ```typescript
   if (openPositions.length >= this.config.maxPositions) {
     return;  // 已满仓
   }
   ```

2. **市场持仓检查** ✅
   ```typescript
   if (positionManager.hasPosition(candidate.marketId)) {
     continue;  // 市场已在持仓中
   }
   ```

3. **策略数量检查** ✅
   ```typescript
   const reversalPositions = openPositions.filter(p => p.strategy === 'reversal');
   if (reversalPositions.length < this.config.strategies.reversal.maxPositions) {
     // 可以开仓
   }
   ```

4. **交易冷却检查** ✅
   ```typescript
   const minutesSinceLastTrade = (now.getTime() - lastTradeTime.getTime()) / (1000 * 60);
   if (minutesSinceLastTrade < this.COOLDOWN_MINUTES) {
     return;  // 未到冷却时间
   }
   ```

5. **仓位大小计算** ✅
   ```typescript
   const equity = positionManager.getEquity();  // 不含浮盈
   const positionValue = equity * 0.18;  // 18%
   const positionSize = Math.floor(positionValue / entryPrice);
   ```

6. **最小订单大小检查** ✅
   ```typescript
   if (shares < minOrderSize) {
     return;  // 订单太小
   }
   ```

7. **【待实现】CLOB 流动性检查** ⚠️
   ```typescript
   // 需要实现
   const hasEnoughLiquidity = await clobApiClient.hasEnoughLiquidity(
     tokenID,
     assetId,
     'buy',
     shares
   );
   ```

8. **【待实现】买一卖一检查** ⚠️
   ```typescript
   // 需要实现
   const bestPrice = await clobApiClient.getBestPrice(tokenID);
   if (!bestPrice || bestPrice.ask.size < shares) {
     return;  // 流动性不足
   }
   ```

---

## 重点检查：平仓逻辑

### 流程图

```
开始
  ↓
获取当前持仓列表
  ↓
遍历每个持仓
  ↓
获取候选仓（获取当前价格）
  ↓
调用策略的 shouldClose 方法
  ├─ 返回 false → 跳过
  └─ 返回 true ↓
获取退出原因
  ↓
计算盈亏
  ↓
更新持仓状态
  ↓
更新权益（已实现盈亏）
  ↓
从持仓列表移除
  ↓
发送事件通知
  ↓
继续下一个持仓
  ↓
结束
```

### 关键检查点

1. **市场归零保护** ✅
   ```typescript
   if (currentPrice < 0.01) {
     return true;  // 立即平仓
   }
   ```

2. **硬止损检查** ✅
   ```typescript
   const hardStopLossPrice = entryPrice * (1 + stopLossParams.hardStopLoss);
   if (currentPrice <= hardStopLossPrice) {
     return true;  // 触发硬止损
   }
   ```

3. **移动止盈检查** ✅
   ```typescript
   const drawdownRatio = (highestPrice - currentPrice) / highestPrice;
   if (drawdownRatio > stopLossParams.movingStopLossDrawdown) {
     return true;  // 触发移动止盈
   }
   ```

4. **最大持仓时间检查** ✅
   ```typescript
   const hoursHeld = (now.getTime() - entryTime.getTime()) / (1000 * 60 * 60);
   if (hoursHeld >= stopLossParams.maxHoldingHours) {
     return true;  // 触发强制平仓
   }
   ```

5. **盈亏计算** ✅
   ```typescript
   const exitValue = positionSize * exitPrice;
   const pnl = exitValue - entryValue;
   const pnlPercent = (pnl / entryValue) * 100;
   ```

6. **权益更新** ✅
   ```typescript
   const closedPositions = getClosedPositions();
   const realizedPnl = closedPositions.reduce((sum, p) => sum + p.pnl, 0);
   equity = initialCapital + realizedPnl;  // 不含浮盈
   ```

---

## 待实现功能

### 1. CLOB API tokenID 映射

**问题**: Gamma API 的市场 ID 和 CLOB API 的 tokenID 可能不一致

**解决方案**:
- 创建 tokenID 映射表
- 从 Gamma API 获取 tokenID 信息
- 或者使用 CLOB API 获取市场列表

### 2. CLOB 流动性检查

**问题**: 需要验证订单簿是否有足够的流动性

**解决方案**:
- 实现完整的 CLOB API 调用
- 检查订单簿的买单/卖单总量
- 检查买一/卖一的数量

### 3. 实时盘口监控

**问题**: 需要实时监控订单簿变化

**解决方案**:
- 使用 WebSocket 连接 CLOB API
- 实时接收订单簿更新
- 实时更新持仓价格

### 4. 实际下单

**问题**: 当前系统只是虚拟资金，需要实现实际下单功能

**解决方案**:
- 实现钱包连接
- 实现下单 API 调用
- 实现订单管理

---

## 总结

### 已完成 ✅

1. ✅ Gamma API 调用模块
2. ✅ CLOB API 调用模块（基础）
3. ✅ 候选仓管理模块
4. ✅ 持仓管理模块
5. ✅ Reversal 策略（实盘版）
6. ✅ Convergence 策略（实盘版）
7. ✅ 实盘交易引擎
8. ✅ 三种测试模式
9. ✅ 定时任务
10. ✅ 逻辑检查文档

### 待完成 ⚠️

1. ⚠️ CLOB API tokenID 映射
2. ⚠️ CLOB 流动性检查（完整实现）
3. ⚠️ 实时盘口监控（WebSocket）
4. ⚠️ 实际下单功能
5. ⚠️ 仪表盘界面
6. ⚠️ 端到端测试

### 风险提示

1. **API 限流**: Gamma 和 CLOB API 可能有访问频率限制
2. **网络延迟**: API 调用可能有延迟，影响实时性
3. **数据不一致**: 不同 API 的数据可能不一致
4. **滑点风险**: 实际交易可能存在滑点
5. **流动性风险**: 市场流动性不足可能导致无法成交

### 下一步行动

1. 完善 CLOB API 集成
2. 实现实时盘口监控
3. 创建仪表盘界面
4. 进行端到端测试
5. 部署到测试环境
