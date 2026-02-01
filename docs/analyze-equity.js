// 分析 equity 曲线和持仓变化的脚本

const fs = require('fs');
const path = require('path');

const equityFile = path.join(__dirname, '../data/exports/equity-2026-01-28T21-51-36-284Z.json');

// 读取 equity 文件
const data = JSON.parse(fs.readFileSync(equityFile, 'utf8'));
const equityCurve = data.equityCurve;

console.log('========================================');
console.log('  Equity 曲线分析');
console.log('========================================\n');

// 找出峰值
const maxEquityEntry = equityCurve.reduce((max, entry) =>
  entry.equity > max.equity ? entry : max,
  equityCurve[0]
);

console.log(`峰值 Equity: $${maxEquityEntry.equity.toFixed(2)}`);
console.log(`峰值时间: ${maxEquityEntry.timestamp}`);
console.log(`峰值时持仓数: ${maxEquityEntry.positions}`);
console.log(`收益率: ${maxEquityEntry.equityPercent}%`);
console.log();

// 找出最小值
const minEquityEntry = equityCurve.reduce((min, entry) =>
  entry.equity < min.equity ? entry : min,
  equityCurve[0]
);

console.log(`最小 Equity: $${minEquityEntry.equity.toFixed(2)}`);
console.log(`最小时间: ${minEquityEntry.timestamp}`);
console.log(`最小时持仓数: ${minEquityEntry.positions}`);
console.log(`收益率: ${minEquityEntry.equityPercent}%`);
console.log();

// 统计 equity 的变化阶段
console.log('Equity 变化阶段:\n');

let stageStart = equityCurve[0];
const stages = [];
const threshold = 0.05; // 5% 变化阈值

for (let i = 1; i < equityCurve.length; i++) {
  const current = equityCurve[i];
  const change = (current.equity - stageStart.equity) / stageStart.equity;

  if (Math.abs(change) >= threshold || i === equityCurve.length - 1) {
    stages.push({
      start: stageStart,
      end: current,
      change: change,
      durationMins: (new Date(current.timestamp) - new Date(stageStart.timestamp)) / (1000 * 60)
    });
    stageStart = current;
  }
}

stages.forEach((stage, index) => {
  console.log(`阶段 ${index + 1}:`);
  console.log(`  开始时间: ${stage.start.timestamp}`);
  console.log(`  开始 Equity: $${stage.start.equity.toFixed(2)}`);
  console.log(`  开始持仓: ${stage.start.positions}`);
  console.log(`  结束时间: ${stage.end.timestamp}`);
  console.log(`  结束 Equity: $${stage.end.equity.toFixed(2)}`);
  console.log(`  结束持仓: ${stage.end.positions}`);
  console.log(`  变化: ${(stage.change * 100).toFixed(2)}%`);
  console.log(`  持续: ${stage.durationMins.toFixed(0)} 分钟`);
  console.log();
});

// 打印 equity 曲线的关键点
console.log('Equity 曲线关键点:\n');

const keyPoints = equityCurve.filter((entry, index, array) => {
  if (index === 0 || index === array.length - 1) return true;

  const prev = array[index - 1];
  const next = array[index + 1];

  // 峰值
  if (entry.equity >= prev.equity && entry.equity >= next.equity &&
      Math.abs(entry.equity - prev.equity) > 1000) {
    return true;
  }

  // 谷值
  if (entry.equity <= prev.equity && entry.equity <= next.equity &&
      Math.abs(entry.equity - prev.equity) > 1000) {
    return true;
  }

  return false;
});

keyPoints.forEach(point => {
  console.log(`  ${point.timestamp}: $${point.equity.toFixed(2)} (${point.equityPercent}%), 持仓: ${point.positions}`);
});

console.log();
