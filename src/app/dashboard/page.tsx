'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useRouter } from 'next/navigation';
import { candidateManager, Candidate } from '../../lib/polymarket/candidate-manager-v2';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  TrendingUp,
  ArrowLeftRight,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Target,
  Shield,
  Activity,
  Zap,
  Menu,
  X,
  Settings,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';

interface CandidatePosition {
  marketId: string;
  question: string;
  outcome: string;
  price: number;
  probability: number;
  volume: number;
  liquidity: number;
  endDate: string;
  strategy: 'convergence' | 'arbitrage' | 'reversal';
  score: number;
  expectedReturn: number;
  riskScore: number;
}

interface Position {
  id: string;
  outcome_id: string;
  marketId: string;
  question: string;
  outcome: string;
  entryPrice: number;
  currentPrice: number;
  positionSize: number;
  pnl: number;
  pnlPercent: number;
  strategy: 'convergence' | 'arbitrage' | 'reversal';
  entryTime: string;
  status: 'active' | 'closed' | 'pending';
  stopLoss?: number;
  takeProfit?: number;
  riskScore: number;
  expectedReturn: number;
  volume?: number;
  liquidity?: number;
  endDate?: string;
}

interface PortfolioMetrics {
  totalPositions: number;
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  strategyDistribution: {
    convergence: number;
    arbitrage: number;
    reversal: number;
  };
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
      duration: 0.5,
      ease: [0.4, 0, 0.2, 1] as any,
    },
  },
};

export default function DashboardPage() {
  const [activeItem, setActiveItem] = useState('settings');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [candidates, setCandidates] = useState<CandidatePosition[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [portfolioMetrics, setPortfolioMetrics] = useState<PortfolioMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState<'convergence' | 'arbitrage' | 'reversal' | 'all'>('all');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  const router = useRouter();

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const getStrategyColor = (strategy: string) => {
    switch (strategy) {
      case 'convergence':
        return 'bg-blue-500';
      case 'arbitrage':
        return 'bg-green-500';
      case 'reversal':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStrategyBadgeColor = (strategy: string) => {
    switch (strategy) {
      case 'convergence':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'arbitrage':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'reversal':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const getStrategyIcon = (strategy: string) => {
    switch (strategy) {
      case 'convergence':
        return TrendingUp;
      case 'arbitrage':
        return ArrowLeftRight;
      case 'reversal':
        return Activity;
      default:
        return TrendingUp;
    }
  };

  const getStrategyName = (strategy: string) => {
    switch (strategy) {
      case 'convergence':
        return 'Convergence';
      case 'arbitrage':
        return 'Arbitrage';
      case 'reversal':
        return 'Reversal';
      default:
        return strategy;
    }
  };

  const fetchCandidates = async () => {
    try {
      const url = selectedStrategy === 'all'
        ? '/api/markets'
        : `/api/markets?strategy=${selectedStrategy}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setCandidates(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch candidates:', error);
    }
  };

  const fetchPositions = async () => {
    try {
      const response = await fetch('/api/positions');
      const data = await response.json();

      if (data.success) {
        setPositions(data.data);
        setPortfolioMetrics(data.portfolioMetrics);
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
    }
  };

  const openPosition = async (candidate: CandidatePosition) => {
    try {
      const response = await fetch('/api/positions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          marketId: candidate.marketId,
          question: candidate.question,
          outcome: candidate.outcome,
          price: candidate.price,
          strategy: candidate.strategy,
          riskScore: candidate.riskScore,
          expectedReturn: candidate.expectedReturn,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert('Position opened successfully!');
        await fetchPositions();
        await fetchCandidates();
      } else {
        alert(`Failed to open position: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to open position:', error);
      alert('Failed to open position, please try again');
    }
  };

  const closePosition = async (positionId: string) => {
    try {
      const response = await fetch(`/api/positions?id=${positionId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        alert('Position closed successfully!');
        await fetchPositions();
      } else {
        alert(`Failed to close position: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to close position:', error);
      alert('Failed to close position, please try again');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchCandidates(), fetchPositions()]);
      setLastUpdateTime(new Date());
      setLoading(false);
    };

    loadData();

    // Refresh data every 30 seconds
    const interval = setInterval(() => {
      fetchCandidates();
      fetchPositions();
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedStrategy]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#06B6D4] border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-400 text-xs">Loading...</p>
        </div>
      </div>
    );
  }

  const totalCandidates = candidates.length;
  const highScoreCandidates = candidates.filter(c => c.score >= 7).length;
  

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
              <span className="font-bold text-sm text-white">Live Trading</span>
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

      {/* Main Content */}
      <main className="lg:ml-[200px] min-h-screen">
        {/* Top Bar */}
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
                {lastUpdateTime ? `Updated: ${lastUpdateTime.toLocaleTimeString()}` : 'Last updated: 2 min ago'}
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

        {/* Page Content */}
        <div className="p-4">
          {/* Portfolio Metrics */}
          {portfolioMetrics && (
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-[#1e293b]/60 backdrop-blur-xl border-slate-800/50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[12px]">Total Positions</CardDescription>
                  <CardTitle className="text-lg text-slate-200">{portfolioMetrics.totalPositions}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-[10px] text-slate-400">
                    <Target className="mr-2 h-3 w-3" />
                    Max 5 positions
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#1e293b]/60 backdrop-blur-xl border-slate-800/50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[12px]">Total Value</CardDescription>
                  <CardTitle className="text-lg text-slate-200">{formatCurrency(portfolioMetrics.totalValue)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-[10px] text-slate-400">
                    <DollarSign className="mr-2 h-3 w-3" />
                    Current position value
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#1e293b]/60 backdrop-blur-xl border-slate-800/50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[12px]">Total P&L</CardDescription>
                  <CardTitle className={`text-lg ${portfolioMetrics.totalPnl >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
                    {formatCurrency(portfolioMetrics.totalPnl)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-[10px] ${portfolioMetrics.totalPnlPercent >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
                    {formatPercent(portfolioMetrics.totalPnlPercent)}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#1e293b]/60 backdrop-blur-xl border-slate-800/50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[12px]">Strategy Distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center">
                        <div className="mr-2 h-2 w-2 rounded-full bg-[#06B6D4]"></div>
                        <span className="text-slate-400">Convergence</span>
                      </div>
                      <span className="font-medium text-[#06B6D4]">{portfolioMetrics.strategyDistribution.convergence}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center">
                        <div className="mr-2 h-2 w-2 rounded-full bg-[#10B981]"></div>
                        <span className="text-slate-400">Arbitrage</span>
                      </div>
                      <span className="font-medium text-[#06B6D4]">{portfolioMetrics.strategyDistribution.arbitrage}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center">
                        <div className="mr-2 h-2 w-2 rounded-full bg-[#8B5CF6]"></div>
                        <span className="text-slate-400">Reversal</span>
                      </div>
                      <span className="font-medium text-[#06B6D4]">{portfolioMetrics.strategyDistribution.reversal}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tabs */}
          <Tabs defaultValue="positions" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 bg-[#1e293b]/60 border border-slate-800/50">
              <TabsTrigger value="positions" className="text-[10px] text-slate-300 data-[state=active]:bg-[#06B6D4]/20 data-[state=active]:text-[#06B6D4]">
                Positions ({positions.filter(p => p.status === 'active').length})
              </TabsTrigger>
              <TabsTrigger value="candidates" className="text-[10px] text-slate-300 data-[state=active]:bg-[#06B6D4]/20 data-[state=active]:text-[#06B6D4]">
                Candidates ({totalCandidates})
              </TabsTrigger>
            </TabsList>

            {/* Positions Tab */}
            <TabsContent value="positions" className="space-y-4">
              <Card className="bg-[#1e293b]/60 backdrop-blur-xl border-slate-800/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-slate-400">Current Positions</CardTitle>
                  <CardDescription className="text-[10px] text-slate-400">
                    Active positions with real-time P&L monitoring
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {positions.length === 0 ? (
                    <div className="py-8 text-center">
                      <Clock className="mx-auto h-10 w-10 text-slate-600 mb-3" />
                      <h3 className="text-sm font-medium text-white mb-2">
                        No positions
                      </h3>
                      <p className="text-slate-400 text-[10px] mb-4">
                        Select opportunities from candidates to open positions
                      </p>
                      <Button
                        size="sm"
                        onClick={() => window.location.href = '#candidates'}
                        className="bg-[#06B6D4] hover:bg-[#0891B2] text-white text-[10px] h-6 px-2"
                      >
                        View Candidates
                      </Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto text-slate-400">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] text-slate-200">Strategy</TableHead>
                            <TableHead className="text-[10px] text-slate-200">Question</TableHead>
                            <TableHead className="text-[10px] text-slate-200">Outcome</TableHead>
                            <TableHead className="text-right text-[10px] text-slate-200">Entry</TableHead>
                            <TableHead className="text-right text-[10px] text-slate-200">Current</TableHead>
                            <TableHead className="text-right text-[10px] text-slate-200">P&L</TableHead>
                            <TableHead className="text-right text-[10px] text-slate-200">P&L %</TableHead>
                            <TableHead className="text-right text-[10px] text-slate-200">Stop</TableHead>
                            <TableHead className="text-right text-[10px] text-slate-200">Take</TableHead>
                            <TableHead className="text-center text-[10px] text-slate-200">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {positions.filter(p => p.status === 'active').map((position) => {
                            const StrategyIcon = getStrategyIcon(position.strategy);
                            const detailUrl = `/position/${position.id}?${new URLSearchParams({
                              question: position.question,
                              outcome: position.outcome,
                              tokenId: position.outcome_id,
                              entryPrice: position.entryPrice.toString(),
                              currentPrice: position.currentPrice.toString(),
                              positionSize: position.positionSize.toString(),
                              entryTime: position.entryTime,
                              strategy: position.strategy,
                              status: position.status,
                              volume: position.volume?.toString() || '0',
                              liquidity: position.liquidity?.toString() || '0',
                              endDate: position.endDate || '',
                              bidPrice: (position.currentPrice * 0.95).toString(),
                              askPrice: (position.currentPrice * 1.05).toString(),
                            }).toString()}`;
                            return (
                              <TableRow key={position.id} onClick={() => router.push(detailUrl)}>
                                <TableCell className="text-[10px]">
                                  <div className="flex items-center gap-2">
                                    <div className={`h-6 w-6 rounded-lg ${getStrategyColor(position.strategy)} flex items-center justify-center`}>
                                      <StrategyIcon className="h-3 w-3 text-white" />
                                    </div>
                                    <span className="font-medium text-[10px]">{getStrategyName(position.strategy)}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-[10px] max-w-xs truncate" title={position.question}>
                                  {position.question}
                                </TableCell>
                                <TableCell className="text-[10px]">{position.outcome}</TableCell>
                                <TableCell className="text-right font-medium text-[10px]">
                                  {(position.entryPrice * 100).toFixed(2)}%
                                </TableCell>
                                <TableCell className="text-right font-medium text-[10px]">
                                  {(position.currentPrice * 100).toFixed(2)}%
                                </TableCell>
                                <TableCell className="text-right text-[10px]">
                                  <span className={position.pnl >= 0 ? 'text-[#10B981]' : 'text-red-400'}>
                                    {formatCurrency(position.pnl)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right text-[10px]">
                                  <span className={position.pnlPercent >= 0 ? 'text-[#10B981]' : 'text-red-400'}>
                                    {formatPercent(position.pnlPercent)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right text-[10px]">
                                  {position.stopLoss ? `${(position.stopLoss * 100).toFixed(2)}%` : '-'}
                                </TableCell>
                                <TableCell className="text-right text-[10px]">
                                  {position.takeProfit ? `${(position.takeProfit * 100).toFixed(2)}%` : '-'}
                                </TableCell>
                                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => closePosition(position.id)}
                                    className="text-[10px] h-6 px-2"
                                  >
                                    Close
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Candidates Tab */}
            <TabsContent value="candidates" className="space-y-4">
              {/* Strategy Filter */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedStrategy === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStrategy('all')}
                  className={selectedStrategy === 'all' ? 'bg-[#06B6D4] hover:bg-[#0891B2] text-white text-[10px] h-7 px-3' : 'bg-[#1E293B] text-[10px] h-7 px-3 border-slate-800'}
                >
                  All ({totalCandidates})
                </Button>
                <Button
                  variant={selectedStrategy === 'convergence' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStrategy('convergence')}
                  className={selectedStrategy === 'convergence' ? 'bg-[#06B6D4] hover:bg-[#0891B2] text-white text-[10px] h-7 px-3' : 'bg-[#1E293B] text-[10px] h-7 px-3 border-slate-800'}
                >
                  Convergence
                </Button>
                <Button
                  variant={selectedStrategy === 'arbitrage' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStrategy('arbitrage')}
                  className={selectedStrategy === 'arbitrage' ? 'bg-[#06B6D4] hover:bg-[#0891B2] text-white text-[10px] h-7 px-3' : 'bg-[#1E293B] text-[10px] h-7 px-3 border-slate-800'}
                >
                  Arbitrage
                </Button>
                <Button
                  variant={selectedStrategy === 'reversal' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStrategy('reversal')}
                  className={selectedStrategy === 'reversal' ? 'bg-[#06B6D4] hover:bg-[#0891B2] text-white text-[10px] h-7 px-3' : 'bg-[#1E293B] text-[10px] h-7 px-3 border-slate-800'}
                >
                  Reversal
                </Button>
              </div>

              {/* High Score Alert */}
              {highScoreCandidates > 0 && (
                <Alert className="border-[#10B981]/30 bg-[#10B981]/10 text-slate-400">
                  <CheckCircle className="h-3 w-3 text-[#10B981]" />
                  <AlertTitle className="text-[10px]">High Score Candidates</AlertTitle>
                  <AlertDescription className="text-[10px] text-slate-400">
                    Found {highScoreCandidates} high-score candidates (≥ 7), prioritize attention
                  </AlertDescription>
                </Alert>
              )}

              {/* Candidates List */}
              <Card className="bg-[#1e293b]/60 backdrop-blur-xl border-slate-800/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-slate-400">Candidate List</CardTitle>
                  <CardDescription className="text-[10px] text-slate-400">
                    Pre-screened high-frequency tracking candidates, sorted by score
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {candidates.length === 0 ? (
                    <div className="py-8 text-center">
                      <AlertCircle className="mx-auto h-10 w-10 text-slate-600 mb-3" />
                      <h3 className="text-sm font-medium text-white mb-2">
                        No candidates
                      </h3>
                      <p className="text-slate-400 text-[10px]">
                        No candidates under current market conditions
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {candidates.map((candidate, index) => {
                        const StrategyIcon = getStrategyIcon(candidate.strategy);
                        const isHighScore = candidate.score >= 7;
                        return (
                          <Card
                            key={`${candidate.marketId}-${candidate.strategy}-${index}`}
                            className={`${isHighScore ? 'border-[#10B981]/50 bg-[#10B981]/10' : 'border-slate-800/50 bg-[#1e293b]/60'}`}
                          >
                            <CardContent className="p-3">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-start gap-2">
                                    <div className={`mt-0.5 h-8 w-8 rounded-lg ${getStrategyColor(candidate.strategy)} flex items-center justify-center flex-shrink-0`}>
                                      <StrategyIcon className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 mb-1">
                                        <Badge className={`${getStrategyBadgeColor(candidate.strategy)} text-[9px] px-2 py-0.5`}>
                                          {getStrategyName(candidate.strategy)}
                                        </Badge>
                                        {isHighScore && (
                                          <Badge className="bg-[#10B981]/20 text-[#10B981] text-[9px] px-2 py-0.5">
                                            High Score
                                          </Badge>
                                        )}
                                      </div>
                                      <h4 className="font-semibold text-white text-[10px] line-clamp-2">
                                        {candidate.question}
                                      </h4>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                                    <div>
                                      <p className="text-[10px] text-slate-400 mb-0.5">Outcome</p>
                                      <p className="font-medium text-white text-[10px]">{candidate.outcome}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-slate-400 mb-0.5">Price</p>
                                      <p className="font-medium text-white text-[10px]">
                                        {(candidate.price * 100).toFixed(2)}%
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-slate-400 mb-0.5">Expected Return</p>
                                      <p className={`font-medium text-[10px] ${candidate.expectedReturn >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
                                        {formatPercent(candidate.expectedReturn)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-slate-400 mb-0.5">Risk Score</p>
                                      <div className="flex items-center gap-2">
                                        <Progress value={candidate.riskScore * 10} className="flex-1 h-1.5" />
                                        <span className="font-medium text-white text-[10px]">
                                          {candidate.riskScore}/10
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                                    <div>
                                      <p className="text-[10px] text-slate-400 mb-0.5">Volume</p>
                                      <p className="font-medium text-white text-[10px]">
                                        {formatCurrency(candidate.volume)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-slate-400 mb-0.5">Liquidity</p>
                                      <p className="font-medium text-white text-[10px]">
                                        {formatCurrency(candidate.liquidity)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-slate-400 mb-0.5">End Date</p>
                                      <p className="font-medium text-white text-[10px]">
                                        {new Date(candidate.endDate).toLocaleDateString()}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col items-end gap-2 lg:w-40">
                                  <div className="text-center">
                                    <p className="text-[10px] text-slate-400 mb-0.5">Score</p>
                                    <div className={`text-2xl font-bold ${candidate.score >= 7 ? 'text-[#10B981]' : candidate.score >= 5 ? 'text-yellow-500' : 'text-red-400'}`}>
                                      {candidate.score.toFixed(1)}
                                    </div>
                                  </div>
                                  <Button
                                    className="w-full bg-[#06B6D4] hover:bg-[#0891B2] text-white text-[10px] h-7 px-3"
                                    onClick={() => openPosition(candidate)}
                                  >
                                    Open
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Position Control Rules Alert */}
          <Alert className="mt-4 border-[#06B6D4]/30 bg-[#06B6D4]/10">
            <AlertTitle className="text-[10px] text-slate-400">Position Control Rules</AlertTitle>
            <AlertDescription className="text-[10px]">
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-slate-400">
                <li>Max per position: 15% of total capital</li>
                <li>Max positions: 6 (ensure diversification)</li>
                <li>Max exposure per strategy: 40%</li>
                <li>Must diversify across at least 2 strategies</li>
                <li>Priority to high-score candidates (≥ 7)</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      </main>
    </div>
  );
}
