#!/usr/bin/env node
// 运行完整数据集回测脚本（使用 http 模块）
// 使用 backtest_data_2zip.json (81w 快照) 运行完整回测

const http = require('http');

const API_URL = 'http://localhost:5000/api/backtest/stream';
const DATA_FILE = 'backtest_data_2zip.json';

async function runFullDatasetBacktest() {
  console.log('========================================');
  console.log('  运行完整数据集回测 (81w 快照)');
  console.log('========================================\n');

  // 准备回测请求
  const payload = {
    dataFile: DATA_FILE,
    config: {
      initialCapital: 10000,
      maxPositionValue: 500,  // 5% 的仓位
      maxOpenPositions: 10,
      stopLoss: 0.15,  // 15% 止损
      trailingStop: 0.20,  // 20% 回撤止盈
      minProfit: 0.15,  // 15% 利润后启用移动止盈
      strategy: 'v8.9',
    }
  };

  console.log('回测配置:');
  console.log(`  - 初始资金: $${payload.config.initialCapital}`);
  console.log(`  - 最大仓位: $${payload.config.maxPositionValue} (${((payload.config.maxPositionValue / payload.config.initialCapital) * 100).toFixed(1)}%)`);
  console.log(`  - 最大持仓数: ${payload.config.maxOpenPositions}`);
  console.log(`  - 止损: ${(payload.config.stopLoss * 100).toFixed(0)}%`);
  console.log(`  - 移动止盈: ${(payload.config.trailingStop * 100).toFixed(0)}%`);
  console.log(`  - 最小利润: ${(payload.config.minProfit * 100).toFixed(0)}%`);
  console.log(`  - 策略: v8.9`);
  console.log(`  - 数据文件: ${DATA_FILE}`);
  console.log();

  // 发送回测请求
  console.log('开始回测（流式输出）...\n');
  const backtestStartTime = Date.now();

  return new Promise((resolve, reject) => {
    const url = new URL(API_URL);

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP 错误: ${res.statusCode}`));
        return;
      }

      let lastProgress = -1;
      let tradesCount = 0;
      let wins = 0;
      let losses = 0;
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();  // 保留最后一个不完整的行

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) {
            continue;
          }

          const dataStr = line.slice(6);

          try {
            const event = JSON.parse(dataStr);

            // 处理进度事件
            if (event.type === 'progress') {
              const current = event.progress?.current || 0;
              const total = event.progress?.total || 813717;
              const progress = (current / total) * 100;

              // 每 5% 输出一次进度
              if (Math.floor(progress / 5) > Math.floor(lastProgress / 5)) {
                const elapsed = (Date.now() - backtestStartTime) / 1000;
                const remaining = elapsed / (current / total) - elapsed;

                process.stdout.write(`\r[${progress.toFixed(0)}%] 已处理: ${current.toLocaleString()}/${total.toLocaleString()} | ` +
                  `Equity: $${(event.equity || 0).toFixed(2)} | ` +
                  `交易: ${tradesCount} | 胜率: ${tradesCount > 0 ? ((wins / tradesCount) * 100).toFixed(1) : 0}% | ` +
                  `预计剩余: ${remaining.toFixed(0)}s`);

                lastProgress = progress;
              }
            }

            // 处理交易事件
            if (event.type === 'trade') {
              tradesCount++;
              if (event.data.pnlPercent > 0) {
                wins++;
              } else {
                losses++;
              }

              if (tradesCount <= 10) {
                console.log(`\n[交易 #${tradesCount}] ${event.data.side.toUpperCase()} | ` +
                  `价格: ${event.data.price} | ` +
                  `盈亏: ${event.data.pnlPercent.toFixed(2)}% | ` +
                  `原因: ${event.data.exitReason}`);
              }
            }

            // 处理完成事件
            if (event.type === 'complete') {
              console.log('\n\n========================================');
              console.log('  回测完成');
              console.log('========================================');
              console.log(`总耗时: ${((Date.now() - backtestStartTime) / 1000).toFixed(2)}s`);
              console.log('\n回测结果:');
              console.log(`  - 初始资金: $${event.result.initialCapital.toFixed(2)}`);
              console.log(`  - 最终 Equity: $${event.result.finalEquity.toFixed(2)}`);
              console.log(`  - 总收益率: ${event.result.totalReturnPercent}%`);
              console.log(`  - 峰值 Equity: $${event.result.peakEquity.toFixed(2)}`);
              console.log(`  - 最大回撤: ${event.result.maxDrawdownPercent}%`);
              console.log(`  - 交易数: ${event.result.totalTrades}`);
              console.log(`  - 胜率: ${event.result.winRate}%`);
              console.log(`  - 盈亏比: ${event.result.winLossRatio.toFixed(2)}`);
              console.log(`  - 导出文件:`);
              console.log(`    - ${event.exportFiles.trades.json}`);
              console.log(`    - ${event.exportFiles.equity.json}`);
            }

            // 捕获警告
            if (event.type === 'warning') {
              console.log(`\n[警告] ${event.message}`);
            }

            // 捕获错误
            if (event.type === 'error') {
              console.log(`\n[错误] ${event.message}`);
              if (event.error) {
                console.error(event.error);
              }
            }

          } catch (e) {
            // 忽略 JSON 解析错误
          }
        }
      });

      res.on('end', () => {
        resolve();
      });

      res.on('error', (err) => {
        reject(err);
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

// 运行
runFullDatasetBacktest()
  .then(() => {
    console.log('\n回测成功完成');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n回测失败:', err.message);
    console.error(err);
    process.exit(1);
  });
