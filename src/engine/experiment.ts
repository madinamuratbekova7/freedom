import { mulberry32, type Rng } from "./rng";

/**
 * Симулятор эксперимента. Модель вымышленных новичков с разным опытом и мотивацией.
 * Один и тот же истинный эффект измеряется тремя способами, чтобы показать,
 * какие из них путают эффект обучения с мотивацией клиентов и изменением рынка.
 */
export interface ExperimentParams {
  /** Клиентов в каждой группе. */
  perGroup: number;
  /** Насколько «Засада» повышает шанс не держать >50% в одной компании — для прошедших обучение. */
  effect: number;
  /** Побочный эффект: на сколько обучение повышает шанс так и не сделать первую сделку. */
  scare: number;
  /** Сдвиг рынка между периодами «до» и «после»: ралли подталкивает ставить всё на одну акцию. */
  marketShift: number;
  seed: number;
}

export interface Estimate {
  /** Доля «без опасной концентрации» в группе сравнения и в группе воздействия. */
  base: number;
  treated: number;
  diff: number;
  ciLow: number;
  ciHigh: number;
  pValue: number;
  nBase: number;
  nTreated: number;
}

export type GuardrailVerdict = "ok" | "watch" | "stop";

export interface ExperimentResult {
  /** Настоящий эффект на всех начавших урок — известен только потому, что это модель. */
  trueEffect: number;
  beforeAfter: Estimate;
  completers: Estimate;
  randomized: Estimate;
  guardrail: Estimate & { verdict: GuardrailVerdict };
  completionRate: number;
  /** Доля верных ответов в тесте с вариантами и доля прошедших засаду — разрыв «тест → перенос». */
  quizRate: number;
  ambushPassRate: number;
}

interface Client {
  experience: number;
  motivation: number;
}

/** Порог стоп-правила: заградительная метрика хуже контроля больше чем на 2 п.п. */
export const GUARDRAIL_LIMIT = 0.02;

const clamp = (value: number) => Math.min(0.98, Math.max(0.02, value));

function drawClient(rng: Rng): Client {
  // Большинство новичков малоопытны: опыт смещён к нулю.
  return { experience: Math.pow(rng(), 1.5), motivation: rng() };
}

/** Шанс не держать больше половины счёта в одной компании без всякого обучения. */
function pSafe(client: Client, market: number): number {
  return clamp(0.17 + 0.25 * client.experience + 0.26 * client.motivation - market);
}

/** Мотивированные чаще доходят до конца — отсюда смещение при сравнении «прошли / не прошли». */
function pComplete(client: Client): number {
  return clamp(0.35 + 0.5 * client.motivation);
}

function pNoTrade(client: Client): number {
  return clamp(0.3 - 0.15 * client.motivation);
}

/** Функция стандартного нормального распределения (приближение Абрамовица — Стиган 26.2.17). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const density = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const upper = density * poly;
  return z >= 0 ? 1 - upper : upper;
}

/** Разность двух долей: 95% доверительный интервал (Вальд) и двусторонний p-value. */
export function compareProportions(
  successBase: number,
  nBase: number,
  successTreated: number,
  nTreated: number,
): Estimate {
  const base = nBase > 0 ? successBase / nBase : 0;
  const treated = nTreated > 0 ? successTreated / nTreated : 0;
  const diff = treated - base;
  const se = Math.sqrt((base * (1 - base)) / Math.max(1, nBase) + (treated * (1 - treated)) / Math.max(1, nTreated));
  const z = se > 0 ? diff / se : 0;
  return {
    base,
    treated,
    diff,
    ciLow: diff - 1.96 * se,
    ciHigh: diff + 1.96 * se,
    pValue: 2 * (1 - normalCdf(Math.abs(z))),
    nBase,
    nTreated,
  };
}

/** Клиентов на группу, чтобы заметить рост доли с p1 на mde при α = 0,05 и мощности 80%. */
export function sampleSize(p1: number, mde: number): number {
  const p2 = p1 + mde;
  const pooled = (p1 + p2) / 2;
  const zAlpha = 1.959964;
  const zBeta = 0.841621;
  const numerator =
    zAlpha * Math.sqrt(2 * pooled * (1 - pooled)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((numerator * numerator) / (mde * mde));
}

export function runExperiment(params: ExperimentParams): ExperimentResult {
  const rng = mulberry32(params.seed);
  const n = params.perGroup;
  const hit = (probability: number) => rng() < probability;

  // --- Способ 1. «До и после»: когорта до запуска (без обучения, ралли) против когорты после (все обучены).
  let beforeSafe = 0;
  let afterSafe = 0;
  for (let i = 0; i < n; i++) {
    if (hit(pSafe(drawClient(rng), params.marketShift))) beforeSafe++;
  }
  for (let i = 0; i < n; i++) {
    const client = drawClient(rng);
    const completed = hit(pComplete(client));
    if (hit(clamp(pSafe(client, 0) + (completed ? params.effect : 0)))) afterSafe++;
  }

  // --- Способы 2 и 3. Один календарный период, случайное деление на контроль и «Засаду».
  let controlSafe = 0;
  let controlNoTrade = 0;
  let treatedSafe = 0;
  let treatedNoTrade = 0;
  let completedCount = 0;
  let completedSafe = 0;
  let droppedSafe = 0;
  let quizCorrect = 0;
  let ambushPassed = 0;
  let trueEffectSum = 0;

  for (let i = 0; i < n; i++) {
    const client = drawClient(rng);
    if (hit(pSafe(client, 0))) controlSafe++;
    if (hit(pNoTrade(client))) controlNoTrade++;
  }

  for (let i = 0; i < n; i++) {
    const client = drawClient(rng);
    const completed = hit(pComplete(client));
    const baseline = pSafe(client, 0);
    const withLesson = clamp(baseline + (completed ? params.effect : 0));
    trueEffectSum += pComplete(client) * (clamp(baseline + params.effect) - baseline);
    const safe = hit(withLesson);
    if (safe) treatedSafe++;
    if (hit(clamp(pNoTrade(client) + (completed ? params.scare : 0)))) treatedNoTrade++;
    if (completed) {
      completedCount++;
      if (safe) completedSafe++;
      if (hit(0.85)) quizCorrect++;
      if (hit(clamp(0.3 + 0.3 * client.experience + 2 * params.effect))) ambushPassed++;
    } else if (safe) {
      droppedSafe++;
    }
  }

  const guardrail = compareProportions(controlNoTrade, n, treatedNoTrade, n);
  let verdict: GuardrailVerdict = "ok";
  if (guardrail.diff > GUARDRAIL_LIMIT && guardrail.ciLow > 0) verdict = "stop";
  else if (guardrail.diff > GUARDRAIL_LIMIT || guardrail.ciHigh > 2 * GUARDRAIL_LIMIT) verdict = "watch";

  return {
    trueEffect: trueEffectSum / n,
    beforeAfter: compareProportions(beforeSafe, n, afterSafe, n),
    completers: compareProportions(droppedSafe, n - completedCount, completedSafe, completedCount),
    randomized: compareProportions(controlSafe, n, treatedSafe, n),
    guardrail: { ...guardrail, verdict },
    completionRate: completedCount / n,
    quizRate: completedCount > 0 ? quizCorrect / completedCount : 0,
    ambushPassRate: completedCount > 0 ? ambushPassed / completedCount : 0,
  };
}
