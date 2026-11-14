import { useMemo, useState } from "react";
import { type Estimate, GUARDRAIL_LIMIT, runExperiment, sampleSize } from "../engine/experiment";

const pp = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(1)} п.п.`;
const share = (value: number) => `${(value * 100).toFixed(1)}%`;

const DOMAIN = { min: -0.1, max: 0.3 };
const scale = (value: number) =>
  ((Math.min(DOMAIN.max, Math.max(DOMAIN.min, value)) - DOMAIN.min) / (DOMAIN.max - DOMAIN.min)) * 100;

interface MethodRowProps {
  title: string;
  how: string;
  estimate: Estimate;
  trueEffect: number;
  /** Чем объясняется расхождение с настоящим эффектом. */
  confound: string | null;
}

function MethodRow({ title, how, estimate, trueEffect, confound }: MethodRowProps) {
  const covers = estimate.ciLow <= trueEffect && trueEffect <= estimate.ciHigh;
  const bias = estimate.diff - trueEffect;
  return (
    <div className={`method ${covers ? "honest" : "biased"}`}>
      <div className="method-head">
        <div>
          <b>{title}</b>
          <span>{how}</span>
        </div>
        <strong>{pp(estimate.diff)}</strong>
      </div>
      <div className="forest" role="img" aria-label={`Оценка ${pp(estimate.diff)}, интервал от ${pp(estimate.ciLow)} до ${pp(estimate.ciHigh)}`}>
        <i className="zero" style={{ left: `${scale(0)}%` }} />
        <i className="truth" style={{ left: `${scale(trueEffect)}%` }} />
        <i
          className="whisker"
          style={{ left: `${scale(estimate.ciLow)}%`, width: `${scale(estimate.ciHigh) - scale(estimate.ciLow)}%` }}
        />
        <i className="point" style={{ left: `${scale(estimate.diff)}%` }} />
      </div>
      <p className="method-verdict">
        {covers
          ? "Настоящий эффект попадает в доверительный интервал."
          : `${bias > 0 ? "Завышает" : "Занижает"} на ${Math.abs(bias * 100).toFixed(1)} п.п. ${confound ?? ""}`}
      </p>
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <label className="exp-slider">
      <div>
        <span>{label}</span>
        <b>{format(value)}</b>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

const VERDICTS = {
  ok: { label: "Продолжаем", text: "Обучение не отпугивает от первой сделки." },
  watch: { label: "Наблюдаем", text: "Разница близка к порогу или интервал слишком широкий — нужно больше данных." },
  stop: { label: "Стоп", text: "Клиенты боятся начинать. Останавливаем и смягчаем подачу риска." },
};

export function Experiment() {
  const [perGroup, setPerGroup] = useState(1100);
  const [effect, setEffect] = useState(10);
  const [marketShift, setMarketShift] = useState(6);
  const [scare, setScare] = useState(1);
  const [seed, setSeed] = useState(11);

  const result = useMemo(
    () => runExperiment({ perGroup, effect: effect / 100, scare: scare / 100, marketShift: marketShift / 100, seed }),
    [perGroup, effect, marketShift, scare, seed],
  );

  const needed = result.trueEffect > 0.004 ? sampleSize(result.randomized.base, result.trueEffect) : null;
  const significant = result.randomized.pValue < 0.05;
  const verdict = VERDICTS[result.guardrail.verdict];

  return (
    <div className="exp">
      <section className="exp-panel">
        <h2>Модель</h2>
        <p className="exp-sub">
          Вымышленные новички с разным опытом и мотивацией. Мы сами задаём настоящий эффект — и смотрим, какой
          способ измерения его находит.
        </p>
        <Slider label="Клиентов в группе" value={perGroup} min={200} max={6000} step={100} format={(v) => String(v)} onChange={setPerGroup} />
        <Slider label="Эффект «Засады» для прошедших" value={effect} min={0} max={20} step={1} format={(v) => `${v} п.п.`} onChange={setEffect} />
        <Slider
          label="Рынок: до запуска было ралли"
          value={marketShift}
          min={-10}
          max={10}
          step={1}
          format={(v) => `${v > 0 ? "+" : ""}${v} п.п.`}
          onChange={setMarketShift}
        />
        <Slider label="Побочный эффект: страх сделки" value={scare} min={0} max={8} step={1} format={(v) => `${v} п.п.`} onChange={setScare} />
        <button className="ghost wide" onClick={() => setSeed((value) => value + 1)}>
          Набрать новую выборку
        </button>

        <div className="exp-facts">
          <div>
            <span>Дошли до конца урока</span>
            <b>{share(result.completionRate)}</b>
          </div>
          <div>
            <span>Верно в тесте с вариантами</span>
            <b>{share(result.quizRate)}</b>
          </div>
          <div>
            <span>Прошли засаду</span>
            <b>{share(result.ambushPassRate)}</b>
          </div>
          <div>
            <span>Разрыв «тест → перенос»</span>
            <b>{pp(result.quizRate - result.ambushPassRate).replace("+", "")}</b>
          </div>
        </div>
      </section>

      <section className="exp-panel">
        <h2>Один эффект — три способа измерить</h2>
        <p className="exp-sub">
          Основная метрика: доля новичков без опасной концентрации на 30-й день. Настоящий эффект на всех начавших
          урок — <b className="truth-text">{pp(result.trueEffect)}</b> (зелёная линия).
        </p>

        <MethodRow
          title="«До и после»"
          how="Клиенты до запуска против клиентов после"
          estimate={result.beforeAfter}
          trueEffect={result.trueEffect}
          confound="Разница — это рынок: в периоды были разные настроения."
        />
        <MethodRow
          title="«Прошли и не прошли»"
          how="Закончившие урок против бросивших"
          estimate={result.completers}
          trueEffect={result.trueEffect}
          confound="Разница — это мотивация: до конца доходят те, кто и так осторожнее."
        />
        <MethodRow
          title="Случайное деление (A/B)"
          how="Один период, группа по жребию, считаем всех начавших"
          estimate={result.randomized}
          trueEffect={result.trueEffect}
          confound="Случайное отклонение выборки — наберите новую."
        />

        <div className="exp-cards">
          <div className={`exp-card ${significant ? "ok" : "warn"}`}>
            <span>Итог A/B-теста</span>
            <b>
              {share(result.randomized.base)} → {share(result.randomized.treated)}
            </b>
            <p>
              {significant
                ? `Эффект статистически значим (p = ${result.randomized.pValue < 0.001 ? "< 0,001" : result.randomized.pValue.toFixed(3).replace(".", ",")}).`
                : `Эффект не доказан (p = ${result.randomized.pValue.toFixed(2).replace(".", ",")}): выборки не хватает.`}{" "}
              {needed !== null && `Нужно около ${needed.toLocaleString("ru-RU")} клиентов на группу.`}
            </p>
          </div>
          <div className={`exp-card ${result.guardrail.verdict === "ok" ? "ok" : result.guardrail.verdict === "stop" ? "danger" : "warn"}`}>
            <span>Заградительная: не сделали первую сделку</span>
            <b>
              {share(result.guardrail.base)} → {share(result.guardrail.treated)} · {verdict.label}
            </b>
            <p>
              {verdict.text} Стоп-правило: хуже контроля больше чем на {GUARDRAIL_LIMIT * 100} п.п.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
