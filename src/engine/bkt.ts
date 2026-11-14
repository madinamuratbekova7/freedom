/**
 * Байесовское отслеживание знаний (Bayesian Knowledge Tracing).
 * Скрытое состояние — «навык освоен / не освоен»; наблюдаем только правильность действия.
 * Вид проверки меняет силу свидетельства: угадать в тесте с вариантами легко,
 * пройти непомеченную засаду случайно — почти нельзя.
 */
export type ObservationKind = "quiz" | "free" | "transfer";

interface Emission {
  /** Вероятность ошибиться, владея навыком. */
  slip: number;
  /** Вероятность справиться, не владея навыком. */
  guess: number;
}

export const EMISSIONS: Record<ObservationKind, Emission> = {
  quiz: { slip: 0.1, guess: 0.45 },
  free: { slip: 0.15, guess: 0.2 },
  transfer: { slip: 0.15, guess: 0.08 },
};

export const P_INIT = 0.25;
const P_LEARN: Record<ObservationKind, number> = { quiz: 0.05, free: 0.15, transfer: 0.2 };

/** Апостериорная вероятность владения навыком после наблюдения + шанс научиться на этом шаге. */
export function bktUpdate(prior: number, correct: boolean, kind: ObservationKind): number {
  const { slip, guess } = EMISSIONS[kind];
  const posterior = correct
    ? (prior * (1 - slip)) / (prior * (1 - slip) + (1 - prior) * guess)
    : (prior * slip) / (prior * slip + (1 - prior) * (1 - guess));
  return posterior + (1 - posterior) * P_LEARN[kind];
}

/**
 * Адаптивный интервал до следующей засады.
 * Провал — возвращаемся быстро; чем увереннее навык, тем реже проверяем (от 3 до ~45 дней).
 */
export function nextAmbushInDays(mastery: number, passed: boolean): number {
  if (!passed) return 3;
  return Math.round(3 * Math.pow(2, 4 * mastery));
}
