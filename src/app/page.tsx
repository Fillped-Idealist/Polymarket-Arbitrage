'use client';

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
import {
  Activity,
  TrendingUp,
  DollarSign,
  Target,
  Zap,
  Clock,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Menu,
  X,
} from 'lucide-react';

// 模拟数据
const dailyPnLData = [
  { day: 'Mon', value: 120, type: 'win' },
  { day: 'Tue', value: -80, type: 'loss' },
  { day: 'Wed', value: 210, type: 'win' },
  { day: 'Thu', value: -150, type: 'loss' },
  { day: 'Fri', value: 350, type: 'win' },
  { day: 'Sat', value: 180, type: 'win' },
  { day: 'Sun', value: -60, type: 'loss' },
];

const capitalChangeData = [
  { date: '1/1', value: 10000 },
  { date: '1/2', value: 10120 },
  { date: '1/3', value: 10040 },
  { date: '1/4', value: 10250 },
  { date: '1/5', value: 10100 },
  { date: '1/6', value: 10450 },
  { date: '1/7', value: 10630 },
  { date: '1/8', value: 10570 },
];

const closeReasonData = [
  { name: '止盈', value: 45, color: '#10B981' },
  { name: '止损', value: 25, color: '#EF4444' },
  { name: '强制平仓', value: 20, color: '#F59E0B' },
  { name: '市场归零', value: 10, color: '#8B5CF6' },
];

const positionDetails = [
  { name: 'Bitcoin Price', entryPrice: 0.52, currentPrice: 0.78, pnl: '+50%', type: 'win' },
  { name: 'Ethereum ETF', entryPrice: 0.35, currentPrice: 0.42, pnl: '+20%', type: 'win' },
  { name: 'US Election', entryPrice: 0.15, currentPrice: 0.08, pnl: '-46.7%', type: 'loss' },
  { name: 'Tech Giants', entryPrice: 0.88, currentPrice: 0.92, pnl: '+4.5%', type: 'win' },
];

const currentPositions = [
  { name: 'Crypto Regulation', amount: 1800, profit: 156.4, profitPercent: '+8.7%' },
  { name: 'AI Breakthrough', amount: 2500, profit: -62.5, profitPercent: '-2.5%' },
  { name: 'Climate Goals', amount: 1500, profit: 89.3, profitPercent: '+5.9%' },
  { name: 'Space Mission', amount: 3200, profit: 192.0, profitPercent: '+6.0%' },
  { name: 'Economic Growth', amount: 2100, profit: 31.5, profitPercent: '+1.5%' },
];

const closeDetails = [
  { reason: '止盈', profit: '+12.5%', count: 45 },
  { reason: '止损', profit: '-3.2%', count: 25 },
  { reason: '强制平仓', profit: '+1.8%', count: 20 },
  { reason: '市场归零', profit: '-100%', count: 10 },
];

const sidebarItems = [
  { id: 'overview', label: 'Dashboard', icon: Activity, path: '/' },
  { id: 'live-trading', label: 'Live Trading', icon: Target, path: '/live-trading-v2' },
  { id: 'backtest', label: 'Backtest', icon: TrendingUp, path: '/backtest' },
  { id: 'settings', label: 'Settings', icon: Zap, path: '/dashboard' },
];

// 动画配置
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
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
      ease: [0.4, 0, 0.2, 1] as any,
    },
  },
};

export default function Home() {
  const [activeItem, setActiveItem] = useState('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [capital, setCapital] = useState(10570);

  // 数字滚动动画
  useEffect(() => {
    const interval = setInterval(() => {
      setCapital((prev) => {
        const change = (Math.random() - 0.5) * 50;
        return Math.max(10000, prev + change);
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100">
      {/* 侧边栏 */}
      <motion.aside
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed left-0 top-0 z-50 hidden h-screen w-[200px] border-r border-slate-800/50 bg-[#0F172A]/95 backdrop-blur-sm lg:block"
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="border-b border-slate-800/50 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#8B5CF6] shadow-lg shadow-[#06B6D4]/20">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-sm text-white">Polymarket</h1>
                <p className="text-[9px] text-slate-400">Arbitrage System</p>
              </div>
            </div>
          </div>

          {/* 导航菜单 */}
          <nav className="flex-1 overflow-y-auto px-3 py-2">
            <ul className="space-y-0.5">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeItem === item.id;

                return (
                  <li key={item.id}>
                    <Link
                      href={item.path}
                      onClick={() => setActiveItem(item.id)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-300 ${
                        isActive
                          ? 'bg-[#1E293B] text-[#06B6D4] shadow-lg shadow-[#06B6D4]/10'
                          : 'text-slate-400 hover:bg-[#1E293B]/50 hover:text-slate-100'
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeIndicator"
                          className="absolute left-0 h-6 w-0.5 rounded-r-full bg-[#06B6D4]"
                          initial={false}
                          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        />
                      )}
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* 底部状态 */}
          <div className="border-t border-slate-800/50 p-3">
            <div className="flex items-center gap-2 rounded-lg bg-[#1E293B]/30 px-3 py-2">
              <div className="flex h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
              <div className="flex-1">
                <p className="text-[9px] text-slate-400">Status</p>
                <p className="text-[10px] font-medium text-[#10B981]">Live</p>
              </div>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* 移动端顶部栏 */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 border-b border-slate-800/50 bg-[#0F172A]/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMobileMenu}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1E293B]/50 hover:text-slate-100"
            >
              {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#8B5CF6]">
                <Activity className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-bold text-sm text-white">Analytics Pro</span>
            </div>
          </div>
          <div className="flex h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
        </div>

        {/* 移动端菜单 */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-slate-800/50 bg-[#0F172A] px-4 py-2"
            >
              <ul className="space-y-0.5">
                {sidebarItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeItem === item.id;

                  return (
                    <li key={item.id}>
                      <Link
                        href={item.path}
                        onClick={() => {
                          setActiveItem(item.id);
                          setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-300 ${
                          isActive
                            ? 'bg-[#1E293B] text-[#06B6D4]'
                            : 'text-slate-400 hover:bg-[#1E293B]/50 hover:text-slate-100'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 主内容区 */}
      <main className="lg:ml-[200px] min-h-screen">
        {/* 顶部栏 */}
        <div className="hidden lg:flex items-center justify-between border-b border-slate-800/50 bg-[#0F172A]/95 backdrop-blur-sm px-6 py-3">
          <div>
            <h2 className="text-lg font-bold text-white">Revenue Dashboard</h2>
            <p className="text-xs text-slate-400">Real-time trading analytics and performance metrics</p>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="rounded-lg border border-slate-700/50 bg-[#1E293B]/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-[#2D3F57]"
            >
              <span className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                Last updated: 2 min ago
              </span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="rounded-lg bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-[#06B6D4]/20 transition-all hover:shadow-[#06B6D4]/30"
            >
              Export Report
            </motion.button>
          </div>
        </div>

        {/* 内容区域 */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="p-4 lg:p-8 pt-20 lg:pt-8"
        >
          {/* 关键指标 */}
          <motion.div
            variants={itemVariants}
            className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {[
              { label: 'Total Capital', value: `$${capital.toLocaleString()}`, change: '+5.7%', trend: 'up', color: '[#06B6D4]' },
              { label: 'Daily P&L', value: '+$234', change: '+12.3%', trend: 'up', color: '[#10B981]' },
              { label: 'Active Positions', value: '5', change: 'Max 5', trend: 'neutral', color: '[#8B5CF6]' },
              { label: 'Win Rate', value: '85%', change: '+2.1%', trend: 'up', color: '[#F59E0B]' },
            ].map((metric, index) => (
              <motion.div
                key={index}
                whileHover={{ scale: 1.02, y: -4 }}
                className="rounded-xl border border-slate-800/50 bg-[#1E293B]/40 p-4 shadow-xl shadow-black/20 backdrop-blur-sm"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] text-slate-400">{metric.label}</p>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-${metric.color}/10`}>
                    {metric.trend === 'up' ? (
                      <ArrowUp className={`h-3.5 w-3.5 text-${metric.color}`} />
                    ) : (
                      <ArrowDown className={`h-3.5 w-3.5 text-${metric.color}`} />
                    )}
                  </div>
                </div>
                <p className="mb-1 text-lg font-bold text-white">{metric.value}</p>
                <p className={`text-[10px] font-medium ${
                  metric.trend === 'up' ? 'text-[#10B981]' : 'text-slate-400'
                }`}>
                  {metric.change}
                </p>
              </motion.div>
            ))}
          </motion.div>

          {/* 主卡片网格 */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* 仓位明细卡片 */}
            <motion.div
              variants={itemVariants}
              className="rounded-xl border border-slate-800/50 bg-[#1E293B]/40 shadow-xl shadow-black/20 backdrop-blur-sm"
            >
              <div className="border-b border-slate-800/50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Position Details</h3>
                    <p className="text-[10px] text-slate-400">Daily P&L breakdown</p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="rounded-md bg-[#06B6D4]/10 px-2 py-1 text-[10px] font-medium text-[#06B6D4] hover:bg-[#06B6D4]/20"
                  >
                    View All
                  </motion.button>
                </div>
              </div>

              <div className="p-4">
                {/* 柱状图 */}
                <div className="mb-4 h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyPnLData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="day" stroke="#64748B" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis stroke="#64748B" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1E293B',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#F1F5F9',
                          fontSize: 11,
                          padding: '8px',
                        }}
                        itemStyle={{ color: '#F1F5F9' }}
                      />
                      <Bar
                        dataKey="value"
                        radius={[3, 3, 0, 0]}
                      >
                        {dailyPnLData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.type === 'win' ? '#10B981' : '#EF4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 仓位列表 */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-semibold text-slate-300">Recent Positions</h4>
                  {positionDetails.slice(0, 3).map((position, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.02, x: 4 }}
                      className="flex items-center justify-between rounded-lg border border-slate-800/50 bg-[#0F172A]/40 p-3 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{position.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {position.entryPrice} → {position.currentPrice}
                        </p>
                      </div>
                      <div
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold ml-2 ${
                          position.type === 'win' ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#EF4444]/10 text-[#EF4444]'
                        }`}
                      >
                        {position.pnl}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* 统计摘要 */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-[#0F172A]/40 p-2 border border-slate-800/50">
                    <p className="text-[10px] text-slate-400">Best</p>
                    <p className="text-sm font-bold text-[#10B981]">+50%</p>
                  </div>
                  <div className="rounded-lg bg-[#0F172A]/40 p-2 border border-slate-800/50">
                    <p className="text-[10px] text-slate-400">Worst</p>
                    <p className="text-sm font-bold text-[#EF4444]">-46.7%</p>
                  </div>
                  <div className="rounded-lg bg-[#0F172A]/40 p-2 border border-slate-800/50">
                    <p className="text-[10px] text-slate-400">Avg Win</p>
                    <p className="text-sm font-bold text-[#10B981]">+24.8%</p>
                  </div>
                  <div className="rounded-lg bg-[#0F172A]/40 p-2 border border-slate-800/50">
                    <p className="text-[10px] text-slate-400">Avg Loss</p>
                    <p className="text-sm font-bold text-[#EF4444]">-21.5%</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* 资金变化卡片 */}
            <motion.div
              variants={itemVariants}
              className="rounded-xl border border-slate-800/50 bg-[#1E293B]/40 shadow-xl shadow-black/20 backdrop-blur-sm"
            >
              <div className="border-b border-slate-800/50 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Capital Changes</h3>
                  <p className="text-[10px] text-slate-400">Fund evolution over time</p>
                </div>
              </div>

              <div className="p-4">
                {/* 资金曲线图 */}
                <div className="mb-4 h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={capitalChangeData}>
                      <defs>
                        <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748B" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis stroke="#64748B" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1E293B',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#F1F5F9',
                          fontSize: 11,
                          padding: '8px',
                        }}
                        itemStyle={{ color: '#F1F5F9' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#06B6D4"
                        strokeWidth={1.5}
                        fill="url(#colorGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* 当前持仓 */}
                <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Current Positions</h4>
                <div className="space-y-2">
                  {currentPositions.slice(0, 4).map((position, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.02, y: -2 }}
                      className="flex items-center justify-between rounded-lg border border-slate-800/50 bg-[#0F172A]/40 p-3 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{position.name}</p>
                        <p className="text-[10px] text-slate-400">
                          ${position.amount.toLocaleString()}
                        </p>
                      </div>
                      <div
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold ml-2 ${
                          position.profitPercent.startsWith('+')
                            ? 'bg-[#10B981]/10 text-[#10B981]'
                            : 'bg-[#EF4444]/10 text-[#EF4444]'
                        }`}
                      >
                        {position.profitPercent}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* 平仓明细卡片 */}
            <motion.div
              variants={itemVariants}
              className="rounded-xl border border-slate-800/50 bg-[#1E293B]/40 shadow-xl shadow-black/20 backdrop-blur-sm"
            >
              <div className="border-b border-slate-800/50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Exit Analysis</h3>
                    <p className="text-[10px] text-slate-400">Position closure breakdown</p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="rounded-md bg-[#8B5CF6]/10 px-2 py-1 text-[10px] font-medium text-[#8B5CF6] hover:bg-[#8B5CF6]/20"
                  >
                    View Details
                  </motion.button>
                </div>
              </div>

              <div className="p-4">
                {/* 环形图 */}
                <div className="mb-4 h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={closeReasonData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {closeReasonData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1E293B',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#F1F5F9',
                          fontSize: 11,
                          padding: '8px',
                        }}
                        itemStyle={{ color: '#F1F5F9' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* 平仓明细列表 */}
                <div className="space-y-2">
                  <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Exit Details</h4>
                  {closeDetails.map((detail, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.02, x: -4 }}
                      className="flex items-center justify-between rounded-lg border border-slate-800/50 bg-[#0F172A]/40 p-3 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: detail.reason === '止盈' ? '#10B981' : detail.reason === '止损' ? '#EF4444' : detail.reason === '强制平仓' ? '#F59E0B' : '#8B5CF6' }}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate">{detail.reason}</p>
                          <p className="text-[10px] text-slate-400">{detail.count} positions</p>
                        </div>
                      </div>
                      <div
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold ml-2 ${
                          detail.profit.startsWith('+')
                            ? 'bg-[#10B981]/10 text-[#10B981]'
                            : 'bg-[#EF4444]/10 text-[#EF4444]'
                        }`}
                      >
                        {detail.profit}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* 统计摘要 */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-[#0F172A]/40 p-2 border border-slate-800/50 text-center">
                    <p className="text-lg font-bold text-white">100</p>
                    <p className="text-[10px] text-slate-400">Total</p>
                  </div>
                  <div className="rounded-lg bg-[#0F172A]/40 p-2 border border-slate-800/50 text-center">
                    <p className="text-lg font-bold text-[#10B981]">60%</p>
                    <p className="text-[10px] text-slate-400">Win Rate</p>
                  </div>
                  <div className="rounded-lg bg-[#0F172A]/40 p-2 border border-slate-800/50 text-center">
                    <p className="text-lg font-bold text-[#06B6D4]">+9.2%</p>
                    <p className="text-[10px] text-slate-400">Avg Return</p>
                  </div>
                  <div className="rounded-lg bg-[#0F172A]/40 p-2 border border-slate-800/50 text-center">
                    <p className="text-lg font-bold text-[#8B5CF6]">2.4</p>
                    <p className="text-[10px] text-slate-400">Sharpe</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* 快速操作 */}
          <motion.div variants={itemVariants} className="mt-4 flex gap-3">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex-1 rounded-xl border border-slate-800/50 bg-[#1E293B]/40 p-3 text-left transition-all hover:bg-[#1E293B]/60 cursor-pointer"
            >
              <Link href="/live-trading" className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#06B6D4]/10">
                  <Zap className="h-5 w-5 text-[#06B6D4]" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-white">Start Live Trading</h4>
                  <p className="text-[11px] text-slate-400">Launch real-time automated trading</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </Link>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex-1 rounded-xl border border-slate-800/50 bg-[#1E293B]/40 p-3 text-left transition-all hover:bg-[#1E293B]/60 cursor-pointer"
            >
              <Link href="/backtest" className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#8B5CF6]/10">
                  <TrendingUp className="h-5 w-5 text-[#8B5CF6]" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-white">Run Backtest</h4>
                  <p className="text-[11px] text-slate-400">Test strategies with historical data</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
