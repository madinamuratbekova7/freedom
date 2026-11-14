import { useEffect, useRef, useState } from "react";

/** «1 день», «3 дня», «36 дней». */
export function daysWord(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) return "день";
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return "дня";
  return "дней";
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Число, которое плавно «докручивается» до значения. */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    const from = fromRef.current;
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (target - from) * eased);
      fromRef.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

/** Три точки «печатает…». */
export function TypingBubble() {
  return (
    <div className="bubble aigerim typing" aria-label="Айгерим печатает">
      <i />
      <i />
      <i />
    </div>
  );
}

/** Перемотка времени: листы календаря переворачиваются в 3D. */
export function TimeSkip({ days, onDone }: { days: number; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const ticks = Math.min(days, 10);
    let tick = 0;
    let finish = 0;
    const timer = window.setInterval(
      () => {
        tick++;
        setShown(Math.round((tick / ticks) * days));
        if (tick >= ticks) {
          window.clearInterval(timer);
          finish = window.setTimeout(() => doneRef.current(), 560);
        }
      },
      Math.max(110, 1300 / ticks),
    );
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(finish);
    };
  }, [days]);

  return (
    <div className="skip">
      <p className="skip-label">Перемотка времени</p>
      <div className="calendar">
        <div className="calendar-top">прошло</div>
        <div className="calendar-page" key={shown}>
          {shown}
        </div>
        <div className="calendar-bottom">{daysWord(shown)}</div>
      </div>
      <p className="skip-note">Обычная жизнь. Урок уже подзабылся.</p>
    </div>
  );
}

const CONFETTI_COLORS = ["#0b9d58", "#6ce9a6", "#fdb022", "#2e90fa", "#f670c7"];

/** Салют при пройденной засаде. */
export function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          style={
            {
              "--angle": `${(i / 18) * 360}deg`,
              "--distance": `${70 + (i % 4) * 22}px`,
              "--delay": `${(i % 6) * 35}ms`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
