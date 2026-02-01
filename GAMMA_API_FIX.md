# Gamma API 参数修复说明

## 问题描述

之前在调用 Gamma API 时遇到 `GatewayErr` 错误，原因是参数传递格式不正确。

### 错误的参数格式

```typescript
// ❌ 错误的参数
const params = new URLSearchParams({
  active: 'true',
  closed: 'false',
  archived: 'false',
  'endDate__gt': current_time,
  'endDate__lt': expiry_time,
  limit: '500',
});

const url = `${this.config.baseUrl}/markets?${params.toString()}&offset=${offset}`;
// 结果：https://gamma-api.polymarket.com/markets?active=true&closed=false&archived=false&endDate__gt=...&endDate__lt=...&limit=500&offset=0
```

### 正确的参数格式

```typescript
// ✅ 正确的参数
const url = `${this.config.baseUrl}/markets?status=active&limit=500&offset=${offset}`;
// 结果：https://gamma-api.polymarket.com/markets?status=active&limit=500&offset=0
```

## 修复内容

### 1. 修复参数格式

- ❌ 移除：`active=true` → ✅ 使用：`status=active`
- ❌ 移除：`closed=false`
- ❌ 移除：`archived=false`
- ❌ 移除：`endDate__gt` 和 `endDate__lt`

### 2. 简化 URL 构建

```typescript
// 修复前
const params = new URLSearchParams({
  active: 'true',
  closed: 'false',
  archived: 'false',
  'endDate__gt': current_time,
  'endDate__lt': expiry_time,
  limit: '500',
});
const url = `${this.config.baseUrl}/markets?${params.toString()}&offset=${offset}`;

// 修复后
const url = `${this.config.baseUrl}/markets?status=active&limit=500&offset=${offset}`;
```

### 3. API 文档参考

根据 Polymarket Gamma API 文档，正确的参数格式为：

```
GET /markets?status=active&limit=500&offset=0
```

参数说明：
- `status=active`：只获取活跃市场
- `limit=500`：每页返回 500 条记录
- `offset=0`：分页偏移量

## 影响范围

修复的文件：
- `src/lib/polymarket/gamma-api-v2.ts` (Polymarket_Arbitrage 项目)
- `src/lib/polymarket/gamma-api-v2.ts` (polymarket-website 项目)

## 测试验证

### 方法 1：手动测试 API

```bash
# 测试正确的参数
curl "https://gamma-api.polymarket.com/markets?status=active&limit=10&offset=0"

# 测试错误的参数（应该返回空或错误）
curl "https://gamma-api.polymarket.com/markets?active=true&limit=10&offset=0"
```

### 方法 2：本地运行测试

```bash
# 启动开发服务器
pnpm run dev

# 访问市场数据接口
curl http://localhost:5000/api/markets
```

### 方法 3：检查日志

```bash
# 查看日志，确认 API 调用成功
tail -f /app/work/logs/bypass/app.log

# 应该看到类似的日志：
# [GammaAPI] 启动 6 个线程并发获取 30 页数据...
# [GammaAPI] 第 1 页获取成功，返回 500 个市场
# [GammaAPI] 原始数据获取完成：共收集到 XXXX 个市场数据
```

## 预期效果

修复后：
1. ✅ GatewayErr 错误应该消失
2. ✅ 可以成功获取市场数据
3. ✅ 实盘策略可以正常运行
4. ✅ 候选仓可以正常更新

## 其他注意事项

### 关于时间过滤

移除了 `endDate__gt` 和 `endDate__lt` 参数，这意味着：

- API 会返回所有活跃市场，不限制时间范围
- 需要在代码层面根据业务需求过滤市场
- 可以在获取到市场数据后，根据 `endDate` 字段进行过滤

### 性能优化建议

由于移除了时间过滤，API 可能返回更多数据。可以考虑：

1. **降低并发数**：
```typescript
this.config = {
  maxWorkers: config.maxWorkers || 3,  // 从 6 降到 3
};
```

2. **增加超时时间**：
```typescript
this.config = {
  timeout: config.timeout || 60000,  // 增加到 60 秒
};
```

3. **添加缓存机制**：
```typescript
// 缓存市场数据，减少 API 调用
private marketCache: { [key: string]: { data: ParsedMarket[], timestamp: number } } = {};
```

## 相关文档

- [Polymarket Gamma API 文档](https://docs.polymarket.com/)
- [GATEWAY_ERR_TROUBLESHOOTING.md](./GATEWAY_ERR_TROUBLESHOOTING.md)
- [BUILD_ERROR_FIX.md](./BUILD_ERROR_FIX.md)

## 更新日志

- **2025-02-02**: 修复 Gamma API 参数传递格式
  - 使用正确的参数：`status=active&limit=500&offset=0`
  - 移除错误的参数：`active=true`、`endDate__gt`、`endDate__lt`
  - 简化 URL 构建逻辑

## 支持

如果修复后仍有问题，请：
1. 检查 Gamma API 服务状态
2. 查看 GitHub Issues
3. 提交新的 Issue 并附上完整的错误日志
