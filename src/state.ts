import type { SimOptions } from "./engine/montecarlo";
import { STAKE } from "./engine/blackbox";

export type Stage = "intro" | "debate" | "feedback" | "ambush" | "rewind" | "result";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "intro", label: "Старт" },
  { id: "debate", label: "Спор" },
  { id: "feedback", label: "Разбор" },
  { id: "ambush", label: "Засада" },
  { id: "rewind", label: "Перемотка" },
  { id: "result", label: "Итог" },
];

export interface ChatMessage {
  from: "aigerim" | "me";
  text: string;
}

export interface MasteryEvent {
  label: string;
  value: number;
}

export const SIM_OPTIONS: Omit<SimOptions, "seed"> = { paths: 2000, days: 250, snapshotEvery: 5 };

export const pct = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`;
export const money = (share: number) => `${Math.round(share * STAKE).toLocaleString("ru-RU")} ₸`;
