import { type Asset, cholesky, correlationMatrix } from "./market";
import { makeNormal, mulberry32 } from "./rng";

export interface SimOptions {
  paths: number;
  /** Торговых дней в горизонте. */
  days: number;
  /** Каждые сколько дней сохраняем точку (5 = недельный шаг). */
  snapshotEvery: number;
  seed: number;
}

export interface Simulation {
  assets: Asset[];
  paths: number;
  /** Число сохранённых точек, включая стартовую. */
  steps: number;
  /** Цены относительно старта: [траектория][шаг][бумага]. */
  prices: Float32Array;
  elapsedMs: number;
}

export interface PortfolioOutcome {
  paths: number;
  steps: number;
  /** Стоимость портфеля относительно вложенного: [траектория][шаг]. */
  values: Float32Array;
  finals: Float64Array;
  maxDrawdowns: Float64Array;
}

const TRADING_DAYS = 252;

/**
 * Рынок: коррелированное геометрическое броуновское движение + скачки Мертона.
 * d ln S = (μ − λk − σ²/2) dt + σ dW + ln J · dN,  k = E[J − 1].
 * Рынок моделируется один раз, а портфели оцениваются поверх тех же траекторий (общие случайные числа).
 */
export function simulateMarket(assets: Asset[], options: SimOptions): Simulation {
  const started = performance.now();
  const n = assets.length;
  const lower = cholesky(correlationMatrix(assets));
  const rng = mulberry32(options.seed);
  const normal = makeNormal(rng);
  const dt = 1 / TRADING_DAYS;
  const steps = Math.floor(options.days / options.snapshotEvery) + 1;
  const prices = new Float32Array(options.paths * steps * n);

  const drift = assets.map((a) => {
    const compensator = Math.exp(a.jumpMean + a.jumpStd ** 2 / 2) - 1;
    return (a.mu - a.jumpRate * compensator - a.sigma ** 2 / 2) * dt;
  });
  const vol = assets.map((a) => a.sigma * Math.sqrt(dt));
  const jumpProb = assets.map((a) => a.jumpRate * dt);

  const noise = new Float64Array(n);
  const logPrice = new Float64Array(n);

  for (let p = 0; p < options.paths; p++) {
    logPrice.fill(0);
    let offset = p * steps * n;
    for (let i = 0; i < n; i++) prices[offset + i] = 1;
    offset += n;

    for (let day = 1; day <= options.days; day++) {
      for (let i = 0; i < n; i++) noise[i] = normal();
      for (let i = 0; i < n; i++) {
        let correlated = 0;
        const row = lower[i];
        for (let j = 0; j <= i; j++) correlated += row[j] * noise[j];
        let increment = drift[i] + vol[i] * correlated;
        if (jumpProb[i] > 0 && rng() < jumpProb[i]) {
          increment += assets[i].jumpMean + assets[i].jumpStd * normal();
        }
        logPrice[i] += increment;
      }
      if (day % options.snapshotEvery === 0) {
        for (let i = 0; i < n; i++) prices[offset + i] = Math.exp(logPrice[i]);
        offset += n;
      }
    }
  }

  return { assets, paths: options.paths, steps, prices, elapsedMs: performance.now() - started };
}

/**
 * Портфель «купил и держу». weights — доли по бумагам; остаток до 1 лежит свободными деньгами без дохода.
 */
export function evaluatePortfolio(sim: Simulation, weights: number[]): PortfolioOutcome {
  const n = sim.assets.length;
  const invested = weights.reduce((sum, w) => sum + w, 0);
  const cash = Math.max(0, 1 - invested);
  const values = new Float32Array(sim.paths * sim.steps);
  const finals = new Float64Array(sim.paths);
  const maxDrawdowns = new Float64Array(sim.paths);

  for (let p = 0; p < sim.paths; p++) {
    let peak = 1;
    let worst = 0;
    let value = 1;
    for (let s = 0; s < sim.steps; s++) {
      const base = (p * sim.steps + s) * n;
      value = cash;
      for (let i = 0; i < n; i++) value += weights[i] * sim.prices[base + i];
      values[p * sim.steps + s] = value;
      if (value > peak) peak = value;
      const drawdown = 1 - value / peak;
      if (drawdown > worst) worst = drawdown;
    }
    finals[p] = value;
    maxDrawdowns[p] = worst;
  }

  return { paths: sim.paths, steps: sim.steps, values, finals, maxDrawdowns };
}

/** Ряд стоимости одной траектории — для графика. */
export function pathSeries(outcome: PortfolioOutcome, path: number): number[] {
  const start = path * outcome.steps;
  return Array.from(outcome.values.subarray(start, start + outcome.steps));
}
