# 快速开始指南

本指南帮助你在 5 分钟内启动 Polymarket Arbitrage System。

---

## 前置要求

- **Node.js**: >= 24.0.0
- **pnpm**: >= 9.0.0
- **网络连接**: 需要访问外部 API（非沙盒环境）

---

## 方法 1：使用安装脚本（推荐）

### Linux / macOS

```bash
# 1. 克隆项目
git clone https://github.com/yourusername/Polymarket_Arbitrage.git
cd Polymarket_Arbitrage

# 2. 运行安装脚本
./scripts/install.sh

# 3. 运行启动脚本
./scripts/start.sh
```

### Windows

```batch
# 1. 克隆项目
git clone https://github.com/yourusername/Polymarket_Arbitrage.git
cd Polymarket_Arbitrage

# 2. 运行安装脚本
scripts\install.bat

# 3. 运行启动脚本
scripts\start.bat
```

---

## 方法 2：手动安装

```bash
# 1. 克隆项目
git clone https://github.com/yourusername/Polymarket_Arbitrage.git
cd Polymarket_Arbitrage

# 2. 安装 pnpm（如果未安装）
npm install -g pnpm

# 3. 安装依赖
pnpm install

# 4. 启动开发服务器
pnpm run dev
```

---

## 启动选项

### 开发模式（推荐用于开发）

```bash
pnpm run dev
```

**特点**：
- 支持热更新
- 自动重启
- 详细错误信息

### 生产模式

```bash
# 1. 构建项目
pnpm run build

# 2. 启动生产服务器
pnpm run start
```

**特点**：
- 优化后的代码
- 更好的性能
- 更少的资源占用

---

## 访问应用

启动成功后，打开浏览器访问：

```
http://localhost:5000
```

### 主要页面

- **首页**: `http://localhost:5000/`
- **自动交易**: `http://localhost:5000/auto-trading`
- **仪表盘**: `http://localhost:5000/dashboard`
- **回测系统**: `http://localhost:5000/backtest`

---

## 使用自动交易系统

### 第一步：访问自动交易页面

访问 `http://localhost:5000/auto-trading`

### 第二步：配置参数

1. **选择测试模式**：
   - 1 Convergence + 4 Reversal（推荐）
   - 2 Convergence + 3 Reversal
   - All Reversal

2. **设置初始资金**：
   - 默认：10000 USD
   - 可自定义

### 第三步：启动交易

点击"启动"按钮，系统会：
1. 初始化交易引擎
2. 从 Gamma API 获取市场数据
3. 筛选候选市场
4. 自动开仓和平仓

### 第四步：监控交易

- **进度提示**：实时显示当前步骤
- **持仓列表**：查看当前持仓
- **盈亏统计**：查看总收益和胜率

---

## 常见问题

### Q: 安装失败？

A: 检查以下几点：
1. Node.js 版本 >= 24.0.0
2. pnpm 已正确安装
3. 网络连接正常

### Q: 无法访问外部 API？

A: 可能的原因：
1. 开发环境限制
2. 防火墙阻止
3. DNS 解析失败

**解决方案**：在本地环境运行

### Q: 端口 5000 已被占用？

A: 使用其他端口：

```bash
PORT=3000 pnpm run dev
```

### Q: 如何查看日志？

A: 查看控制台输出或日志文件：

```bash
# Linux / macOS
tail -f /app/work/logs/bypass/app.log

# Windows
type app.log
```

---

## 下一步

- 📖 阅读 [README.md](../README.md) 了解项目详情
- 🚀 阅读 [DEPLOYMENT.md](./DEPLOYMENT.md) 了解部署方法
- 🏗️ 阅读 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解系统架构
- 📝 阅读 [API.md](./API.md) 了解 API 接口

---

## 获取帮助

- **GitHub Issues**: [https://github.com/yourusername/Polymarket_Arbitrage/issues](https://github.com/yourusername/Polymarket_Arbitrage/issues)
- **文档**: [https://github.com/yourusername/Polymarket_Arbitrage/wiki](https://github.com/yourusername/Polymarket_Arbitrage/wiki)

---

**祝使用愉快！** 🎉
