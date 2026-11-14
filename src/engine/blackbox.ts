import type { Scenario } from "./ambush";
import { evaluatePortfolio, type PortfolioOutcome, type Simulation } from "./montecarlo";
import {
  effectivePositions,
  herfindahl,
  largestWeeklyDrop,
  maxIssuerShare,
  pathAtQuantile,
  riskContributions,
  type RiskSummary,
  summarize,
} from "./risk";

/**
 * «Чёрный ящик» — разбор решения, как разбор полёта.
 * Сравнивает выбор клиента с разложенным портфелем на одних и тех же будущих
 * и находит, что именно пошло не так в «плохом, но обычном» году.
 */
export type Verdict = "fail" | "pass" | "strong";

export const FAIL_THRESHOLD = 0.5;
export const STRONG_THRESHOLD = 0.3;
export const STAKE = 1_000_000;

/** Разложенный вариант: разрекламированная акция остаётся, но долей. Порядок как в buildAssets. */
export const ALTERNATIVE_WEIGHTS = [0.15, 0.15, 0.15, 0.35, 0.2];

export interface Finding {
  id: string;
  title: string;
  text: string;
}

export interface BlackBoxReport {
  verdict: Verdict;
  maxShare: number;
  maxShareName: string;
  hhi: number;
  effectivePositions: number;
  riskShares: number[];
  user: RiskSummary;
  alternative: RiskSummary;
  userOutcome: PortfolioOutcome;
  alternativeOutcome: PortfolioOutcome;
  /** В скольких будущих клиент теряет больше половины, а разложенный портфель — нет. */
  avoidableFutures: number;
  badPath: number;
  findings: Finding[];
}

const money = (share: number) => `${Math.round(share * STAKE).toLocaleString("ru-RU")} ₸`;
const pct = (value: number) => `${Math.round(value * 100)}%`;

export function analyzeDecision(scenario: Scenario, sim: Simulation, weights: number[]): BlackBoxReport {
  const userOutcome = evaluatePortfolio(sim, weights);
  const alternativeOutcome = evaluatePortfolio(sim, ALTERNATIVE_WEIGHTS);
  const user = summarize(userOutcome);
  const alternative = summarize(alternativeOutcome);
  const { share: maxShare, index: maxIndex } = maxIssuerShare(scenario.assets, weights);
  const riskShares = riskContributions(scenario.assets, weights);
  const verdict: Verdict = maxShare > FAIL_THRESHOLD ? "fail" : maxShare <= STRONG_THRESHOLD ? "strong" : "pass";

  let avoidableFutures = 0;
  for (let p = 0; p < sim.paths; p++) {
    if (userOutcome.finals[p] < 0.5 && alternativeOutcome.finals[p] >= 0.5) avoidableFutures++;
  }

  const badPath = pathAtQuantile(userOutcome, 0.05);
  const findings: Finding[] = [];

  if (maxIndex >= 0 && maxShare > STRONG_THRESHOLD) {
    const name = scenario.assets[maxIndex].name;
    const drop = largestWeeklyDrop(sim, badPath, maxIndex);
    findings.push({
      id: "signal",
      title: "Сигнал, который был в сообщении",
      text: `«${scenario.messages[2]}» Это тот же призыв, что у Айгерим, — вложить всё в одну компанию. Изменились только отрасль и рассказчик.`,
    });
    findings.push({
      id: "hook",
      title: `Крючок: ${scenario.hookLabel}`,
      text: scenario.hookLesson,
    });
    findings.push({
      id: "risk-share",
      title: "Доля денег ≠ доля риска",
      text:
        maxShare >= 0.99
          ? `${name} — это все твои деньги и весь риск портфеля: одна плохая новость бьёт по всему счёту.`
          : `${name} — это ${pct(maxShare)} твоих денег, но ${pct(riskShares[maxIndex])} всего риска портфеля.`,
    });
    findings.push({
      id: "bad-year",
      title: "Плохой, но обычный год",
      text: `В одном из 20 будущих: на ${drop.week}-й неделе ${name} теряет ${pct(drop.drop)} за неделю. К концу года от 1 000 000 ₸ остаётся ${money(userOutcome.finals[badPath])}. С разложенным портфелем в том же будущем — ${money(alternativeOutcome.finals[badPath])}.`,
    });
    findings.push({
      id: "counterfactual",
      title: "Те же будущие, другое решение",
      text: `Ты теряешь больше половины в ${Math.round(user.pLossHalf * sim.paths)} из ${sim.paths} будущих. Разложенный портфель — в ${Math.round(alternative.pLossHalf * sim.paths)}. Рынок одинаковый, отличается только решение.`,
    });
  }

  return {
    verdict,
    maxShare,
    maxShareName: maxIndex >= 0 ? scenario.assets[maxIndex].name : "—",
    hhi: herfindahl(weights),
    effectivePositions: effectivePositions(weights),
    riskShares,
    user,
    alternative,
    userOutcome,
    alternativeOutcome,
    avoidableFutures,
    badPath,
    findings,
  };
}
