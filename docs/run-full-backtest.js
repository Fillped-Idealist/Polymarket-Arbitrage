// 运行完整数据集回测脚本
// 使用 backtest_data_2zip.json (81w 快照) 运行完整回测

const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:5000/api/backtest/stream';
const FULL_DATASET_PATH = './data/imported/backtest_data_2zip.json';

async function runFullDatasetBacktest() {
  console.log('========================================');
  console.log('  运行完整数据集回测 (81w 快照)');
  console.log('========================================\n');

  // 检查数据文件是否存在
  if (!fs.existsSync(FULL_DATASET_PATH)) {
    console.error(`错误: 数据文件不存在: ${FULL_DATASET_PATH}`);
    process.exit(1);
  }

  // 读取数据文件
  console.log('正在读取数据文件...');
  const startTime = Date.now();
  const fullDataset = JSON.parse(fs.readFileSync(FULL_DATASET_PATH, 'utf-8'));
  const readTime = Date.now() - startTime;

  console.log(`数据文件读取完成 (${(readTime / 1000).toFixed(2)}s)`);
  console.log(`数据集大小: ${fullDataset.snapshots.length.toLocaleString()} 个快照`);
  console.log(`元数据: ${JSON.stringify(fullDataset.meta, null, 2)}`);
  console.log();

  const dataset = fullDataset.snapshots;

  // 准备回测请求
  const payload = {
    dataFile: 'backtest_data_2zip.json',
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
  console.log(`  - 策略: ${payload.strategy}`);
  console.log();

  // 发送回测请求
  console.log('开始回测...');
  const backtestStartTime = Date.now();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`HTTP 错误: ${response.status}`);
      const errorText = await response.text();
      console.error(errorText);
      process.exit(1);
    }

    // 处理流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let lastLogTime = Date.now();
    let tradesCount = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const text = decoder.decode(value);
      const lines = text.split('\n');

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) {
          continue;
        }

        const dataStr = line.slice(6);

        try {
          const event = JSON.parse(dataStr);

          // 每秒输出一次进度
          const now = Date.now();
          if (now - lastLogTime > 1000) {
            const progress = ((event.progress?.current || 0) / (event.progress?.total || dataset.length)) * 100;
            process.stdout.write(`\r进度: ${progress.toFixed(1)}% | ` +
              `Equity: $${(event.equity || 0).toFixed(2)} | ` +
              `交易数: ${tradesCount} | ` +
              `盈亏: ${(event.totalReturnPercent || 0).toFixed(2)}%`);
            lastLogTime = now;
          }

          // 捕获交易事件
          if (event.type === 'trade') {
            tradesCount++;
            if (tradesCount <= 10) {
              console.log(`\n[交易 #${tradesCount}] ${event.data.side.toUpperCase()} | ` +
                `价格: ${event.data.price} | ` +
                `盈亏: ${event.data.pnlPercent.toFixed(2)}%`);
            }
          }

          // 捕获警告
          if (event.type === 'warning') {
            console.log(`\n[警告] ${event.message}`);
          }

          // 捕获错误
          if (event.type === 'error') {
            console.log(`\n[错误] ${event.message}`);
          }

        } catch (e) {
          // 忽略 JSON 解析错误
        }
      }
    }

    const backtestTime = Date.now() - backtestStartTime;

    console.log('\n');
    console.log('========================================');
    console.log('  回测完成');
    console.log('========================================');
    console.log(`总耗时: ${(backtestTime / 1000).toFixed(2)}s`);
    console.log(`处理速度: ${(dataset.length / (backtestTime / 1000)).toFixed(0)} 快照/秒`);
    console.log();

    // 等待最终结果
    await new Promise(resolve => setTimeout(resolve, 2000));

  } catch (error) {
    console.error('\n回测失败:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// 运行
runFullDatasetBacktest().catch(console.error);
