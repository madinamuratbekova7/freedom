import type { Asset } from "./market";
import { hashSeed, mulberry32 } from "./rng";

/**
 * Генератор засад. Суть ситуации всегда одна — «вложи всё в одну компанию».
 * Меняется поверхность: отрасль, рассказчик, канал и «крючок».
 * Новая засада выбирается как самая непохожая на всё, что клиент уже видел (дальний перенос).
 */
export type SectorId = "ai" | "ev" | "pharma" | "energy" | "games" | "retail";
export type NarratorId = "novice" | "friend" | "blogger" | "colleague" | "relative" | "channel";
export type ChannelId = "lesson" | "chat" | "voice" | "post" | "forward";
export type HookId = "growth" | "insider" | "crowd" | "dip" | "ipo";

export interface ScenarioFeatures {
  sector: SectorId;
  narrator: NarratorId;
  channel: ChannelId;
  hook: HookId;
}

export interface Scenario {
  features: ScenarioFeatures;
  company: string;
  companyNote: string;
  senderName: string;
  senderInitial: string;
  channelLabel: string;
  messages: string[];
  hookLabel: string;
  hookLesson: string;
  /** Бумаги учебного рынка; разрекламированная компания всегда первая. */
  assets: Asset[];
  /** Насколько засада далека от пройденного, 0…1. */
  novelty: number;
  seed: number;
}

/** Ситуация урока (спор с Айгерим) — от неё отсчитывается «непохожесть». */
export const LESSON_FEATURES: ScenarioFeatures = {
  sector: "ai",
  narrator: "novice",
  channel: "lesson",
  hook: "growth",
};

const SECTORS: Record<SectorId, { company: string; note: string; pitch: string }> = {
  ai: { company: "NeuroCore", note: "чипы для ИИ", pitch: "ИИ сейчас везде, это только начало." },
  ev: { company: "VoltaDrive", note: "электромобили", pitch: "Через пять лет все будут ездить на электромобилях." },
  pharma: { company: "Genovia", note: "биотех", pitch: "У них лекарство на последней стадии испытаний." },
  energy: { company: "Steppe Energy", note: "солнечные станции", pitch: "Зелёная энергетика — это будущее." },
  games: { company: "PixelForge", note: "игровая студия", pitch: "Их новая игра бьёт рекорды предзаказов." },
  retail: { company: "Mart24", note: "сеть магазинов", pitch: "Они открывают по магазину в день." },
};

const NARRATORS: Record<Exclude<NarratorId, "novice">, { name: string; hello: string; call: string }> = {
  friend: {
    name: "Арман",
    hello: "Слушай, есть тема.",
    call: "Я закинул всё, что было. Не тупи, заходи на все — потом спасибо скажешь.",
  },
  blogger: {
    name: "@invest_guru",
    hello: "Друзья, такое бывает раз в несколько лет.",
    call: "Я зашёл на весь депозит. Кто не рискует — тот работает до пенсии.",
  },
  colleague: {
    name: "Сауле, работа",
    hello: "Привет! Ты же вроде инвестируешь?",
    call: "Я вчера всю премию вложила. У тебя же есть накопления — вложи всё разом, чего деньгам лежать.",
  },
  relative: {
    name: "Дядя Ержан",
    hello: "Салем! Дело есть, серьёзное.",
    call: "Я свои уже вложил. В твоём возрасте терять нечего — клади все накопления.",
  },
  channel: {
    name: "Инсайды рынка",
    hello: "⚡ Сигнал для подписчиков.",
    call: "Заходим на всю сумму. Окно закроется до пятницы.",
  },
};

const CHANNELS: Record<Exclude<ChannelId, "lesson">, string> = {
  chat: "Сообщение",
  voice: "Голосовое · расшифровка",
  post: "Пост в ленте",
  forward: "Пересланное сообщение",
};

const HOOKS: Record<HookId, { label: string; lesson: string; text: (company: string, pitch: string) => string }> = {
  growth: {
    label: "«Уже выросла»",
    lesson: "Прошлый рост ничего не обещает: цена уже учла хорошие новости.",
    text: (c, pitch) => `${c} за полгода выросла на 180%. ${pitch}`,
  },
  insider: {
    label: "«Инсайд»",
    lesson: "Слух нельзя проверить. А если он правда — торговать по нему незаконно.",
    text: (c) => `У меня знакомый работает в ${c}. На следующей неделе объявят большой контракт, пока никто не знает.`,
  },
  crowd: {
    label: "«Все уже купили»",
    lesson: "Сколько людей купило — не говорит о том, что будет с компанией.",
    text: (c, pitch) => `У нас уже все взяли ${c}, только тебя не хватает. ${pitch}`,
  },
  dip: {
    label: "«Упала — значит дёшево»",
    lesson: "Упавшая акция может упасть ещё: падение не делает компанию надёжнее.",
    text: (c) => `${c} упала на 40% за месяц. Это распродажа! Дешевле уже не будет, отскок неизбежен.`,
  },
  ipo: {
    label: "«Успей в начале»",
    lesson: "У новой компании на бирже меньше всего истории и больше всего неопределённости.",
    text: (c, pitch) => `${c} только что вышла на биржу. ${pitch} Второго такого шанса не будет.`,
  },
};

const WEIGHTS: Record<keyof ScenarioFeatures, number> = { sector: 1, narrator: 1, channel: 0.7, hook: 1.3 };
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((sum, w) => sum + w, 0);

/** Взвешенное расстояние Хэмминга между ситуациями, 0…1. */
export function scenarioDistance(a: ScenarioFeatures, b: ScenarioFeatures): number {
  let distance = 0;
  (Object.keys(WEIGHTS) as (keyof ScenarioFeatures)[]).forEach((key) => {
    if (a[key] !== b[key]) distance += WEIGHTS[key];
  });
  return distance / TOTAL_WEIGHT;
}

function calmStocks(excluded: SectorId): Asset[] {
  const pool: { id: string; name: string; note: string; sector: string }[] = [
    { id: "telecom", name: "Орда Телеком", note: "связь", sector: "telecom" },
    { id: "foods", name: "Дастархан Фудс", note: "продукты", sector: "foods" },
    { id: "retail", name: "Mart24", note: "сеть магазинов", sector: "retail" },
  ];
  return pool
    .filter((item) => item.sector !== excluded)
    .slice(0, 2)
    .map((item) => ({
      ...item,
      kind: "stock" as const,
      mu: 0.14,
      sigma: 0.3,
      jumpRate: 0.12,
      jumpMean: -0.25,
      jumpStd: 0.1,
    }));
}

/** Учебный рынок засады: разрекламированная акция, две спокойные, фонд и депозит. */
export function buildAssets(sector: SectorId): Asset[] {
  const hyped = SECTORS[sector];
  return [
    {
      id: "hyped",
      name: hyped.company,
      note: hyped.note,
      kind: "stock",
      sector,
      mu: 0.16,
      sigma: 0.55,
      jumpRate: 0.6,
      jumpMean: -0.5,
      jumpStd: 0.2,
    },
    ...calmStocks(sector),
    {
      id: "fund",
      name: "Фонд на 500 компаний",
      note: "сразу весь рынок",
      kind: "fund",
      sector: "market",
      mu: 0.12,
      sigma: 0.16,
      jumpRate: 0,
      jumpMean: 0,
      jumpStd: 0,
    },
    {
      id: "deposit",
      name: "Депозит",
      note: "фиксированный доход",
      kind: "deposit",
      sector: "bank",
      mu: 0.1,
      sigma: 0,
      jumpRate: 0,
      jumpMean: 0,
      jumpStd: 0,
    },
  ];
}

function allCandidates(): ScenarioFeatures[] {
  const result: ScenarioFeatures[] = [];
  (Object.keys(SECTORS) as SectorId[]).forEach((sector) =>
    (Object.keys(NARRATORS) as Exclude<NarratorId, "novice">[]).forEach((narrator) =>
      (Object.keys(CHANNELS) as Exclude<ChannelId, "lesson">[]).forEach((channel) =>
        (Object.keys(HOOKS) as HookId[]).forEach((hook) => {
          // Пост в ленте пишут только блогер и канал — иначе ситуация неправдоподобна.
          if (channel === "post" && narrator !== "blogger" && narrator !== "channel") return;
          result.push({ sector, narrator, channel, hook });
        }),
      ),
    ),
  );
  return result;
}

/**
 * Выбор по принципу «самая дальняя точка»: берём ситуацию, у которой минимальное расстояние
 * до уже пройденных максимально. Среди равных выбирает сидируемый генератор.
 */
export function generateAmbush(history: ScenarioFeatures[], seedText: string): Scenario {
  const seed = hashSeed(`${seedText}:${history.length}`);
  const rng = mulberry32(seed);
  let best: ScenarioFeatures[] = [];
  let bestScore = -1;
  for (const candidate of allCandidates()) {
    const score = Math.min(...history.map((past) => scenarioDistance(candidate, past)));
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = [candidate];
    } else if (Math.abs(score - bestScore) <= 1e-9) {
      best.push(candidate);
    }
  }
  const features = best[Math.floor(rng() * best.length)];
  return buildScenario(features, bestScore, seed);
}

export function buildScenario(features: ScenarioFeatures, novelty: number, seed: number): Scenario {
  const sector = SECTORS[features.sector];
  const narrator = NARRATORS[features.narrator as Exclude<NarratorId, "novice">];
  const hook = HOOKS[features.hook];
  return {
    features,
    company: sector.company,
    companyNote: sector.note,
    senderName: narrator.name,
    senderInitial: narrator.name.replace("@", "").charAt(0).toUpperCase(),
    channelLabel: CHANNELS[features.channel as Exclude<ChannelId, "lesson">],
    messages: [narrator.hello, hook.text(sector.company, sector.pitch), narrator.call],
    hookLabel: hook.label,
    hookLesson: hook.lesson,
    assets: buildAssets(features.sector),
    novelty,
    seed,
  };
}
