'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, TrendingUp, ArrowLeftRight, Activity, AlertCircle, CheckCircle, Clock, DollarSign, Target, Shield } from 'lucide-react';

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

export default function DashboardPage() {
  const [candidates, setCandidates] = useState<CandidatePosition[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [portfolioMetrics, setPortfolioMetrics] = useState<PortfolioMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState<'convergence' | 'arbitrage' | 'reversal' | 'all'>('all');

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
        return '尾盘收敛';
      case 'arbitrage':
        return '跨市场套利';
      case 'reversal':
        return '反转套利';
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
        alert('持仓已成功开仓！');
        await fetchPositions();
        await fetchCandidates();
      } else {
        alert(`开仓失败: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to open position:', error);
      alert('开仓失败，请重试');
    }
  };

  const closePosition = async (positionId: string) => {
    try {
      const response = await fetch(`/api/positions?id=${positionId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        alert('持仓已平仓！');
        await fetchPositions();
      } else {
        alert(`平仓失败: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to close position:', error);
      alert('平仓失败，请重试');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchCandidates(), fetchPositions()]);
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
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  const totalCandidates = candidates.length;
  const highScoreCandidates = candidates.filter(c => c.score >= 7).length;

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
                <Activity className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                  实时交易仪表盘
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  候选仓筛选与持仓管理
                </p>
              </div>
            </div>
            <nav className="flex gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/analysis">分析报告</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/docs">文档</Link>
              </Button>
            </nav>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Portfolio Metrics */}
        {portfolioMetrics && (
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>总持仓数</CardDescription>
                <CardTitle className="text-3xl">{portfolioMetrics.totalPositions}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                  <Target className="mr-2 h-4 w-4" />
                  最多 {6} 个持仓
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>总市值</CardDescription>
                <CardTitle className="text-3xl">{formatCurrency(portfolioMetrics.totalValue)}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                  <DollarSign className="mr-2 h-4 w-4" />
                  当前持仓总价值
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>总盈亏</CardDescription>
                <CardTitle className={`text-3xl ${portfolioMetrics.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(portfolioMetrics.totalPnl)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-sm ${portfolioMetrics.totalPnlPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercent(portfolioMetrics.totalPnlPercent)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>策略分布</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <div className="mr-2 h-3 w-3 rounded-full bg-blue-500"></div>
                      <span className="text-slate-600 dark:text-slate-400">收敛</span>
                    </div>
                    <span className="font-medium">{portfolioMetrics.strategyDistribution.convergence}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <div className="mr-2 h-3 w-3 rounded-full bg-green-500"></div>
                      <span className="text-slate-600 dark:text-slate-400">套利</span>
                    </div>
                    <span className="font-medium">{portfolioMetrics.strategyDistribution.arbitrage}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <div className="mr-2 h-3 w-3 rounded-full bg-red-500"></div>
                      <span className="text-slate-600 dark:text-slate-400">反转</span>
                    </div>
                    <span className="font-medium">{portfolioMetrics.strategyDistribution.reversal}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Position Control Rules Alert */}
        <Alert className="mb-8 border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <Shield className="h-4 w-4 text-blue-600" />
          <AlertTitle>持仓控制规则</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600 dark:text-slate-400">
              <li>单个仓位最大：总资金的 15%</li>
              <li>最大持仓数：6 个（确保分散）</li>
              <li>单策略最大敞口：40%</li>
              <li>必须持仓分散到至少 2 种不同策略</li>
              <li>优先开仓高分候选（评分 ≥ 7）</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Tabs */}
        <Tabs defaultValue="positions" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="positions">
              当前持仓 ({positions.filter(p => p.status === 'active').length})
            </TabsTrigger>
            <TabsTrigger value="candidates">
              候选仓 ({totalCandidates})
            </TabsTrigger>
          </TabsList>

          {/* Positions Tab */}
          <TabsContent value="positions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>当前持仓</CardTitle>
                <CardDescription>
                  正在持仓中的头寸，实时盈亏监控
                </CardDescription>
              </CardHeader>
              <CardContent>
                {positions.length === 0 ? (
                  <div className="py-12 text-center">
                    <Clock className="mx-auto h-12 w-12 text-slate-400 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-slate-50 mb-2">
                      暂无持仓
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-4">
                      从候选仓中选择合适的机会开仓
                    </p>
                    <Button onClick={() => window.location.href = '#candidates'}>
                      查看候选仓
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>策略</TableHead>
                          <TableHead>市场问题</TableHead>
                          <TableHead>结果</TableHead>
                          <TableHead className="text-right">入场价</TableHead>
                          <TableHead className="text-right">现价</TableHead>
                          <TableHead className="text-right">盈亏</TableHead>
                          <TableHead className="text-right">盈亏比</TableHead>
                          <TableHead className="text-right">止损</TableHead>
                          <TableHead className="text-right">止盈</TableHead>
                          <TableHead className="text-center">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {positions.filter(p => p.status === 'active').map((position) => {
                          const StrategyIcon = getStrategyIcon(position.strategy);
                          return (
                            <TableRow key={position.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className={`h-8 w-8 rounded-lg ${getStrategyColor(position.strategy)} flex items-center justify-center`}>
                                    <StrategyIcon className="h-4 w-4 text-white" />
                                  </div>
                                  <span className="font-medium">{getStrategyName(position.strategy)}</span>
                                </div>
                              </TableCell>
                              <TableCell className="max-w-xs truncate" title={position.question}>
                                {position.question}
                              </TableCell>
                              <TableCell>{position.outcome}</TableCell>
                              <TableCell className="text-right font-medium">
                                {(position.entryPrice * 100).toFixed(2)}%
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {(position.currentPrice * 100).toFixed(2)}%
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={position.pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  {formatCurrency(position.pnl)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={position.pnlPercent >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  {formatPercent(position.pnlPercent)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                {position.stopLoss ? `${(position.stopLoss * 100).toFixed(2)}%` : '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                {position.takeProfit ? `${(position.takeProfit * 100).toFixed(2)}%` : '-'}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => closePosition(position.id)}
                                >
                                  平仓
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
          <TabsContent value="candidates" className="space-y-6">
            {/* Strategy Filter */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedStrategy === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedStrategy('all')}
              >
                全部 ({totalCandidates})
              </Button>
              <Button
                variant={selectedStrategy === 'convergence' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedStrategy('convergence')}
              >
                收敛
              </Button>
              <Button
                variant={selectedStrategy === 'arbitrage' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedStrategy('arbitrage')}
              >
                套利
              </Button>
              <Button
                variant={selectedStrategy === 'reversal' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedStrategy('reversal')}
              >
                反转
              </Button>
            </div>

            {/* High Score Alert */}
            {highScoreCandidates > 0 && (
              <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle>高分候选</AlertTitle>
                <AlertDescription>
                  发现 {highScoreCandidates} 个高评分候选（≥ 7 分），建议优先关注
                </AlertDescription>
              </Alert>
            )}

            {/* Candidates List */}
            <Card>
              <CardHeader>
                <CardTitle>候选仓列表</CardTitle>
                <CardDescription>
                  预先筛选的高频持续跟踪候选，按照评分排序
                </CardDescription>
              </CardHeader>
              <CardContent>
                {candidates.length === 0 ? (
                  <div className="py-12 text-center">
                    <AlertCircle className="mx-auto h-12 w-12 text-slate-400 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-slate-50 mb-2">
                      暂无候选仓
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400">
                      当前市场条件下没有符合条件的候选
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {candidates.map((candidate, index) => {
                      const StrategyIcon = getStrategyIcon(candidate.strategy);
                      const isHighScore = candidate.score >= 7;
                      return (
                        <Card
                          key={`${candidate.marketId}-${candidate.strategy}-${index}`}
                          className={`${isHighScore ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/50' : ''}`}
                        >
                          <CardContent className="p-6">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="flex-1 space-y-3">
                                <div className="flex items-start gap-3">
                                  <div className={`mt-1 h-10 w-10 rounded-lg ${getStrategyColor(candidate.strategy)} flex items-center justify-center flex-shrink-0`}>
                                    <StrategyIcon className="h-5 w-5 text-white" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge className={getStrategyBadgeColor(candidate.strategy)}>
                                        {getStrategyName(candidate.strategy)}
                                      </Badge>
                                      {isHighScore && (
                                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                                          高分推荐
                                        </Badge>
                                      )}
                                    </div>
                                    <h4 className="font-semibold text-slate-900 dark:text-slate-50 line-clamp-2">
                                      {candidate.question}
                                    </h4>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                  <div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">结果</p>
                                    <p className="font-medium text-slate-900 dark:text-slate-50">{candidate.outcome}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">当前价格</p>
                                    <p className="font-medium text-slate-900 dark:text-slate-50">
                                      {(candidate.price * 100).toFixed(2)}%
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">期望收益</p>
                                    <p className={`font-medium ${candidate.expectedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {formatPercent(candidate.expectedReturn)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">风险评分</p>
                                    <div className="flex items-center gap-2">
                                      <Progress value={candidate.riskScore * 10} className="flex-1 h-2" />
                                      <span className="font-medium text-slate-900 dark:text-slate-50 text-sm">
                                        {candidate.riskScore}/10
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                                  <div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">成交量</p>
                                    <p className="font-medium text-slate-900 dark:text-slate-50">
                                      {formatCurrency(candidate.volume)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">流动性</p>
                                    <p className="font-medium text-slate-900 dark:text-slate-50">
                                      {formatCurrency(candidate.liquidity)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">到期时间</p>
                                    <p className="font-medium text-slate-900 dark:text-slate-50 text-sm">
                                      {new Date(candidate.endDate).toLocaleDateString('zh-CN')}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-3 lg:w-48">
                                <div className="text-center">
                                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">候选评分</p>
                                  <div className={`text-3xl font-bold ${candidate.score >= 7 ? 'text-green-600' : candidate.score >= 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {candidate.score.toFixed(1)}
                                  </div>
                                </div>
                                <Button
                                  className="w-full"
                                  onClick={() => openPosition(candidate)}
                                >
                                  开仓
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
      </div>
    </div>
  );
}
