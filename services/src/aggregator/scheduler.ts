import type Database from 'better-sqlite3';
import { aggregateHeatmap } from './pipeline.js';

export interface SchedulerConfig {
  kAnonymityThreshold: number;
  aggregationIntervalMs: number;
}

export class AggregationScheduler {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private db: Database.Database;
  private config: SchedulerConfig;

  constructor(db: Database.Database, config: SchedulerConfig) {
    this.db = db;
    this.config = config;
  }

  start(): void {
    this.runOnce();
    this.intervalHandle = setInterval(() => {
      this.runOnce();
    }, this.config.aggregationIntervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  runOnce(): void {
    try {
      aggregateHeatmap(this.db, this.config.kAnonymityThreshold);
    } catch (err) {
      console.error('[AggregationScheduler] pipeline error:', err);
    }
  }
}
