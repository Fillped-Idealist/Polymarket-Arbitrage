import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, ArrowLeftRight, Activity, LineChart, BarChart3, PieChart } from 'lucide-react';

export default function Home() {
  const strategies = [
    {
      id: 'convergence',
      title: '尾盘策略（Convergence）',
      description: '在市场临近结束时，价格向最终结果收敛。当概率 > 80% 且距离结束 < 7 天时开仓。',
      icon: TrendingUp,
      color: 'bg-blue-500',
      badge: '高胜率',
      badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      metrics: {
        winRate: '85%+',
        expectedReturn: '9%+',
        maxDrawdown: '8-15%',
        difficulty: '中等',
        liquidity: '中等',
      },
    },
    {
      id: 'reversal',
      title: '反转策略（Reversal）',
      description: '捕捉从低价格（1%-35%）突然上涨≥5%的机会，赌其继续上涨。低胜率，高盈亏比。',
      icon: Activity,
      color: 'bg-purple-500',
      badge: '高盈亏比',
      badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
      metrics: {
        winRate: '1.5%',
        expectedReturn: '不定',
        maxDrawdown: '80%',
        difficulty: '极高',
        liquidity: '高',
      },
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="border-b bg-white/50 backdrop-blur-sm dark:bg-slate-950/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
                <Activity className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                  Polymarket 实盘交易系统
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  基于真实 API 数据的自动量化交易
                </p>
              </div>
            </div>
            <nav className="flex gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/auto-trading">自动交易</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/backtest">回测系统</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">仪表盘</Link>
              </Button>
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

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <Badge className="mb-4" variant="outline">
            v2.0.0 - 使用真实 API 数据（Gamma API + CLOB API）
          </Badge>
          <h2 className="mb-6 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-5xl">
            Polymarket 实盘交易系统
          </h2>
          <p className="mb-8 text-lg text-slate-600 dark:text-slate-400">
            基于真实市场数据的自动交易系统，支持尾盘收敛和价格反转策略。
            使用 Gamma API 获取市场信息，CLOB API 获取盘口数据，实现真正的实时交易。
          </p>

          {/* Summary Metrics */}
          <div className="mb-12 grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm dark:bg-slate-900">
              <LineChart className="h-8 w-8 text-blue-600" />
              <div className="text-left">
                <p className="text-sm text-slate-600 dark:text-slate-400">最高胜率</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">85%</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm dark:bg-slate-900">
              <BarChart3 className="h-8 w-8 text-green-600" />
              <div className="text-left">
                <p className="text-sm text-slate-600 dark:text-slate-400">期望收益</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">9%</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm dark:bg-slate-900">
              <PieChart className="h-8 w-8 text-purple-600" />
              <div className="text-left">
                <p className="text-sm text-slate-600 dark:text-slate-400">夏普比率</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">2.4</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Strategy Cards */}
      <section className="container mx-auto px-4 pb-16">
        <h3 className="mb-8 text-2xl font-bold text-slate-900 dark:text-slate-50">
          实盘交易策略
        </h3>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {strategies.map((strategy) => {
            const Icon = strategy.icon;
            return (
              <Card key={strategy.id} className="flex flex-col hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="mb-3 flex items-start justify-between">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${strategy.color}`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <Badge className={strategy.badgeColor} variant="secondary">
                      {strategy.badge}
                    </Badge>
                  </div>
                  <CardTitle>{strategy.title}</CardTitle>
                  <CardDescription>{strategy.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                        <p className="text-slate-600 dark:text-slate-400">胜率</p>
                        <p className="font-bold text-slate-900 dark:text-slate-50">{strategy.metrics.winRate}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                        <p className="text-slate-600 dark:text-slate-400">期望收益</p>
                        <p className="font-bold text-slate-900 dark:text-slate-50">{strategy.metrics.expectedReturn}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                        <p className="text-slate-600 dark:text-slate-400">最大回撤</p>
                        <p className="font-bold text-slate-900 dark:text-slate-50">{strategy.metrics.maxDrawdown}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                        <p className="text-slate-600 dark:text-slate-400">实现难度</p>
                        <p className="font-bold text-slate-900 dark:text-slate-50">{strategy.metrics.difficulty}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button asChild className="w-full">
                    <Link href={`/strategy/${strategy.id}`}>查看详情</Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Key Insights */}
      <section className="container mx-auto px-4 pb-16">
        <Card>
          <CardHeader>
            <CardTitle>核心洞察</CardTitle>
            <CardDescription>
              基于真实市场数据的自动交易系统特性
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="mb-3 font-semibold text-slate-900 dark:text-slate-50">系统特性</h4>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex gap-2">
                    <span className="text-blue-600">•</span>
                    <span>真实数据：使用 Gamma API 获取市场信息，CLOB API 获取盘口数据</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-blue-600">•</span>
                    <span>自动交易：三种测试模式（1 Convergence + 4 Reversal、2 Convergence + 3 Reversal、全部 Reversal）</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-blue-600">•</span>
                    <span>流动性验证：开仓前检查订单簿流动性，确保有足够的 shares</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-blue-600">•</span>
                    <span>移动止盈：不设置硬止盈，完全依赖移动止盈（利润回撤时止盈）</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="mb-3 font-semibold text-slate-900 dark:text-slate-50">风险管理</h4>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex gap-2">
                    <span className="text-green-600">★</span>
                    <span>
                      <span className="font-semibold">总杠杆控制</span>：总共 5 个仓位，每个仓位最多 18%（总杠杆 90%）
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-yellow-600">★</span>
                    <span>
                      <span className="font-semibold">候选仓管理</span>：无数量限制，定期从 Gamma API 获取候选市场
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-600">★</span>
                    <span>
                      <span className="font-semibold">数据更新间隔</span>：每 10 分钟更新一次，与回测一致
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white/50 backdrop-blur-sm dark:bg-slate-950/50">
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            本系统基于真实市场数据进行自动交易，不构成投资建议。实际交易存在风险，请谨慎决策。
          </p>
        </div>
      </footer>
    </div>
  );
}
