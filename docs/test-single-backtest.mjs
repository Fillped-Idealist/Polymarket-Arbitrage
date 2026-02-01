#!/usr/bin/env node

/**
 * 测试单个数据集回测并输出详细交易记录
 */

const createConfig = () => ({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  intervalMinutes: 15,

  initialCapital: 10000,
  maxPositions: 3,
  maxPositionSize: 0.33,

  strategies: {
    'convergence': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'arbitrage': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'reversal': { enabled: true, maxPositions: 3, maxPositionSize: 0.33 },
    'trend_following': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
    'mean_reversion': { enabled: false, maxPositions: 0, maxPositionSize: 0.2 },
  },

  dailyLossLimit: 0.10,
  maxDrawdown: 0.15,

  filters: {
    minVolume: 0,
    minLiquidity: 0,
    minDaysToEnd: 1,
    maxDaysToEnd: 365,
  },
});

async function main() {
  const dataFile = process.argv[2] || 'backtest_data_1769009635709.json';

  console.log(`\n测试数据集: ${dataFile}\n`);

  const config = createConfig();

  try {
    const response = await fetch('http://localhost:5000/api/backtest/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config,
        dataFile,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let result = null;
    let tradesList = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'snapshot_processed') {
              const progress = parseFloat(data.data.progress);
              process.stdout.write(`\r进度: ${progress.toFixed(1)}% | 当前资金: $${data.data.currentEquity?.toFixed(2) || 'N/A'} | 开仓: ${data.data.stats?.tradesOpened || 0} | 平仓: ${data.data.stats?.tradesClosed || 0}`);
            } else if (data.type === 'complete') {
              process.stdout.write('\r' + ' '.repeat(100) + '\r');
              
              result = data.result;
              tradesList = result.tradesList || [];
              
              console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log('回测结果');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log(`总收益率: ${result.totalReturn}`);
              console.log(`交易总数: ${result.totalTrades}`);
              console.log(`胜率: ${result.winRate}`);
              console.log(`最佳策略: ${result.bestStrategy}`);
              
              if (tradesList.length > 0) {
                console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('详细交易记录');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                
                tradesList.forEach((trade, index) => {
                  const profitPercent = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(2);
                  const pnl = ((trade.exitPrice - trade.entryPrice) * trade.positionSize).toFixed(2);
                  const hoursHeld = trade.exitTime && trade.entryTime ? ((trade.exitTime - trade.entryTime) / (1000 * 60 * 60)).toFixed(2) : 'N/A';
                  
                  console.log(`\n交易 ${index + 1}:`);
                  console.log(`  市场: ${trade.marketId.substring(0, 50)}...`);
                  console.log(`  入场价格: ${(trade.entryPrice * 100).toFixed(2)}%`);
                  console.log(`  出场价格: ${(trade.exitPrice * 100).toFixed(2)}%`);
                  console.log(`  盈亏: ${profitPercent}% ($${pnl})`);
                  console.log(`  持仓时间: ${hoursHeld} 小时`);
                  console.log(`  入场原因: ${trade.entryReason || 'N/A'}`);
                  console.log(`  出场原因: ${trade.exitReason || 'N/A'}`);
                  console.log(`  状态: ${trade.status}`);
                });
              } else {
                console.log('\n⚠️  没有交易记录');
              }
              
              process.exit(0);
            } else if (data.type === 'error') {
              console.error('\n❌ 错误:', data.error);
              process.exit(1);
            }
          } catch (e) {
            // 忽略 JSON 解析错误
          }
        }
      }
    }
  } catch (error) {
    console.error(`\n❌ 测试失败:`, error.message);
    process.exit(1);
  }
}

main().catch(console.error);

