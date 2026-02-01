# GatewayErr 错误解决方案

## 问题描述
```
GatewayErr: (code: 699024202, message: raw response: , unmarshal response err, logID: ...)
```

## 原因分析

### 1. 沙盒环境限制
沙盒环境可能无法访问外部 API（Gamma API、CLOB API），导致请求失败。

### 2. 网络连接问题
- 超时设置过短
- 网络不稳定
- 防火墙阻止

### 3. API 服务问题
- Polymarket API 暂时不可用
- API 返回空响应
- API 返回非 JSON 格式

## 解决方案

### 方案 1：增加超时时间和重试次数

修改 `src/lib/polymarket/gamma-api-v2.ts`：

```typescript
constructor(config: GammaApiConfig = {}) {
  this.config = {
    baseUrl: config.baseUrl || 'https://gamma-api.polymarket.com',
    maxWorkers: config.maxWorkers || 3,  // 降低并发数
    timeout: config.timeout || 60000,  // 增加超时到 60 秒
    retryAttempts: config.retryAttempts || 5,  // 增加重试次数
    retryDelay: config.retryDelay || 5000,  // 增加重试延迟
  };
}
```

### 方案 2：添加代理支持

如果需要通过代理访问：

```typescript
private async httpGet<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const options: RequestOptions & HttpsRequestOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      timeout: this.config.timeout,
      // 添加代理支持
      agent: new https.Agent({
        rejectUnauthorized: false,  // 开发环境可以禁用 SSL 验证
      }),
    };

    // ... 其余代码
  });
}
```

### 方案 3：添加更好的错误处理

```typescript
private async httpGet<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const options: RequestOptions & HttpsRequestOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      timeout: this.config.timeout,
    };

    const req = protocol.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        // 检查响应是否为空
        if (!data || data.trim() === '') {
          reject(new Error(`API 返回空响应: ${url}`));
          return;
        }

        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data) as T);
          } catch (error) {
            // 记录原始响应以便调试
            console.error(`JSON 解析失败，原始响应:`, data);
            reject(new Error(`JSON 解析失败: ${error}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`请求失败: ${url}`, error);
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`请求超时: ${url}`));
    });

    req.end();
  });
}
```

### 方案 4：使用本地环境运行

由于沙盒环境可能无法访问外部 API，建议在本地环境运行：

```bash
# 1. 克隆项目
git clone https://github.com/Fillped-Idealist/Polymarket-Arbitrage.git
cd Polymarket_Arbitrage

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，添加必要的配置

# 4. 启动开发服务器
pnpm run dev
```

### 方案 5：添加 Mock 数据（用于测试）

在开发环境中使用 Mock 数据：

```typescript
// 创建 src/lib/polymarket/mock-data.ts
export const mockMarkets = [
  {
    id: "1",
    question: "Will Bitcoin reach $100,000 by end of 2025?",
    endDate: "2025-12-31T23:59:59Z",
    active: true,
    outcomePrices: [0.15, 0.85],
    liquidity: 10000,
    volume: 50000,
  },
  // ... 更多 mock 数据
];

// 在 gamma-api-v2.ts 中
async fetchMarkets(hours: number = 480): Promise<ParsedMarket[]> {
  if (process.env.USE_MOCK_DATA === 'true') {
    return this.parseMarkets(mockMarkets);
  }
  // ... 正常逻辑
}
```

## 调试步骤

### 1. 检查网络连接
```bash
curl -I https://gamma-api.polymarket.com
```

### 2. 检查日志
```bash
tail -f /app/work/logs/bypass/app.log
```

### 3. 测试 API 端点
```bash
curl https://gamma-api.polymarket.com/markets?active=true&limit=10
```

### 4. 查看浏览器控制台
打开浏览器开发者工具（F12），查看 Console 和 Network 标签中的错误信息。

## 推荐方案

**短期解决方案**：
1. 增加超时时间到 60 秒
2. 增加重试次数到 5 次
3. 添加更好的错误处理和日志记录

**长期解决方案**：
1. 在本地环境运行项目
2. 配置代理（如果需要）
3. 添加 API 健康检查
4. 实现 Mock 数据用于测试

## 预防措施

1. **添加 API 健康检查**
```typescript
async healthCheck(): Promise<boolean> {
  try {
    await this.httpGet('https://gamma-api.polymarket.com/health');
    return true;
  } catch {
    return false;
  }
}
```

2. **实现降级策略**
```typescript
async fetchMarkets(hours: number = 480): Promise<ParsedMarket[]> {
  try {
    return await this.fetchMarketsFromAPI(hours);
  } catch (error) {
    console.error('API 调用失败，尝试使用缓存数据');
    return this.fetchMarketsFromCache(hours);
  }
}
```

3. **添加监控和告警**
```typescript
async fetchMarkets(hours: number = 480): Promise<ParsedMarket[]> {
  const startTime = Date.now();
  try {
    const result = await this.fetchMarketsFromAPI(hours);
    const duration = Date.now() - startTime;
    console.log(`API 调用成功，耗时 ${duration}ms`);
    return result;
  } catch (error) {
    console.error('API 调用失败:', error);
    // 发送告警
    this.sendAlert('API 调用失败', error);
    throw error;
  }
}
```

## 联系支持

如果问题持续存在，请：
1. 检查 Polymarket API 状态页面
2. 查看项目 GitHub Issues
3. 提交新的 Issue 并附上完整的错误日志
