# Git 推送指南

## 方式一：本地推送（推荐）

由于沙盒环境没有配置 GitHub 认证，请在本地环境执行以下命令：

```bash
# 1. 克隆新创建的仓库（或进入现有仓库）
cd /path/to/your/local/directory

# 2. 从沙盒复制文件到本地
# 将 /workspace/projects/Polymarket_Arbitrage 目录下的所有文件复制到本地

# 3. 初始化 Git 仓库（如果还没有）
git init
git branch -m main

# 4. 添加远程仓库
git remote add origin https://github.com/Fillped-Idealist/Polymarket-Arbitrage.git

# 5. 添加所有文件
git add .

# 6. 提交
git commit -m "Initial commit: Polymarket Arbitrage Trading System

- Implement real-time market data integration (Gamma API + CLOB API)
- Support multiple trading strategies (Reversal V9, Convergence)
- Add backtesting engine with streaming support
- Implement position and candidate management
- Add live trading control panel with real-time updates
- Clean up AI/Coze related content for deployment readiness"

# 7. 推送到 GitHub
git push -u origin main
```

## 方式二：使用 GitHub CLI（如果已安装）

```bash
# 1. 登录 GitHub
gh auth login

# 2. 创建仓库并推送
gh repo create Fillped-Idealist/Polymarket-Arbitrage --public --source=. --remote=origin --push
```

## 方式三：使用 Personal Access Token

1. 在 GitHub 生成 Personal Access Token：
   - 访问：https://github.com/settings/tokens
   - 点击 "Generate new token" → "Generate new token (classic)"
   - 选择权限：`repo`（完整访问权限）
   - 生成 token 并复制

2. 使用 token 推送：
```bash
git remote set-url origin https://YOUR_TOKEN@github.com/Fillped-Idealist/Polymarket-Arbitrage.git
git push -u origin main
```

## 验证推送成功

推送成功后，访问以下链接验证：
https://github.com/Fillped-Idealist/Polymarket-Arbitrage

## 项目文件结构

推送完成后，仓库应包含以下内容：

```
Polymarket-Arbitrage/
├── .gitignore
├── .env.example
├── MIGRATION.md
├── README.md
├── components.json
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tsconfig.json
├── vercel.json
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── PROJECT_STRUCTURE.md
│   ├── QUICKSTART.md
│   └── [其他文档...]
├── scripts/
│   ├── build.sh
│   ├── dev.sh
│   ├── install.sh
│   ├── start.bat
│   └── start.sh
└── src/
    ├── app/
    │   ├── api/
    │   │   ├── auto-trading/
    │   │   ├── backtest/
    │   │   ├── live-trading/
    │   │   ├── markets/
    │   │   └── positions/
    │   ├── auto-trading/
    │   ├── backtest/
    │   ├── dashboard/
    │   ├── live-trading/
    │   ├── live-trading-v2/
    │   └── page.tsx
    ├── components/ui/
    ├── lib/
    │   └── polymarket/
    │       ├── strategies/
    │       ├── live-trading/
    │       ├── gamma-api.ts
    │       ├── clob-api.ts
    │       └── [其他核心文件...]
    └── app/
        └── globals.css
```

## 注意事项

1. **首次推送**：如果是首次推送，可能需要输入 GitHub 用户名和密码（或 token）
2. **分支保护**：默认推送到 `main` 分支
3. **忽略文件**：确保 `.gitignore` 正确配置，避免推送敏感文件
4. **环境变量**：`.env` 文件不会被推送，请手动在 GitHub 或 Vercel 中配置

## 下一步

推送成功后，可以：

1. **在 Vercel 部署**：
   - 访问：https://vercel.com/new
   - 导入 GitHub 仓库
   - 配置环境变量（参考 `.env.example`）
   - 点击部署

2. **设置 GitHub Pages**（可选）：
   - 仓库 Settings → Pages
   - 选择 source 分支（main）
   - 访问：https://fillped-idealist.github.io/Polymarket-Arbitrage

3. **配置 GitHub Actions**（可选）：
   - 添加 CI/CD 工作流
   - 自动化测试和部署
