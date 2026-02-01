'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, Square, RefreshCw, TrendingUp, TrendingDown, DollarSign, Clock } from 'lucide-react';

interface LiveTradingStatus {
  isRunning: boolean;
  updateInterval: string;
  positions: {
    openCount: number;
    closedCount: number;
    openPositions: any[];
    closedPositions: any[];
  };
  candidates: {
    totalCandidates: number;
    validCandidates: number;
  };
  config: {
    testMode: string;
    maxPositions: number;
    maxPositionSize: number;
    strategies: {
      reversal: { enabled: boolean; maxPositions: number };
      convergence: { enabled: boolean; maxPositions: number };
    };
  };
}

export default function LiveTradingPage() {
  const [status, setStatus] = useState<LiveTradingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testMode, setTestMode] = useState<string>('all-reversal');
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  // 获取状态
  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/live-trading');
      const result = await response.json();

      if (result.success) {
        setStatus(result.data);
        setLastUpdateTime(new Date());
      }
    } catch (error) {
      console.error('获取状态失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 启动交易
  const startTrading = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/live-trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testMode, initialCapital }),
      });

      const result = await response.json();

      if (result.success) {
        setStatus(result.data);
        setLastUpdateTime(new Date());
      } else {
        alert(result.message);
      }
    } catch (error) {
      console.error('启动失败:', error);
      alert('启动失败');
    } finally {
      setLoading(false);
    }
  };

  // 停止交易
  const stopTrading = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/live-trading', {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        setStatus(null);
        setLastUpdateTime(new Date());
      } else {
        alert(result.message);
      }
    } catch (error) {
      console.error('停止失败:', error);
      alert('停止失败');
    } finally {
      setLoading(false);
    }
  };

  // 定时刷新
  useEffect(() => {
    if (status?.isRunning) {
      const interval = setInterval(() => {
        fetchStatus();
      }, 30000); // 每 30 秒刷新一次

      return () => clearInterval(interval);
    }
  }, [status?.isRunning]);

  // 初始加载
  useEffect(() => {
    fetchStatus();
  }, []);

  // 计算总盈亏
  const calculateTotalPnl = () => {
    if (!status) return 0;

    const openPnl = status.positions.openPositions.reduce(
      (sum: number, pos: any) => sum + (pos.currentPnl || 0),
      0
    );

    return openPnl;
  };

  const totalPnl = calculateTotalPnl();
  const totalPnlPercent = status
    ? ((status.positions.openCount > 0 ? totalPnl / (initialCapital * 0.18 * status.positions.openCount) : 0) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">实盘交易仪表盘</h1>
            <p className="text-slate-400 mt-1">
              Polymarket 自动化交易系统
              {lastUpdateTime && ` · 最后更新: ${lastUpdateTime.toLocaleTimeString()}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={fetchStatus}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {!status?.isRunning ? (
              <Button
                onClick={startTrading}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
              >
                <Play className="h-4 w-4 mr-2" />
                启动交易
              </Button>
            ) : (
              <Button
                onClick={stopTrading}
                disabled={loading}
                variant="destructive"
              >
                <Square className="h-4 w-4 mr-2" />
                停止交易
              </Button>
            )}
          </div>
        </div>

        {/* 配置面板 */}
        {!status?.isRunning && (
          <Card className="border-slate-700 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-white">交易配置</CardTitle>
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
                  <div className={`w-2 h-2 rounded-full ${status.isRunning ? 'bg-green-500' : 'bg-slate-500'}`} />
                  <span className="text-2xl font-bold text-white">
                    {status.isRunning ? '运行中' : '已停止'}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-2">
                  更新间隔: {status.updateInterval}
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
                    {status.positions.openCount}/{status.config.maxPositions}
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
                  总计: {status.candidates.totalCandidates}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 策略配置 */}
        {status && (
          <Card className="border-slate-700 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-white">策略配置</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Reversal 策略</span>
                    <Badge variant={status.config.strategies.reversal.enabled ? 'default' : 'secondary'}>
                      {status.config.strategies.reversal.enabled ? '启用' : '禁用'}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-400">
                    最大持仓: {status.config.strategies.reversal.maxPositions}/{status.config.maxPositions}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Convergence 策略</span>
                    <Badge variant={status.config.strategies.convergence.enabled ? 'default' : 'secondary'}>
                      {status.config.strategies.convergence.enabled ? '启用' : '禁用'}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-400">
                    最大持仓: {status.config.strategies.convergence.maxPositions}/{status.config.maxPositions}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
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
                  <CardTitle className="text-white">当前持仓</CardTitle>
                </CardHeader>
                <CardContent>
                  {status.positions.openPositions.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      暂无持仓
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
                        {status.positions.openPositions.map((position: any, index: number) => (
                          <TableRow key={index} className="border-slate-700">
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
                              ${(position.entryPrice * 100).toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-white">
                              ${(position.currentPrice * 100).toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-white">
                              {position.positionSize}
                            </TableCell>
                            <TableCell className={position.currentPnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                              ${position.currentPnl.toFixed(2)}
                            </TableCell>
                            <TableCell className={position.currentPnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}>
                              {position.currentPnlPercent >= 0 ? '+' : ''}{position.currentPnlPercent.toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-slate-400">
                              {new Date(position.entryTime).toLocaleString()}
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
                  <CardTitle className="text-white">历史持仓</CardTitle>
                </CardHeader>
                <CardContent>
                  {status.positions.closedPositions.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      暂无历史持仓
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
                        {status.positions.closedPositions.map((position: any, index: number) => (
                          <TableRow key={index} className="border-slate-700">
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
                              ${(position.entryPrice * 100).toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-white">
                              ${(position.exitPrice * 100).toFixed(2)}%
                            </TableCell>
                            <TableCell className={position.pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                              ${position.pnl.toFixed(2)}
                            </TableCell>
                            <TableCell className={position.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}>
                              {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-slate-600">
                                {position.exitReason}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-slate-400">
                              {new Date(position.exitTime).toLocaleString()}
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
      </div>
    </div>
  );
}
