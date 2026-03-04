import { randomForSecond } from './random';

const START_PRICE = 100;
const EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

export const HISTORY_INTERVAL_SECONDS = 300;
export const HISTORY_POINTS = 60;

export const JITTER_AMPLITUDE = 0.004;
export const EVENT_PROBABILITY = 0.06;
export const EVENT_AMPLITUDE = 0.08;
export const TREND_AMPLITUDE = 0.04;
export const INTRA_BUCKET_SPREAD = 0.02;

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

function noise(second: number): number {
  const rnd = randomForSecond(second) - 0.5;
  const slow = Math.sin(second / 1800) * 0.01;
  const mid = Math.cos(second / 420) * 0.008;
  const fast = Math.sin(second / 90) * 0.004;
  return rnd * 0.015 + slow + mid + fast;
}

export function getCurrentSecond(nowMs = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - EPOCH_MS) / 1000));
}

export function getCurrentBucket(second: number): number {
  return Math.max(0, Math.floor(second / HISTORY_INTERVAL_SECONDS));
}

export type Candle = {
  bucket: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

function bucketTrend(bucket: number): number {
  const slow = Math.sin(bucket / 280) * (TREND_AMPLITUDE * 0.7);
  const mid = Math.cos(bucket / 90) * (TREND_AMPLITUDE * 0.5);
  return slow + mid;
}

function bucketEvent(bucket: number): number {
  const baseSecond = bucket * HISTORY_INTERVAL_SECONDS;
  const roll = randomForSecond(baseSecond + 11);
  if (roll > EVENT_PROBABILITY) return 0;
  const direction = randomForSecond(baseSecond + 29) - 0.5;
  return direction * 2 * EVENT_AMPLITUDE;
}

function basePriceAtBucket(bucket: number): number {
  const baseSecond = bucket * HISTORY_INTERVAL_SECONDS;
  const drift = 1 + baseSecond * 0.0000012;
  const value = START_PRICE * drift * (1 + bucketTrend(bucket) + bucketEvent(bucket) + noise(baseSecond));
  return Math.max(1, value);
}

export function candleAtBucket(bucket: number): Candle {
  const base = basePriceAtBucket(bucket);
  const seed = bucket * HISTORY_INTERVAL_SECONDS;
  const open = base * (1 + (randomForSecond(seed + 3) - 0.5) * INTRA_BUCKET_SPREAD);
  const close = base * (1 + (randomForSecond(seed + 7) - 0.5) * INTRA_BUCKET_SPREAD);
  const highBase = Math.max(open, close);
  const lowBase = Math.min(open, close);
  const high = highBase * (1 + Math.abs(randomForSecond(seed + 13) - 0.5) * (INTRA_BUCKET_SPREAD * 1.8));
  const low = lowBase * (1 - Math.abs(randomForSecond(seed + 19) - 0.5) * (INTRA_BUCKET_SPREAD * 1.6));
  return {
    bucket,
    open: roundPrice(open),
    high: roundPrice(Math.max(high, open, close)),
    low: roundPrice(Math.max(1, Math.min(low, open, close))),
    close: roundPrice(close),
  };
}

export function livePriceAtSecond(second: number): number {
  const bucket = getCurrentBucket(second);
  const candle = candleAtBucket(bucket);
  const within = second - bucket * HISTORY_INTERVAL_SECONDS;
  const t = Math.min(1, Math.max(0, within / HISTORY_INTERVAL_SECONDS));
  const base = candle.open + (candle.close - candle.open) * t;
  const jitter = (randomForSecond(second) - 0.5) * (JITTER_AMPLITUDE * 2) + Math.sin(second / 10) * JITTER_AMPLITUDE;
  const price = base * (1 + jitter);
  const clamped = Math.min(candle.high, Math.max(candle.low, price));
  return roundPrice(Math.max(1, clamped));
}

export function livePriceAtMs(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return 0;
  const elapsed = Math.max(0, (nowMs - EPOCH_MS) / 1000);
  const second = Math.floor(elapsed);
  const t = elapsed - second;
  const eased = t * t * (3 - 2 * t);
  const p0 = livePriceAtSecond(second);
  const p1 = livePriceAtSecond(second + 1);
  return roundPrice(p0 + (p1 - p0) * eased);
}

export function buildHistorySeries(
  currentSecond: number,
  points = HISTORY_POINTS,
  intervalSeconds = HISTORY_INTERVAL_SECONDS,
): { seconds: number[]; candles: Candle[] } {
  const safePoints = Math.max(2, Math.floor(points));
  const seconds: number[] = [];
  const candles: Candle[] = [];
  const currentBucket = getCurrentBucket(currentSecond);
  for (let i = safePoints - 1; i >= 0; i -= 1) {
    const bucket = Math.max(0, currentBucket - i);
    const second = bucket * intervalSeconds;
    seconds.push(second);
    candles.push(candleAtBucket(bucket));
  }
  return { seconds, candles };
}
