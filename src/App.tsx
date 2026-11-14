import { useMemo, useState } from "react";
import { buildAssets, generateAmbush, LESSON_FEATURES, type Scenario, type ScenarioFeatures } from "./engine/ambush";
import { bktUpdate, nextAmbushInDays, P_INIT } from "./engine/bkt";
import { analyzeDecision, type BlackBoxReport } from "./engine/blackbox";
import { AIGERIM_OPENING, type DialogReply, type DialogState, initialDialog, respond } from "./engine/dialog";
import { evaluatePortfolio, simulateMarket, type Simulation } from "./engine/montecarlo";
import { analyzeAnswer, type AnswerAnalysis, CONCEPT_ORDER, type ConceptId } from "./engine/nlp";
import { summarize } from "./engine/risk";
import { AmbushFlowScreens } from "./screens";
import { Experiment } from "./screens/Experiment";
import { type ChatMessage, type MasteryEvent, SIM_OPTIONS, type Stage, STAGES } from "./state";
import { Hood } from "./ui/Hood";

const SEED_TEXT = "demo";
const openingChat = (): ChatMessage[] => AIGERIM_OPENING.map((text) => ({ from: "aigerim", text }));
const emptyWeights = (scenario: Scenario) => scenario.assets.map(() => 0);

export function App() {
  const [view, setView] = useState<"prototype" | "experiment">("prototype");
  const [stage, setStage] = useState<Stage>("intro");
  const [mastery, setMastery] = useState<MasteryEvent[]>([{ label: "До урока", value: P_INIT }]);
  const [dialog, setDialog] = useState<DialogState>(initialDialog);
  const [chat, setChat] = useState<ChatMessage[]>(openingChat);
  const [analysis, setAnalysis] = useState<AnswerAnalysis | null>(null);
  const [lastReply, setLastReply] = useState<DialogReply | null>(null);
  const [debateBefore, setDebateBefore] = useState(P_INIT);
  const [history, setHistory] = useState<ScenarioFeatures[]>([LESSON_FEATURES]);
  const [scenario, setScenario] = useState<Scenario>(() => generateAmbush([LESSON_FEATURES], SEED_TEXT));
  const [weights, setWeights] = useState<number[]>(() => emptyWeights(scenario));
  const [sim, setSim] = useState<Simulation | null>(null);
  const [report, setReport] = useState<BlackBoxReport | null>(null);
  const [ambushBefore, setAmbushBefore] = useState(P_INIT);
  const [ambushCount, setAmbushCount] = useState(1);
  /** false — клиент отказался от неожиданной проверки: засада придёт с пометкой «учебная». */
  const [surprise, setSurprise] = useState(true);

  const current = mastery[mastery.length - 1].value;

  /** Что стало бы с Айгерим, вложи она всё в NeuroCore, — тот же движок, рынок урока. */
  const aigerimLossHalf = useMemo(() => {
    if (dialog.outcome !== "agreed") return null;
    const lessonSim = simulateMarket(buildAssets("ai"), { ...SIM_OPTIONS, seed: 7 });
    return summarize(evaluatePortfolio(lessonSim, [1, 0, 0, 0, 0])).pLossHalf;
  }, [dialog.outcome]);

  /** Идеи, которые клиент не назвал в споре, — в них и целится засада. */
  const weakConcepts = (state: DialogState): ConceptId[] =>
    state.outcome === "ongoing" ? [] : CONCEPT_ORDER.filter((id) => !state.covered.includes(id));

  const pushMastery = (label: string, value: number) => setMastery((events) => [...events, { label, value }]);

  const sendAnswer = (text: string) => {
    const result = analyzeAnswer(text);
    const reply = respond(dialog, result);
    setAnalysis(result);
    setLastReply(reply);
    setDialog(reply.state);
    setChat((messages) => [...messages, { from: "me", text }, { from: "aigerim", text: reply.text }]);
    if (reply.state.outcome !== "ongoing") {
      // Первая засада ещё не сыграна — перенацеливаем её на пробелы этого спора.
      if (ambushCount === 1 && report === null) {
        const targeted = generateAmbush([LESSON_FEATURES], SEED_TEXT, weakConcepts(reply.state));
        setScenario(targeted);
        setWeights(emptyWeights(targeted));
      }
      const convinced = reply.state.outcome === "convinced";
      setDebateBefore(current);
      pushMastery(convinced ? "Спор: Айгерим убеждена" : "Спор: Айгерим не убеждена", bktUpdate(current, convinced, "free"));
    }
  };

  const retryDebate = () => {
    setDialog(initialDialog());
    setChat(openingChat());
    setAnalysis(null);
    setLastReply(null);
  };

  const confirmAllocation = () => {
    const market = simulateMarket(scenario.assets, { ...SIM_OPTIONS, seed: scenario.seed });
    const result = analyzeDecision(scenario, market, weights);
    const passed = result.verdict !== "fail";
    setSim(market);
    setReport(result);
    setAmbushBefore(current);
    // С пометкой «учебная» догадаться проще, поэтому это более слабое свидетельство навыка.
    pushMastery(
      `Засада ${ambushCount}${surprise ? "" : " (с пометкой)"}: ${passed ? "пройдена" : "провал"}`,
      bktUpdate(current, passed, surprise ? "transfer" : "free"),
    );
    setStage("rewind");
  };

  const nextAmbush = () => {
    const seen = [...history, scenario.features];
    const next = generateAmbush(seen, SEED_TEXT, weakConcepts(dialog));
    setHistory(seen);
    setScenario(next);
    setWeights(emptyWeights(next));
    setSim(null);
    setReport(null);
    setAmbushCount((count) => count + 1);
    setStage("ambush");
  };

  const restart = () => {
    const first = generateAmbush([LESSON_FEATURES], SEED_TEXT);
    setStage("intro");
    setMastery([{ label: "До урока", value: P_INIT }]);
    retryDebate();
    setHistory([LESSON_FEATURES]);
    setScenario(first);
    setWeights(emptyWeights(first));
    setSim(null);
    setReport(null);
    setAmbushCount(1);
    setSurprise(true);
  };

  const reachable = (id: Stage): boolean => {
    if (id === "intro" || id === "debate" || id === "ambush") return true;
    if (id === "feedback") return dialog.outcome !== "ongoing";
    return report !== null;
  };

  const passed = report ? report.verdict !== "fail" : false;
  const lastInterval = nextAmbushInDays(current, passed);

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <span className="logo">З</span>
          <div>
            <b>Засада</b>
            <span>тренажёр самостоятельных решений · учебный прототип</span>
          </div>
        </div>
        <div className="views" role="tablist" aria-label="Раздел">
          <button role="tab" aria-selected={view === "prototype"} className={view === "prototype" ? "on" : ""} onClick={() => setView("prototype")}>
            Прототип
          </button>
          <button role="tab" aria-selected={view === "experiment"} className={view === "experiment" ? "on" : ""} onClick={() => setView("experiment")}>
            Эксперимент
          </button>
        </div>
      </header>

      {view === "experiment" && <Experiment />}

      {view === "prototype" && (
        <nav className="stepper" aria-label="Шаги сценария">
          {STAGES.map((item, i) => (
            <button
              key={item.id}
              className={item.id === stage ? "on" : ""}
              disabled={!reachable(item.id)}
              aria-current={item.id === stage ? "step" : undefined}
              onClick={() => setStage(item.id)}
            >
              <i>{i + 1}</i>
              {item.label}
            </button>
          ))}
        </nav>
      )}

      {view === "prototype" && (
      <main className="stage">
        <div className="phone">
          <div className="phone-bar">
            <span>Freedom Broker</span>
            <span>{stage === "ambush" ? "Лента" : "Обучение"}</span>
          </div>
          <div className="phone-screen" key={`${stage}-${ambushCount}`}>
            <AmbushFlowScreens
              stage={stage}
              chat={chat}
              dialog={dialog}
              aigerimLossHalf={aigerimLossHalf}
              debateBefore={debateBefore}
              current={current}
              scenario={scenario}
              weights={weights}
              report={report}
              ambushBefore={ambushBefore}
              daysLater={ambushCount === 1 ? 5 : 3}
              nextInDays={lastInterval}
              marked={!surprise}
              onStart={(consent) => {
                setSurprise(consent);
                setStage("debate");
              }}
              onSend={sendAnswer}
              onRetry={retryDebate}
              onToFeedback={() => setStage("feedback")}
              onToAmbush={() => setStage("ambush")}
              onWeights={setWeights}
              onConfirm={confirmAllocation}
              onToResult={() => setStage("result")}
              onNextAmbush={nextAmbush}
              onRestart={restart}
            />
          </div>
        </div>

        <Hood
          stage={stage}
          analysis={analysis}
          lastReply={lastReply}
          dialog={dialog}
          mastery={mastery}
          scenario={scenario}
          history={history}
          weights={weights}
          sim={sim}
          report={report}
          surprise={surprise}
        />
      </main>
      )}
    </div>
  );
}
