'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  PlayCircle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Clock,
  Target,
  DollarSign,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  LineChart,
  Menu,
  X,
  RefreshCw,
} from 'lucide-react';
import { BacktestResult } from '@/lib/backtest/types';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend,
} from 'recharts';

interface ProgressEvent {
  type: 'start' | 'data_loaded' | 'snapshot_processed' | 'trade_opened' | 'trade_closed' | 'complete' | 'error' | 'trades_batch' | 'equity_curve';
  timestamp: string;
  message?: string;
  step?: string;
  config?: any;
  marketsCount?: number;
  snapshotsCount?: number;
  totalSnapshots?: number;
  currentSnapshot?: number;
  progress?: string;
  stats?: any;
  currentEquity?: number;
  openPositions?: number;
  strategy?: string;
  question?: string;
  entryPrice?: string;
  exitPrice?: string;
  pnl?: string;
  pnlPercent?: string;
  exitReason?: string;
  result?: any;
  fullResult?: BacktestResult;
  error?: string;
  tradesBatch?: any[];
  batchIndex?: number;
  totalBatches?: number;
  equityCurve?: any[];
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
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

export default function BacktestPage() {
  const [activeItem, setActiveItem] = useState('backtest');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  // Real-time progress data
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<{ timestamp: Date; message: string; type: string }[]>([]);
  const [currentStep, setCurrentStep] = useState('');
  const [stats, setStats] = useState({
    markets: 0,
    snapshots: 0,
    processed: 0,
    tradesOpened: 0,
    tradesClosed: 0,
    currentEquity: 0,
    openPositions: 0,
  });

  // Trade record batches
  const [tradesBatches, setTradesBatches] = useState<any[]>([]);
  const [isReceivingBatches, setIsReceivingBatches] = useState(false);

  // Imported data list
  const [importedDataList, setImportedDataList] = useState<any[]>([]);
  const [selectedDataFile, setSelectedDataFile] = useState<string | null>(null);
  const [selectedDataSnapshotCount, setSelectedDataSnapshotCount] = useState(0);

  // Merge tradesList
  const mergedTradesList = useMemo(() => {
    if (result?.tradesList && result.tradesList.length > 0) {
      return result.tradesList;
    }
    return tradesBatches;
  }, [result?.tradesList, tradesBatches]);

  // Merge equityCurve
  const mergedEquityCurve = useMemo(() => {
    if (result?.equityCurve && result.equityCurve.length > 0) {
      return result.equityCurve;
    }
    return result?.equityCurve || [];
  }, [result?.equityCurve]);

  // Default configuration
  const [initialCapital, setInitialCapital] = useState(10000);
  const [maxPositions, setMaxPositions] = useState(5);
  const [days, setDays] = useState(30);

  // Strategy configuration
  const [convergenceEnabled, setConvergenceEnabled] = useState(true);
  const [convergenceMaxPositions, setConvergenceMaxPositions] = useState(15);
  const [convergenceStopLoss, setConvergenceStopLoss] = useState(15);

  const [arbitrageEnabled, setArbitrageEnabled] = useState(false);
  const [arbitrageMaxPositions, setArbitrageMaxPositions] = useState(0);

  const [reversalEnabled, setReversalEnabled] = useState(true);
  const [reversalMaxPositions, setReversalMaxPositions] = useState(10);
  const [reversalStopLoss, setReversalStopLoss] = useState(40);
  const [reversalTakeProfit, setReversalTakeProfit] = useState(100);

  // Filters
  const [minVolume, setMinVolume] = useState(10000);
  const [minLiquidity, setMinLiquidity] = useState(3000);
  const [useCryptoFilter, setUseCryptoFilter] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load imported data list
  useEffect(() => {
    loadImportedDataList();
  }, []);

  const loadImportedDataList = async () => {
    try {
      const response = await fetch('/api/backtest/data');
      const result = await response.json();
      if (result.success) {
        setImportedDataList(result.data);
        if (result.data.length > 0) {
          setSelectedDataFile(result.data[0].fileName);
          setSelectedDataSnapshotCount(result.data[0].snapshotCount);
        }
      }
    } catch (err) {
      console.error('Failed to load data list:', err);
    }
  };

  // Add log
  const addLog = (message: string, type: string = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date(), message, type }]);
  };

  // Auto-scroll to log bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Auto-merge tradesBatches to result
  useEffect(() => {
    if (result && tradesBatches.length > 0 && !isReceivingBatches) {
      setResult((prevResult) => {
        if (!prevResult) return prevResult;
        if (!prevResult.tradesList || prevResult.tradesList.length < tradesBatches.length) {
          return {
            ...prevResult,
            tradesList: [...tradesBatches],
          };
        }
        return prevResult;
      });
    }
  }, [tradesBatches, isReceivingBatches, result]);

  // Run backtest
  const runBacktest = async () => {
    if (!selectedDataFile) {
      setError('Must select imported data to run backtest. Please upload data first.');
      addLog('❌ Error: Must select imported data', 'error');
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setLogs([]);
    setTradesBatches([]);
    setIsReceivingBatches(false);
    setCurrentStep('');
    setStats({
      markets: 0,
      snapshots: 0,
      processed: 0,
      tradesOpened: 0,
      tradesClosed: 0,
      currentEquity: initialCapital,
      openPositions: 0,
    });

    try {
      const config = {
        initialCapital,
        maxPositions,
        maxPositionSize: 0.20,
        days,
        strategies: {
          convergence: {
            enabled: convergenceEnabled,
            maxPositions: convergenceMaxPositions,
            stopLoss: convergenceStopLoss / 100,
          },
          arbitrage: {
            enabled: arbitrageEnabled,
            maxPositions: arbitrageMaxPositions,
          },
          reversal: {
            enabled: reversalEnabled,
            maxPositions: reversalMaxPositions,
            stopLoss: reversalStopLoss / 100,
            takeProfit: reversalTakeProfit / 100,
            trailingStop: 0.10,
          },
        },
        filters: {
          minVolume,
          minLiquidity,
          minDaysToEnd: 1,
          maxDaysToEnd: 30,
          tags: useCryptoFilter ? ['crypto', 'bitcoin', 'price'] : undefined,
        },
      };

      const requestBody: any = { config };
      if (selectedDataFile) {
        requestBody.dataFile = selectedDataFile;
      } else {
        setError('Must select data file');
        setIsRunning(false);
        return;
      }

      const response = await fetch('/api/backtest/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith(':') || line.trim() === '') {
            continue;
          }

          if (line.startsWith('data: ')) {
            const jsonData = line.slice(6).trim();

            if (jsonData === '') {
              continue;
            }

            try {
              const openBraces = (jsonData.match(/{/g) || []).length;
              const closeBraces = (jsonData.match(/}/g) || []).length;
              const openBrackets = (jsonData.match(/\[/g) || []).length;
              const closeBrackets = (jsonData.match(/\]/g) || []).length;

              if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
                console.error('[SSE] Incomplete JSON, skipping:', jsonData.slice(0, 100));
                addLog(`⚠️ Received incomplete data, skipped`, 'error');
                continue;
              }

              const data: ProgressEvent = JSON.parse(jsonData);
              handleProgressEvent(data);
            } catch (parseError) {
              console.error('[SSE] JSON parse failed:', parseError, 'Data:', jsonData.slice(0, 200));
              addLog(`⚠️ Data parse failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`, 'error');
            }
          }
        }
      }

      if (buffer.trim() !== '') {
        console.warn('[SSE] Remaining buffer:', buffer.slice(0, 100));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Network error';
      setError(errorMsg);
      addLog(`❌ Error: ${errorMsg}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  // Handle progress events
  const handleProgressEvent = (event: ProgressEvent) => {
    try {
      if (!event || !event.type) {
        console.warn('[SSE] Invalid event:', event);
        return;
      }

      switch (event.type) {
        case 'start':
          setCurrentStep(event.step || 'initializing');
          if (event.message) {
            addLog(event.message, 'info');
          }
          if (event.config) {
            setStats(prev => ({ ...prev, currentEquity: event.config?.initialCapital || initialCapital }));
          }
          if (event.marketsCount !== undefined) {
            setStats(prev => ({ ...prev, markets: event.marketsCount! }));
          }
          if (event.snapshotsCount !== undefined) {
            setStats(prev => ({ ...prev, snapshots: event.snapshotsCount! }));
          }
          break;

        case 'data_loaded':
          setCurrentStep('data_loaded');
          if (event.message) addLog(event.message, 'success');
          if (event.totalSnapshots) {
            setStats(prev => ({ ...prev, snapshots: event.totalSnapshots! }));
          }
          break;

        case 'snapshot_processed':
          if (event.progress) {
            setProgress(parseFloat(event.progress));
          }
          if (event.stats) {
            setStats(prev => ({
              ...prev,
              processed: event.stats!.processedSnapshots || 0,
              tradesOpened: event.stats!.tradesOpened || 0,
              tradesClosed: event.stats!.tradesClosed || 0,
            }));
          }
          if (event.currentEquity !== undefined) {
            setStats(prev => ({ ...prev, currentEquity: event.currentEquity! }));
          }
          if (event.openPositions !== undefined) {
            setStats(prev => ({ ...prev, openPositions: event.openPositions! }));
          }
          break;

        case 'trade_opened':
          if (event.strategy && event.entryPrice && event.question) {
            const msg = `➕ Open [${event.strategy}]: ${event.question.substring(0, 40)}... @ ${event.entryPrice}`;
            addLog(msg, 'success');
          }
          break;

        case 'trade_closed':
          if (event.strategy && event.pnl && event.exitReason) {
            const pnlNum = parseFloat(event.pnl);
            const type = pnlNum >= 0 ? 'success' : 'error';
            const msg = `➖ Close [${event.strategy}]: ${pnlNum >= 0 ? '+' : ''}${event.pnl} (${event.pnlPercent}%) - ${event.exitReason}`;
            addLog(msg, type);
          }
          break;

        case 'trades_batch':
          if (event.tradesBatch && Array.isArray(event.tradesBatch)) {
            setIsReceivingBatches(true);
            setTradesBatches(prev => [...prev, ...(event.tradesBatch || [])]);
            const batchNum = event.batchIndex !== undefined ? event.batchIndex + 1 : '?';
            const totalBatches = event.totalBatches !== undefined ? event.totalBatches : '?';
            addLog(`📦 Receiving trade batch ${batchNum}/${totalBatches}`, 'info');

            if (event.batchIndex !== undefined && event.totalBatches !== undefined &&
                event.batchIndex + 1 >= event.totalBatches) {
              setIsReceivingBatches(false);
              addLog('✅ All trade batches received', 'success');
            }
          }
          break;

        case 'equity_curve':
          if (event.equityCurve && Array.isArray(event.equityCurve)) {
            setResult((prevResult) => {
              if (prevResult) {
                return {
                  ...prevResult,
                  equityCurve: event.equityCurve as { timestamp: Date; equity: number; positions: number }[],
                };
              }
              return {
                period: {
                  start: new Date(),
                  end: new Date(),
                  duration: 0,
                },
                trades: {
                  total: 0,
                  winning: 0,
                  losing: 0,
                  winRate: 0,
                  averageTrade: 0,
                  bestTrade: 0,
                  worstTrade: 0,
                },
                pnl: {
                  total: 0,
                  totalPercent: 0,
                  averageDaily: 0,
                  maxDrawdown: 0,
                  maxDrawdownPercent: 0,
                  sharpeRatio: 0,
                },
                strategyStats: {
                  convergence: { trades: 0, winRate: 0, totalPnl: 0, averagePnl: 0, maxDrawdown: 0 },
                  arbitrage: { trades: 0, winRate: 0, totalPnl: 0, averagePnl: 0, maxDrawdown: 0 },
                  reversal: { trades: 0, winRate: 0, totalPnl: 0, averagePnl: 0, maxDrawdown: 0 },
                  trend_following: { trades: 0, winRate: 0, totalPnl: 0, averagePnl: 0, maxDrawdown: 0 },
                  mean_reversion: { trades: 0, winRate: 0, totalPnl: 0, averagePnl: 0, maxDrawdown: 0 },
                },
                equityCurve: event.equityCurve as { timestamp: Date; equity: number; positions: number }[],
                tradesList: [],
              } as BacktestResult;
            });
            addLog(`📊 Received equity curve (${event.equityCurve.length} snapshots)`, 'info');
          }
          break;

        case 'complete':
          setProgress(100);
          if (event.message) addLog(event.message, 'success');

          if (event.fullResult) {
            setResult((prevResult) => {
              if (prevResult && prevResult.equityCurve && prevResult.equityCurve.length > 0) {
                return {
                  ...event.fullResult,
                  equityCurve: prevResult.equityCurve,
                } as BacktestResult;
              }
              return event.fullResult as BacktestResult;
            });
            setCurrentStep('complete');
          }
          break;

        case 'error':
          setCurrentStep('error');
          if (event.message) addLog(event.message, 'error');
          if (event.error) setError(event.error);
          break;

        default:
          console.warn('[SSE] Unknown event type:', event.type);
      }
    } catch (error) {
      console.error('[SSE] Event handler failed:', error, event);
      addLog(`⚠️ Event handler failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

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
            <h2 className="text-lg font-bold text-white">Backtest System</h2>
            <p className="text-xs text-slate-400">Backtest trading analytics and performance metrics</p>
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
              className="rounded-lg border border-slate-700/50 bg-[#1E293B]/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-[#2D3F57]"
            >
              {isRunning ? (
                <>
                  Running...
                </>
              ) : (
                <>
                  Run Backtest
                </>
              )}
            </motion.button>
          </div>
        </div>

        {/* Page Content */}
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Configuration Panel */}
            <Card className="bg-[#1e293b]/60 backdrop-blur-xl border-slate-800/50 lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm">Configuration</CardTitle>
                <CardDescription className="text-slate-400 text-[10px]">Backtest parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div>
                    <Label className="text-slate-400 text-[10px]">Initial Capital ($)</Label>
                    <Input
                      type="number"
                      value={initialCapital}
                      onChange={(e) => setInitialCapital(Number(e.target.value))}
                      className="bg-[#1e293b]/60 border-slate-800/50 text-white mt-1 text-xs h-8"
                      disabled={isRunning}
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-[10px]">Backtest Days</Label>
                    <Input
                      type="number"
                      min="1"
                      max="60"
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value))}
                      className="bg-[#1e293b]/60 border-slate-800/50 text-white mt-1 text-xs h-8"
                      disabled={isRunning}
                    />
                  </div>
                </div>

                <Separator className="bg-slate-800/50" />

                {/* Data Selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-white text-[10px]">Select Data</Label>
                    <Link href="/import" className="text-[10px] text-[#06B6D4] hover:text-[#0891B2]">
                      Import New
                    </Link>
                  </div>
                  {importedDataList.length > 0 ? (
                    <div className="space-y-1.5">
                      {importedDataList.map((data) => (
                        <button
                          key={data.fileName}
                          onClick={() => {
                            setSelectedDataFile(data.fileName);
                            setSelectedDataSnapshotCount(data.snapshotCount);
                          }}
                          className={`w-full p-2.5 rounded-lg text-left transition-all ${
                            selectedDataFile === data.fileName
                              ? 'bg-[#06B6D4]/10 border border-[#06B6D4]/50'
                              : 'bg-[#1e293b]/60 border border-slate-800/50 hover:bg-slate-800/50'
                          }`}
                          disabled={isRunning}
                        >
                          <div className="text-white text-[10px] font-medium mb-1">
                            {data.fileName.replace('backtest_data_', '').replace('.json', '')}
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-400">
                              {data.snapshotCount.toLocaleString()} snapshots
                            </span>
                            <span className="text-slate-400">
                              {data.marketCount} markets
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-[#1e293b]/60 rounded-lg p-3 text-center border border-slate-800/50">
                      <p className="text-slate-400 text-[10px] mb-2">No imported data</p>
                      <Link href="/import">
                        <Button variant="outline" size="sm" className="bg-[#1e293b]/60 border-slate-800/50 text-white hover:bg-slate-800/50 text-[10px] h-6 px-2 py-1">
                          Import Data
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>

                <Separator className="bg-slate-800/50" />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-white text-[10px]">Convergence</Label>
                    <Switch checked={convergenceEnabled} onCheckedChange={setConvergenceEnabled} disabled={isRunning} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-white text-[10px]">Gamma Arbitrage</Label>
                    <Switch checked={arbitrageEnabled} onCheckedChange={setArbitrageEnabled} disabled={isRunning} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-white text-[10px]">Reversal</Label>
                    <Switch checked={reversalEnabled} onCheckedChange={setReversalEnabled} disabled={isRunning} />
                  </div>
                </div>

                <Separator className="bg-slate-800/50" />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-white text-[10px]">Crypto Only</Label>
                    <Switch checked={useCryptoFilter} onCheckedChange={setUseCryptoFilter} disabled={isRunning} />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-[10px]">Min Volume</Label>
                    <Input
                      type="number"
                      value={minVolume}
                      onChange={(e) => setMinVolume(Number(e.target.value))}
                      className="bg-[#1e293b]/60 border-slate-800/50 text-white text-[10px] mt-1 h-7"
                      disabled={isRunning}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Main Panel */}
            <div className="lg:col-span-3 space-y-4">
              {/* Real-time Progress */}
              {isRunning && (
                <Card className="bg-[#1e293b]/60 backdrop-blur-xl border-slate-800/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white text-sm flex items-center">
                      <Activity className="mr-2 h-4 w-4 text-[#06B6D4]" />
                      Backtest Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Progress Bar */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-2">
                        <span className="text-slate-400">Progress</span>
                        <span className="text-white font-medium">{progress.toFixed(1)}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="bg-[#1e293b]/60 p-2 rounded-lg border border-slate-800/50">
                        <div className="text-[10px] text-slate-400 mb-0.5">Markets</div>
                        <div className="text-sm font-bold text-white">{stats.markets}</div>
                      </div>
                      <div className="bg-[#1e293b]/60 p-2 rounded-lg border border-slate-800/50">
                        <div className="text-[10px] text-slate-400 mb-0.5">Snapshots</div>
                        <div className="text-sm font-bold text-white">{stats.snapshots}</div>
                      </div>
                      <div className="bg-[#1e293b]/60 p-2 rounded-lg border border-slate-800/50">
                        <div className="text-[10px] text-slate-400 mb-0.5">Processed</div>
                        <div className="text-sm font-bold text-[#06B6D4]">{stats.processed}</div>
                      </div>
                      <div className="bg-[#1e293b]/60 p-2 rounded-lg border border-slate-800/50">
                        <div className="text-[10px] text-slate-400 mb-0.5">Equity</div>
                        <div className="text-sm font-bold text-[#10B981]">${stats.currentEquity.toFixed(0)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-[#1e293b]/60 p-2 rounded-lg border border-slate-800/50">
                        <div className="text-[10px] text-slate-400 mb-0.5">Positions</div>
                        <div className="text-[11px] font-bold text-white">{stats.openPositions}</div>
                      </div>
                      <div className="bg-[#1e293b]/60 p-2 rounded-lg border border-slate-800/50">
                        <div className="text-[10px] text-slate-400 mb-0.5">Opened</div>
                        <div className="text-[11px] font-bold text-[#10B981]">{stats.tradesOpened}</div>
                      </div>
                      <div className="bg-[#1e293b]/60 p-2 rounded-lg border border-slate-800/50">
                        <div className="text-[10px] text-slate-400 mb-0.5">Closed</div>
                        <div className="text-[11px] font-bold text-slate-400">{stats.tradesClosed}</div>
                      </div>
                    </div>

                    {/* Real-time Logs */}
                    <div>
                      <div className="text-[10px] text-slate-400 mb-2">Real-time Logs</div>
                      <ScrollArea className="h-32 rounded-lg border border-slate-800/50 bg-[#0F172A]/50 p-2">
                        <div className="space-y-1 text-[10px]">
                          {logs.length === 0 ? (
                            <div className="text-slate-500">Waiting...</div>
                          ) : (
                            logs.map((log, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <span className="text-slate-500 shrink-0">
                                  {log.timestamp.toLocaleTimeString()}
                                </span>
                                <span
                                  className={
                                    log.type === 'success'
                                      ? 'text-[#10B981]'
                                      : log.type === 'error'
                                      ? 'text-red-400'
                                      : 'text-slate-300'
                                  }
                                >
                                  {log.message}
                                </span>
                              </div>
                            ))
                          )}
                          <div ref={logsEndRef} />
                        </div>
                      </ScrollArea>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Error Alert */}
              {error && (
                <Alert variant="destructive" className="bg-red-900/20 border-red-800/50">
                  <XCircle className="h-3 w-3" />
                  <AlertTitle className="text-xs">Backtest Failed</AlertTitle>
                  <AlertDescription className="text-[10px]">{error}</AlertDescription>
                </Alert>
              )}

              {/* Receiving Batches */}
              {isReceivingBatches && (
                <Card className="bg-[#1e293b]/60 backdrop-blur-xl border-slate-800/50">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#06B6D4] border-t-transparent" />
                      <p className="text-slate-300 text-[10px]">Receiving trade data, please wait...</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Results */}
              {result && (result.tradesList || (result.pnl && result.trades && result.strategyStats)) && (
                <Card className="bg-[#1e293b]/60 backdrop-blur-xl border-slate-800/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white text-sm flex items-center">
                      <CheckCircle className="mr-2 h-4 w-4 text-[#10B981]" />
                      Backtest Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="overview" className="w-full">
                      <TabsList className="bg-[#1e293b]/60 border border-slate-800/50">
                        <TabsTrigger value="overview" className="text-[10px] data-[state=active]:bg-[#06B6D4]/20 data-[state=active]:text-[#06B6D4]">Overview</TabsTrigger>
                        <TabsTrigger value="equity" className="text-[10px] data-[state=active]:bg-[#06B6D4]/20 data-[state=active]:text-[#06B6D4]">Equity</TabsTrigger>
                        <TabsTrigger value="strategies" className="text-[10px] data-[state=active]:bg-[#06B6D4]/20 data-[state=active]:text-[#06B6D4]">Strategies</TabsTrigger>
                        <TabsTrigger value="trades" className="text-[10px] data-[state=active]:bg-[#06B6D4]/20 data-[state=active]:text-[#06B6D4]">Trades</TabsTrigger>
                      </TabsList>

                      <TabsContent value="overview" className="space-y-3 mt-3">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                          <div className="p-3 bg-[#1e293b]/60 rounded-lg border border-slate-800/50">
                            <p className="text-[10px] text-slate-400">Total Return</p>
                            <p className={`text-lg font-bold ${result.pnl?.totalPercent >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
                              {result.pnl?.totalPercent !== undefined
                                ? (result.pnl.totalPercent >= 0 ? '+' : '') + result.pnl.totalPercent.toFixed(2) + '%'
                                : '-'}
                            </p>
                          </div>
                          <div className="p-3 bg-[#1e293b]/60 rounded-lg border border-slate-800/50">
                            <p className="text-[10px] text-slate-400">Win Rate</p>
                            <p className="text-lg font-bold text-white">
                              {result.trades?.winRate !== undefined ? result.trades.winRate.toFixed(2) + '%' : '-'}
                            </p>
                          </div>
                          <div className="p-3 bg-[#1e293b]/60 rounded-lg border border-slate-800/50">
                            <p className="text-[10px] text-slate-400">Sharpe Ratio</p>
                            <p className="text-lg font-bold text-white">
                              {result.pnl?.sharpeRatio !== undefined ? result.pnl.sharpeRatio.toFixed(2) : '-'}
                            </p>
                          </div>
                          <div className="p-3 bg-[#1e293b]/60 rounded-lg border border-slate-800/50">
                            <p className="text-[10px] text-slate-400">Max Drawdown</p>
                            <p className="text-lg font-bold text-red-400">
                              {result.pnl?.maxDrawdownPercent !== undefined
                                ? '-' + result.pnl.maxDrawdownPercent.toFixed(2) + '%'
                                : '-'}
                            </p>
                          </div>
                          <div className="p-3 bg-[#1e293b]/60 rounded-lg border border-slate-800/50">
                            <p className="text-[10px] text-slate-400">Trades</p>
                            <p className="text-lg font-bold text-white">
                              {result.trades?.total !== undefined ? result.trades.total : '-'}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div className="p-3 bg-[#1e293b]/60 rounded-lg border border-slate-800/50">
                            <h4 className="text-[10px] font-medium text-slate-300 mb-2">P&L Stats</h4>
                            <div className="space-y-1 text-[10px]">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Total P&L</span>
                                <span className={`font-medium ${result.pnl?.total >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
                                  {result.pnl?.total !== undefined ? `$${result.pnl.total.toFixed(2)}` : '-'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Return %</span>
                                <span className={`font-medium ${result.pnl?.totalPercent >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
                                  {result.pnl?.totalPercent !== undefined ? result.pnl.totalPercent.toFixed(2) + '%' : '-'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="p-3 bg-[#1e293b]/60 rounded-lg border border-slate-800/50">
                            <h4 className="text-[10px] font-medium text-slate-300 mb-2">Trade Stats</h4>
                            <div className="space-y-1 text-[10px]">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Winning</span>
                                <span className="font-medium text-[#10B981]">{result.trades.winning}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Losing</span>
                                <span className="font-medium text-red-400">{result.trades.losing}</span>
                              </div>
                            </div>
                          </div>
                          <div className="p-3 bg-[#1e293b]/60 rounded-lg border border-slate-800/50">
                            <h4 className="text-[10px] font-medium text-slate-300 mb-2">Best/Worst</h4>
                            <div className="space-y-1 text-[10px]">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Best</span>
                                <span className="font-medium text-[#10B981]">
                                  ${result.trades.bestTrade.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Worst</span>
                                <span className="font-medium text-red-400">
                                  ${result.trades.worstTrade.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="equity" className="space-y-3 mt-3">
                        <Card className="bg-[#1e293b]/60 border-slate-800/50">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-white text-[10px] flex items-center">
                              <LineChart className="mr-2 h-3 w-3" />
                              Equity Curve
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="h-56">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={(mergedEquityCurve || []).map((e: any) => ({
                                  time: new Date(e.timestamp).toLocaleDateString(),
                                  equity: e.equity,
                                  positions: e.positions,
                                }))}>
                                  <defs>
                                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" strokeWidth={0.5} />
                                  <XAxis
                                    dataKey="time"
                                    stroke="#94a3b8"
                                    fontSize={9}
                                    tickLine={false}
                                    axisLine={{ stroke: '#475569', strokeWidth: 0.5 }}
                                  />
                                  <YAxis
                                    stroke="#94a3b8"
                                    fontSize={9}
                                    tickLine={false}
                                    axisLine={{ stroke: '#475569', strokeWidth: 0.5 }}
                                    tickFormatter={(value) => `$${value.toLocaleString()}`}
                                    domain={['auto', 'auto']}
                                    padding={{ top: 20, bottom: 20 }}
                                  />
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: '#0f172a',
                                      border: '1px solid #334155',
                                      borderRadius: '12px',
                                      padding: '12px',
                                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                                    }}
                                    labelStyle={{ color: '#f1f5f9', fontSize: 10, fontWeight: 500 }}
                                    itemStyle={{ color: '#f1f5f9', fontSize: 10 }}
                                    formatter={(value: number, name: string) => {
                                      if (name === 'equity') {
                                        return [`$${value.toLocaleString()}`, 'Equity'];
                                      }
                                      return [value, name];
                                    }}
                                  />
                                  <Area
                                    type="monotone"
                                    dataKey="equity"
                                    name="Equity"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    fill="url(#equityGradient)"
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-[#1e293b]/60 border-slate-800/50">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-white text-[10px] flex items-center">
                              <BarChart3 className="mr-2 h-3 w-3" />
                              Position Count
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="h-48">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={(mergedEquityCurve || []).map((e: any) => ({
                                  time: new Date(e.timestamp).toLocaleDateString(),
                                  positions: e.positions,
                                }))}>
                                  <defs>
                                    <linearGradient id="positionGradient" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" strokeWidth={0.5} />
                                  <XAxis
                                    dataKey="time"
                                    stroke="#94a3b8"
                                    fontSize={9}
                                    tickLine={false}
                                    axisLine={{ stroke: '#475569', strokeWidth: 0.5 }}
                                  />
                                  <YAxis
                                    stroke="#94a3b8"
                                    fontSize={9}
                                    tickLine={false}
                                    axisLine={{ stroke: '#475569', strokeWidth: 0.5 }}
                                    domain={[0, 'dataMax + 1']}
                                    padding={{ top: 10, bottom: 10 }}
                                  />
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: '#0f172a',
                                      border: '1px solid #334155',
                                      borderRadius: '12px',
                                      padding: '12px',
                                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                                    }}
                                    labelStyle={{ color: '#f1f5f9', fontSize: 10, fontWeight: 500 }}
                                    itemStyle={{ color: '#f1f5f9', fontSize: 10 }}
                                    formatter={(value: number) => [value, 'Positions']}
                                  />
                                  <Area
                                    type="monotone"
                                    dataKey="positions"
                                    name="Positions"
                                    stroke="#8b5cf6"
                                    strokeWidth={2}
                                    fill="url(#positionGradient)"
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>

                      <TabsContent value="strategies" className="space-y-3 mt-3">
                        {result.strategyStats ? (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {Object.entries(result.strategyStats).map(([name, stats]: [string, any]) => (
                              <Card key={name} className="bg-[#1e293b]/60 border-slate-800/50">
                                <CardHeader className="pb-2">
                                  <CardTitle className="text-white text-[10px] capitalize">
                                    {name}
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1.5 text-[10px]">
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Trades</span>
                                    <span className="text-white font-medium">{stats.trades}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Win Rate</span>
                                    <span className="text-white font-medium">{stats.winRate.toFixed(2)}%</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Total P&L</span>
                                    <span className={`font-medium ${stats.totalPnl >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
                                      ${stats.totalPnl.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Average</span>
                                    <span className={`font-medium ${stats.averagePnl >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
                                      ${stats.averagePnl.toFixed(2)}
                                    </span>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center text-slate-400 py-8 text-[10px]">No strategy stats</div>
                        )}
                      </TabsContent>

                      <TabsContent value="trades" className="space-y-3 mt-3">
                        <Card className="bg-[#1e293b]/60 border-slate-800/50">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-white text-[10px] flex items-center">
                              <Clock className="mr-2 h-3 w-3" />
                              Trade Timeline
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="h-48">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={(mergedTradesList || []).map((trade: any) => ({
                                  time: new Date(trade.exitTime || trade.entryTime).toLocaleDateString(),
                                  pnl: trade.pnl || 0,
                                  strategy: trade.strategy,
                                }))}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                  <XAxis
                                    dataKey="time"
                                    stroke="#94a3b8"
                                    fontSize={9}
                                    tickLine={false}
                                    axisLine={false}
                                  />
                                  <YAxis
                                    stroke="#94a3b8"
                                    fontSize={9}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value: number) => `$${value.toFixed(0)}`}
                                  />
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: '#1e293b',
                                      border: '1px solid #334155',
                                      borderRadius: '8px',
                                    }}
                                    labelStyle={{ color: '#f1f5f9', fontSize: 9 }}
                                    itemStyle={{ color: '#f1f5f9', fontSize: 9 }}
                                    formatter={(value: number, name: string) => {
                                      if (name === 'pnl') {
                                        const formattedValue = value.toFixed(2);
                                        return [`$${value >= 0 ? '+' : ''}${formattedValue}`, 'P&L'];
                                      }
                                      return [value, name];
                                    }}
                                  />
                                  <Area
                                    type="monotone"
                                    dataKey="pnl"
                                    name="P&L"
                                    stroke="#8b5cf6"
                                    fill="#8b5cf6"
                                    fillOpacity={0.3}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-[#1e293b]/60 border-slate-800/50">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-white text-[10px] flex items-center">
                              <TrendingUp className="mr-2 h-3 w-3" />
                              Daily P&L
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="h-48">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={(mergedEquityCurve || []).map((e: any, i: number) => {
                                  const prevEquity = i > 0 ? mergedEquityCurve[i - 1].equity : mergedEquityCurve[0].equity;
                                  const dailyPnl = e.equity - prevEquity;
                                  return {
                                    date: new Date(e.timestamp).toLocaleDateString(),
                                    dailyPnl: dailyPnl,
                                  };
                                })}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                  <XAxis
                                    dataKey="date"
                                    stroke="#94a3b8"
                                    fontSize={9}
                                    tickLine={false}
                                    axisLine={false}
                                  />
                                  <YAxis
                                    stroke="#94a3b8"
                                    fontSize={9}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                                  />
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: '#1e293b',
                                      border: '1px solid #334155',
                                      borderRadius: '8px',
                                    }}
                                    labelStyle={{ color: '#f1f5f9', fontSize: 9 }}
                                    itemStyle={{ color: '#f1f5f9', fontSize: 9 }}
                                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Daily P&L']}
                                  />
                                  <Area
                                    type="monotone"
                                    dataKey="dailyPnl"
                                    name="Daily P&L"
                                    stroke="#f59e0b"
                                    fill="#f59e0b"
                                    fillOpacity={0.3}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-[#1e293b]/60 border-slate-800/50">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-white text-[10px] flex items-center">
                              <BarChart3 className="mr-2 h-3 w-3" />
                              Trade Details
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="rounded-lg border border-slate-800/50 overflow-hidden">
                              <ScrollArea className="h-64 w-full">
                                <div className="min-w-[800px]">
                                  <table className="w-full text-[10px]">
                                    <thead className="bg-[#0F172A]/50 sticky top-0">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-slate-300 font-medium">#</th>
                                        <th className="px-3 py-2 text-left text-slate-300 font-medium">Strategy</th>
                                        <th className="px-3 py-2 text-left text-slate-300 font-medium">Question</th>
                                        <th className="px-3 py-2 text-right text-slate-300 font-medium">Entry</th>
                                        <th className="px-3 py-2 text-right text-slate-300 font-medium">Exit</th>
                                        <th className="px-3 py-2 text-right text-slate-300 font-medium">P&L</th>
                                        <th className="px-3 py-2 text-left text-slate-300 font-medium">Reason</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {mergedTradesList && mergedTradesList.length > 0 ? (
                                        mergedTradesList.map((trade: any, index: number) => (
                                          <tr key={index} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                                            <td className="px-3 py-1.5 text-slate-400">
                                              {index + 1}
                                            </td>
                                            <td className="px-3 py-1.5">
                                              <Badge variant="outline" className="capitalize text-[9px]">
                                                {trade.strategy}
                                              </Badge>
                                            </td>
                                            <td className="px-3 py-1.5 text-slate-300 max-w-xs truncate" title={trade.question}>
                                              {trade.question}
                                            </td>
                                            <td className="px-3 py-1.5 text-right text-white">
                                              ${(trade.entryValue || trade.positionSize * trade.entryPrice).toFixed(2)}
                                              <span className="text-slate-400 ml-1">
                                                ({(trade.entryPrice * 100).toFixed(1)}%)
                                              </span>
                                            </td>
                                            <td className="px-3 py-1.5 text-right text-white">
                                              {trade.exitPrice ? (
                                                <>
                                                  ${(trade.exitValue || trade.positionSize * trade.exitPrice).toFixed(2)}
                                                  <span className="text-slate-400 ml-1">
                                                    ({(trade.exitPrice * 100).toFixed(1)}%)
                                                  </span>
                                                </>
                                              ) : '-'}
                                            </td>
                                            <td className={`px-3 py-1.5 text-right font-medium ${trade.pnl >= 0 ? 'text-[#10B981]' : 'text-red-400'}`}>
                                              {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                                              <span className="text-slate-400 ml-1">
                                                ({trade.pnl >= 0 ? '+' : ''}{(trade.pnlPercent || 0).toFixed(1)}%)
                                              </span>
                                            </td>
                                            <td className="px-3 py-1.5 text-slate-400 max-w-[80px] truncate" title={trade.exitReason}>
                                              {trade.exitReason}
                                            </td>
                                          </tr>
                                        ))
                                      ) : (
                                        <tr>
                                          <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                                            No trades
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </ScrollArea>
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              )}

              {/* Empty State */}
              {!result && !isRunning && !error && (
                <Card className="bg-[#1e293b]/60 backdrop-blur-xl border-slate-800/50">
                  <CardContent className="pt-12 pb-12 text-center">
                    <BarChart3 className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                    <div>
                      <h3 className="text-sm font-medium text-white mb-2">Start Backtest</h3>
                      <p className="text-slate-400 max-w-md mx-auto text-[10px]">
                        Configure parameters and strategies, click "Run Backtest" to view historical performance
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
