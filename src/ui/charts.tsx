import { useEffect, useRef } from "react";
import type { PortfolioOutcome } from "../engine/montecarlo";

const COLORS = { lostHalf: "#d92d20", lost: "#f79009", gained: "#12a150" };

function colorFor(final: number): string {
  if (final < 0.5) return COLORS.lostHalf;
  if (final < 1) return COLORS.lost;
  return COLORS.gained;
}

/** Веер траекторий: каждая линия — одно возможное будущее портфеля на год вперёд. */
export function FanChart({ outcome, animate }: { outcome: PortfolioOutcome; animate: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const left = 46;
    const right = 8;
    const top = 8;
    const bottom = 20;
    const maxY = 2.5;
    const shown = 180;
    const stride = Math.max(1, Math.floor(outcome.paths / shown));
    const x = (step: number) => left + (step / (outcome.steps - 1)) * (width - left - right);
    const y = (value: number) => top + (1 - Math.min(value, maxY) / maxY) * (height - top - bottom);

    const duration = animate ? 2400 : 0;
    const started = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const progress = duration ? Math.min(1, (now - started) / duration) : 1;
      const upto = progress * (outcome.steps - 1);
      ctx.clearRect(0, 0, width, height);

      ctx.font = "11px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      [
        { value: 2, label: "2 млн" },
        { value: 1, label: "1 млн" },
        { value: 0.5, label: "500 тыс" },
        { value: 0, label: "0" },
      ].forEach((tick) => {
        ctx.strokeStyle = tick.value === 0.5 ? "#d92d20" : "#d5dbe3";
        ctx.setLineDash(tick.value === 0.5 || tick.value === 1 ? [4, 4] : []);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, y(tick.value));
        ctx.lineTo(width - right, y(tick.value));
        ctx.stroke();
        ctx.fillStyle = tick.value === 0.5 ? "#d92d20" : "#667085";
        ctx.fillText(tick.label, 0, y(tick.value));
      });
      ctx.setLineDash([]);
      ctx.fillStyle = "#667085";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("сегодня", left, height - 4);
      ctx.textAlign = "right";
      ctx.fillText("через год", width - right, height - 4);
      ctx.textAlign = "left";

      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.32;
      for (let p = 0; p < outcome.paths; p += stride) {
        const base = p * outcome.steps;
        ctx.strokeStyle = colorFor(outcome.finals[p]);
        ctx.beginPath();
        ctx.moveTo(x(0), y(outcome.values[base]));
        const whole = Math.floor(upto);
        for (let s = 1; s <= whole; s++) ctx.lineTo(x(s), y(outcome.values[base + s]));
        if (whole < outcome.steps - 1) {
          const part = upto - whole;
          const from = outcome.values[base + whole];
          const to = outcome.values[base + whole + 1];
          ctx.lineTo(x(upto), y(from + (to - from) * part));
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (progress < 1) frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [outcome, animate]);

  return <canvas ref={ref} className="fan" role="img" aria-label="Траектории стоимости портфеля за год" />;
}

/** 100 точек, каждая — 1% будущих. Доли округляются методом наибольших остатков, чтобы сумма была ровно 100. */
export function DotGrid({ outcome }: { outcome: PortfolioOutcome }) {
  let lostHalf = 0;
  let lost = 0;
  for (let p = 0; p < outcome.paths; p++) {
    if (outcome.finals[p] < 0.5) lostHalf++;
    else if (outcome.finals[p] < 1) lost++;
  }
  const gained = outcome.paths - lostHalf - lost;
  const exact = [lostHalf, lost, gained].map((count) => (count / outcome.paths) * 100);
  const dots = exact.map(Math.floor);
  let rest = 100 - dots.reduce((sum, d) => sum + d, 0);
  exact
    .map((value, i) => ({ i, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => {
      if (rest > 0) {
        dots[i]++;
        rest--;
      }
    });
  const colors = [COLORS.lostHalf, COLORS.lost, COLORS.gained];
  const cells = dots.flatMap((count, i) => new Array<string>(count).fill(colors[i]));

  return (
    <div>
      <div className="dots" aria-hidden="true">
        {cells.map((color, i) => (
          <span key={i} style={{ background: color }} />
        ))}
      </div>
      <ul className="legend">
        <li>
          <i style={{ background: COLORS.lostHalf }} />
          Осталось меньше половины — <b>{lostHalf}</b>
        </li>
        <li>
          <i style={{ background: COLORS.lost }} />
          В минусе, но больше половины цело — <b>{lost}</b>
        </li>
        <li>
          <i style={{ background: COLORS.gained }} />В плюсе — <b>{gained}</b>
        </li>
      </ul>
    </div>
  );
}

export function MasteryBar({ before, after }: { before: number; after: number }) {
  const up = after >= before;
  return (
    <div className="mastery">
      <div className="mastery-head">
        <span>Оценка навыка</span>
        <b className={up ? "good" : "bad"}>
          {Math.round(before * 100)}% → {Math.round(after * 100)}%
        </b>
      </div>
      <div className="mastery-track">
        <div className="mastery-before" style={{ width: `${before * 100}%` }} />
        <div className={`mastery-after ${up ? "good" : "bad"}`} style={{ width: `${after * 100}%` }} />
      </div>
    </div>
  );
}
