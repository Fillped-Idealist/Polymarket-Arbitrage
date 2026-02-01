'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Play, Square, RefreshCw, TrendingUp, TrendingDown, DollarSign, Clock, AlertCircle, CheckCircle2, Loader2, Activity, Zap, Target, Shield } from 'lucide-react';

interface Position {
  id: string;
  market_id: string;
  question: string;
  strategy: 'reversal' | 'convergence';
  outcome_name: string;
  entry_price: number;
  current_price: number;
  position_size: number;
  entry_time: string;
  current_pnl: number;
  current_pnl_percent: number;
  highest_price: number;
  status: 'open' | 'closed';
  exit_price?: number;
  exit_time?: string;
  exit_reason?: string;
  pnl?: number;
  pnl_percent?: number;
}

interface Statistics {
  isRunning: boolean;
  isInitializing: boolean;
  lastUpdate: string;
  positions: {
    openCount: number;
    closedCount: number;
    openPositions: Position[];
    closedPositions: Position[];
    totalPnl: number;
    floatingPnl: number;
    equity: number;
    totalAssets: number;
    winCount: number;
    lossCount: number;
    winRate: number;
  };
  candidates: {
    totalCandidates: number;
    validCandidates: number;
  };
  config: any;
}

export default function LiveTradingV2Page() {
  const [status, setStatus] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [testMode, setTestMode] = useState<string>('all-reversal');
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>('');
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 获取状态
  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/live-trading?version=v2', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000), // 10秒超时
      });

      const result = await response.json();

      if (result.success) {
        setStatus(result.data);
        setLastUpdateTime(new Date());
      } else {
        setError(result.message);
      }
    } catch (err) {
      console.error('获取状态失败:', err);
      setError(err instanceof Error ? err.message : '网络请求失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 启动交易
  const startTrading = async () => {
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

      const response = await fetch('/api/live-trading?version=v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testMode, initialCapital, version: 'v2' }),
      });

      clearInterval(progressInterval);

      const result = await response.json();

      if (result.success) {
        setStatus(result.data);
        setLastUpdateTime(new Date());
        // 启动后立即刷新
        setTimeout(() => {
          fetchStatus();
          setProgress(0);
          setProgressText('');
        }, 3000);
      } else {
        setError(result.message);
        setProgress(0);
        setProgressText('');
      }
    } catch (err) {
      console.error('启动失败:', err);
      setError(err instanceof Error ? err.message : '启动失败');
      setProgress(0);
      setProgressText('');
    } finally {
      setStarting(false);
    }
  };

  // 停止交易
  const stopTrading = async () => {
    setStopping(true);
    setError(null);

    try {
      const response = await fetch('/api/live-trading?version=v2', {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        setStatus(result.data);
        setLastUpdateTime(new Date());
      } else {
        setError(result.message);
      }
    } catch (err) {
      console.error('停止失败:', err);
      setError(err instanceof Error ? err.message : '停止失败');
    } finally {
      setStopping(false);
    }
  };

  // 定时刷新
  useEffect(() => {
    if (status?.isRunning) {
      // 清除旧的定时器
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }

      // 设置新的定时器（每 10 秒刷新一次）
      refreshIntervalRef.current = setInterval(() => {
        fetchStatus();
      }, 10000);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [status?.isRunning, fetchStatus]);

  // 初始加载
  useEffect(() => {
    fetchStatus();
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [fetchStatus]);

  // 计算总盈亏
  const calculateTotalPnl = () => {
    if (!status) return 0;
    return status.positions.totalPnl + status.positions.floatingPnl;
  };

  const totalPnl = calculateTotalPnl();
  const totalPnlPercent = status
    ? ((totalPnl / (initialCapital || 10000)) * 100)
    : 0;

  // 获取策略描述
  const getStrategyDescription = (strategy: string) => {
    switch (strategy) {
      case 'reversal':
        return '反转策略：捕捉从低价格（1%-35%）突然上涨的机会';
      case 'convergence':
        return '尾盘策略：在市场临近结束时，价格向最终结果收敛';
      default:
        return strategy;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
              <Activity className="h-8 w-8 text-blue-500" />
              实盘交易仪表盘 V2
              <Badge variant="outline" className="ml-2">真实数据</Badge>
            </h1>
            <p className="text-slate-400 mt-1">
              Polymarket 自动化交易系统（使用真实 API 数据）
              {lastUpdateTime && ` · 最后更新: ${lastUpdateTime.toLocaleTimeString()}`}
              {loading && <Loader2 className="h-4 w-4 inline ml-2 animate-spin" />}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={fetchStatus}
              disabled={loading}
              title="刷新数据"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            {!status?.isRunning ? (
              <Button
                onClick={startTrading}
                disabled={starting || status?.isRunning}
                className="bg-green-600 hover:bg-green-700"
                size="lg"
              >
                {starting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    启动中...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    启动交易
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={stopTrading}
                disabled={stopping}
                variant="destructive"
                size="lg"
              >
                {stopping ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    停止中...
                  </>
                ) : (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    停止交易
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <Card className="border-red-500 bg-red-950/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle className="h-5 w-5" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 进度条 */}
        {progress > 0 && (
          <Card className="border-blue-500 bg-blue-950/50">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-blue-400">
                  <span>{progressText}</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* 配置面板 */}
        {!status?.isRunning && (
          <Card className="border-slate-700 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Target className="h-5 w-5" />
                交易配置
              </CardTitle>
              <CardDescription>配置交易模式和初始资金</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">测试模式</label>
                  <Select value={testMode} onValueChange={setTestMode}>
                    <SelectTrigger className="border-slate-700 bg-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-slate-700 bg-slate-800">
                      <SelectItem value="all-reversal">
                        全部 Reversal（5 个仓位）
                      </SelectItem>
                      <SelectItem value="1-convergence-4-reversal">
                        1 Convergence + 4 Reversal
                      </SelectItem>
                      <SelectItem value="2-convergence-3-reversal">
                        2 Convergence + 3 Reversal
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">初始资金（USD）</label>
                  <Input
                    type="number"
                    value={initialCapital}
                    onChange={(e) => setInitialCapital(Number(e.target.value))}
                    className="border-slate-700 bg-slate-800"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 状态概览 */}
        {status && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-slate-700 bg-slate-900/50">
              <CardHeader className="pb-3">
                <CardDescription className="text-slate-400">运行状态</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {status.isInitializing ? (
                    <Loader2 className="h-6 w-6 text-yellow-500 animate-spin" />
                  ) : status.isRunning ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : (
                    <AlertCircle className="h-6 w-6 text-yellow-500" />
                  )}
                  <span className="text-2xl font-bold text-white">
                    {status.isInitializing ? '初始化中' : status.isRunning ? '运行中' : '已停止'}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-2">
                  {lastUpdateTime && `更新时间: ${lastUpdateTime.toLocaleTimeString()}`}
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-900/50">
              <CardHeader className="pb-3">
                <CardDescription className="text-slate-400">持仓数量</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-6 w-6 text-blue-500" />
                  <span className="text-2xl font-bold text-white">
                    {status.positions.openCount}/{status.config?.maxPositions || 5}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-2">
                  已平仓: {status.positions.closedCount}
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-900/50">
              <CardHeader className="pb-3">
                <CardDescription className="text-slate-400">总盈亏</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {totalPnl >= 0 ? (
                    <TrendingUp className="h-6 w-6 text-green-500" />
                  ) : (
                    <TrendingDown className="h-6 w-6 text-red-500" />
                  )}
                  <span className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ${totalPnl.toFixed(2)}
                  </span>
                </div>
                <p className={`text-sm mt-2 ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalPnlPercent >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}%
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-900/50">
              <CardHeader className="pb-3">
                <CardDescription className="text-slate-400">候选仓</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Clock className="h-6 w-6 text-purple-500" />
                  <span className="text-2xl font-bold text-white">
                    {status.candidates.validCandidates}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-2">
                  总计: {status.candidates.totalCandidates} (无限制)
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 持仓列表 */}
        {status && (
          <Tabs defaultValue="open" className="space-y-4">
            <TabsList className="bg-slate-900 border border-slate-700">
              <TabsTrigger value="open" className="data-[state=active]:bg-slate-800">
                当前持仓 ({status.positions.openCount})
              </TabsTrigger>
              <TabsTrigger value="closed" className="data-[state=active]:bg-slate-800">
                历史持仓 ({status.positions.closedCount})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="open">
              <Card className="border-slate-700 bg-slate-900/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    当前持仓
                  </CardTitle>
                  {status.positions.openCount === 0 && (
                    <CardDescription>当前没有持仓，系统正在寻找交易机会...</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {status.positions.openPositions.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>暂无持仓</p>
                      <p className="text-sm mt-2">系统正在从 Gamma API 获取市场数据...</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-700">
                          <TableHead className="text-slate-300">市场</TableHead>
                          <TableHead className="text-slate-300">策略</TableHead>
                          <TableHead className="text-slate-300">入场价</TableHead>
                          <TableHead className="text-slate-300">当前价</TableHead>
                          <TableHead className="text-slate-300">仓位</TableHead>
                          <TableHead className="text-slate-300">盈亏</TableHead>
                          <TableHead className="text-slate-300">盈亏%</TableHead>
                          <TableHead className="text-slate-300">入场时间</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {status.positions.openPositions.map((position) => (
                          <TableRow key={position.id} className="border-slate-700">
                            <TableCell className="text-white">
                              <div className="max-w-xs truncate" title={position.question}>
                                {position.question}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-slate-600">
                                {position.strategy}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-white">
                              ${(position.entry_price * 100).toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-white">
                              ${(position.current_price * 100).toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-white">
                              {position.position_size.toFixed(2)}
                            </TableCell>
                            <TableCell className={(position.current_pnl >= 0) ? 'text-green-500' : 'text-red-500'}>
                              ${position.current_pnl.toFixed(2)}
                            </TableCell>
                            <TableCell className={(position.current_pnl_percent >= 0) ? 'text-green-500' : 'text-red-500'}>
                              {position.current_pnl_percent >= 0 ? '+' : ''}{position.current_pnl_percent.toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-slate-400">
                              {new Date(position.entry_time).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="closed">
              <Card className="border-slate-700 bg-slate-900/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    历史持仓
                  </CardTitle>
                  {status.positions.closedCount === 0 && (
                    <CardDescription>还没有历史持仓记录...</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {status.positions.closedPositions.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>暂无历史持仓</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-700">
                          <TableHead className="text-slate-300">市场</TableHead>
                          <TableHead className="text-slate-300">策略</TableHead>
                          <TableHead className="text-slate-300">入场价</TableHead>
                          <TableHead className="text-slate-300">离场价</TableHead>
                          <TableHead className="text-slate-300">盈亏</TableHead>
                          <TableHead className="text-slate-300">盈亏%</TableHead>
                          <TableHead className="text-slate-300">离场原因</TableHead>
                          <TableHead className="text-slate-300">离场时间</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {status.positions.closedPositions.map((position) => (
                          <TableRow key={position.id} className="border-slate-700">
                            <TableCell className="text-white">
                              <div className="max-w-xs truncate" title={position.question}>
                                {position.question}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-slate-600">
                                {position.strategy}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-white">
                              ${(position.entry_price * 100).toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-white">
                              ${((position.exit_price || 0) * 100).toFixed(2)}%
                            </TableCell>
                            <TableCell className={(position.pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}>
                              ${(position.pnl || 0).toFixed(2)}
                            </TableCell>
                            <TableCell className={(position.pnl_percent || 0) >= 0 ? 'text-green-500' : 'text-red-500'}>
                              {(position.pnl_percent || 0) >= 0 ? '+' : ''}{(position.pnl_percent || 0).toFixed(2)}%
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-slate-600">
                                {position.exit_reason || '未知'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-slate-400">
                              {position.exit_time ? new Date(position.exit_time).toLocaleString() : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* 系统信息 */}
        {status && (
          <Card className="border-slate-700 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Activity className="h-5 w-5" />
                系统信息
              </CardTitle>
              <CardDescription>实时系统状态和统计数据</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">总资产</span>
                    <span className="text-white font-bold">${status.positions.totalAssets.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">权益</span>
                    <span className="text-white font-bold">${status.positions.equity.toFixed(2)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">胜率</span>
                    <span className="text-white font-bold">{(status.positions.winRate * 100).toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">胜/负</span>
                    <span className="text-white font-bold">{status.positions.winCount}/{status.positions.lossCount}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">浮动盈亏</span>
                    <span className={`${(status.positions.floatingPnl >= 0) ? 'text-green-500' : 'text-red-500'} font-bold`}>
                      ${status.positions.floatingPnl.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">已实现盈亏</span>
                    <span className={`${(status.positions.totalPnl >= 0) ? 'text-green-500' : 'text-red-500'} font-bold`}>
                      ${status.positions.totalPnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 策略说明 */}
        <Card className="border-slate-700 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="h-5 w-5" />
              策略说明
            </CardTitle>
            <CardDescription>当前使用的交易策略</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50">
                <Badge variant="outline" className="border-purple-600 text-purple-400">Reversal</Badge>
                <div>
                  <p className="text-white font-medium">反转策略</p>
                  <p className="text-sm text-slate-400 mt-1">{getStrategyDescription('reversal')}</p>
                  <p className="text-xs text-slate-500 mt-1">价格区间：1%-5%, 5%-10%, 10%-20%, 20%-35%</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50">
                <Badge variant="outline" className="border-blue-600 text-blue-400">Convergence</Badge>
                <div>
                  <p className="text-white font-medium">尾盘策略</p>
                  <p className="text-sm text-slate-400 mt-1">{getStrategyDescription('convergence')}</p>
                  <p className="text-xs text-slate-500 mt-1">价格区间：90%-95%，临近结束 48 小时内</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
