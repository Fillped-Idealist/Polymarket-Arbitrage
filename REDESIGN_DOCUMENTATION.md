# 深色主题 SaaS 仪表盘首页重新设计文档

## 设计概览

本次重新设计将 Polymarket 实盘交易系统的首页打造为一个现代、专业的深色主题 SaaS 数据仪表盘，参考了业界领先的数据可视化设计风格。

## 一、设计风格与视觉规范

### 1.1 主题色彩方案

#### 背景色系
- **主背景色**: `#0F172A` (深灰蓝，近乎纯黑)
- **卡片背景**: `#1E293B` (稍浅的深灰蓝，带 50% 透明度)
- **内层背景**: `#0F172A` (更深的背景用于卡片内部)

#### 强调色系（霓虹色调）
- **青蓝色**: `#06B6D4` - 用于主要交互、高亮、增长指标
- **紫色**: `#8B5CF6` - 用于次要交互、特殊指标
- **绿色**: `#10B981` - 用于成功、盈利状态
- **红色**: `#EF4444` - 用于亏损、警告状态
- **琥珀色**: `#F59E0B` - 用于中性、待处理状态

#### 中性色系
- **文字白色**: `#F1F5F9` (主要文字)
- **文字灰色**: `#94A3B8` (次要文字)
- **文字深灰**: `#64748B` (辅助文字)
- **文字浅灰**: `#475569` (边框、分割线)
- **文字最浅**: `#334155` (网格线)

### 1.2 字体规范

#### 标题层级
- **页面标题**: 20px, font-bold, text-white
- **卡片标题**: 18px, font-bold, text-white
- **小标题**: 16px, font-semibold, text-slate-300
- **标签**: 12px, font-medium, text-slate-400

#### 数据指标
- **大指标**: 24px, font-bold, text-white
- **中指标**: 20px, font-bold, text-white
- **小指标**: 14px, font-medium, 根据状态着色

#### 辅助文字
- **描述文字**: 14px, text-slate-400
- **提示文字**: 12px, text-slate-500

### 1.3 卡片设计规范

#### 圆角
- **外层卡片**: `rounded-2xl` (16px)
- **内层元素**: `rounded-xl` (12px)
- **按钮/标签**: `rounded-lg` (8px)

#### 阴影效果
- **外层卡片**: `shadow-2xl shadow-black/30`
- **悬浮效果**: `shadow-xl shadow-black/20`
- **高亮效果**: `shadow-[#06B6D4]/20`

#### 边框
- **卡片边框**: `border border-slate-800`
- **分割线**: `border-b border-slate-800`

#### 内发光
- **激活状态**: 使用背景色透明度 10% 实现内发光效果
- **示例**: `bg-[#06B6D4]/10`

## 二、布局结构

### 2.1 整体布局

```
┌─────────────────────────────────────────────────────────────┐
│  侧边栏 (240px)  │  主内容区 (flex-1)                        │
│  - Logo        │  - 顶部栏（隐藏在移动端）                    │
│  - 导航菜单    │  - 关键指标（4 列网格）                      │
│  - 底部状态    │  - 主卡片网格（3 列）                        │
│                │  - 快速操作按钮                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 侧边栏设计

#### 尺寸与定位
- **宽度**: 240px
- **位置**: 固定在左侧（`fixed left-0 top-0`）
- **高度**: 100vh
- **层级**: `z-50`

#### Logo 区域
```tsx
<div className="border-b border-slate-800 p-6">
  <div className="flex items-center gap-3">
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#8B5CF6]">
      <Activity className="h-6 w-6 text-white" />
    </div>
    <div>
      <h1 className="font-bold text-lg text-white">Analytics Pro</h1>
      <p className="text-[10px] text-slate-400">Dashboard</p>
    </div>
  </div>
</div>
```

#### 导航菜单项
- **普通状态**:
  - 背景: 透明
  - 文字: `text-slate-400`
  - 悬浮: `hover:bg-[#1E293B] hover:text-slate-100`
- **激活状态**:
  - 背景: `bg-[#1E293B]`
  - 文字: `text-[#06B6D4]`
  - 阴影: `shadow-lg shadow-[#06B6D4]/10`
  - 左侧指示条: 使用 `framer-motion` 的 `layoutId` 实现滑动动画

#### 底部状态
- 显示系统运行状态（Live Trading）
- 使用绿色脉冲动画表示正常运行

### 2.3 主内容区

#### 顶部栏
- 显示页面标题和描述
- 显示"最后更新"时间和"导出报告"按钮
- 仅在桌面端显示（`hidden lg:flex`）

#### 关键指标卡片
- **布局**: 响应式网格（`sm:grid-cols-2 lg:grid-cols-4`）
- **每个指标包含**:
  - 标签和趋势图标
  - 当前数值（大字体）
  - 变化百分比（根据趋势着色）

#### 主卡片网格
- **布局**: 响应式网格（`lg:grid-cols-3`）
- **三个核心卡片**:
  1. **仓位明细卡片** (2 列宽度)
  2. **资金变化卡片** (1 列宽度)
  3. **平仓明细卡片** (3 列宽度)

### 2.4 核心卡片详解

#### 1. 仓位明细卡片 (Position Details)
- **位置**: 左侧，占用 2 列
- **内容**:
  - 每日盈亏柱状图（红绿双色）
  - 最近仓位列表（4 条）
  - 统计摘要（最佳收益率、最差收益率、平均收益）
- **图表类型**: `BarChart` (Recharts)

#### 2. 资金变化卡片 (Capital Changes)
- **位置**: 右侧，占用 1 列
- **内容**:
  - 资金变化面积图（渐变填充）
  - 当前持仓列表（5 条）
- **图表类型**: `AreaChart` (Recharts)

#### 3. 平仓明细卡片 (Exit Analysis)
- **位置**: 底部，占用 3 列
- **内容**:
  - 平仓原因环形图（4 个分段）
  - 平仓明细列表（4 条）
  - 统计摘要（总平仓数、胜率、平均收益、夏普比率）
- **图表类型**: `PieChart` (Recharts)

#### 快速操作按钮
- **布局**: 水平排列（`flex gap-4`）
- **包含**:
  - "Start Live Trading" 按钮
  - "Run Backtest" 按钮

## 三、动效设计

### 3.1 页面加载动效

#### 侧边栏动画
```tsx
<motion.aside
  initial={{ x: -100, opacity: 0 }}
  animate={{ x: 0, opacity: 1 }}
  transition={{ duration: 0.5 }}
>
```
- 效果: 从左侧滑入 + 渐入
- 持续时间: 0.5s

#### 主内容区 stagger 动画
```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,  // 子元素依次延迟 0.1s
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.4, 0, 0.2, 1],  // 缓动函数
    },
  },
};
```
- 效果: 子元素依次渐入 + 从下往上
- 延迟: 每个元素延迟 0.1s
- 持续时间: 0.5s

### 3.2 导航交互动画

#### 菜单项悬停
```tsx
className="transition-all duration-300"
```
- 效果: 背景色和文字颜色平滑过渡
- 持续时间: 0.3s

#### 激活指示条动画
```tsx
<motion.div
  layoutId="activeIndicator"
  className="absolute left-0 h-8 w-1 rounded-r-full bg-[#06B6D4]"
  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
/>
```
- 效果: 弹簧动画滑动高亮
- 刚度: 300
- 阻尼: 30

### 3.3 卡片交互动画

#### 悬浮效果
```tsx
whileHover={{ scale: 1.02, y: -4 }}
```
- 效果: 微缩放 1.02 倍 + 向上移动 4px
- 持续时间: 自动（默认 0.3s）

#### 列表项悬浮
```tsx
whileHover={{ scale: 1.02, x: 4 }}  // 向右移动
whileHover={{ scale: 1.02, y: -2 }} // 向上移动
```

### 3.4 按钮交互动画

#### 悬浮效果
```tsx
whileHover={{ scale: 1.05 }}
```
- 效果: 缩放到 1.05 倍

#### 点击效果
```tsx
whileTap={{ scale: 0.95 }}
```
- 效果: 缩小到 0.95 倍

### 3.5 数据更新动画

#### 数字滚动动画
```tsx
useEffect(() => {
  const interval = setInterval(() => {
    setCapital((prev) => {
      const change = (Math.random() - 0.5) * 50;
      return Math.max(10000, prev + change);
    });
  }, 3000);

  return () => clearInterval(interval);
}, []);
```
- 效果: 每 3 秒更新一次数字
- 变化范围: ±50
- 最小值: 10000

#### 列表项动画
```tsx
initial={{ opacity: 0, x: -20 }}
animate={{ opacity: 1, x: 0 }}
transition={{ delay: index * 0.05 }}  // 每项延迟 0.05s
```
- 效果: 从左侧滑入 + 渐入
- 延迟: 每项延迟 0.05s

## 四、图表设计

### 4.1 柱状图 (BarChart)

#### 配置
- **X 轴**: 显示日期（Mon, Tue, Wed...）
- **Y 轴**: 显示盈亏值
- **柱体颜色**:
  - 盈利: `#10B981` (绿色)
  - 亏损: `#EF4444` (红色)
- **圆角**: `radius={[4, 4, 0, 0]}`
- **网格线**: 虚线 `strokeDasharray="3 3"`
- **颜色**: `stroke="#334155"`

#### Tooltip 样式
```tsx
contentStyle={{
  backgroundColor: '#1E293B',
  border: '1px solid #334155',
  borderRadius: '8px',
  color: '#F1F5F9',
}}
```

### 4.2 面积图 (AreaChart)

#### 渐变定义
```tsx
<defs>
  <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
  </linearGradient>
</defs>
```
- 效果: 从上到下的渐变，从 30% 透明度到 0%

#### 配置
- **线条颜色**: `#06B6D4` (青蓝色)
- **线条宽度**: 2
- **填充**: 使用渐变

### 4.3 环形图 (PieChart)

#### 配置
- **内半径**: 60
- **外半径**: 100
- **内边距**: 5
- **分段颜色**:
  - 止盈: `#10B981` (绿色)
  - 止损: `#EF4444` (红色)
  - 强制平仓: `#F59E0B` (琥珀色)
  - 市场归零: `#8B5CF6` (紫色)

## 五、响应式设计

### 5.1 断点

- **移动端**: < 1024px
- **桌面端**: ≥ 1024px

### 5.2 侧边栏

#### 桌面端
- 固定显示在左侧
- 宽度: 240px

#### 移动端
- 隐藏侧边栏
- 显示顶部栏（包含 Logo、菜单按钮、状态指示）
- 点击菜单按钮展开下拉菜单

### 5.3 网格布局

#### 关键指标
```tsx
className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
```
- 移动端: 1 列
- 小屏幕 (sm): 2 列
- 大屏幕 (lg): 4 列

#### 主卡片网格
```tsx
className="grid gap-6 lg:grid-cols-3"
```
- 移动端: 1 列
- 大屏幕 (lg): 3 列

## 六、技术实现

### 6.1 依赖项

```json
{
  "framer-motion": "^12.30.1",
  "recharts": "^2.15.4",
  "lucide-react": "^0.468.0"
}
```

### 6.2 组件结构

```tsx
'use client';  // 使用客户端组件以支持交互

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from 'recharts';
```

### 6.3 状态管理

```tsx
const [activeItem, setActiveItem] = useState('revenue');
const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
const [capital, setCapital] = useState(10570);
```

### 6.4 性能优化

#### 使用 `ResponsiveContainer`
- 确保图表在不同屏幕尺寸下自适应

#### 使用 `AnimatePresence`
- 优化移动端菜单的进入/退出动画

#### 使用 `layoutId`
- 优化指示条动画的性能

## 七、设计亮点

### 7.1 视觉层次
- 清晰的颜色层次（霓虹色 + 中性色）
- 清晰的文字层级（标题 > 数据 > 辅助）
- 清晰的空间层次（卡片 > 内部元素）

### 7.2 交互反馈
- 所有可交互元素都有悬浮效果
- 点击有缩放反馈
- 数据更新有动画效果

### 7.3 品牌一致性
- 统一的颜色系统
- 统一的圆角和阴影
- 统一的动效曲线

### 7.4 可访问性
- 高对比度的文字颜色
- 清晰的视觉反馈
- 响应式设计支持所有设备

## 八、文件位置

- **首页文件**: `src/app/page.tsx`
- **设计文档**: `REDESIGN_DOCUMENTATION.md`

## 九、后续优化建议

### 9.1 功能优化
1. **真实数据集成**: 替换模拟数据为真实 API 数据
2. **实时更新**: 使用 WebSocket 实现实时数据推送
3. **数据过滤**: 添加时间范围、策略类型等过滤选项
4. **导出功能**: 实现真正的数据导出功能

### 9.2 性能优化
1. **代码分割**: 将图表组件拆分为独立的组件
2. **懒加载**: 对图表组件使用动态导入
3. **虚拟滚动**: 对长列表使用虚拟滚动
4. **缓存优化**: 使用 React Query 进行数据缓存

### 9.3 体验优化
1. **加载状态**: 添加骨架屏
2. **错误处理**: 添加错误边界和重试机制
3. **空状态**: 添加无数据时的空状态提示
4. **引导提示**: 添加首次使用的引导提示

---

**设计完成时间**: 2026-02-03
**设计风格**: 深色主题 SaaS 数据仪表盘
**技术栈**: Next.js 16 + Framer Motion + Recharts + Tailwind CSS
