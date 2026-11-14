import { LESSON_FEATURES, type Scenario, scenarioDistance, type ScenarioFeatures } from "../engine/ambush";
import { bktUpdate, P_INIT } from "../engine/bkt";
import type { BlackBoxReport } from "../engine/blackbox";
import { biasFor, type DialogReply, type DialogState, nextTarget } from "../engine/dialog";
import type { Simulation } from "../engine/montecarlo";
import { type AnswerAnalysis, CONCEPT_ORDER, CONCEPTS } from "../engine/nlp";
import { effectivePositions, herfindahl, maxIssuerShare, riskContributions } from "../engine/risk";
import { type MasteryEvent, pct, type Stage } from "../state";

const FEATURE_NAMES: Record<keyof ScenarioFeatures, string> = {
  sector: "Отрасль",
  narrator: "Рассказчик",
  channel: "Канал",
  hook: "Крючок",
};

const VALUE_NAMES: Record<string, string> = {
  ai: "ИИ-чипы", ev: "электромобили", pharma: "биотех", energy: "энергетика", games: "игры", retail: "ритейл",
  novice: "новичок", friend: "друг", blogger: "блогер", colleague: "коллега", relative: "родственник", channel: "канал",
  lesson: "урок", chat: "чат", voice: "голосовое", post: "пост", forward: "пересылка",
  growth: "уже выросла", insider: "инсайд", crowd: "все купили", dip: "упала", ipo: "новая на бирже",
};

const STANCE_NAMES = { agree: "согласен вложить всё", oppose: "против", neutral: "не определена" };
const QUALITY_NAMES = { ok: "по делу", short: "слишком коротко", offtopic: "не по теме" };

interface HoodProps {
  stage: Stage;
  analysis: AnswerAnalysis | null;
  lastReply: DialogReply | null;
  dialog: DialogState;
  mastery: MasteryEvent[];
  scenario: Scenario;
  history: ScenarioFeatures[];
  weights: number[];
  sim: Simulation | null;
  report: BlackBoxReport | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="hood-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function Hood(props: HoodProps) {
  const { stage, analysis, lastReply, dialog, mastery, scenario, history, weights, sim, report } = props;
  const lessonStage = stage === "debate" || stage === "feedback";
  const current = mastery[mastery.length - 1].value;

  return (
    <aside className="hood">
      <h2>Под капотом</h2>
      <p className="hood-sub">Что алгоритмы считают прямо сейчас. Клиент этого не видит.</p>

      {stage === "intro" && (
        <section>
          <h3>8 алгоритмов, всё в браузере</h3>
          <ol className="hood-list">
            <li>Монте-Карло: коррелированное броуновское движение + скачки Мертона</li>
            <li>Общие случайные числа для честного сравнения решений</li>
            <li>Метрики риска: HHI, вклад в риск, VaR / CVaR</li>
            <li>Байесовская оценка навыка (BKT)</li>
            <li>Разбор свободного текста с допуском опечаток</li>
            <li>Диалоговая политика Айгерим</li>
            <li>Генератор засад: самая непохожая ситуация</li>
            <li>Адаптивный интервал до следующей проверки</li>
          </ol>
        </section>
      )}

      {lessonStage && (
        <>
          <section>
            <h3>Разбор последнего ответа</h3>
            {analysis ? (
              <>
                <Row label="Слов" value={String(analysis.tokens.length)} />
                <Row label="Качество" value={QUALITY_NAMES[analysis.quality]} />
                <Row label="Позиция" value={STANCE_NAMES[analysis.stance]} />
                <Row label="Баллы за / против" value={`${analysis.agreeScore} / ${analysis.opposeScore}`} />
                <div className="chips">
                  {CONCEPT_ORDER.map((id) => (
                    <span key={id} className={analysis.concepts.includes(id) ? "chip on" : "chip"}>
                      {CONCEPTS[id].title}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="hood-empty">Ждём первый ответ клиента.</p>
            )}
          </section>
          <section>
            <h3>Политика Айгерим</h3>
            <Row label="Идей названо" value={`${dialog.covered.length} из 5 (нужно 3)`} />
            <Row label="Ходов" value={`${dialog.turns} из 4`} />
            <Row label="Переспросила" value={`${dialog.clarifications} раз`} />
            {dialog.outcome === "ongoing" && nextTarget(dialog.covered) && (
              <p className="hood-note">
                Следующее возражение бьёт в непокрытую идею:{" "}
                <b>{biasFor(lastReply?.target ?? nextTarget(dialog.covered)!)}</b>
              </p>
            )}
          </section>
        </>
      )}

      {stage === "ambush" && (
        <>
          <section>
            <h3>Генератор засад</h3>
            <table className="hood-table">
              <thead>
                <tr>
                  <th />
                  <th>Урок</th>
                  <th>Засада</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(FEATURE_NAMES) as (keyof ScenarioFeatures)[]).map((key) => (
                  <tr key={key}>
                    <td>{FEATURE_NAMES[key]}</td>
                    <td>{VALUE_NAMES[LESSON_FEATURES[key]]}</td>
                    <td>
                      <b>{VALUE_NAMES[scenario.features[key]]}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Row label="Пройдено ситуаций" value={String(history.length)} />
            <Row
              label="Расстояние до ближайшей"
              value={Math.min(...history.map((past) => scenarioDistance(scenario.features, past))).toFixed(2)}
            />
            <p className="hood-note">Суть та же — «вложи всё в одну компанию». Поверхность другая: это и есть перенос.</p>
          </section>
          <section>
            <h3>Риск выбора (считается на лету)</h3>
            <Row label="Макс. доля одной компании" value={pct(maxIssuerShare(scenario.assets, weights).share)} />
            <Row label="Индекс Херфиндаля" value={herfindahl(weights).toFixed(2)} />
            <Row label="Эффективных позиций" value={effectivePositions(weights).toFixed(1)} />
            <div className="bars">
              {riskContributions(scenario.assets, weights).map((share, i) => (
                <div key={scenario.assets[i].id} className="bar-row">
                  <span>{scenario.assets[i].name}</span>
                  <div className="bar">
                    <i style={{ width: `${Math.max(0, share) * 100}%` }} />
                  </div>
                  <b>{pct(share)}</b>
                </div>
              ))}
            </div>
            <p className="hood-note">Полоски — вклад бумаги в риск портфеля, а не доля денег.</p>
          </section>
        </>
      )}

      {(stage === "rewind" || stage === "result") && sim && report && (
        <>
          <section>
            <h3>Монте-Карло</h3>
            <Row label="Будущих × дней × бумаг" value={`${sim.paths} × 250 × ${sim.assets.length}`} />
            <Row label="Время расчёта" value={`${sim.elapsedMs.toFixed(0)} мс`} />
            <Row label="Seed (воспроизводимо)" value={String(scenario.seed)} />
          </section>
          <section>
            <h3>Решение клиента / разложенный</h3>
            <Row label="Потеря > 50%" value={`${pct(report.user.pLossHalf, 1)} / ${pct(report.alternative.pLossHalf, 1)}`} />
            <Row label="VaR 95%" value={`${pct(report.user.var95)} / ${pct(report.alternative.var95)}`} />
            <Row label="CVaR 95%" value={`${pct(report.user.cvar95)} / ${pct(report.alternative.cvar95)}`} />
            <Row
              label="Медианная просадка"
              value={`${pct(report.user.medianMaxDrawdown)} / ${pct(report.alternative.medianMaxDrawdown)}`}
            />
            <Row label="Средний итог" value={`${report.user.mean.toFixed(2)}× / ${report.alternative.mean.toFixed(2)}×`} />
            <Row label="Потерь можно было избежать" value={`в ${report.avoidableFutures} будущих`} />
            <p className="hood-note">Оба портфеля оценены на одних и тех же траекториях рынка.</p>
          </section>
        </>
      )}

      <section>
        <h3>Оценка навыка (BKT)</h3>
        {mastery.map((event, i) => (
          <Row key={i} label={event.label} value={pct(event.value)} />
        ))}
        {current !== P_INIT && (
          <p className="hood-note">
            Для сравнения: верный ответ в тесте с вариантами поднял бы оценку только до{" "}
            {pct(bktUpdate(P_INIT, true, "quiz"))} — его легко угадать.
          </p>
        )}
      </section>
    </aside>
  );
}
