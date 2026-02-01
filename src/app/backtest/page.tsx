'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
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
  DollarSign,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  LineChart,
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
  // 分批发送的交易记录
  tradesBatch?: any[];
  batchIndex?: number;
  totalBatches?: number;
  // 资金曲线
  equityCurve?: any[];
}

export default function BacktestPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 实时进度数据
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

  // 交易记录批次（用于接收分批发送的交易数据）
  const [tradesBatches, setTradesBatches] = useState<any[]>([]);
  const [isReceivingBatches, setIsReceivingBatches] = useState(false);

  // 导入的数据列表
  const [importedDataList, setImportedDataList] = useState<any[]>([]);
  const [selectedDataFile, setSelectedDataFile] = useState<string | null>(null);
  const [selectedDataSnapshotCount, setSelectedDataSnapshotCount] = useState(0);

  // 合并result.tradesList和tradesBatches（用于大数据回测的分批接收）
  const mergedTradesList = useMemo(() => {
    // 优先使用result.tradesList（小数据回测），如果为空则使用tradesBatches（大数据回测）
    if (result?.tradesList && result.tradesList.length > 0) {
      return result.tradesList;
    }
    return tradesBatches;
  }, [result?.tradesList, tradesBatches]);

  // 合并equityCurve（用于大数据回测的分批接收）
  const mergedEquityCurve = useMemo(() => {
    // 优先使用result.equityCurve（小数据回测），如果为空则不显示（大数据回测会在equity_curve事件中处理）
    if (result?.equityCurve && result.equityCurve.length > 0) {
      return result.equityCurve;
    }
    // 大数据回测时，equityCurve会在equity_curve事件中更新到result中
    // 这里返回result.equityCurve（可能为空数组，等待equity_curve事件填充）
    return result?.equityCurve || [];
  }, [result?.equityCurve]);

  // 默认配置
  const [initialCapital, setInitialCapital] = useState(10000);
  const [maxPositions, setMaxPositions] = useState(5);
  const [days, setDays] = useState(30);

  // 策略配置（V3.0 - 充分利用二元市场特性）
  const [convergenceEnabled, setConvergenceEnabled] = useState(true);
  const [convergenceMaxPositions, setConvergenceMaxPositions] = useState(15);
  const [convergenceStopLoss, setConvergenceStopLoss] = useState(15); // 动态止损15%

  const [arbitrageEnabled, setArbitrageEnabled] = useState(false);
  const [arbitrageMaxPositions, setArbitrageMaxPositions] = useState(0);

  const [reversalEnabled, setReversalEnabled] = useState(true);
  const [reversalMaxPositions, setReversalMaxPositions] = useState(10);
  const [reversalStopLoss, setReversalStopLoss] = useState(40); // 动态止损40%（最宽40%）
  const [reversalTakeProfit, setReversalTakeProfit] = useState(100); // 止盈100%

  // 过滤条件
  const [minVolume, setMinVolume] = useState(10000);
  const [minLiquidity, setMinLiquidity] = useState(3000);
  const [useCryptoFilter, setUseCryptoFilter] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // 加载已导入的数据列表
  useEffect(() => {
    loadImportedDataList();
  }, []);

  const loadImportedDataList = async () => {
    try {
      const response = await fetch('/api/backtest/data');
      const result = await response.json();
      if (result.success) {
        setImportedDataList(result.data);
        // 如果有数据，默认选择最新的
        if (result.data.length > 0) {
          setSelectedDataFile(result.data[0].fileName);
          setSelectedDataSnapshotCount(result.data[0].snapshotCount);
        }
      }
    } catch (err) {
      console.error('加载数据列表失败:', err);
    }
  };

  // 添加日志
  const addLog = (message: string, type: string = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date(), message, type }]);
  };

  // 自动滚动到日志底部
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // 自动合并tradesBatches到result（当所有批次接收完成时）
  useEffect(() => {
    if (result && tradesBatches.length > 0 && !isReceivingBatches) {
      // 合并tradesBatches到result的tradesList
      setResult((prevResult) => {
        if (!prevResult) return prevResult;
        // 只在tradesList为空或比tradesBatches短时才更新
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

  // 运行回测
  const runBacktest = async () => {
    // 检查是否选择了导入的数据
    if (!selectedDataFile) {
      setError('必须先导入并选择真实历史数据才能运行回测。请前往导入页面上传数据。');
      addLog('❌ 错误: 必须先导入并选择真实历史数据', 'error');
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setLogs([]);
    setTradesBatches([]);  // 重置交易记录批次
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

      // 构建请求体（只发送文件名，避免413错误）
      const requestBody: any = { config };

      // 添加数据文件名
      if (selectedDataFile) {
        requestBody.dataFile = selectedDataFile;
      } else {
        setError('必须先选择数据文件');
        setIsRunning(false);
        return;
      }

      // 使用SSE流式接收进度
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

      // SSE缓冲区：处理被分割的chunk
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 解码并追加到缓冲区
        buffer += decoder.decode(value, { stream: true });

        // 按行分割
        const lines = buffer.split('\n');
        // 保留最后一行（可能不完整）
        buffer = lines.pop() || '';

        for (const line of lines) {
          // 跳过注释行（心跳）
          if (line.startsWith(':') || line.trim() === '') {
            continue;
          }

          // 检查是否是数据行
          if (line.startsWith('data: ')) {
            const jsonData = line.slice(6).trim();

            // 跳过空数据
            if (jsonData === '') {
              continue;
            }

            try {
              // 验证JSON格式（简单的括号匹配检查）
              const openBraces = (jsonData.match(/{/g) || []).length;
              const closeBraces = (jsonData.match(/}/g) || []).length;
              const openBrackets = (jsonData.match(/\[/g) || []).length;
              const closeBrackets = (jsonData.match(/\]/g) || []).length;

              if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
                console.error('[SSE] JSON格式不完整，跳过:', jsonData.slice(0, 100));
                addLog(`⚠️ 接收到格式不完整的数据，已跳过`, 'error');
                continue;
              }

              // 解析JSON
              const data: ProgressEvent = JSON.parse(jsonData);
              handleProgressEvent(data);
            } catch (parseError) {
              console.error('[SSE] JSON解析失败:', parseError, 'Data:', jsonData.slice(0, 200));
              addLog(`⚠️ 数据解析失败: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`, 'error');
              // 继续处理下一条，不中断整个流
            }
          }
        }
      }

      // 处理缓冲区中剩余的数据
      if (buffer.trim() !== '') {
        console.warn('[SSE] 缓冲区剩余数据:', buffer.slice(0, 100));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '网络错误';
      setError(errorMsg);
      addLog(`❌ 错误: ${errorMsg}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  // 处理进度事件
  const handleProgressEvent = (event: ProgressEvent) => {
    try {
      // 验证事件类型
      if (!event || !event.type) {
        console.warn('[SSE] 收到无效事件:', event);
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
            const msg = `➕ 开仓 [${event.strategy}]: ${event.question.substring(0, 40)}... @ ${event.entryPrice}`;
            addLog(msg, 'success');
          }
          break;

        case 'trade_closed':
          if (event.strategy && event.pnl && event.exitReason) {
            const pnlNum = parseFloat(event.pnl);
            const type = pnlNum >= 0 ? 'success' : 'error';
            const msg = `➖ 平仓 [${event.strategy}]: ${pnlNum >= 0 ? '+' : ''}${event.pnl} (${event.pnlPercent}%) - ${event.exitReason}`;
            addLog(msg, type);
          }
          break;

        case 'trades_batch':
          // 处理分批发送的交易记录
          if (event.tradesBatch && Array.isArray(event.tradesBatch)) {
            setIsReceivingBatches(true);
            setTradesBatches(prev => [...prev, ...(event.tradesBatch || [])]);
            const batchNum = event.batchIndex !== undefined ? event.batchIndex + 1 : '?';
            const totalBatches = event.totalBatches !== undefined ? event.totalBatches : '?';
            addLog(`📦 接收交易记录批次 ${batchNum}/${totalBatches}`, 'info');

            // 所有批次接收完成
            if (event.batchIndex !== undefined && event.totalBatches !== undefined &&
                event.batchIndex + 1 >= event.totalBatches) {
              setIsReceivingBatches(false);
              addLog('✅ 所有交易记录接收完成', 'success');
            }
          }
          break;

        case 'equity_curve':
          // 处理资金曲线数据
          if (event.equityCurve && Array.isArray(event.equityCurve)) {
            setResult((prevResult) => {
              // 如果已经有result，合并equityCurve
              if (prevResult) {
                return {
                  ...prevResult,
                  equityCurve: event.equityCurve as { timestamp: Date; equity: number; positions: number }[],
                };
              }
              // 如果还没有result，创建一个临时的result对象
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
                  convergence: {
                    trades: 0,
                    winRate: 0,
                    totalPnl: 0,
                    averagePnl: 0,
                    maxDrawdown: 0,
                  },
                  arbitrage: {
                    trades: 0,
                    winRate: 0,
                    totalPnl: 0,
                    averagePnl: 0,
                    maxDrawdown: 0,
                  },
                  reversal: {
                    trades: 0,
                    winRate: 0,
                    totalPnl: 0,
                    averagePnl: 0,
                    maxDrawdown: 0,
                  },
                  trend_following: {
                    trades: 0,
                    winRate: 0,
                    totalPnl: 0,
                    averagePnl: 0,
                    maxDrawdown: 0,
                  },
                  mean_reversion: {
                    trades: 0,
                    winRate: 0,
                    totalPnl: 0,
                    averagePnl: 0,
                    maxDrawdown: 0,
                  },
                },
                equityCurve: event.equityCurve as { timestamp: Date; equity: number; positions: number }[],
                tradesList: [],
              } as BacktestResult;
            });
            addLog(`📊 接收到资金曲线数据 (${event.equityCurve.length} 个快照)`, 'info');
          }
          break;

        case 'complete':
          setProgress(100);
          if (event.message) addLog(event.message, 'success');

          // 处理完整的 BacktestResult 对象（不包含tradesList）
          if (event.fullResult) {
            setResult((prevResult) => {
              // 如果之前已经有result（比如equity_curve事件设置的），保留equityCurve
              if (prevResult && prevResult.equityCurve && prevResult.equityCurve.length > 0) {
                return {
                  ...event.fullResult,
                  equityCurve: prevResult.equityCurve, // 保留已有的equityCurve
                } as BacktestResult;
              }
              return event.fullResult as BacktestResult;
            });
            setCurrentStep('complete');
          }

          // 注意：不再处理单独的event.result（摘要信息），因为现在总是发送fullResult

          break;

        case 'error':
          setCurrentStep('error');
          if (event.message) addLog(event.message, 'error');
          if (event.error) setError(event.error);
          break;

        default:
          console.warn('[SSE] 未知事件类型:', event.type);
      }
    } catch (error) {
      console.error('[SSE] 处理事件失败:', error, event);
      addLog(`⚠️ 事件处理失败: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">回测系统</h1>
            <p className="text-slate-400">基于Polymarket真实数据的策略回测</p>
          </div>
          <Button
            onClick={runBacktest}
            disabled={isRunning || !selectedDataFile}
            size="lg"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isRunning ? (
              <>
                <Activity className="mr-2 h-5 w-5 animate-spin" />
                运行中...
              </>
            ) : (
              <>
                <PlayCircle className="mr-2 h-5 w-5" />
                运行回测
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* 配置面板 */}
          <Card className="bg-slate-900 border-slate-800 lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-white">配置</CardTitle>
              <CardDescription>设置回测参数</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label className="text-slate-400 text-sm">初始资金 ($)</Label>
                  <Input
                    type="number"
                    value={initialCapital}
                    onChange={(e) => setInitialCapital(Number(e.target.value))}
                    className="bg-slate-800 border-slate-700 text-white mt-1"
                    disabled={isRunning}
                  />
                </div>
                <div>
                  <Label className="text-slate-400 text-sm">回测天数</Label>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="bg-slate-800 border-slate-700 text-white mt-1"
                    disabled={isRunning}
                  />
                </div>
              </div>

              <Separator className="bg-slate-800" />

              {/* 数据选择 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-white text-sm">选择数据</Label>
                  <Link href="/import" className="text-xs text-blue-400 hover:text-blue-300">
                    导入新数据
                  </Link>
                </div>
                {importedDataList.length > 0 ? (
                  <div className="space-y-2">
                    {importedDataList.map((data) => (
                      <button
                        key={data.fileName}
                        onClick={() => {
                          setSelectedDataFile(data.fileName);
                          setSelectedDataSnapshotCount(data.snapshotCount);
                        }}
                        className={`w-full p-3 rounded-lg text-left transition-colors ${
                          selectedDataFile === data.fileName
                            ? 'bg-blue-900/50 border border-blue-700'
                            : 'bg-slate-800 border border-slate-700 hover:bg-slate-750'
                        }`}
                        disabled={isRunning}
                      >
                        <div className="text-white text-xs font-medium mb-1">
                          {data.fileName.replace('backtest_data_', '').replace('.json', '')}
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">
                            {data.snapshotCount.toLocaleString()} 快照
                          </span>
                          <span className="text-slate-400">
                            {data.marketCount} 市场
                          </span>
                        </div>
                        {data.dateRange && (
                          <div className="text-xs text-slate-500 mt-1">
                            {new Date(data.dateRange.start).toLocaleDateString()} - {new Date(data.dateRange.end).toLocaleDateString()}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-800 rounded-lg p-4 text-center">
                    <p className="text-slate-400 text-sm mb-2">暂无导入的数据</p>
                    <Link href="/import">
                      <Button variant="outline" size="sm" className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">
                        前往导入
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              <Separator className="bg-slate-800" />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-white text-sm">尾盘收敛</Label>
                  <Switch checked={convergenceEnabled} onCheckedChange={setConvergenceEnabled} disabled={isRunning} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-white text-sm">Gamma套利</Label>
                  <Switch checked={arbitrageEnabled} onCheckedChange={setArbitrageEnabled} disabled={isRunning} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-white text-sm">反转套利</Label>
                  <Switch checked={reversalEnabled} onCheckedChange={setReversalEnabled} disabled={isRunning} />
                </div>
              </div>

              <Separator className="bg-slate-800" />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-white text-sm">仅加密货币</Label>
                  <Switch checked={useCryptoFilter} onCheckedChange={setUseCryptoFilter} disabled={isRunning} />
                </div>
                <div>
                  <Label className="text-slate-400 text-sm">最小成交量</Label>
                  <Input
                    type="number"
                    value={minVolume}
                    onChange={(e) => setMinVolume(Number(e.target.value))}
                    className="bg-slate-800 border-slate-700 text-white text-sm mt-1"
                    disabled={isRunning}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 主面板 */}
          <div className="lg:col-span-3 space-y-6">
            {/* 实时进度卡片 */}
            {isRunning && (
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <Activity className="mr-2 h-5 w-5 text-blue-500" />
                    回测进度
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 进度条 */}
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-400">处理进度</span>
                      <span className="text-white font-medium">{progress.toFixed(1)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  {/* 统计卡片 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-800 p-3 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">市场数</div>
                      <div className="text-xl font-bold text-white">{stats.markets}</div>
                    </div>
                    <div className="bg-slate-800 p-3 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">快照数</div>
                      <div className="text-xl font-bold text-white">{stats.snapshots}</div>
                    </div>
                    <div className="bg-slate-800 p-3 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">已处理</div>
                      <div className="text-xl font-bold text-blue-400">{stats.processed}</div>
                    </div>
                    <div className="bg-slate-800 p-3 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">当前资金</div>
                      <div className="text-xl font-bold text-emerald-400">${stats.currentEquity.toFixed(0)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-800 p-3 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">持仓数</div>
                      <div className="text-lg font-bold text-white">{stats.openPositions}</div>
                    </div>
                    <div className="bg-slate-800 p-3 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">已开仓</div>
                      <div className="text-lg font-bold text-emerald-400">{stats.tradesOpened}</div>
                    </div>
                    <div className="bg-slate-800 p-3 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">已平仓</div>
                      <div className="text-lg font-bold text-slate-400">{stats.tradesClosed}</div>
                    </div>
                  </div>

                  {/* 实时日志 */}
                  <div>
                    <div className="text-xs text-slate-400 mb-2">实时日志</div>
                    <ScrollArea className="h-48 rounded-lg border border-slate-700 bg-slate-950 p-3">
                      <div className="space-y-1 text-xs">
                        {logs.length === 0 ? (
                          <div className="text-slate-500">等待开始...</div>
                        ) : (
                          logs.map((log, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="text-slate-500 shrink-0">
                                {log.timestamp.toLocaleTimeString()}
                              </span>
                              <span
                                className={
                                  log.type === 'success'
                                    ? 'text-emerald-400'
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

            {/* 错误提示 */}
            {error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>回测失败</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* 数据处理中提示 */}
            {isReceivingBatches && (
              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center gap-3">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    <p className="text-slate-300">正在接收交易数据，请稍候...</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 结果展示 */}
            {result && (result.tradesList || (result.pnl && result.trades && result.strategyStats)) && (
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <CheckCircle className="mr-2 h-5 w-5 text-emerald-500" />
                    回测结果
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="bg-slate-800">
                      <TabsTrigger value="overview">概览</TabsTrigger>
                      <TabsTrigger value="equity">资金曲线</TabsTrigger>
                      <TabsTrigger value="strategies">策略</TabsTrigger>
                      <TabsTrigger value="trades">交易</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="p-4 bg-slate-800 rounded-lg">
                          <p className="text-sm text-slate-400">总收益</p>
                          <p className={`text-2xl font-bold ${result.pnl?.totalPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {result.pnl?.totalPercent !== undefined
                              ? (result.pnl.totalPercent >= 0 ? '+' : '') + result.pnl.totalPercent.toFixed(2) + '%'
                              : '-'}
                          </p>
                        </div>
                        <div className="p-4 bg-slate-800 rounded-lg">
                          <p className="text-sm text-slate-400">胜率</p>
                          <p className="text-2xl font-bold text-white">
                            {result.trades?.winRate !== undefined ? result.trades.winRate.toFixed(2) + '%' : '-'}
                          </p>
                        </div>
                        <div className="p-4 bg-slate-800 rounded-lg">
                          <p className="text-sm text-slate-400">夏普比率</p>
                          <p className="text-2xl font-bold text-white">
                            {result.pnl?.sharpeRatio !== undefined ? result.pnl.sharpeRatio.toFixed(2) : '-'}
                          </p>
                        </div>
                        <div className="p-4 bg-slate-800 rounded-lg">
                          <p className="text-sm text-slate-400">最大回撤</p>
                          <p className="text-2xl font-bold text-red-400">
                            {result.pnl?.maxDrawdownPercent !== undefined
                              ? '-' + result.pnl.maxDrawdownPercent.toFixed(2) + '%'
                              : '-'}
                          </p>
                        </div>
                        <div className="p-4 bg-slate-800 rounded-lg">
                          <p className="text-sm text-slate-400">交易数</p>
                          <p className="text-2xl font-bold text-white">
                            {result.trades?.total !== undefined ? result.trades.total : '-'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 bg-slate-800 rounded-lg">
                          <h4 className="text-sm font-medium text-slate-300 mb-2">盈亏统计</h4>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-400">总盈亏</span>
                              <span className={`font-medium ${result.pnl?.total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {result.pnl?.total !== undefined ? `$${result.pnl.total.toFixed(2)}` : '-'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">收益率</span>
                              <span className={`font-medium ${result.pnl?.totalPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {result.pnl?.totalPercent !== undefined ? result.pnl.totalPercent.toFixed(2) + '%' : '-'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 bg-slate-800 rounded-lg">
                          <h4 className="text-sm font-medium text-slate-300 mb-2">交易统计</h4>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-400">盈利</span>
                              <span className="font-medium text-emerald-400">{result.trades.winning}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">亏损</span>
                              <span className="font-medium text-red-400">{result.trades.losing}</span>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 bg-slate-800 rounded-lg">
                          <h4 className="text-sm font-medium text-slate-300 mb-2">最佳/最差</h4>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-400">最佳</span>
                              <span className="font-medium text-emerald-400">
                                ${result.trades.bestTrade.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">最差</span>
                              <span className="font-medium text-red-400">
                                ${result.trades.worstTrade.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="equity" className="space-y-4 mt-4">
                      <Card className="bg-slate-800 border-slate-700">
                        <CardHeader>
                          <CardTitle className="text-white flex items-center">
                            <LineChart className="mr-2 h-5 w-5" />
                            资金曲线
                          </CardTitle>
                          <CardDescription className="text-slate-400">
                            资金随时间变化趋势
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="h-96">
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
                                  fontSize={11}
                                  tickLine={false}
                                  axisLine={{ stroke: '#475569', strokeWidth: 0.5 }}
                                />
                                <YAxis
                                  stroke="#94a3b8"
                                  fontSize={11}
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
                                  labelStyle={{ color: '#f1f5f9', fontSize: 12, fontWeight: 500 }}
                                  itemStyle={{ color: '#f1f5f9', fontSize: 12 }}
                                  formatter={(value: number, name: string) => {
                                    if (name === 'equity') {
                                      return [`$${value.toLocaleString()}`, '资金'];
                                    }
                                    return [value, name];
                                  }}
                                />
                                <Legend verticalAlign="top" height={36} />
                                <Area
                                  type="monotone"
                                  dataKey="equity"
                                  name="资金曲线"
                                  stroke="#10b981"
                                  strokeWidth={2.5}
                                  fill="url(#equityGradient)"
                                />
                                <Line
                                  type="monotone"
                                  dataKey="equity"
                                  stroke="#10b981"
                                  strokeWidth={2.5}
                                  dot={false}
                                  activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-slate-800 border-slate-700">
                        <CardHeader>
                          <CardTitle className="text-white flex items-center">
                            <BarChart3 className="mr-2 h-5 w-5" />
                            持仓数量变化
                          </CardTitle>
                          <CardDescription className="text-slate-400">
                            随时间变化的持仓数量
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="h-64">
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
                                  fontSize={11}
                                  tickLine={false}
                                  axisLine={{ stroke: '#475569', strokeWidth: 0.5 }}
                                />
                                <YAxis
                                  stroke="#94a3b8"
                                  fontSize={11}
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
                                  labelStyle={{ color: '#f1f5f9', fontSize: 12, fontWeight: 500 }}
                                  itemStyle={{ color: '#f1f5f9', fontSize: 12 }}
                                  formatter={(value: number) => [value, '持仓数']}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="positions"
                                  name="持仓数量"
                                  stroke="#8b5cf6"
                                  strokeWidth={2.5}
                                  fill="url(#positionGradient)"
                                />
                                <Line
                                  type="monotone"
                                  dataKey="positions"
                                  stroke="#8b5cf6"
                                  strokeWidth={2.5}
                                  dot={false}
                                  activeDot={{ r: 5, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="strategies" className="space-y-4 mt-4">
                      {result.strategyStats ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {Object.entries(result.strategyStats).map(([name, stats]: [string, any]) => (
                            <Card key={name} className="bg-slate-800 border-slate-700">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-white text-base capitalize">
                                  {name}
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">交易数</span>
                                  <span className="text-white font-medium">{stats.trades}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">胜率</span>
                                  <span className="text-white font-medium">{stats.winRate.toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">总盈亏</span>
                                  <span className={`font-medium ${stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    ${stats.totalPnl.toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">平均</span>
                                  <span className={`font-medium ${stats.averagePnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    ${stats.averagePnl.toFixed(2)}
                                  </span>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center text-slate-400 py-8">暂无策略统计信息</div>
                      )}
                    </TabsContent>

                    <TabsContent value="trades" className="space-y-4 mt-4">
                      {/* 交易时间线 */}
                      <Card className="bg-slate-800 border-slate-700">
                        <CardHeader>
                          <CardTitle className="text-white flex items-center">
                            <Clock className="mr-2 h-5 w-5" />
                            交易时间线
                          </CardTitle>
                          <CardDescription className="text-slate-400">
                            随时间显示的每笔交易盈亏
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="h-64">
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
                                  fontSize={11}
                                  tickLine={false}
                                  axisLine={false}
                                />
                                <YAxis
                                  stroke="#94a3b8"
                                  fontSize={11}
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
                                  labelStyle={{ color: '#f1f5f9', fontSize: 11 }}
                                  itemStyle={{ color: '#f1f5f9', fontSize: 11 }}
                                  formatter={(value: number, name: string) => {
                                    if (name === 'pnl') {
                                      const formattedValue = value.toFixed(2);
                                      return [`$${value >= 0 ? '+' : ''}${formattedValue}`, '盈亏'];
                                    }
                                    return [value, name];
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="pnl"
                                  name="盈亏"
                                  stroke="#8b5cf6"
                                  fill="#8b5cf6"
                                  fillOpacity={0.3}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>

                      {/* 每日盈亏 */}
                      <Card className="bg-slate-800 border-slate-700">
                        <CardHeader>
                          <CardTitle className="text-white flex items-center">
                            <TrendingUp className="mr-2 h-5 w-5" />
                            每日盈亏
                          </CardTitle>
                          <CardDescription className="text-slate-400">
                            每日收益与亏损统计
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="h-64">
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
                                  fontSize={12}
                                  tickLine={false}
                                  axisLine={false}
                                />
                                <YAxis
                                  stroke="#94a3b8"
                                  fontSize={12}
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
                                  labelStyle={{ color: '#f1f5f9', fontSize: 11 }}
                                  itemStyle={{ color: '#f1f5f9', fontSize: 11 }}
                                  formatter={(value: number) => [`$${value.toFixed(2)}`, '每日盈亏']}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="dailyPnl"
                                  name="每日盈亏"
                                  stroke="#f59e0b"
                                  fill="#f59e0b"
                                  fillOpacity={0.3}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>

                      {/* 交易详细记录 */}
                      <Card className="bg-slate-800 border-slate-700">
                        <CardHeader>
                          <CardTitle className="text-white flex items-center">
                            <BarChart3 className="mr-2 h-5 w-5" />
                            交易明细
                          </CardTitle>
                          <CardDescription className="text-slate-400">
                            所有交易的详细信息
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="rounded-lg border border-slate-700 overflow-hidden">
                            <ScrollArea className="h-96 w-full">
                              <div className="min-w-[1200px]"> {/* 增加最小宽度确保横向滚动 */}
                                <table className="w-full text-sm">
                                <thead className="bg-slate-900 sticky top-0">
                                  <tr>
                                    <th className="px-4 py-3 text-left text-slate-300 font-medium">#</th>
                                    <th className="px-4 py-3 text-left text-slate-300 font-medium">策略</th>
                                    <th className="px-4 py-3 text-left text-slate-300 font-medium">问题</th>
                                    <th className="px-4 py-3 text-right text-slate-300 font-medium">入场</th>
                                    <th className="px-4 py-3 text-right text-slate-300 font-medium">出场</th>
                                    <th className="px-4 py-3 text-right text-slate-300 font-medium">盈亏</th>
                                    <th className="px-4 py-3 text-left text-slate-300 font-medium">原因</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {mergedTradesList && mergedTradesList.length > 0 ? (
                                    mergedTradesList.map((trade: any, index: number) => (
                                      <tr key={index} className="border-t border-slate-700 hover:bg-slate-800/50">
                                        <td className="px-4 py-2 text-slate-400 text-xs">
                                          {index + 1}
                                        </td>
                                        <td className="px-4 py-2">
                                          <Badge variant="outline" className="capitalize text-xs">
                                            {trade.strategy}
                                          </Badge>
                                        </td>
                                        <td className="px-4 py-2 text-slate-300 max-w-xs truncate text-xs" title={trade.question}>
                                          {trade.question}
                                        </td>
                                        <td className="px-4 py-2 text-right text-white text-xs">
                                          ${(trade.entryValue || trade.positionSize * trade.entryPrice).toFixed(2)}
                                          <span className="text-slate-400 ml-1">
                                            ({(trade.entryPrice * 100).toFixed(1)}%)
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-right text-white text-xs">
                                          {trade.exitPrice ? (
                                            <>
                                              ${(trade.exitValue || trade.positionSize * trade.exitPrice).toFixed(2)}
                                              <span className="text-slate-400 ml-1">
                                                ({(trade.exitPrice * 100).toFixed(1)}%)
                                              </span>
                                            </>
                                          ) : '-'}
                                        </td>
                                        <td className={`px-4 py-2 text-right font-medium text-xs ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                          {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                                          <span className="text-slate-400 ml-1">
                                            ({trade.pnl >= 0 ? '+' : ''}{(trade.pnlPercent || 0).toFixed(1)}%)
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-slate-400 text-xs max-w-[100px] truncate" title={trade.exitReason}>
                                          {trade.exitReason}
                                        </td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                                        暂无交易记录
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

            {/* 空状态 */}
            {!result && !isRunning && !error && (
              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="pt-16 pb-16 text-center">
                  <BarChart3 className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                  <div>
                    <h3 className="text-lg font-medium text-white mb-2">开始回测</h3>
                    <p className="text-slate-400 max-w-md mx-auto text-sm">
                      配置回测参数和策略，点击"运行回测"按钮查看策略历史表现
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
