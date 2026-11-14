import { type Asset, covarianceMatrix } from "./market";
import type { PortfolioOutcome, Simulation } from "./montecarlo";

export interface RiskSummary {
  /** Доля будущих, где потеряно больше половины. */
  pLossHalf: number;
  /** Доля будущих, где итог ниже вложенного. */
  pLoss: number;
  mean: number;
  median: number;
  p5: number;
  p95: number;
  /** Потери, хуже которых бывает только в 5% будущих. */
  var95: number;
  /** Средние потери в худших 5% будущих. */
  cvar95: number;
  medianMaxDrawdown: number;
}

export function quantile(sorted: ArrayLike<number>, q: number): number {
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function summarize(outcome: PortfolioOutcome): RiskSummary {
  const sorted = Float64Array.from(outcome.finals).sort();
  const drawdowns = Float64Array.from(outcome.maxDrawdowns).sort();
  const n = sorted.length;
  let lossHalf = 0;
  let loss = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (sorted[i] < 0.5) lossHalf++;
    if (sorted[i] < 1) loss++;
    total += sorted[i];
  }
  const tailCount = Math.max(1, Math.floor(n * 0.05));
  let tail = 0;
  for (let i = 0; i < tailCount; i++) tail += sorted[i];
  const p5 = quantile(sorted, 0.05);
  return {
    pLossHalf: lossHalf / n,
    pLoss: loss / n,
    mean: total / n,
    median: quantile(sorted, 0.5),
    p5,
    p95: quantile(sorted, 0.95),
    var95: 1 - p5,
    cvar95: 1 - tail / tailCount,
    medianMaxDrawdown: quantile(drawdowns, 0.5),
  };
}

/** Максимальная доля одного эмитента. Фонды и депозит эмитентом не считаются — они уже диверсифицированы. */
export function maxIssuerShare(assets: Asset[], weights: number[]): { share: number; index: number } {
  let share = 0;
  let index = -1;
  assets.forEach((asset, i) => {
    if (asset.kind === "stock" && weights[i] > share) {
      share = weights[i];
      index = i;
    }
  });
  return { share, index };
}

/** Индекс Херфиндаля — Хиршмана по всем активам счёта (включая свободные деньги). */
export function herfindahl(weights: number[]): number {
  const cash = Math.max(0, 1 - weights.reduce((sum, w) => sum + w, 0));
  return weights.reduce((sum, w) => sum + w * w, cash * cash);
}

/** Эффективное число позиций: 1/HHI. Пять равных позиций → 5, всё в одной → 1. */
export function effectivePositions(weights: number[]): number {
  const hhi = herfindahl(weights);
  return hhi > 0 ? 1 / hhi : 0;
}

/**
 * Вклад каждой бумаги в риск портфеля (разложение Эйлера): RCᵢ = wᵢ·(Σw)ᵢ / wᵀΣw.
 * В сумме даёт 1. Показывает, что 50% денег в рискованной акции — это не 50% риска, а больше.
 */
export function riskContributions(assets: Asset[], weights: number[]): number[] {
  const cov = covarianceMatrix(assets);
  const marginal = cov.map((row) => row.reduce((sum, c, j) => sum + c * weights[j], 0));
  const variance = marginal.reduce((sum, m, i) => sum + m * weights[i], 0);
  if (variance <= 0) return weights.map(() => 0);
  return weights.map((w, i) => (w * marginal[i]) / variance);
}

/** Гистограмма итогов для графика распределения. */
export function histogram(finals: ArrayLike<number>, min: number, max: number, bins: number): number[] {
  const counts = new Array<number>(bins).fill(0);
  const width = (max - min) / bins;
  for (let i = 0; i < finals.length; i++) {
    const bin = Math.min(bins - 1, Math.max(0, Math.floor((finals[i] - min) / width)));
    counts[bin]++;
  }
  return counts;
}

/** Номер траектории, итог которой стоит на заданном квантиле (например, 0,05 — «плохой, но реальный» год). */
export function pathAtQuantile(outcome: PortfolioOutcome, q: number): number {
  const order = Array.from({ length: outcome.paths }, (_, i) => i).sort(
    (a, b) => outcome.finals[a] - outcome.finals[b],
  );
  return order[Math.min(order.length - 1, Math.floor(order.length * q))];
}

/** Самое резкое недельное падение бумаги на траектории — для разбора «что именно случилось». */
export function largestWeeklyDrop(
  sim: Simulation,
  path: number,
  assetIndex: number,
): { week: number; drop: number } {
  const n = sim.assets.length;
  let week = 0;
  let drop = 0;
  for (let s = 1; s < sim.steps; s++) {
    const before = sim.prices[(path * sim.steps + s - 1) * n + assetIndex];
    const after = sim.prices[(path * sim.steps + s) * n + assetIndex];
    const change = 1 - after / before;
    if (change > drop) {
      drop = change;
      week = s;
    }
  }
  return { week, drop };
}
