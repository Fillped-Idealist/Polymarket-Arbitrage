/**
 * Reversal 策略 V8.5 最优配置
 * 
 * 基于全数据集交叉验证和流动性检查优化的最终配置
 */

export interface StrategyConfig {
  version: string;
  name: string;
  description: string;
  
  // 入场条件
  entryConditions: {
    priceRange: {
      min: number;  // 最小价格（小数，如 0.10 表示 10%）
      max: number;  // 最大价格（小数，如 0.40 表示 40%）
    };
    timeRange: {
      minDaysToEnd: number;
      maxDaysToEnd: number;
    };
    liquidity: {
      minLiquidity: number;  // 最小流动性（美元）
      minVolume24h: number;  // 最小24小时成交量（美元）
      minLiquidityToVolumeRatio: number;  // 最小流动性/成交量比率
      maxLiquidityDropRatio: number;  // 最大流动性下降比率
    };
    volatility: {
      maxPriceChange: number;  // 最近10个数据点最大价格变化（小数，如 0.30 表示 30%）
      maxHourlyChangeRate: number;  // 最大每小时价格变化率（小数，如 0.10 表示 10%/小时）
    };
  };
  
  // 出场条件
  exitConditions: {
    marketZeroRisk: {
      enabled: boolean;
      threshold: number;  // 价格阈值（小数，如 0.05 表示 5%）
    };
    stopLoss: {
      hardStopLossMultiplier: number;  // 硬止损容忍度（如 1.2 表示参数的 1.2 倍）
      softStopLossEnabled: boolean;
      minHoldingTimeForStopLoss: number;  // 最小持仓时间（小时）
    };
    takeProfit: {
      dynamicEnabled: boolean;  // 是否根据剩余时间动态调整
    };
    priceCrashDetection: {
      enabled: boolean;
      threshold: number;  // 价格暴跌阈值（小数，如 0.20 表示 20%）
      minProfitLoss: number;  // 触发条件（亏损阈值，小数，如 -0.05 表示 -5%）
    };
    momentumReversal: {
      enabled: boolean;
      consecutiveDrops: number;  // 连续下跌数据点数
      minHoldingTime: number;  // 最小持仓时间（小时）
    };
    maxHoldingTime: {
      dynamicEnabled: boolean;  // 是否根据剩余时间动态调整
    };
    nearExpiration: {
      enabled: boolean;
      hoursBeforeExpiration: number;  // 临近截止时间（小时）
    };
  };
  
  // 分段参数（根据剩余时间动态调整）
  segmentedParameters: Array<{
    name: string;
    condition: {
      type: 'hours' | 'days';
      max: number;
    };
    stopLoss: number;  // 止损（小数，如 0.02 表示 2%）
    takeProfitRatio: number;  // 止盈倍数（如 1.25 表示 25% 止盈）
    maxHoldingHours: number;  // 最大持仓时间（小时）
  }>;
  
  // 风险管理
  riskManagement: {
    maxPositions: number;  // 最大持仓数
    maxPositionSize: number;  // 单仓位最大占比（小数，如 0.33 表示 33%）
    dailyLossLimit: number;  // 日亏损限制（小数，如 0.10 表示 10%）
    maxDrawdown: number;  // 最大回撤（小数，如 0.15 表示 15%）
    tradeCooldownMinutes: number;  // 交易冷却时间（分钟）
  };
}

/**
 * 尾盘收敛策略（Convergence）配置接口
 */
export interface ConvergenceStrategyConfig {
  version: string;
  name: string;
  description: string;
  
  // 入场条件
  entryConditions: {
    priceRange: {
      min: number;  // 最小价格（小数，如 0.80 表示 80%）
      max: number;  // 最大价格（小数，如 0.98 表示 98%）
    };
    timeRange: {
      minHoursToEnd: number;
      maxHoursToEnd: number;
    };
    liquidity: {
      minLiquidity: number;  // 最小流动性（美元）
      minVolume24h: number;  // 最小24小时成交量（美元）
    };
    trend: {
      requireUpTrend: boolean;  // 是否需要上升趋势
      maxVolatility: number;  // 最大波动率（小数）
      minVolatilityForOverbought: number;  // 超买条件下的最大波动率
    };
  };
  
  // 出场条件
  exitConditions: {
    stopLoss: {
      enabled: boolean;
      threshold: number;  // 止损阈值（相对于入场价，如 0.05 表示 -5%）
    };
    belowEntry: {
      enabled: boolean;
      minHoldingHours: number;  // 最小持仓时间（小时）
    };
    takeProfit: {
      staged: boolean;  // 是否分阶段止盈
      stages: Array<{
        condition: {
          type: 'price' | 'hoursToEnd';
          value: number;
        };
        threshold: number;
      }>;
    };
    maxHoldingTime: {
      enabled: boolean;
      maxHours: number;
    };
    nearExpiration: {
      enabled: boolean;
      hoursBeforeExpiration: number;
    };
  };
  
  // 风险管理
  riskManagement: {
    maxPositions: number;
    maxPositionSize: number;
    dailyLossLimit: number;
    maxDrawdown: number;
  };
}

export const REVERSAL_STRATEGY_V85: StrategyConfig = {
  version: '8.5',
  name: 'Reversal Strategy V8.5',
  description: 'Reversal 策略 V8.5（流动性增强版）- 基于全数据集交叉验证和流动性检查优化的最终配置',
  
  entryConditions: {
    priceRange: {
      min: 0.10,  // 10%
      max: 0.40,  // 40%
    },
    timeRange: {
      minDaysToEnd: 1,
      maxDaysToEnd: 365,  // 不限制
    },
    liquidity: {
      minLiquidity: 1000,  // $1,000
      minVolume24h: 5000,  // $5,000
      minLiquidityToVolumeRatio: 0.01,  // 1%
      maxLiquidityDropRatio: 0.50,  // 50%
    },
    volatility: {
      maxPriceChange: 0.30,  // 30%
      maxHourlyChangeRate: 0.10,  // 10%/小时
    },
  },
  
  exitConditions: {
    marketZeroRisk: {
      enabled: true,
      threshold: 0.05,  // 5%
    },
    stopLoss: {
      hardStopLossMultiplier: 1.2,
      softStopLossEnabled: true,
      minHoldingTimeForStopLoss: 1,  // 1 小时
    },
    takeProfit: {
      dynamicEnabled: true,
    },
    priceCrashDetection: {
      enabled: true,
      threshold: 0.20,  // 20%
      minProfitLoss: -0.05,  // -5%
    },
    momentumReversal: {
      enabled: true,
      consecutiveDrops: 2,
      minHoldingTime: 1,  // 1 小时
    },
    maxHoldingTime: {
      dynamicEnabled: true,
    },
    nearExpiration: {
      enabled: true,
      hoursBeforeExpiration: 24,
    },
  },
  
  segmentedParameters: [
    {
      name: '超短期',
      condition: {
        type: 'hours',
        max: 12,
      },
      stopLoss: 0.02,  // 2%
      takeProfitRatio: 1.25,  // 25%
      maxHoldingHours: 12,
    },
    {
      name: '临期',
      condition: {
        type: 'days',
        max: 3,
      },
      stopLoss: 0.03,  // 3%
      takeProfitRatio: 1.30,  // 30%
      maxHoldingHours: 48,  // 2 天
    },
    {
      name: '短期',
      condition: {
        type: 'days',
        max: 7,
      },
      stopLoss: 0.04,  // 4%
      takeProfitRatio: 1.40,  // 40%
      maxHoldingHours: 96,  // 4 天
    },
    {
      name: '中期',
      condition: {
        type: 'days',
        max: 30,
      },
      stopLoss: 0.06,  // 6%
      takeProfitRatio: 1.50,  // 50%
      maxHoldingHours: 168,  // 7 天
    },
    {
      name: '长期',
      condition: {
        type: 'days',
        max: 999,  // 无限制
      },
      stopLoss: 0.08,  // 8%
      takeProfitRatio: 1.60,  // 60%
      maxHoldingHours: 336,  // 14 天
    },
  ],
  
  riskManagement: {
    maxPositions: 3,
    maxPositionSize: 0.33,  // 33%
    dailyLossLimit: 0.10,  // 10%
    maxDrawdown: 0.15,  // 15%
    tradeCooldownMinutes: 30,
  },
};

/**
 * 尾盘收敛策略（Convergence）V5.3 配置
 * 
 * 核心思想：填补空余仓位，捕捉概率收敛，专注于高概率事件
 * 特点：高胜率（85%），中等收益（9%），夏普比率（2.4）
 */
export const CONVERGENCE_STRATEGY_V53: ConvergenceStrategyConfig = {
  version: '5.3',
  name: 'Convergence Strategy V5.3',
  description: '尾盘收敛策略 V5.3（保守版）- 高胜率、中等收益、低风险，专注于高概率事件的收敛交易',
  
  entryConditions: {
    priceRange: {
      min: 0.80,  // 80%
      max: 0.98,  // 98%
    },
    timeRange: {
      minHoursToEnd: 6,   // 6 小时
      maxHoursToEnd: 48,  // 48 小时
    },
    liquidity: {
      minLiquidity: 1000,   // $1,000
      minVolume24h: 5000,   // $5,000
    },
    trend: {
      requireUpTrend: true,   // 需要上升趋势
      maxVolatility: 0.04,    // 最大波动率 4%
      minVolatilityForOverbought: 0.03,  // 超买条件下的最大波动率 3%
    },
  },
  
  exitConditions: {
    stopLoss: {
      enabled: true,
      threshold: 0.05,  // 入场价-5%
    },
    belowEntry: {
      enabled: true,
      minHoldingHours: 6,  // 最小持仓时间 6 小时
    },
    takeProfit: {
      staged: true,
      stages: [
        {
          condition: { type: 'price', value: 0.985 },
          threshold: 0.985,  // 98.5% 立即平仓
        },
        {
          condition: { type: 'hoursToEnd', value: 12 },
          threshold: 0.97,   // 临近截止 12 小时，价格达到 97%
        },
        {
          condition: { type: 'hoursToEnd', value: 24 },
          threshold: 0.96,   // 24 小时内，价格达到 96%
        },
        {
          condition: { type: 'hoursToEnd', value: 48 },
          threshold: 0.95,   // 48 小时内，价格达到 95%
        },
      ],
    },
    maxHoldingTime: {
      enabled: true,
      maxHours: 24,  // 最大持仓时间 24 小时
    },
    nearExpiration: {
      enabled: true,
      hoursBeforeExpiration: 4,  // 临近截止 4 小时强制平仓
    },
  },
  
  riskManagement: {
    maxPositions: 3,
    maxPositionSize: 0.33,  // 33%
    dailyLossLimit: 0.10,  // 10%
    maxDrawdown: 0.15,  // 15%
  },
};

/**
 * 获取指定剩余时间的分段参数（Reversal）
 */
export function getSegmentedParameters(hoursToEnd: number, daysToEnd: number) {
  // 超短期（0-12 小时）
  if (hoursToEnd <= 12) {
    return REVERSAL_STRATEGY_V85.segmentedParameters[0];
  }
  
  // 临期（0.5-3 天）
  if (daysToEnd <= 3) {
    return REVERSAL_STRATEGY_V85.segmentedParameters[1];
  }
  
  // 短期（3-7 天）
  if (daysToEnd <= 7) {
    return REVERSAL_STRATEGY_V85.segmentedParameters[2];
  }
  
  // 中期（7-30 天）
  if (daysToEnd <= 30) {
    return REVERSAL_STRATEGY_V85.segmentedParameters[3];
  }
  
  // 长期（30+ 天）
  return REVERSAL_STRATEGY_V85.segmentedParameters[4];
}

/**
 * 检查市场快照是否满足 Reversal 入场条件
 */
export function shouldOpenReversalTrade(market: any, config: StrategyConfig = REVERSAL_STRATEGY_V85): boolean {
  const { entryConditions } = config;
  
  // 检查价格区间
  const yesPrice = market.outcomePrices?.[0];
  if (!yesPrice || yesPrice < entryConditions.priceRange.min || yesPrice > entryConditions.priceRange.max) {
    return false;
  }
  
  // 检查时间范围
  const hoursToEnd = (market.endDate.getTime() - market.timestamp.getTime()) / (1000 * 60 * 60);
  const daysToEnd = hoursToEnd / 24;
  if (daysToEnd < entryConditions.timeRange.minDaysToEnd || daysToEnd > entryConditions.timeRange.maxDaysToEnd) {
    return false;
  }
  
  // 检查流动性
  if (market.liquidity && market.liquidity < entryConditions.liquidity.minLiquidity) {
    return false;
  }
  
  if (!market.volume24h || market.volume24h < entryConditions.liquidity.minVolume24h) {
    return false;
  }
  
  if (market.liquidity && market.volume24h) {
    const ratio = market.liquidity / market.volume24h;
    if (ratio < entryConditions.liquidity.minLiquidityToVolumeRatio) {
      return false;
    }
  }
  
  return true;
}

/**
 * 检查市场快照是否满足 Convergence 入场条件
 */
export function shouldOpenConvergenceTrade(market: any, config: ConvergenceStrategyConfig = CONVERGENCE_STRATEGY_V53): boolean {
  const { entryConditions } = config;
  
  // 检查价格区间
  const yesPrice = market.outcomePrices?.[0];
  if (!yesPrice || yesPrice < entryConditions.priceRange.min || yesPrice > entryConditions.priceRange.max) {
    return false;
  }
  
  // 检查时间范围
  const hoursToEnd = (market.endDate.getTime() - market.timestamp.getTime()) / (1000 * 60 * 60);
  if (hoursToEnd < entryConditions.timeRange.minHoursToEnd || hoursToEnd > entryConditions.timeRange.maxHoursToEnd) {
    return false;
  }
  
  // 检查流动性
  if (market.liquidity && market.liquidity < entryConditions.liquidity.minLiquidity) {
    return false;
  }
  
  if (!market.volume24h || market.volume24h < entryConditions.liquidity.minVolume24h) {
    return false;
  }
  
  // 默认情况：如果价格 > 90%，可以开仓
  if (yesPrice >= 0.90) {
    return true;
  }
  
  return false;
}

/**
 * 检查是否应该平仓（Reversal）
 */
export function shouldCloseReversalTrade(
  trade: any,
  currentPrice: number,
  currentTime: Date,
  market: any,
  config: StrategyConfig = REVERSAL_STRATEGY_V85
): boolean {
  const { exitConditions, segmentedParameters } = config;
  
  const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);
  const hoursToEnd = (market.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
  const daysToEnd = hoursToEnd / 24;
  const profitPercent = (currentPrice - trade.entryPrice) / trade.entryPrice;
  
  // 市场归零风险控制
  if (exitConditions.marketZeroRisk.enabled && currentPrice < exitConditions.marketZeroRisk.threshold) {
    return true;
  }
  
  // 获取分段参数
  const params = getSegmentedParameters(hoursToEnd, daysToEnd);
  
  // 止盈
  const takeProfitPrice = trade.entryPrice * params.takeProfitRatio;
  if (currentPrice >= takeProfitPrice) {
    return true;
  }
  
  // 硬止损
  const hardStopLossRatio = params.stopLoss * exitConditions.stopLoss.hardStopLossMultiplier;
  const hardStopLossPrice = trade.entryPrice * (1 - hardStopLossRatio);
  if (currentPrice <= hardStopLossPrice) {
    return true;
  }
  
  // 软止损
  if (exitConditions.stopLoss.softStopLossEnabled) {
    const stopLossPrice = trade.entryPrice * (1 - params.stopLoss);
    if (currentPrice <= stopLossPrice && hoursHeld >= exitConditions.stopLoss.minHoldingTimeForStopLoss) {
      return true;
    }
  }
  
  // 临近截止
  if (exitConditions.nearExpiration.enabled && hoursToEnd <= exitConditions.nearExpiration.hoursBeforeExpiration) {
    return true;
  }
  
  // 最大持仓时间
  if (hoursHeld >= params.maxHoldingHours) {
    return true;
  }
  
  return false;
}

/**
 * 检查是否应该平仓（Convergence）
 */
export function shouldCloseConvergenceTrade(
  trade: any,
  currentPrice: number,
  currentTime: Date,
  market: any,
  config: ConvergenceStrategyConfig = CONVERGENCE_STRATEGY_V53
): boolean {
  const { exitConditions } = config;
  
  const hoursHeld = (currentTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);
  const hoursToEnd = (market.endDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
  
  // 止损：入场价-5%
  if (exitConditions.stopLoss.enabled && currentPrice <= trade.entryPrice * (1 - exitConditions.stopLoss.threshold)) {
    return true;
  }
  
  // 价格跌破入场价，且持仓超过 6 小时
  if (exitConditions.belowEntry.enabled && currentPrice <= trade.entryPrice && hoursHeld >= exitConditions.belowEntry.minHoldingHours) {
    return true;
  }
  
  // 分阶段止盈
  if (exitConditions.takeProfit.staged) {
    for (const stage of exitConditions.takeProfit.stages) {
      if (stage.condition.type === 'price' && currentPrice >= stage.threshold) {
        return true;
      }
      if (stage.condition.type === 'hoursToEnd' && hoursToEnd <= stage.condition.value && currentPrice >= stage.threshold) {
        return true;
      }
    }
  }
  
  // 最大持仓时间
  if (exitConditions.maxHoldingTime.enabled && hoursHeld >= exitConditions.maxHoldingTime.maxHours) {
    return true;
  }
  
  // 临近截止
  if (exitConditions.nearExpiration.enabled && hoursToEnd <= exitConditions.nearExpiration.hoursBeforeExpiration) {
    return true;
  }
  
  return false;
}
