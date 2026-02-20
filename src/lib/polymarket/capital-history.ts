/**
 * 资金历史记录系统
 * 用于记录和查询资金变化历史，支持数据采样和持久化存储
 */

import fs from 'fs';
import path from 'path';

export interface CapitalHistoryPoint {
  timestamp: Date;
  equity: number;
  totalAssets: number;
  realizedPnl: number;
  floatingPnl: number;
  openPositions: number;
}

export interface DailyPnLData {
  date: string; // YYYY-MM-DD
  realizedPnl: number;
  trades: number;
}

export interface SampledData {
  timestamp: Date;
  equity: number;
}

/**
 * 资金历史记录类
 */
export class CapitalHistory {
  private history: CapitalHistoryPoint[] = [];
  private dailyPnL: Map<string, DailyPnLData> = new Map();
  private filePath: string;

  constructor(storageDir: string = '/tmp/polymarket_data') {
    this.filePath = path.join(storageDir, 'capital_history.json');

    // 确保存储目录存在
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    // 加载历史数据
    this.load();
  }

  /**
   * 记录资金变化
   * @param equity 当前权益
   * @param totalAssets 总资产（含浮盈）
   * @param realizedPnl 已实现盈亏
   * @param floatingPnl 浮动盈亏
   * @param openPositions 开仓数量
   */
  recordPoint(
    equity: number,
    totalAssets: number,
    realizedPnl: number,
    floatingPnl: number,
    openPositions: number
  ): void {
    const point: CapitalHistoryPoint = {
      timestamp: new Date(),
      equity,
      totalAssets,
      realizedPnl,
      floatingPnl,
      openPositions,
    };

    this.history.push(point);

    // 更新每日盈亏
    this.updateDailyPnL(point);

    // 保存到文件
    this.save();
  }

  /**
   * 更新每日盈亏数据
   */
  private updateDailyPnL(point: CapitalHistoryPoint): void {
    const dateStr = this.formatDate(point.timestamp);

    if (!this.dailyPnL.has(dateStr)) {
      this.dailyPnL.set(dateStr, {
        date: dateStr,
        realizedPnl: point.realizedPnl,
        trades: 0,
      });
    } else {
      const existing = this.dailyPnL.get(dateStr)!;
      // 只保留最新的 realizedPnl（因为它是累计的）
      existing.realizedPnl = point.realizedPnl;
    }
  }

  /**
   * 记录交易（用于计算每日盈亏的变化）
   */
  recordTrade(pnl: number): void {
    const dateStr = this.formatDate(new Date());

    if (!this.dailyPnL.has(dateStr)) {
      this.dailyPnL.set(dateStr, {
        date: dateStr,
        realizedPnl: pnl,
        trades: 1,
      });
    } else {
      const existing = this.dailyPnL.get(dateStr)!;
      existing.trades += 1;
      // 每日盈亏是当天所有交易的总和
      existing.realizedPnl += pnl;
    }

    this.save();
  }

  /**
   * 获取资金历史（带采样）
   * @param maxPoints 最大数据点数（默认50）
   * @param intervalMinutes 采样间隔（分钟，默认10）
   */
  getHistory(maxPoints: number = 50, intervalMinutes: number = 10): SampledData[] {
    if (this.history.length === 0) {
      return [];
    }

    // 按时间间隔采样
    const sampled: SampledData[] = [];
    let lastIndex = 0;

    for (let i = 0; i < this.history.length; i++) {
      const point = this.history[i];
      const previousPoint = sampled.length > 0 ? sampled[sampled.length - 1] : null;

      // 如果是第一个点，或者距离上一个采样点超过了间隔
      if (!previousPoint || this.getTimeDiffMinutes(previousPoint.timestamp, point.timestamp) >= intervalMinutes) {
        sampled.push({
          timestamp: point.timestamp,
          equity: point.equity,
        });
      }
    }

    // 如果采样后的点太多，进行均匀采样
    if (sampled.length > maxPoints) {
      const step = Math.ceil(sampled.length / maxPoints);
      return sampled.filter((_, index) => index % step === 0);
    }

    return sampled;
  }

  /**
   * 获取过去 N 天的每日盈亏
   * @param days 天数（默认7天）
   */
  getDailyPnL(days: number = 7): Array<{ date: string; value: number; type: 'win' | 'loss' }> {
    const result: Array<{ date: string; value: number; type: 'win' | 'loss' }> = [];

    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = this.formatDate(date);

      const data = this.dailyPnL.get(dateStr);

      if (data) {
        // 计算当天的净盈亏
        const prevDate = new Date(date);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = this.formatDate(prevDate);
        const prevData = this.dailyPnL.get(prevDateStr);

        const dailyChange = prevData
          ? data.realizedPnl - prevData.realizedPnl
          : data.realizedPnl;

        result.push({
          date: date.toLocaleDateString('en-US', { weekday: 'short' }),
          value: Math.round(dailyChange),
          type: dailyChange >= 0 ? 'win' : 'loss',
        });
      } else {
        // 没有数据的日期
        result.push({
          date: date.toLocaleDateString('en-US', { weekday: 'short' }),
          value: 0,
          type: 'loss',
        });
      }
    }

    return result;
  }

  /**
   * 获取初始资金
   */
  getInitialCapital(): number {
    if (this.history.length === 0) {
      return 0;
    }
    return this.history[0].equity;
  }

  /**
   * 获取最新资金
   */
  getLatestCapital(): number {
    if (this.history.length === 0) {
      return 0;
    }
    return this.history[this.history.length - 1].equity;
  }

  /**
   * 清空历史记录
   */
  clear(): void {
    this.history = [];
    this.dailyPnL.clear();
    this.save();
  }

  /**
   * 保存到文件
   */
  private save(): void {
    try {
      const data = {
        history: this.history.map(point => ({
          ...point,
          timestamp: point.timestamp.toISOString(),
        })),
        dailyPnL: Array.from(this.dailyPnL.values()),
      };

      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[CapitalHistory] 保存失败:', error);
    }
  }

  /**
   * 从文件加载
   */
  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }

      const content = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(content);

      this.history = (data.history || []).map((point: any) => ({
        ...point,
        timestamp: new Date(point.timestamp),
      }));

      this.dailyPnL = new Map(
        (data.dailyPnL || []).map((item: DailyPnLData) => [item.date, item])
      );

      console.log(`[CapitalHistory] 加载了 ${this.history.length} 条历史记录`);
    } catch (error) {
      console.error('[CapitalHistory] 加载失败:', error);
    }
  }

  /**
   * 格式化日期
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 计算时间差（分钟）
   */
  private getTimeDiffMinutes(date1: Date, date2: Date): number {
    const diff = date2.getTime() - date1.getTime();
    return diff / (1000 * 60);
  }
}

// 导出单例
export const capitalHistory = new CapitalHistory();
