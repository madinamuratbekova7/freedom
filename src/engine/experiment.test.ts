import { describe, expect, it } from "vitest";
import { compareProportions, normalCdf, runExperiment, sampleSize } from "./experiment";

describe("Симулятор эксперимента", () => {
  it("статистика: нормальное распределение, интервал, размер выборки", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    const estimate = compareProportions(400, 1000, 460, 1000);
    expect(estimate.diff).toBeCloseTo(0.06, 6);
    expect(estimate.pValue).toBeLessThan(0.01);
    expect(estimate.ciLow).toBeGreaterThan(0);
    // 40% → 46%, α = 0,05, мощность 80% — около 1070 на группу, как в плане.
    expect(sampleSize(0.4, 0.06)).toBeGreaterThan(1040);
    expect(sampleSize(0.4, 0.06)).toBeLessThan(1090);
  });

  it("случайное деление находит настоящий эффект, два других способа завышают", () => {
    const result = runExperiment({ perGroup: 40000, effect: 0.1, scare: 0.01, marketShift: 0.06, seed: 1 });
    console.log(result);
    expect(Math.abs(result.randomized.diff - result.trueEffect)).toBeLessThan(0.012);
    expect(result.beforeAfter.diff - result.trueEffect).toBeGreaterThan(0.04);
    expect(result.completers.diff - result.trueEffect).toBeGreaterThan(0.04);
    expect(result.quizRate).toBeGreaterThan(result.ambushPassRate);
  });

  it("без эффекта обучения A/B показывает ноль, а «до и после» — мнимый рост", () => {
    const result = runExperiment({ perGroup: 40000, effect: 0, scare: 0, marketShift: 0.08, seed: 2 });
    expect(Math.abs(result.randomized.diff)).toBeLessThan(0.012);
    expect(result.beforeAfter.diff).toBeGreaterThan(0.06);
    expect(result.completers.diff).toBeGreaterThan(0.03);
    expect(result.guardrail.verdict).toBe("ok");
  });

  it("стоп-правило срабатывает при сильном запугивании", () => {
    const result = runExperiment({ perGroup: 5000, effect: 0.1, scare: 0.08, marketShift: 0, seed: 3 });
    expect(result.guardrail.verdict).toBe("stop");
  });
});
