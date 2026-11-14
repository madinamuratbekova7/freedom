import { useEffect, useRef, useState } from "react";
import type { DialogState } from "../engine/dialog";
import { CONCEPT_ORDER, CONCEPTS } from "../engine/nlp";
import type { ChatMessage } from "../state";
import { MasteryBar } from "../ui/charts";

export function Intro({ onStart }: { onStart: () => void }) {
  const [consent, setConsent] = useState(false);
  return (
    <div className="screen">
      <p className="eyebrow">Урок · 4 минуты</p>
      <h1>Всё в одну компанию?</h1>
      <p className="lead">Навык: не вкладывать все деньги в одну акцию — даже когда очень хочется.</p>

      <ol className="steps">
        <li>
          <b>Спор.</b> Ты советник. Новичок Айгерим хочет вложить всё в одну акцию — отговори её своими словами.
        </li>
        <li>
          <b>Засада.</b> Через несколько дней в ленте появится похожая ситуация. Без пометки и без вариантов ответа.
        </li>
        <li>
          <b>Перемотка.</b> Ты увидишь, чем решение обернулось в 2000 вариантах будущего.
        </li>
      </ol>

      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>Хорошо, проверяйте меня неожиданно. Деньги и сделки — учебные.</span>
      </label>
      <p className="hint">Можно не соглашаться — тогда проверка придёт с пометкой «учебная».</p>

      <button className="primary" disabled={!consent} onClick={onStart}>
        Начать спор
      </button>
    </div>
  );
}

interface DebateProps {
  chat: ChatMessage[];
  dialog: DialogState;
  /** Доля будущих, где Айгерим теряет больше половины, — показываем, если клиент согласился с ней. */
  aigerimLossHalf: number | null;
  onSend: (text: string) => void;
  onRetry: () => void;
  onNext: () => void;
}

export function Debate({ chat, dialog, aigerimLossHalf, onSend, onRetry, onNext }: DebateProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const finished = dialog.outcome !== "ongoing";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.length, finished]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="screen chat-screen">
      <div className="chat-head">
        <div className="avatar">А</div>
        <div>
          <b>Айгерим</b>
          <span>новичок · просит совета</span>
        </div>
      </div>

      <div className="chat">
        {chat.map((message, i) => (
          <div key={i} className={`bubble ${message.from}`}>
            {message.text}
          </div>
        ))}

        {dialog.outcome === "agreed" && aigerimLossHalf !== null && (
          <div className="card danger">
            <b>Год спустя</b>
            <p>
              В {Math.round(aigerimLossHalf * 2000)} из 2000 вариантов будущего у Айгерим осталось меньше половины
              накоплений. Совет «вкладывай всё» — ошибка. Хорошо, что деньги учебные.
            </p>
          </div>
        )}
        {dialog.outcome === "unconvinced" && (
          <div className="card warn">
            <b>Айгерим не убеждена</b>
            <p>Аргументов не хватило. В разборе — какие идеи остались неназванными.</p>
          </div>
        )}
        {dialog.outcome === "convinced" && (
          <div className="card ok">
            <b>Айгерим передумала</b>
            <p>Принцип объяснён своими словами — без единого варианта ответа.</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {finished ? (
        <div className="actions">
          {dialog.outcome !== "convinced" && (
            <button className="ghost" onClick={onRetry}>
              Переубедить заново
            </button>
          )}
          <button className="primary" onClick={onNext}>
            Смотреть разбор
          </button>
        </div>
      ) : (
        <div className="composer">
          <textarea
            value={draft}
            rows={2}
            placeholder="Ответь своими словами…"
            aria-label="Твой ответ Айгерим"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <button className="send" onClick={send} disabled={!draft.trim()} aria-label="Отправить">
            ↑
          </button>
        </div>
      )}
    </div>
  );
}

interface FeedbackProps {
  dialog: DialogState;
  masteryBefore: number;
  masteryAfter: number;
  onNext: () => void;
}

export function Feedback({ dialog, masteryBefore, masteryAfter, onNext }: FeedbackProps) {
  return (
    <div className="screen">
      <p className="eyebrow">Разбор спора</p>
      <h1>
        {dialog.covered.length} из 5 идей — своими словами
      </h1>

      <ul className="concepts">
        {CONCEPT_ORDER.map((id) => {
          const named = dialog.covered.includes(id);
          return (
            <li key={id} className={named ? "named" : "missed"}>
              <span className="mark">{named ? "✓" : "○"}</span>
              <div>
                <b>{CONCEPTS[id].title}</b>
                <p>{named ? "Названо без подсказки." : CONCEPTS[id].explain}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <MasteryBar before={masteryBefore} after={masteryAfter} />

      <div className="card">
        <b>Награды пока нет</b>
        <p>Её дают не за разговор, а за решение. Проверка придёт, когда не ждёшь.</p>
      </div>

      <button className="primary" onClick={onNext}>
        ⏩ Перемотать 5 дней
      </button>
    </div>
  );
}
