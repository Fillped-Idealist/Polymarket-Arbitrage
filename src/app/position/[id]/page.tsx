'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMemo } from 'react';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Zap,
  Activity,
  Target,
  RefreshCw,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface PriceData {
  timestamp: Date;
  price: number;
}

interface PriceHistoryResponse {
  success: boolean;
  data: {
    tokenId: string;
    entryPrice: number | null;
    history: PriceData[];
    totalPoints: number;
    sampledPoints: number;
  };
  message?: string;
}

// 侧边栏菜单项
const sidebarItems = [
  { id: 'overview', label: 'Overview', icon: Activity, path: '/' },
  { id: 'live-trading', label: 'Live Trading', icon: Target, path: '/live-trading-v2' },
  { id: 'backtest', label: 'Backtest', icon: TrendingUp, path: '/backtest' },
  { id: 'dashboard', label: 'Dashboard', icon: Zap, path: '/dashboard' },
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
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1] as any,
    },
  },
};

export default function PositionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const positionId = params.id as string;

  // --- 增加挂载状态检测 ---
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);
  

  // 从 URL 获取持仓信息（实际应用中应该从数据库或 API 获取）
  const query = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const positionData = {
    id: positionId,
    // 文本类
    question: isMounted ? (query.get('question') || 'Unknown Question') : 'Unknown Position',
    outcome: isMounted ? (query.get('outcome') || 'Unknown Outcome') : 'Unknown Outcome',
    tokenId: isMounted ? (query.get('tokenId') || '') : '',
    
    // 数值类： parseFloat 绝不能传入 "Loading" 字符串，必须确保是数字字符串或 '0'
    entryPrice: parseFloat((isMounted ? query.get('entryPrice') : '0') || '0'),
    currentPrice: parseFloat((isMounted ? query.get('currentPrice') : '0') || '0'),
    positionSize: parseFloat((isMounted ? query.get('positionSize') : '0') || '0'),
    
    // 时间类
    entryTime: isMounted ? (query.get('entryTime') || '') : '',
    
    // 基础参数（直接使用 query.get 没问题，因为它们通常有确定的 fallback）
    strategy: (query.get('strategy') || 'reversal') as 'reversal' | 'convergence' | 'arbitrage',
    status: (query.get('status') || 'active') as 'active' | 'closed' | 'pending',
    volume: parseFloat(query.get('volume') || '0'),
    liquidity: parseFloat(query.get('liquidity') || '0'),
    endDate: query.get('endDate') || '',
    bidPrice: parseFloat(query.get('bidPrice') || '0'),
    askPrice: parseFloat(query.get('askPrice') || '0'),
  };


  const [priceHistory, setPriceHistory] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [activeItem, setActiveItem] = useState('settings');
  const [showPostEntryOnly, setShowPostEntryOnly] = useState(false);


  // 计算持仓数据
  const entryValue = positionData.positionSize * positionData.entryPrice;
  const currentValue = positionData.positionSize * positionData.currentPrice;
  const pnl = currentValue - entryValue;
  const pnlPercent = entryValue > 0 ? (pnl / entryValue) * 100 : 0;

  // 获取策略颜色
  const getStrategyColor = (strategy: string) => {
    switch (strategy) {
      case 'reversal':
        return 'border-purple-500/50 text-purple-300 bg-purple-500/10';
      case 'convergence':
        return 'border-blue-500/50 text-blue-300 bg-blue-500/10';
      case 'arbitrage':
        return 'border-orange-500/50 text-orange-300 bg-orange-500/10';
      default:
        return 'border-slate-500/50 text-slate-300 bg-slate-500/10';
    }
  };

  // 动态过滤历史数据
  const filteredHistory = useMemo(() => {
    if (!showPostEntryOnly || !positionData.entryTime) {
        return priceHistory;
    }
    // 将 ISO 字符串或日期字符串转为秒级时间戳进行对比
    const entryTs = Math.floor(new Date(positionData.entryTime).getTime() / 1000);
    // 只保留时间戳大于等于买入时间的数据点
    return priceHistory.filter(point => Number(point.timestamp) >= entryTs);
  }, [priceHistory, showPostEntryOnly, positionData.entryTime]);


  // 获取历史价格数据
  const fetchPriceHistory = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      if (!positionData.tokenId) {
        return;
      }

      // 计算开始时间：比买入时间早 10 分钟
      let startTs: number | null = 0;
      if (positionData.entryTime) {
        const entryDate = new Date(positionData.entryTime);
        const startDate = new Date(entryDate.getTime() - 10 * 60 * 1000); // 10 分钟前
        startTs = Math.floor(startDate.getTime() / 1000);
      }

      // 构建请求参数
      const queryParams = new URLSearchParams({
        positionId: positionData.tokenId,
        interval: 'max',
        fidelity: '1',
      });

      if (showPostEntryOnly && startTs > 0) {
            queryParams.append('startTs', startTs.toString());
      }

      const response = await fetch(`/api/position/history?${queryParams.toString()}`);

      const result: PriceHistoryResponse = await response.json();

      if (result.success && result.data) {
        setPriceHistory(result.data.history);
        setLastUpdate(new Date());
      } else {
        setError(result.message || 'Failed to fetch price history');
      }
    } catch (err) {
      console.error('Failed to fetch price history:', err);
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [positionData.tokenId, positionData.entryTime, positionData.entryPrice, showPostEntryOnly]);

  // 初次加载数据
  useEffect(() => {
    fetchPriceHistory();
  }, [fetchPriceHistory]);

  // 自动更新（每 300 秒）
  useEffect(() => {
    if (positionData.status === 'active') {
      const interval = setInterval(() => {
        fetchPriceHistory(true);
      }, 300000);

      return () => clearInterval(interval);
    }
  }, [positionData.status, fetchPriceHistory]);

  // 格式化日期
  // 格式化时间戳 (用于 Chart X轴)
  // 增加 timeZone 参数确保东八区
  const formatXAxisDate = (timestamp: any) => {
    const date = new Date(Number(timestamp) * 1000); // 确保乘 1000
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Shanghai' 
    });
  };

  // 格式化完整日期 (用于 Tooltip 和 详情卡片)
  const formatDate = (dateStr: string | number) => {
    if (!dateStr) return '-';
    try {
      // 判断是秒还是毫秒，如果是秒则转为毫秒
      const ts = typeof dateStr === 'number' && dateStr < 10000000000 ? dateStr * 1000 : dateStr;
      const date = new Date(ts);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Shanghai'
      });
    } catch {
      return String(dateStr);
    }
  };

  // 格式化价格
  const formatPrice = (price: number) => {
    return `${(price * 100).toFixed(2)}%`;
  };

  // 格式化金额
  const formatCurrency = (value: number) => {
    return `$${value.toFixed(2)}`;
  };

  // 格式化时间戳
  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };
  
  if (!isMounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0f1a]">
        <Loader2 className="h-8 w-8 animate-spin text-[#06B6D4]" />
      </div>
    );
  }
 
  return (
    <div className="min-h-screen bg-[#0a0f1a] text-slate-100">
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
                      className={`relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-300 ${
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


      {/* Main Content */}
      <main className="lg:ml-[200px] min-h-screen">
        {/* Top Bar */}
        <div className="sticky top-0 z-40 bg-[#0a0f1a]/95 backdrop-blur-sm border-b border-slate-700/50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" className="text-slate-300 hover:text-slate-100">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-lg font-bold text-white">Position Details</h1>
                <p className="text-xs text-slate-400">Detailed view of your position</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdate && (
                <span className="text-[11px] text-slate-400">
                  Last update: {formatTimestamp(lastUpdate)}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchPriceHistory(true)}
                disabled={refreshing}
                className="border-slate-600/50 hover:bg-[#1e293b]/60"
              >
                {refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="p-4 lg:p-6"
        >

          {/* Position Header */}
          <motion.div variants={itemVariants} className="mb-6">
            <Card className="rounded-xl border border-slate-700/50 bg-[#1e293b]/60 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className={`${getStrategyColor(positionData.strategy)} text-[10px] px-2 py-0.5`}>
                        {positionData.strategy}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          positionData.status === 'active'
                            ? 'bg-[#10B981]/20 text-[#10B981] border-[#10B981]/30 text-[10px] px-2 py-0.5'
                            : 'bg-slate-700/30 text-slate-400 border-slate-600/30 text-[10px] px-2 py-0.5'
                        }
                      >
                        {positionData.status}
                      </Badge>
                    </div>
                    <CardTitle className="text-white text-base mb-1">{positionData.question}</CardTitle>
                    <CardDescription className="text-slate-400 text-xs">
                      Outcome: {positionData.outcome}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">{formatPrice(positionData.currentPrice)}</p>
                    <p className={`text-sm font-medium ${pnl >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
                      {pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </motion.div>

          {/* Key Metrics */}
          <motion.div variants={itemVariants} className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <motion.div whileHover={{ scale: 1.02, y: -4 }} className="rounded-xl border border-slate-700/50 bg-[#1e293b]/60 p-4 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-slate-400">Entry Price</p>
                <DollarSign className="h-5 w-5 text-[#06B6D4]" />
              </div>
              <p className="text-lg font-bold text-white">{formatPrice(positionData.entryPrice)}</p>
            </motion.div>

            <motion.div whileHover={{ scale: 1.02, y: -4 }} className="rounded-xl border border-slate-700/50 bg-[#1e293b]/60 p-4 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-slate-400">Position Size</p>
                <Target className="h-5 w-5 text-[#8B5CF6]" />
              </div>
              <p className="text-lg font-bold text-white">{positionData.positionSize.toFixed(2)}</p>
            </motion.div>

            <motion.div whileHover={{ scale: 1.02, y: -4 }} className="rounded-xl border border-slate-700/50 bg-[#1e293b]/60 p-4 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-slate-400">P&L</p>
                {pnl >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-[#10B981]" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-400" />
                )}
              </div>
              <p className={`text-lg font-bold ${pnl >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
                {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
              </p>
            </motion.div>

            <motion.div whileHover={{ scale: 1.02, y: -4 }} className="rounded-xl border border-slate-700/50 bg-[#1e293b]/60 p-4 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-slate-400">Current Value</p>
                <Activity className="h-5 w-5 text-[#F59E0B]" />
              </div>
              <p className="text-lg font-bold text-white">{formatCurrency(currentValue)}</p>
            </motion.div>
          </motion.div>

          {/* Price History Chart */}
          <motion.div variants={itemVariants} className="mb-6">
            <Card className="rounded-xl border border-slate-700/50 bg-[#1e293b]/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white text-sm">Price History</CardTitle>
                <CardDescription className="text-slate-400 text-[10px]">
                  Historical price data with entry price reference line
                </CardDescription>
                {/* 新增切换按钮 */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPostEntryOnly(!showPostEntryOnly)}
                    className={`text-[11px] border-slate-600/50 ${
                    showPostEntryOnly ? 'bg-[#06B6D4]/20 text-[#06B6D4] border-[#06B6D4]/50' : 'hover:bg-[#1e293b]/60'
                    }`}
                >
                    <Clock className="mr-1.5 h-3 w-3" />
                    {showPostEntryOnly ? "Show All" : "After Entry Only"}
                </Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center h-80">
                    <Loader2 className="h-8 w-8 animate-spin text-[#06B6D4]" />
                  </div>
                ) : filteredHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={filteredHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="timestamp" // 假设后端传回的是 t (秒级时间戳)
                        tickFormatter={formatXAxisDate} // 使用上面新定义的秒级转换函数
                        stroke="#64748b"
                        fontSize={11}
                        tick={{ fill: '#94a3b8' }}
                      />
                      <YAxis
                        domain={['dataMin - 0.01', 'dataMax + 0.01']} 
                        tickFormatter={(value) => `${(value * 100).toFixed(1)}%`}
                        stroke="#64748b"
                        fontSize={11}
                        tick={{ fill: '#94a3b8' }}
                        // 允许轴根据数据变化
                        allowDataOverflow={false} 
                      />
                      <Tooltip
                        contentStyle={{
                            backgroundColor: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                        }}
                        labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                        itemStyle={{ color: '#fff', fontSize: 11 }}
                        // Tooltip 里的 Label 也要乘 1000
                        labelFormatter={(value) => formatDate(value)} 
                        formatter={(value: number) => [(value * 100).toFixed(2) + '%', 'Price']}
                      />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke="#06B6D4"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: '#06B6D4' }}
                      />
                      <ReferenceLine
                        y={positionData.entryPrice}
                        stroke="#F59E0B"
                        strokeDasharray="3 3"
                        strokeWidth={2}
                        label={{
                          value: `Entry: ${formatPrice(positionData.entryPrice)}`,
                          position: 'top',
                          fill: '#F59E0B',
                          fontSize: 10,
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-80 text-slate-400">
                    <Activity className="h-12 w-12 mb-4 opacity-50" />
                    <p className="text-sm">No price history data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Detailed Information */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Order Book */}
            <Card className="rounded-xl border border-slate-700/50 bg-[#1e293b]/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white text-sm">Order Book</CardTitle>
                <CardDescription className="text-slate-400 text-[10px]">Current bid and ask prices</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a0f1a]/40 border border-slate-700/30">
                    <div>
                      <p className="text-[11px] text-slate-400">Best Bid</p>
                      <p className="text-lg font-bold text-[#10B981]">{formatPrice(positionData.bidPrice)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500">Buy Order</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a0f1a]/40 border border-slate-700/30">
                    <div>
                      <p className="text-[11px] text-slate-400">Best Ask</p>
                      <p className="text-lg font-bold text-red-400">{formatPrice(positionData.askPrice)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500">Sell Order</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Market Info */}
            <Card className="rounded-xl border border-slate-700/50 bg-[#1e293b]/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white text-sm">Market Information</CardTitle>
                <CardDescription className="text-slate-400 text-[10px]">Market details and liquidity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a0f1a]/40 border border-slate-700/30">
                    <div>
                      <p className="text-[11px] text-slate-400">Volume</p>
                      <p className="text-lg font-bold text-white">{formatCurrency(positionData.volume)}</p>
                    </div>
                    <Activity className="h-5 w-5 text-[#06B6D4]" />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a0f1a]/40 border border-slate-700/30">
                    <div>
                      <p className="text-[11px] text-slate-400">Liquidity</p>
                      <p className="text-lg font-bold text-white">{formatCurrency(positionData.liquidity)}</p>
                    </div>
                    <DollarSign className="h-5 w-5 text-[#8B5CF6]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-[#0a0f1a]/40 border border-slate-700/30">
                      <p className="text-[10px] text-slate-400 mb-1">Entry Time</p>
                      <p className="text-xs text-white font-medium">{formatDate(positionData.entryTime)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-[#0a0f1a]/40 border border-slate-700/30">
                      <p className="text-[10px] text-slate-400 mb-1">End Date</p>
                      <p className="text-xs text-white font-medium">{formatDate(positionData.endDate)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Position Summary */}
          <motion.div variants={itemVariants} className="mt-6">
            <Card className="rounded-xl border border-slate-700/50 bg-[#1e293b]/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white text-sm">Position Summary</CardTitle>
                <CardDescription className="text-slate-400 text-[10px]">Complete position breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-[#0a0f1a]/40 border border-slate-700/30">
                    <p className="text-[10px] text-slate-400 mb-1">Entry Value</p>
                    <p className="text-sm text-white font-bold">{formatCurrency(entryValue)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0a0f1a]/40 border border-slate-700/30">
                    <p className="text-[10px] text-slate-400 mb-1">Current Value</p>
                    <p className="text-sm text-white font-bold">{formatCurrency(currentValue)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0a0f1a]/40 border border-slate-700/30">
                    <p className="text-[10px] text-slate-400 mb-1">P&L</p>
                    <p className={`text-sm font-bold ${pnl >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
                      {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                    </p>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-[#0a0f1a]/40 border border-slate-700/30">
                    <p className="text-[10px] text-slate-400 mb-1">Entry Price</p>
                    <p className="text-sm text-white font-bold">{formatPrice(positionData.entryPrice)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0a0f1a]/40 border border-slate-700/30">
                    <p className="text-[10px] text-slate-400 mb-1">Current Price</p>
                    <p className="text-sm text-white font-bold">{formatPrice(positionData.currentPrice)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0a0f1a]/40 border border-slate-700/30">
                    <p className="text-[10px] text-slate-400 mb-1">P&L %</p>
                    <p className={`text-sm font-bold ${pnlPercent >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
                      {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
