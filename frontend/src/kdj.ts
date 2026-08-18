import type { ProductPoint } from "./api.ts";

export type PriceSource = "buy" | "sell";

export interface KdjPoint {
  time: number;
  k: number;
  /** null until the D window has filled. */
  d: number | null;
  j: number | null;
}

/**
 * KDJ over a plain price series.
 *
 * The textbook indicator runs on candles, where the stochastic compares the
 * close against the high and low of the last n candles. Bazaar snapshots
 * aren't candles, so the rolling max and min of the price itself stand in for
 * that high and low:
 *
 *   K = (price - min over kPeriod) / (max over kPeriod - min over kPeriod) * 100
 *   D = SMA of K over dPeriod
 *   J = 3K - 2D
 *
 * Note this is the "raw" K rather than the smoothed one some KDJ variants
 * use (where K is itself an EMA of the stochastic) — it matches the two
 * knobs exposed in the UI: a K lookback and a D averaging window.
 *
 * Flat windows (max === min) leave the stochastic undefined; K carries
 * forward its previous value there, since a flat price hasn't moved to any
 * new position within its range.
 */
export function computeKdj(
  points: ProductPoint[],
  source: PriceSource,
  kPeriod: number,
  dPeriod: number
): KdjPoint[] {
  const out: KdjPoint[] = [];
  if (points.length === 0 || kPeriod < 1 || dPeriod < 1) return out;

  const key = source === "buy" ? "buy_price" : "sell_price";

  // Monotonic deques of indices: maxDeque values decreasing, minDeque
  // increasing, so the window's extremes are always at the front. Keeps the
  // whole pass O(n) instead of O(n * kPeriod), which matters at 30-day ranges.
  const maxDeque: number[] = [];
  const minDeque: number[] = [];

  // Sliding window of K values feeding D's SMA. Summed outright each step
  // rather than kept as a running total — dPeriod is small, and an
  // add/subtract running sum accumulates floating-point drift.
  const kWindow: number[] = [];

  let prevK = 50;

  for (let i = 0; i < points.length; i++) {
    const price = points[i][key];

    while (maxDeque.length > 0 && points[maxDeque[maxDeque.length - 1]][key] <= price) {
      maxDeque.pop();
    }
    maxDeque.push(i);

    while (minDeque.length > 0 && points[minDeque[minDeque.length - 1]][key] >= price) {
      minDeque.pop();
    }
    minDeque.push(i);

    const windowStart = i - kPeriod + 1;
    if (maxDeque[0] < windowStart) maxDeque.shift();
    if (minDeque[0] < windowStart) minDeque.shift();

    // No output until the lookback window is actually full.
    if (windowStart < 0) continue;

    const high = points[maxDeque[0]][key];
    const low = points[minDeque[0]][key];
    const k = high === low ? prevK : ((price - low) / (high - low)) * 100;
    prevK = k;

    kWindow.push(k);
    if (kWindow.length > dPeriod) kWindow.shift();

    let d: number | null = null;
    if (kWindow.length === dPeriod) {
      let sum = 0;
      for (const value of kWindow) sum += value;
      d = sum / dPeriod;
    }

    out.push({
      time: points[i].time,
      k,
      d,
      j: d === null ? null : 3 * k - 2 * d,
    });
  }

  return out;
}