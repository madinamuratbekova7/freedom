import type { Scenario } from "../engine/ambush";
import type { BlackBoxReport } from "../engine/blackbox";
import type { DialogState } from "../engine/dialog";
import { type ChatMessage, SIM_OPTIONS, type Stage } from "../state";
import { Ambush, Result, Rewind } from "./AmbushFlow";
import { Debate, Feedback, Intro } from "./Lesson";

interface Props {
  stage: Stage;
  chat: ChatMessage[];
  dialog: DialogState;
  aigerimLossHalf: number | null;
  debateBefore: number;
  current: number;
  scenario: Scenario;
  weights: number[];
  report: BlackBoxReport | null;
  ambushBefore: number;
  daysLater: number;
  nextInDays: number;
  onStart: () => void;
  onSend: (text: string) => void;
  onRetry: () => void;
  onToFeedback: () => void;
  onToAmbush: () => void;
  onWeights: (weights: number[]) => void;
  onConfirm: () => void;
  onToResult: () => void;
  onNextAmbush: () => void;
  onRestart: () => void;
}

/** Выбор экрана по шагу сценария. */
export function AmbushFlowScreens(props: Props) {
  const { stage, scenario, report } = props;

  if (stage === "intro") return <Intro onStart={props.onStart} />;

  if (stage === "debate") {
    return (
      <Debate
        chat={props.chat}
        dialog={props.dialog}
        aigerimLossHalf={props.aigerimLossHalf}
        onSend={props.onSend}
        onRetry={props.onRetry}
        onNext={props.onToFeedback}
      />
    );
  }

  if (stage === "feedback") {
    return (
      <Feedback
        dialog={props.dialog}
        masteryBefore={props.debateBefore}
        masteryAfter={props.current}
        onNext={props.onToAmbush}
      />
    );
  }

  if (stage === "ambush" || !report) {
    return (
      <Ambush
        scenario={scenario}
        weights={props.weights}
        daysLater={props.daysLater}
        onChange={props.onWeights}
        onConfirm={props.onConfirm}
      />
    );
  }

  if (stage === "rewind") {
    return <Rewind scenario={scenario} report={report} paths={SIM_OPTIONS.paths} onNext={props.onToResult} />;
  }

  const invested = props.weights.slice(0, 4).reduce((sum, w) => sum + w, 0);
  return (
    <Result
      scenario={scenario}
      report={report}
      masteryBefore={props.ambushBefore}
      masteryAfter={props.current}
      nextInDays={props.nextInDays}
      nothingInvested={invested === 0}
      onNextAmbush={props.onNextAmbush}
      onRestart={props.onRestart}
    />
  );
}
