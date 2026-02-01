# Polymarket Arbitrage System - 部署指南

本文档详细说明如何在不同环境中部署 Polymarket Arbitrage System。

---

## 目录

- [环境要求](#环境要求)
- [本地开发](#本地开发)
- [Vercel 部署](#vercel-部署)
- [Docker 部署](#docker-部署)
- [Nginx 部署](#nginx-部署)
- [环境变量配置](#环境变量配置)
- [故障排查](#故障排查)

---

## 环境要求

### 基础要求

- **Node.js**: >= 24.0.0
- **pnpm**: >= 9.0.0
- **内存**: >= 2GB
- **磁盘**: >= 5GB

### 网络要求

- **出站网络**: 需要访问以下域名：
  - `gamma-api.polymarket.com`
  - `clob.polymarket.com`
  - `polymarket.com`
- **端口**: 需要开放 5000 端口（或自定义端口）

---

## 本地开发

### 1. 克隆项目

```bash
git clone https://github.com/yourusername/Polymarket_Arbitrage.git
cd Polymarket_Arbitrage
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量（可选）

创建 `.env.local` 文件：

```env
NEXT_PUBLIC_GAMMA_API_URL=https://gamma-api.polymarket.com
NEXT_PUBLIC_CLOB_API_URL=https://clob.polymarket.com
UPDATE_INTERVAL_MINUTES=10
```

### 4. 启动开发服务器

```bash
pnpm run dev
```

### 5. 访问应用

打开浏览器访问：`http://localhost:5000`

---

## Vercel 部署

### 1. 准备工作

- 确保项目已推送到 GitHub
- 注册 [Vercel](https://vercel.com/) 账号

### 2. 部署步骤

#### 方式一：通过 Vercel CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
vercel
```

#### 方式二：通过 Vercel Dashboard

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 "Add New Project"
3. 导入 GitHub 仓库
4. 配置项目设置：
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `pnpm run build`
   - **Output Directory**: `.next`
5. 点击 "Deploy"

### 3. 配置环境变量

在 Vercel Dashboard 中配置：

```
NEXT_PUBLIC_GAMMA_API_URL=https://gamma-api.polymarket.com
NEXT_PUBLIC_CLOB_API_URL=https://clob.polymarket.com
UPDATE_INTERVAL_MINUTES=10
```

### 4. 自定义域名（可选）

在 Vercel Dashboard 中配置自定义域名。

---

## Docker 部署

### 1. 创建 Dockerfile

```dockerfile
# Dockerfile
FROM node:24-alpine AS base

# 安装依赖
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# 构建应用
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN corepack enable pnpm && pnpm run build

# 生产运行
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 5000

ENV PORT 5000

CMD ["node", "server.js"]
```

### 2. 创建 .dockerignore

```
node_modules
.next
.git
.env*.local
*.log
```

### 3. 构建镜像

```bash
docker build -t polymarket-arbitrage:latest .
```

### 4. 运行容器

```bash
docker run -d \
  --name polymarket-arbitrage \
  -p 5000:5000 \
  -e NEXT_PUBLIC_GAMMA_API_URL=https://gamma-api.polymarket.com \
  -e NEXT_PUBLIC_CLOB_API_URL=https://clob.polymarket.com \
  polymarket-arbitrage:latest
```

### 5. 使用 Docker Compose（推荐）

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  polymarket-arbitrage:
    build: .
    container_name: polymarket-arbitrage
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_GAMMA_API_URL=https://gamma-api.polymarket.com
      - NEXT_PUBLIC_CLOB_API_URL=https://clob.polymarket.com
      - UPDATE_INTERVAL_MINUTES=10
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

启动服务：

```bash
docker-compose up -d
```

---

## Nginx 部署

### 1. 构建生产版本

```bash
pnpm run build
```

### 2. 使用 PM2 运行

安装 PM2：

```bash
npm install -g pm2
```

启动应用：

```bash
pm2 start npm --name "polymarket-arbitrage" -- start
```

### 3. 配置 Nginx

创建 `/etc/nginx/sites-available/polymarket-arbitrage`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 启用 gzip 压缩
    gzip on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss;
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/polymarket-arbitrage /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. 配置 SSL（可选）

使用 Let's Encrypt：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 环境变量配置

### 必需变量

```env
NODE_ENV=production
```

### 可选变量

```env
# API URL 配置
NEXT_PUBLIC_GAMMA_API_URL=https://gamma-api.polymarket.com
NEXT_PUBLIC_CLOB_API_URL=https://clob.polymarket.com

# 更新间隔（分钟）
UPDATE_INTERVAL_MINUTES=10

# 端口配置
PORT=5000

# 日志级别
LOG_LEVEL=info
```

---

## 故障排查

### 问题 1: 无法访问外部 API

**症状**：
- 候选仓为空
- 控制台显示网络错误

**解决方案**：
1. 检查网络连接
2. 确认防火墙规则
3. 检查 API 服务状态
4. 查看 Nginx 日志：`tail -f /var/log/nginx/error.log`

### 问题 2: 内存不足

**症状**：
- 应用崩溃
- OOM 错误

**解决方案**：
1. 增加 Node.js 内存限制：
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" pnpm run build
   ```
2. 使用 PM2 配置内存限制：
   ```javascript
   module.exports = {
     apps: [{
       name: 'polymarket-arbitrage',
       script: 'npm',
       args: 'start',
       max_memory_restart: '1G'
     }]
   }
   ```

### 问题 3: 端口冲突

**症状**：
- 启动失败，显示端口已占用

**解决方案**：
```bash
# 查找占用端口的进程
lsof -i :5000

# 杀死进程
kill -9 <PID>

# 或使用其他端口
PORT=3000 pnpm run dev
```

### 问题 4: 构建失败

**症状**：
- TypeScript 类型错误
- 依赖安装失败

**解决方案**：
```bash
# 清理缓存
rm -rf .next node_modules
pnpm install

# 运行类型检查
pnpm run type-check

# 重新构建
pnpm run build
```

---

## 监控和日志

### PM2 日志

```bash
# 查看日志
pm2 logs polymarket-arbitrage

# 查看实时日志
pm2 logs polymarket-arbitrage --lines 100

# 查看错误日志
pm2 logs polymarket-arbitrage --err
```

### Docker 日志

```bash
# 查看容器日志
docker logs polymarket-arbitrage

# 查看实时日志
docker logs -f polymarket-arbitrage
```

### 系统日志

```bash
# 查看 Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## 性能优化

### 1. 启用缓存

在 `next.config.ts` 中配置：

```typescript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=60, stale-while-revalidate=30',
          },
        ],
      },
    ];
  },
};
```

### 2. 使用 CDN

在 Nginx 中配置静态资源缓存：

```nginx
location /_next/static {
    proxy_pass http://localhost:5000;
    proxy_cache_valid 200 1y;
    add_header Cache-Control "public, immutable";
}
```

### 3. 启用 Gzip 压缩

在 Nginx 中启用：

```nginx
gzip on;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml application/json application/javascript;
```

---

## 安全建议

1. **使用 HTTPS**：配置 SSL 证书
2. **限制访问**：使用防火墙限制访问 IP
3. **定期更新**：及时更新依赖包
4. **环境变量**：不要将敏感信息提交到代码库
5. **日志监控**：定期检查异常日志

---

## 联系支持

如果遇到问题，请：

1. 查看 [GitHub Issues](https://github.com/yourusername/Polymarket_Arbitrage/issues)
2. 查阅 [README.md](../README.md)
3. 查阅 [API.md](./API.md)

---

## 更新日志

- **2025-02-01**: 初始版本发布
- **2025-02-01**: 添加 Docker 部署支持
- **2025-02-01**: 添加 Nginx 配置示例

---

**祝部署顺利！** 🚀
