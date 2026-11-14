import { describe, expect, it } from "vitest";
import { generateAmbush, LESSON_FEATURES, scenarioDistance } from "./ambush";
import { bktUpdate, nextAmbushInDays, P_INIT } from "./bkt";
import { ALTERNATIVE_WEIGHTS, analyzeDecision } from "./blackbox";
import { initialDialog, respond } from "./dialog";
import { cholesky } from "./market";
import { evaluatePortfolio, simulateMarket } from "./montecarlo";
import { analyzeAnswer, withinOneEdit } from "./nlp";
import { riskContributions, summarize } from "./risk";

const scenario = generateAmbush([LESSON_FEATURES], "demo");
const sim = simulateMarket(scenario.assets, { paths: 2000, days: 250, snapshotEvery: 5, seed: 42 });

describe("Монте-Карло", () => {
  it("Холецкий восстанавливает матрицу", () => {
    const m = [
      [1, 0.6, 0.3],
      [0.6, 1, 0.3],
      [0.3, 0.3, 1],
    ];
    const l = cholesky(m);
    const back = m.map((_, i) => m.map((_, j) => l[i].reduce((s, v, k) => s + v * l[j][k], 0)));
    back.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(m[i][j], 10)));
  });

  it("всё в одну акцию намного опаснее разложенного портфеля", () => {
    const allIn = summarize(evaluatePortfolio(sim, [1, 0, 0, 0, 0]));
    const spread = summarize(evaluatePortfolio(sim, ALTERNATIVE_WEIGHTS));
    console.log("all-in", allIn, "\nspread", spread, "\nms", sim.elapsedMs);
    expect(allIn.pLossHalf).toBeGreaterThan(0.1);
    expect(spread.pLossHalf).toBeLessThan(0.01);
    expect(allIn.mean).toBeGreaterThan(1.05);
  });

  it("депозит детерминирован, одинаковый seed даёт одинаковый рынок", () => {
    const deposit = evaluatePortfolio(sim, [0, 0, 0, 0, 1]);
    expect(deposit.finals[0]).toBeCloseTo(deposit.finals[999], 6);
    const again = simulateMarket(scenario.assets, { paths: 50, days: 250, snapshotEvery: 5, seed: 42 });
    expect(again.prices[1234]).toBe(sim.prices[1234]);
  });

  it("вклады в риск дают в сумме 1", () => {
    const rc = riskContributions(scenario.assets, [0.5, 0.1, 0.1, 0.2, 0.1]);
    expect(rc.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 8);
    expect(rc[0]).toBeGreaterThan(0.5);
  });

  it("чёрный ящик: провал и успех", () => {
    const fail = analyzeDecision(scenario, sim, [1, 0, 0, 0, 0]);
    expect(fail.verdict).toBe("fail");
    expect(fail.findings.length).toBe(5);
    console.log(fail.findings.map((f) => `${f.title}: ${f.text}`).join("\n"));
    expect(analyzeDecision(scenario, sim, [0.2, 0.1, 0.1, 0.4, 0.2]).verdict).toBe("strong");
    expect(analyzeDecision(scenario, sim, [0.4, 0, 0, 0.4, 0.2]).verdict).toBe("pass");
  });
});

describe("Разбор текста", () => {
  it("опечатки", () => {
    expect(withinOneEdit("банкрот", "бакнрот")).toBe(true);
    expect(withinOneEdit("фонд", "фонды")).toBe(true);
    expect(withinOneEdit("фонд", "завод")).toBe(false);
  });

  it("находит идеи и позицию", () => {
    const a = analyzeAnswer("Не вкладывай всё в одну компанию, она может обанкротиться. Прошлый рост ничего не гарантирует");
    expect(a.stance).toBe("oppose");
    expect(a.concepts).toEqual(["single", "past"]);

    const b = analyzeAnswer("Вложи часть, а не всё, остальное в фонд и оставь подушку");
    expect(b.stance).toBe("oppose");
    expect(b.concepts).toEqual(["share", "diversify", "cushion"]);

    const c = analyzeAnswer("Да, вкладывай всё, отличная идея!");
    expect(c.stance).toBe("agree");
    expect(c.concepts).toEqual([]);

    expect(analyzeAnswer("диверсефицируй").concepts).toEqual(["diversify"]);
    expect(analyzeAnswer("ну").quality).toBe("short");
    expect(analyzeAnswer("какая сегодня погода в городе").quality).toBe("offtopic");
    expect(analyzeAnswer("рискни, один раз живём").stance).toBe("agree");
  });

  it("диалог: непонимание → возражение → убеждена", () => {
    let reply = respond(initialDialog(), analyzeAnswer("эээ"));
    expect(reply.kind).toBe("clarify");
    reply = respond(reply.state, analyzeAnswer("Не стоит, компания может рухнуть"));
    expect(reply.kind).toBe("objection");
    expect(reply.target).toBe("past");
    reply = respond(reply.state, analyzeAnswer("Прошлый рост не гарантия, купи на часть денег"));
    expect(reply.kind).toBe("convinced");
    expect(respond(initialDialog(), analyzeAnswer("Конечно, вкладывай всё")).kind).toBe("agreed");
  });
});

describe("Навык и засады", () => {
  it("BKT: засада — более сильное свидетельство, чем тест", () => {
    expect(bktUpdate(P_INIT, true, "transfer")).toBeGreaterThan(bktUpdate(P_INIT, true, "quiz"));
    expect(bktUpdate(0.6, false, "transfer")).toBeLessThan(0.6);
    expect(nextAmbushInDays(0.9, true)).toBeGreaterThan(nextAmbushInDays(0.4, true));
    expect(nextAmbushInDays(0.9, false)).toBe(3);
  });

  it("засада максимально далека от урока и от предыдущих", () => {
    expect(scenario.novelty).toBe(1);
    expect(scenarioDistance(scenario.features, LESSON_FEATURES)).toBe(1);
    const second = generateAmbush([LESSON_FEATURES, scenario.features], "demo");
    expect(scenarioDistance(second.features, scenario.features)).toBe(1);
    console.log(scenario.senderName, scenario.channelLabel, scenario.messages, "\n", second.senderName, second.messages);
  });
});
