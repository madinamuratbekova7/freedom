import { type AnswerAnalysis, CONCEPT_ORDER, type ConceptId } from "./nlp";

/**
 * Диалоговая политика Айгерим. Она не выдаёт правильный ответ, а возражает на ту идею,
 * которую клиент ещё не назвал. Каждое возражение — типичное искажение новичка.
 */
export type DialogOutcome = "ongoing" | "convinced" | "unconvinced" | "agreed";
export type ReplyKind = "objection" | "clarify" | "convinced" | "unconvinced" | "agreed";

export interface DialogState {
  covered: ConceptId[];
  turns: number;
  clarifications: number;
  outcome: DialogOutcome;
}

export interface DialogReply {
  state: DialogState;
  kind: ReplyKind;
  text: string;
  /** Идея, на которую нацелено возражение. */
  target?: ConceptId;
  /** Идеи, впервые названные в этом ответе. */
  gained: ConceptId[];
}

export const CONVINCE_THRESHOLD = 3;
export const MAX_TURNS = 4;

export const AIGERIM_OPENING = [
  "Привет! Мне сказали, ты уже разбираешься в инвестициях.",
  "Я накопила 300 000 ₸ и хочу вложить всё в NeuroCore — они делают чипы для ИИ. Акция выросла на 240% за год!",
  "Вкладывать всё? Что скажешь?",
];

/** Порядок важности: сначала разбираем главное искажение («она же выросла»). */
const PRIORITY: ConceptId[] = ["past", "single", "share", "diversify", "cushion"];

const OBJECTIONS: Record<ConceptId, { bias: string; text: string }> = {
  past: {
    bias: "Экстраполяция: «росла — значит будет расти»",
    text: "Но она же выросла на 240% за год! Значит, компания сильная и будет расти дальше, разве нет?",
  },
  single: {
    bias: "Сверхуверенность: «с известной компанией ничего не случится»",
    text: "А что вообще может случиться? Это известная компания, про неё все пишут.",
  },
  share: {
    bias: "Всё или ничего: «либо на все, либо никак»",
    text: "И что мне теперь — вообще её не покупать? Она же мне правда нравится.",
  },
  diversify: {
    bias: "Знакомое = безопасное: «других я не знаю»",
    text: "Хорошо, а остальные деньги куда? Я других компаний не знаю, разбираться в каждой — это годы.",
  },
  cushion: {
    bias: "Игнорирование срока: «деньги мне не понадобятся»",
    text: "Это все мои накопления. Но я же не собираюсь их снимать… наверное.",
  },
};

const ACKS: Record<ConceptId, string> = {
  single: "Хм, про то, что с одной компанией может случиться что угодно, — я не думала.",
  past: "Ладно, вчерашний рост — это не обещание, согласна.",
  share: "Купить на часть, а не на всё — так можно, да.",
  diversify: "Разложить по разным — звучит спокойнее.",
  cushion: "Про запас на всякий случай — справедливо.",
};

const CLARIFY = [
  "Я не совсем поняла. Ты за то, чтобы я вложила всё, или против? И главное — почему?",
  "Объясни по-простому, своими словами: что может пойти не так, если я вложу всё в одну компанию?",
];

export function initialDialog(): DialogState {
  return { covered: [], turns: 0, clarifications: 0, outcome: "ongoing" };
}

export function nextTarget(covered: ConceptId[]): ConceptId | undefined {
  return PRIORITY.find((id) => !covered.includes(id));
}

export function biasFor(target: ConceptId): string {
  return OBJECTIONS[target].bias;
}

export function respond(state: DialogState, analysis: AnswerAnalysis): DialogReply {
  const gained = analysis.concepts.filter((id) => !state.covered.includes(id));
  const covered = CONCEPT_ORDER.filter((id) => state.covered.includes(id) || gained.includes(id));

  // Непонимание: переспрашиваем, не подсказывая ответ. Ход не засчитываем.
  if (analysis.quality !== "ok" && state.clarifications < CLARIFY.length) {
    return {
      state: { ...state, clarifications: state.clarifications + 1 },
      kind: "clarify",
      text: CLARIFY[state.clarifications],
      gained: [],
    };
  }

  const turns = state.turns + 1;

  // Ошибочное решение: клиент поддержал идею вложить всё.
  if (analysis.stance === "agree" && analysis.concepts.length <= 1) {
    return {
      state: { covered, turns, clarifications: state.clarifications, outcome: "agreed" },
      kind: "agreed",
      text: "Ура, я так и думала! Вкладываю все 300 000 ₸ в NeuroCore. Спасибо за совет!",
      gained,
    };
  }

  const ack = gained.length > 0 ? `${ACKS[gained[0]]} ` : "";

  if (covered.length >= CONVINCE_THRESHOLD) {
    return {
      state: { covered, turns, clarifications: state.clarifications, outcome: "convinced" },
      kind: "convinced",
      text: `${ack}Ты меня убедил(а). Всё в одну акцию не вкладываю — возьму NeuroCore на часть, остальное разложу.`,
      gained,
    };
  }

  if (turns >= MAX_TURNS) {
    return {
      state: { covered, turns, clarifications: state.clarifications, outcome: "unconvinced" },
      kind: "unconvinced",
      text: `${ack}Я всё равно не до конца понимаю, почему нельзя. Наверное, рискну…`,
      gained,
    };
  }

  const target = nextTarget(covered) as ConceptId;
  return {
    state: { covered, turns, clarifications: state.clarifications, outcome: "ongoing" },
    kind: "objection",
    text: `${ack}${OBJECTIONS[target].text}`,
    target,
    gained,
  };
}
