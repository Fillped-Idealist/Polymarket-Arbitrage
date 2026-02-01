# 构建错误修复指南

## 问题描述

在 Vercel 或本地部署时遇到以下错误：

```
Module not found: Can't resolve '../../backtest/types'
```

**错误位置**：
- 文件：`src/lib/polymarket/strategies/live-convergence.ts`
- 行号：14
- 导入语句：`import { ... } from '../../backtest/types';`

**错误原因**：
实盘策略文件（`live-convergence.ts` 和 `live-reversal-v9.ts`）引用了回测模块的类型定义（`../../backtest/types`），但在项目中缺少 `src/lib/backtest/` 目录。

## 解决方案

### 方案 1：从源项目复制（已执行）

如果您有原始的 `polymarket-website` 项目，可以复制回测模块：

```bash
# 从原始项目复制 backtest 目录
cp -r /path/to/polymarket-website/src/lib/backtest ./src/lib/

# 验证文件
ls -la ./src/lib/backtest/
```

### 方案 2：从 GitHub 拉取最新代码

如果您没有原始项目，可以从 GitHub 拉取最新代码：

```bash
# 拉取最新代码
git pull origin main

# 验证 backtest 目录是否存在
ls -la ./src/lib/backtest/
```

### 方案 3：手动创建（不推荐）

如果以上方案都不可行，可以手动创建缺失的类型文件。但这不是推荐的做法，因为需要手动创建多个文件。

## 验证修复

### 方法 1：运行构建验证脚本

```bash
# 运行构建验证脚本
bash scripts/verify-build.sh
```

### 方法 2：手动验证

```bash
# 1. 检查 backtest 目录是否存在
ls -la ./src/lib/backtest/

# 2. 检查 types.ts 文件是否存在
ls -la ./src/lib/backtest/types.ts

# 3. 运行 TypeScript 类型检查
pnpm run ts-check

# 4. 构建项目
pnpm run build
```

## 项目结构

修复后的项目结构应包含以下目录：

```
src/lib/
├── backtest/                    # ✅ 回测模块（新增）
│   ├── data-collector.ts
│   ├── engine.ts
│   ├── optimized-engine.ts
│   ├── strategies-v4.ts
│   ├── strategies-v5.ts
│   ├── strategies-v6.ts
│   ├── strategies-v7.ts
│   ├── strategies-v8.ts
│   ├── strategies.ts
│   ├── strategy-config.ts
│   └── types.ts                 # ✅ 类型定义（被实盘策略引用）
├── polymarket/                  # ✅ Polymarket 集成
│   ├── strategies/
│   │   ├── live-reversal-v9.ts  # ✅ 引用 ../../backtest/types
│   │   └── live-convergence.ts  # ✅ 引用 ../../backtest/types
│   ├── live-trading/
│   ├── gamma-api-v2.ts
│   └── clob-api-v2.ts
```

## 常见问题

### Q1: 为什么实盘策略需要引用回测类型？

**A**: 实盘策略和回测策略共享相同的接口定义，这样可以确保策略逻辑的一致性，并且可以方便地在回测和实盘之间切换。

### Q2: 是否可以将回测和实盘的类型定义分开？

**A**: 可以，但会增加维护成本。当前的架构设计是让回测和实盘共享类型定义，这样可以减少代码重复和保持一致性。

### Q3: 如果还有其他模块缺失的错误怎么办？

**A**: 请检查以下步骤：

1. 确保从 GitHub 拉取了最新代码：
   ```bash
   git pull origin main
   ```

2. 重新安装依赖：
   ```bash
   rm -rf node_modules
   pnpm install
   ```

3. 清除构建缓存：
   ```bash
   rm -rf .next
   pnpm run build
   ```

4. 运行构建验证脚本：
   ```bash
   bash scripts/verify-build.sh
   ```

### Q4: Vercel 部署时如何自动修复？

**A**: 代码已经推送到 GitHub，Vercel 会自动拉取最新代码并重新部署。如果部署失败，请检查：

1. Vercel 的构建日志
2. 确保环境变量配置正确
3. 确保使用了 pnpm 作为包管理器

## 构建验证脚本

项目提供了 `scripts/verify-build.sh` 脚本，用于验证项目是否可以正确构建：

```bash
# 运行验证脚本
bash scripts/verify-build.sh
```

该脚本会自动检查：
- ✅ Node.js 版本
- ✅ pnpm 安装
- ✅ 项目结构完整性
- ✅ 依赖安装
- ✅ TypeScript 类型检查
- ✅ 项目构建

## 后续步骤

修复后，您可以：

1. **本地测试**：
   ```bash
   # 开发模式
   pnpm run dev

   # 生产模式
   pnpm run build
   pnpm run start
   ```

2. **Vercel 部署**：
   - 访问 Vercel 控制台
   - 重新部署项目
   - 检查部署日志

3. **验证功能**：
   - 访问应用首页
   - 测试回测功能
   - 测试实盘交易功能

## 相关文档

- [GATEWAY_ERR_TROUBLESHOOTING.md](./GATEWAY_ERR_TROUBLESHOOTING.md) - API 错误排查
- [README.md](./README.md) - 项目说明
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) - 部署指南

## 支持与反馈

如果问题仍然存在，请：

1. 检查 GitHub Issues：https://github.com/Fillped-Idealist/Polymarket-Arbitrage/issues
2. 提交新的 Issue 并附上完整的错误日志
3. 提供 Node.js 版本、pnpm 版本和操作系统信息

---

**更新日期**: 2025-02-02
**修复版本**: 2e377d6
