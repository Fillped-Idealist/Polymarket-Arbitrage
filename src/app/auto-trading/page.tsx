'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Play, Square, Settings, TrendingUp, TrendingDown, Activity, Target, DollarSign, AlertCircle, CheckCircle, Clock, Zap, BarChart3, RefreshCw, Loader2 } from 'lucide-react';

interface EngineStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  maxDrawdown: number;
  peakEquity: number;
  dailyPnl: number;
  dailyTrades: number;
  winRate: number;
  currentEquity: number;
  currentDrawdown: number;
}

interface Position {
  id: string;
  marketId: string;
  strategy: string;
  status: string;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  entryTime: string;
  exitTime: string | null;
}

interface EngineConfig {
  totalCapital: number;
  maxTotalPositions: number;
  maxTotalExposure: number;
  strategies: {
    convergence: { enabled: boolean; maxPositions: number; maxPositionSize: number };
    reversal: { enabled: boolean; maxPositions: number; maxPositionSize: number };
  };
  autoTradingEnabled: boolean;
  autoRefreshInterval: number;
}

export default function AutoTradingPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [config, setConfig] = useState<EngineConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testMode, setTestMode] = useState<string>('1-convergence-4-reversal');
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>('');
  const [progressDetails, setProgressDetails] = useState<string>('');
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      case 'reversal':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStrategyName = (strategy: string) => {
    switch (strategy) {
      case 'convergence':
        return '尾盘策略';
      case 'reversal':
        return '反转策略';
      default:
        return strategy;
    }
  };

  const getStrategyDescription = (strategy: string) => {
    switch (strategy) {
      case 'convergence':
        return '尾盘策略：在市场临近结束时，价格向最终结果收敛';
      case 'reversal':
        return '反转策略：捕捉从低价格（1%-35%）突然上涨的机会';
      default:
        return strategy;
    }
  };

  const fetchEngineData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auto-trading', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000), // 10秒超时
      });

      const data = await response.json();

      if (data.success) {
        setIsRunning(data.isRunning);
        setIsInitializing(data.isInitializing || false);
        setStats(data.stats);
        setPositions(data.positions || []);
        setConfig(data.config);

        // 更新进度信息
        if (data.progress && data.progress.step !== 'idle') {
          const percent = Math.floor((data.progress.current / data.progress.total) * 100);
          setProgress(percent);
          setProgressText(data.progress.message);
          setProgressDetails(data.progress.details || '');
        } else if (data.progress && data.progress.step === 'idle' && data.progress.message) {
          setProgress(0);
          setProgressText('');
          setProgressDetails('');
        }
      } else {
        setError(data.error || '获取数据失败');
      }
    } catch (err) {
      console.error('Failed to fetch engine data:', err);
      setError(err instanceof Error ? err.message : '网络请求失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const startEngine = async () => {
    setStarting(true);
    setError(null);
    setProgress(0);
    setProgressText('正在初始化...');

    try {
      // 模拟进度
      const progressSteps = [
        { progress: 20, text: '清空旧数据...' },
        { progress: 40, text: '创建交易引擎...' },
        { progress: 60, text: '连接 Gamma API...' },
        { progress: 80, text: '连接 CLOB API...' },
        { progress: 100, text: '启动完成！' },
      ];

      let stepIndex = 0;
      const progressInterval = setInterval(() => {
        if (stepIndex < progressSteps.length) {
          setProgress(progressSteps[stepIndex].progress);
          setProgressText(progressSteps[stepIndex].text);
          stepIndex++;
        }
      }, 500);

      const response = await fetch('/api/auto-trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          testMode,
          initialCapital,
        }),
      });

      clearInterval(progressInterval);

      const data = await response.json();

      if (data.success) {
        setProgress(0);
        setProgressText('');
        // 启动后立即刷新
        setTimeout(() => {
          fetchEngineData();
        }, 3000);
      } else {
        setError(data.error);
        setProgress(0);
        setProgressText('');
      }
    } catch (err) {
      console.error('Failed to start engine:', err);
      setError(err instanceof Error ? err.message : '启动失败');
      setProgress(0);
      setProgressText('');
    } finally {
      setStarting(false);
    }
  };

  const stopEngine = async () => {
    setStopping(true);
    setError(null);

    try {
      const response = await fetch('/api/auto-trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });

      const data = await response.json();

      if (data.success) {
        await fetchEngineData();
      } else {
        setError(data.error);
      }
    } catch (err) {
      console.error('Failed to stop engine:', err);
      setError(err instanceof Error ? err.message : '停止失败');
    } finally {
      setStopping(false);
    }
  };

  // 定时刷新
  useEffect(() => {
    if (isRunning) {
      // 清除旧的定时器
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }

      // 设置新的定时器（每 10 秒刷新一次）
      refreshIntervalRef.current = setInterval(() => {
        fetchEngineData();
      }, 10000);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [isRunning, fetchEngineData]);

  // 初始加载
  useEffect(() => {
    fetchEngineData();
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [fetchEngineData]);

  const activePositions = positions.filter(p => p.status === 'active');

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="border-b bg-white/50 backdrop-blur-sm dark:bg-slate-950/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  返回首页
                </Link>
              </Button>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                  自动量化交易
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Polymarket 自动化交易系统（使用真实 API 数据）
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isInitializing ? (
                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  初始化中
                </Badge>
              ) : isRunning ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                  <div className="mr-1 h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                  运行中
                </Badge>
              ) : (
                <Badge className="bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  已停止
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={fetchEngineData} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              {!isRunning && !isInitializing ? (
                <Button size="sm" onClick={startEngine} disabled={starting}>
                  {starting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      启动中...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      启动
                    </>
                  )}
                </Button>
              ) : (
                <Button variant="destructive" size="sm" onClick={stopEngine} disabled={stopping}>
                  {stopping ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      停止中...
                    </>
                  ) : (
                    <>
                      <Square className="mr-2 h-4 w-4" />
                      停止
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Error Alert */}
      {error && (
        <div className="container mx-auto px-4 py-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>错误</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Progress */}
      {(progress > 0 || progressText) && (
        <div className="container mx-auto px-4 py-4">
          <Card className="border-blue-500 bg-blue-950/50">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-blue-400">
                  <div className="flex items-center gap-2">
                    {progress > 0 && <Loader2 className="h-4 w-4 animate-spin" />}
                    <span>{progressText}</span>
                  </div>
                  {progress > 0 && <span>{progress}%</span>}
                </div>
                {progress > 0 && <Progress value={progress} className="h-2" />}
                {progressDetails && (
                  <p className="text-xs text-blue-500 mt-1">{progressDetails}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="container mx-auto px-4 py-6">
        {/* Configuration Panel */}
        {!isRunning && !isInitializing && config && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                交易配置
              </CardTitle>
              <CardDescription>配置交易模式和初始资金</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>测试模式</Label>
                  <Select value={testMode} onValueChange={setTestMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-convergence-4-reversal">
                        1 Convergence + 4 Reversal
                      </SelectItem>
                      <SelectItem value="2-convergence-3-reversal">
                        2 Convergence + 3 Reversal
                      </SelectItem>
                      <SelectItem value="all-reversal">
                        全部 Reversal（5 个仓位）
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>初始资金（USD）</Label>
                  <input
                    type="number"
                    value={initialCapital}
                    onChange={(e) => setInitialCapital(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  总收益
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stats.dailyPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(stats.dailyPnl)}
                </div>
                <p className={`text-sm mt-1 ${stats.dailyPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.winRate.toFixed(1)}% 胜率
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  当前权益
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats.currentEquity)}</div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  最高: {formatCurrency(stats.peakEquity)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  总交易数
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalTrades}</div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  盈: {stats.winningTrades} / 亏: {stats.losingTrades}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  当前持仓
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activePositions.length}</div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  最大: {config?.maxTotalPositions || 5}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Running Status Hint */}
        {isRunning && !isInitializing && (
          <Card className="mb-6 border-green-500 bg-green-950/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">交易引擎正在后台运行</p>
                  <p className="text-sm text-green-600">
                    您可以安全地离开此页面，引擎将继续自动交易。下次访问时，数据会自动更新。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Strategy Descriptions */}
        {config && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                策略说明
              </CardTitle>
              <CardDescription>当前使用的交易策略</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(config.strategies).map(([key, strategy]) => (
                  <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-slate-100 dark:bg-slate-800">
                    <Badge variant="outline" className={getStrategyColor(key)}>
                      {key}
                    </Badge>
                    <div>
                      <p className="font-medium">{getStrategyName(key)}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {getStrategyDescription(key)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        最大持仓: {strategy.maxPositions} / 最大比例: {(strategy.maxPositionSize * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Positions Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              当前持仓
            </CardTitle>
            <CardDescription>
              {activePositions.length === 0 && !isRunning
                ? '启动交易后，这里将显示当前的持仓信息'
                : `共 ${activePositions.length} 个持仓`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isRunning ? (
              <div className="text-center py-12 text-slate-600 dark:text-slate-400">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>交易引擎未运行</p>
                <p className="text-sm mt-2">请点击右上角"启动"按钮开始交易</p>
              </div>
            ) : activePositions.length === 0 ? (
              <div className="text-center py-12 text-slate-600 dark:text-slate-400">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50 animate-pulse" />
                <p>暂无持仓</p>
                <p className="text-sm mt-2">系统正在从 Gamma API 获取市场数据...</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>市场</TableHead>
                    <TableHead>策略</TableHead>
                    <TableHead>入场价</TableHead>
                    <TableHead>当前价</TableHead>
                    <TableHead>盈亏</TableHead>
                    <TableHead>盈亏%</TableHead>
                    <TableHead>入场时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activePositions.map((position) => (
                    <TableRow key={position.id}>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={position.marketId}>
                          {position.marketId.substring(0, 20)}...
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStrategyColor(position.strategy)}>
                          {getStrategyName(position.strategy)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(position.entryPrice)}</TableCell>
                      <TableCell>{formatCurrency(position.currentPrice)}</TableCell>
                      <TableCell className={position.pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(position.pnl)}
                      </TableCell>
                      <TableCell className={position.pnlPercent >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatPercent(position.pnlPercent)}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                        {new Date(position.entryTime).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
