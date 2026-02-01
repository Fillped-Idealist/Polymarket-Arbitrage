#!/bin/bash

# 运行单个回测并输出结果

curl -X POST -H "Content-Type: application/json" -d '{
  "config": {
    "startDate": "2025-01-01T00:00:00.000Z",
    "endDate": "2025-12-31T23:59:59.999Z",
    "intervalMinutes": 15,
    "initialCapital": 10000,
    "maxPositions": 3,
    "maxPositionSize": 0.33,
    "strategies": {
      "convergence": { "enabled": false, "maxPositions": 0, "maxPositionSize": 0.2 },
      "arbitrage": { "enabled": false, "maxPositions": 0, "maxPositionSize": 0.2 },
      "reversal": { "enabled": true, "maxPositions": 3, "maxPositionSize": 0.33 },
      "trend_following": { "enabled": false, "maxPositions": 0, "maxPositionSize": 0.2 },
      "mean_reversion": { "enabled": false, "maxPositions": 0, "maxPositionSize": 0.2 }
    },
    "dailyLossLimit": 0.10,
    "maxDrawdown": 0.15,
    "filters": {
      "minVolume": 0,
      "minLiquidity": 0,
      "minDaysToEnd": 1,
      "maxDaysToEnd": 60
    }
  },
  "dataFile": "real_data_250mb.json"
}' http://localhost:5000/api/backtest/stream
