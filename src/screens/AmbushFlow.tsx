import { lazy, Suspense, useState } from "react";
import type { Scenario } from "../engine/ambush";
import { type BlackBoxReport, STAKE } from "../engine/blackbox";
import { money, pct } from "../state";
import { DotGrid, FanChart, MasteryBar } from "../ui/charts";
import { Confetti, daysWord, useCountUp } from "../ui/motion";

/** 3D-сцена тяжёлая, поэтому подгружается только на экране перемотки. */
const Landscape3D = lazy(() => import("../ui/Landscape3D"));

interface AmbushProps {
  scenario: Scenario;
  weights: number[];
  daysLater: number;
  marked: boolean;
  onChange: (weights: number[]) => void;
  onConfirm: () => void;
}

export function Ambush({ scenario, weights, daysLater, marked, onChange, onConfirm }: AmbushProps) {
  const invested = weights.reduce((sum, w) => sum + w, 0);
  const free = Math.max(0, 1 - invested);

  const setWeight = (index: number, value: number) => {
    const others = invested - weights[index];
    const capped = Math.min(value, Math.round((1 - others) * 100) / 100);
    onChange(weights.map((w, i) => (i === index ? capped : w)));
  };

  return (
    <div className="screen feed">
      <div className="time-chip">
        {daysLater} {daysWord(daysLater)} спустя · вторник, 09:41
      </div>
      {marked && <div className="marked-chip">Учебная ситуация · пометка включена по твоему выбору</div>}

      <div className="feed-card account">
        <span>Свободно на счёте</span>
        <b>{STAKE.toLocaleString("ru-RU")} ₸</b>
      </div>

      <div className="feed-card message">
        <div className="chat-head">
          <div className="avatar alt">{scenario.senderInitial}</div>
          <div>
            <b>{scenario.senderName}</b>
            <span>{scenario.channelLabel}</span>
          </div>
        </div>
        {scenario.messages.map((text, i) => (
          <div key={i} className="bubble aigerim" style={{ animationDelay: `${250 + i * 320}ms` }}>
            {text}
          </div>
        ))}
      </div>

      <h2>Что сделаешь с деньгами?</h2>
      <div className="alloc">
        {scenario.assets.map((asset, i) => (
          <label key={asset.id} className="alloc-row">
            <div className="alloc-head">
              <span>
                <b>{asset.name}</b> <em>{asset.note}</em>
              </span>
              <span className="alloc-value">
                {pct(weights[i])} · {money(weights[i])}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(weights[i] * 100)}
              onChange={(event) => setWeight(i, Number(event.target.value) / 100)}
            />
          </label>
        ))}
        <div className="alloc-free">
          <span>Не вложено</span>
          <b>
            {pct(free)} · {money(free)}
          </b>
        </div>
      </div>

      <button className="primary" onClick={onConfirm}>
        Подтвердить решение
      </button>
    </div>
  );
}

interface RewindProps {
  scenario: Scenario;
  report: BlackBoxReport;
  paths: number;
  marked: boolean;
  onNext: () => void;
}

export function Rewind({ scenario, report, paths, marked, onNext }: RewindProps) {
  const [view, setView] = useState<"mine" | "spread">("mine");
  const [seenSpread, setSeenSpread] = useState(false);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const mine = view === "mine";
  const outcome = mine ? report.userOutcome : report.alternativeOutcome;
  const summary = mine ? report.user : report.alternative;
  const lostHalf = Math.round(summary.pLossHalf * paths);
  const shownLost = useCountUp(lostHalf, 1500);

  return (
    <div className="screen">
      <div className="reveal">
        {marked ? "Учебная ситуация завершена." : "Это была учебная засада."} Деньги учебные, решение — твоё.
      </div>
      <p className="eyebrow">Перемотка на год · {paths} вариантов будущего</p>
      <h1>
        {lostHalf === 0
          ? "Ни в одном будущем не потеряно больше половины"
          : `В ${shownLost} из ${paths} осталось меньше половины`}
      </h1>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mine} className={mine ? "on" : ""} onClick={() => setView("mine")}>
          Твоё решение
        </button>
        <button
          role="tab"
          aria-selected={!mine}
          className={mine ? "" : "on"}
          onClick={() => {
            setView("spread");
            setSeenSpread(true);
          }}
        >
          Тот же миллион, разложенный
        </button>
      </div>

      <div className="viz">
        {mode === "3d" ? (
          <Suspense fallback={<div className="landscape wait">Строим ландшафт будущих…</div>}>
            <Landscape3D outcome={outcome} onUnavailable={() => setMode("2d")} />
          </Suspense>
        ) : (
          <FanChart key={view} outcome={outcome} animate={mine ? true : !seenSpread} />
        )}
        <button className="viz-toggle" onClick={() => setMode(mode === "3d" ? "2d" : "3d")}>
          {mode === "3d" ? "Линии" : "3D"}
        </button>
      </div>
      {mode === "3d" && (
        <p className="viz-hint">Потяни, чтобы повернуть. Ближе — худшие будущие, дальше — лучшие.</p>
      )}

      <DotGrid key={view} outcome={outcome} />

      <div className="stats">
        <div>
          <span>Обычный итог</span>
          <b>{money(summary.median)}</b>
        </div>
        <div>
          <span>Плохой год (1 из 20)</span>
          <b>{money(summary.p5)}</b>
        </div>
        <div>
          <span>Хороший год (1 из 20)</span>
          <b>{money(summary.p95)}</b>
        </div>
      </div>

      <p className="hint">
        {mine
          ? `Самая большая доля одной компании: ${report.maxShareName} — ${pct(report.maxShare)}.`
          : `Здесь ${scenario.company} тоже есть — но на 15%. Рынок в обоих вариантах один и тот же.`}
      </p>

      <button className="primary" onClick={onNext}>
        {report.verdict === "fail" ? "Открыть чёрный ящик" : "Дальше"}
      </button>
    </div>
  );
}

interface ResultProps {
  scenario: Scenario;
  report: BlackBoxReport;
  masteryBefore: number;
  masteryAfter: number;
  nextInDays: number;
  nothingInvested: boolean;
  onNextAmbush: () => void;
  onRestart: () => void;
}

export function Result(props: ResultProps) {
  const { scenario, report, masteryBefore, masteryAfter, nextInDays, nothingInvested } = props;
  const failed = report.verdict === "fail";

  return (
    <div className="screen">
      {failed ? (
        <>
          <p className="eyebrow bad">Чёрный ящик · разбор решения</p>
          <h1>Засада сработала</h1>
          <p className="lead">
            Это ошибка, а не провал: она случилась на учебных деньгах. Вот что произошло.
          </p>
          <ol className="findings">
            {report.findings.map((finding) => (
              <li key={finding.id}>
                <b>{finding.title}</b>
                <p>{finding.text}</p>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <div className="badge-wrap">
            <Confetti />
            <div className="badge">🛡</div>
          </div>
          <h1 className="center">Засада пройдена</h1>
          <p className="lead center">
            Никто не подсказывал — а в одной компании оказалось не больше {pct(Math.max(report.maxShare, 0))} денег.
          </p>
          <div className="card ok">
            <b>Награда: значок «Засада пройдена» и 500 учебных баллов</b>
            <p>Выдана за решение. Реальная сделка не нужна.</p>
          </div>
          {report.verdict === "pass" && (
            <div className="card warn">
              <b>На заметку</b>
              <p>
                {report.maxShareName} — {pct(report.maxShare)} денег, но{" "}
                {pct(report.riskShares[scenario.assets.findIndex((a) => a.name === report.maxShareName)])} риска
                портфеля. Доля денег и доля риска — не одно и то же.
              </p>
            </div>
          )}
          {nothingInvested && (
            <div className="card warn">
              <b>На заметку</b>
              <p>
                Не вкладывать в акции — нормальное решение, если деньги нужны скоро. Цель урока — не бояться
                инвестиций, а не ставить всё на одну компанию.
              </p>
            </div>
          )}
          <div className="card">
            <b>Крючок был: {scenario.hookLabel}</b>
            <p>{scenario.hookLesson}</p>
          </div>
        </>
      )}

      <MasteryBar before={masteryBefore} after={masteryAfter} />

      <div className="card">
        <b>
          Следующая засада — через {nextInDays} {daysWord(nextInDays)}
        </b>
        <p>
          {failed
            ? "Скоро и в другом обличье: другая отрасль, другой рассказчик, тот же принцип."
            : "Чем увереннее навык, тем реже проверка. Отрасль и рассказчик снова будут другими."}
        </p>
      </div>

      <div className="actions">
        <button className="ghost" onClick={props.onRestart}>
          Начать заново
        </button>
        <button className="primary" onClick={props.onNextAmbush}>
          ⏩ К следующей засаде
        </button>
      </div>
    </div>
  );
}
