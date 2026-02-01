/**
 * 动态参数调整策略
 * 根据每轮回测结果调整下一轮的策略参数
 */

interface RoundResult {
  round: number;
  success: boolean;
  monthlyReturn: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  profitTrades: number;
  lossTrades: number;
  avgProfit: number;
  avgLoss: number;
}

interface StrategyParams {
  reversal: {
    maxPositions: number;
    stopLoss: number;
    takeProfit: number;
    minPrice: number;
    maxPrice: number;
    signalThreshold: number;
  };
  convergence: {
    maxPositions: number;
    stopLoss: number;
    takeProfit: number;
    minPrice: number;
    maxPrice: number;
    signalThreshold: number;
  };
}

/**
 * 参数调整器
 */
export class ParameterOptimizer {
  private history: RoundResult[] = [];
  private params: StrategyParams;
  private targetMonthlyReturn = 0.5; // 50%
  private targetWinRate = 0.5; // 50%

  constructor(initialParams: StrategyParams) {
    this.params = JSON.parse(JSON.stringify(initialParams));
  }

  /**
   * 添加回测结果到历史
   */
  addResult(result: RoundResult): void {
    this.history.push(result);
  }

  /**
   * 根据所有历史结果调整参数
   */
  adjustParameters(result: RoundResult): StrategyParams {
    const avgMonthlyReturn = this.calculateAvgMonthlyReturn();
    const avgWinRate = this.calculateAvgWinRate();
    const avgMaxDrawdown = this.calculateAvgMaxDrawdown();
    const avgTrades = this.calculateAvgTrades();

    console.log('\n📊 参数调整分析:');
    console.log(`   当前月利润率: ${(result.monthlyReturn * 100).toFixed(2)}%`);
    console.log(`   平均月利润率: ${(avgMonthlyReturn * 100).toFixed(2)}%`);
    console.log(`   目标月利润率: ${(this.targetMonthlyReturn * 100).toFixed(2)}%`);
    console.log(`   当前胜率: ${(result.winRate * 100).toFixed(2)}%`);
    console.log(`   平均胜率: ${(avgWinRate * 100).toFixed(2)}%`);
    console.log(`   平均回撤: ${(avgMaxDrawdown * 100).toFixed(2)}%`);
    console.log(`   平均交易数: ${avgTrades.toFixed(0)}`);

    const adjustments: string[] = [];

    // 策略1: 如果平均月利润率低于目标
    if (avgMonthlyReturn < this.targetMonthlyReturn) {
      const gap = this.targetMonthlyReturn - avgMonthlyReturn;
      adjustments.push(`月利润率偏低 (${(avgMonthlyReturn * 100).toFixed(2)}%)，需要调整`);

      // 如果交易数太少，扩大机会
      if (avgTrades < 10) {
        console.log('   → 交易数太少，降低信号阈值以增加机会');
        this.params.reversal.signalThreshold = Math.max(3, this.params.reversal.signalThreshold - 0.5);
        this.params.convergence.signalThreshold = Math.max(4, this.params.convergence.signalThreshold - 0.5);
        adjustments.push(`Reversal信号阈值 → ${this.params.reversal.signalThreshold}`);
        adjustments.push(`Convergence信号阈值 → ${this.params.convergence.signalThreshold}`);
      }
      // 如果胜率很高但利润低，可能是止损太早
      else if (avgWinRate > 0.6) {
        console.log('   → 胜率高但利润低，放宽止损让利润奔跑');
        this.params.reversal.stopLoss = Math.min(0.5, this.params.reversal.stopLoss + 0.05);
        this.params.convergence.stopLoss = Math.min(0.2, this.params.convergence.stopLoss + 0.05);
        adjustments.push(`Reversal止损 → ${(this.params.reversal.stopLoss * 100).toFixed(0)}%`);
        adjustments.push(`Convergence止损 → ${(this.params.convergence.stopLoss * 100).toFixed(0)}%`);
      }
      // 如果胜率低，需要收紧入场条件
      else if (avgWinRate < 0.4) {
        console.log('   → 胜率低，提高信号阈值提高质量');
        this.params.reversal.signalThreshold = Math.min(7, this.params.reversal.signalThreshold + 0.5);
        this.params.convergence.signalThreshold = Math.min(8, this.params.convergence.signalThreshold + 0.5);
        adjustments.push(`Reversal信号阈值 → ${this.params.reversal.signalThreshold}`);
        adjustments.push(`Convergence信号阈值 → ${this.params.convergence.signalThreshold}`);
      }
    }

    // 策略2: 如果回撤太大
    if (avgMaxDrawdown > 0.4) {
      console.log('   → 回撤过大，减少持仓数');
      this.params.reversal.maxPositions = Math.max(5, this.params.reversal.maxPositions - 1);
      this.params.convergence.maxPositions = Math.max(10, this.params.convergence.maxPositions - 1);
      adjustments.push(`Reversal持仓数 → ${this.params.reversal.maxPositions}`);
      adjustments.push(`Convergence持仓数 → ${this.params.convergence.maxPositions}`);
    }

    // 策略3: 如果利润率过高，可以增加持仓
    if (avgMonthlyReturn > 1.0 && avgMaxDrawdown < 0.2) {
      console.log('   → 利润高且风险低，增加持仓数');
      this.params.reversal.maxPositions = Math.min(15, this.params.reversal.maxPositions + 1);
      this.params.convergence.maxPositions = Math.min(20, this.params.convergence.maxPositions + 1);
      adjustments.push(`Reversal持仓数 → ${this.params.reversal.maxPositions}`);
      adjustments.push(`Convergence持仓数 → ${this.params.convergence.maxPositions}`);
    }

    // 策略4: 动态调整价格区间
    if (avgTrades < 5) {
      console.log('   → 交易极少，扩大价格区间');
      this.params.reversal.minPrice = Math.max(0.01, this.params.reversal.minPrice - 0.01);
      this.params.reversal.maxPrice = Math.min(0.6, this.params.reversal.maxPrice + 0.05);
      this.params.convergence.minPrice = Math.max(0.7, this.params.convergence.minPrice - 0.05);
      this.params.convergence.maxPrice = Math.min(0.99, this.params.convergence.maxPrice + 0.01);
      adjustments.push(`Reversal价格区间 → ${(this.params.reversal.minPrice * 100).toFixed(0)}%-${(this.params.reversal.maxPrice * 100).toFixed(0)}%`);
      adjustments.push(`Convergence价格区间 → ${(this.params.convergence.minPrice * 100).toFixed(0)}%-${(this.params.convergence.maxPrice * 100).toFixed(0)}%`);
    }
    // 如果交易数过多，缩小价格区间提高质量
    else if (avgTrades > 50) {
      console.log('   → 交易过多，缩小价格区间提高质量');
      this.params.reversal.minPrice = Math.min(0.1, this.params.reversal.minPrice + 0.01);
      this.params.reversal.maxPrice = Math.max(0.5, this.params.reversal.maxPrice - 0.05);
      this.params.convergence.minPrice = Math.min(0.85, this.params.convergence.minPrice + 0.05);
      this.params.convergence.maxPrice = Math.max(0.95, this.params.convergence.maxPrice - 0.01);
      adjustments.push(`Reversal价格区间 → ${(this.params.reversal.minPrice * 100).toFixed(0)}%-${(this.params.reversal.maxPrice * 100).toFixed(0)}%`);
      adjustments.push(`Convergence价格区间 → ${(this.params.convergence.minPrice * 100).toFixed(0)}%-${(this.params.convergence.maxPrice * 100).toFixed(0)}%`);
    }

    // 策略5: 确保参数在合理范围内
    this.validateParams();

    console.log('\n✅ 参数调整完成:');
    adjustments.forEach(adj => console.log(`   - ${adj}`));
    console.log('');

    return JSON.parse(JSON.stringify(this.params));
  }

  /**
   * 计算平均月利润率
   */
  private calculateAvgMonthlyReturn(): number {
    if (this.history.length === 0) return 0;
    const sum = this.history.reduce((acc, r) => acc + r.monthlyReturn, 0);
    return sum / this.history.length;
  }

  /**
   * 计算平均胜率
   */
  private calculateAvgWinRate(): number {
    if (this.history.length === 0) return 0;
    const sum = this.history.reduce((acc, r) => acc + r.winRate, 0);
    return sum / this.history.length;
  }

  /**
   * 计算平均最大回撤
   */
  private calculateAvgMaxDrawdown(): number {
    if (this.history.length === 0) return 0;
    const sum = this.history.reduce((acc, r) => acc + r.maxDrawdown, 0);
    return sum / this.history.length;
  }

  /**
   * 计算平均交易数
   */
  private calculateAvgTrades(): number {
    if (this.history.length === 0) return 0;
    const sum = this.history.reduce((acc, r) => acc + r.totalTrades, 0);
    return sum / this.history.length;
  }

  /**
   * 验证参数在合理范围内
   */
  private validateParams(): void {
    // Reversal参数验证
    this.params.reversal.maxPositions = Math.max(3, Math.min(20, this.params.reversal.maxPositions));
    this.params.reversal.stopLoss = Math.max(0.2, Math.min(0.5, this.params.reversal.stopLoss));
    this.params.reversal.takeProfit = 1.0; // 保持100%
    this.params.reversal.minPrice = Math.max(0.01, Math.min(0.3, this.params.reversal.minPrice));
    this.params.reversal.maxPrice = Math.max(0.4, Math.min(0.7, this.params.reversal.maxPrice));
    this.params.reversal.signalThreshold = Math.max(2, Math.min(10, this.params.reversal.signalThreshold));

    // Convergence参数验证
    this.params.convergence.maxPositions = Math.max(5, Math.min(30, this.params.convergence.maxPositions));
    this.params.convergence.stopLoss = Math.max(0.1, Math.min(0.3, this.params.convergence.stopLoss));
    this.params.convergence.takeProfit = 1.0; // 保持100%
    this.params.convergence.minPrice = Math.max(0.7, Math.min(0.85, this.params.convergence.minPrice));
    this.params.convergence.maxPrice = Math.max(0.9, Math.min(0.99, this.params.convergence.maxPrice));
    this.params.convergence.signalThreshold = Math.max(3, Math.min(10, this.params.convergence.signalThreshold));

    // 确保minPrice < maxPrice
    if (this.params.reversal.minPrice >= this.params.reversal.maxPrice) {
      this.params.reversal.minPrice = 0.05;
      this.params.reversal.maxPrice = 0.55;
    }
    if (this.params.convergence.minPrice >= this.params.convergence.maxPrice) {
      this.params.convergence.minPrice = 0.80;
      this.params.convergence.maxPrice = 0.98;
    }
  }

  /**
   * 获取当前参数
   */
  getParams(): StrategyParams {
    return JSON.parse(JSON.stringify(this.params));
  }

  /**
   * 获取历史
   */
  getHistory(): RoundResult[] {
    return JSON.parse(JSON.stringify(this.history));
  }

  /**
   * 打印当前参数
   */
  printParams(): void {
    console.log('\n📋 当前策略参数:');
    console.log('\n【Reversal Strategy】');
    console.log(`   持仓数: ${this.params.reversal.maxPositions}`);
    console.log(`   止损: ${(this.params.reversal.stopLoss * 100).toFixed(0)}%`);
    console.log(`   止盈: ${(this.params.reversal.takeProfit * 100).toFixed(0)}%`);
    console.log(`   价格区间: ${(this.params.reversal.minPrice * 100).toFixed(0)}%-${(this.params.reversal.maxPrice * 100).toFixed(0)}%`);
    console.log(`   信号阈值: ${this.params.reversal.signalThreshold}`);

    console.log('\n【Convergence Strategy】');
    console.log(`   持仓数: ${this.params.convergence.maxPositions}`);
    console.log(`   止损: ${(this.params.convergence.stopLoss * 100).toFixed(0)}%`);
    console.log(`   止盈: ${(this.params.convergence.takeProfit * 100).toFixed(0)}%`);
    console.log(`   价格区间: ${(this.params.convergence.minPrice * 100).toFixed(0)}%-${(this.params.convergence.maxPrice * 100).toFixed(0)}%`);
    console.log(`   信号阈值: ${this.params.convergence.signalThreshold}`);
    console.log('');
  }
}
