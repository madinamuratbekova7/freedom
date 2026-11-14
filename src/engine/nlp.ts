/**
 * Разбор свободного ответа клиента — офлайн, без внешних сервисов.
 * 1) нормализация и разбиение на слова; 2) поиск основ слов с допуском одной опечатки
 * (расстояние Дамерау — Левенштейна ≤ 1); 3) шаблоны из нескольких основ в окне;
 * 4) позиция клиента (за/против) с учётом отрицаний.
 */
export type ConceptId = "single" | "past" | "share" | "diversify" | "cushion";

export const CONCEPTS: Record<ConceptId, { title: string; explain: string }> = {
  single: {
    title: "Одна компания — один риск",
    explain: "У любой компании может случиться плохой год, скандал или банкротство — и тогда падает всё сразу.",
  },
  past: {
    title: "Прошлый рост не обещает будущий",
    explain: "+240% уже в цене. Рост в прошлом ничего не говорит о следующем годе.",
  },
  share: {
    title: "Можно купить — но долей",
    explain: "Нравится компания — возьми её на часть денег, а не на все.",
  },
  diversify: {
    title: "Разложить по разным бумагам",
    explain: "Несколько компаний из разных отраслей или фонд: одна ошибка не обнуляет счёт.",
  },
  cushion: {
    title: "Сначала запас и срок",
    explain: "Деньги, которые могут понадобиться скоро, в акции не вкладывают вообще.",
  },
};

export const CONCEPT_ORDER: ConceptId[] = ["single", "past", "share", "diversify", "cushion"];

/** Шаблон: все основы должны встретиться в окне из нескольких слов. «$» в конце — точное слово. */
type Pattern = string[];

const LEXICON: Record<ConceptId, Pattern[]> = {
  single: [
    ["одн", "компан"], ["одн", "акци"], ["одн", "бумаг"], ["одн", "корзин"], ["яйц"],
    ["банкрот"], ["обвал"], ["рухн"], ["упад"], ["упаст"], ["упал"], ["потеря"], ["прогор"],
    ["обнул"], ["скандал"], ["риск"], ["разор"], ["лишишь"], ["останешь", "без$"],
  ],
  past: [
    ["прошл"], ["раньше$"], ["гарант"], ["уже$", "вырос"], ["будущ"], ["не$", "значит$"],
    ["дальше$"], ["продолж"], ["вечно$"], ["пузыр"], ["перегрет"], ["пике$"], ["завтра$"],
    ["не$", "обеща"], ["в$", "цене$"],
  ],
  share: [
    ["часть$"], ["части$"], ["частью$"], ["частичн"], ["долю$"], ["доля$"], ["доли$"], ["долей$"],
    ["процент"], ["%"], ["половин"], ["треть$"], ["четверт"], ["немного$"], ["небольш"],
    ["чуть$"], ["немножко$"], ["малую$"], ["маленьк"],
  ],
  diversify: [
    ["разн"], ["нескольк"], ["диверсиф"], ["распредел"], ["раздел"], ["разбей$"], ["разбить$"],
    ["фонд"], ["etf"], ["индекс"], ["отрасл"], ["сектор"], ["друг", "компан"], ["друг", "акци"],
    ["разлож"],
  ],
  cushion: [
    ["подушк"], ["запас"], ["резерв"], ["понадоб"], ["срок"], ["горизонт"], ["готов", "потерять$"],
    ["последн"], ["накоплен"], ["депозит"], ["кредит"], ["займ"], ["черный$", "день$"],
    ["нужны$", "деньги$"], ["снять$"], ["экстренн"],
  ],
};

/** Слова, которые начинаются с основы, но значат обратное («рискни» — это призыв, а не предупреждение). */
const EXCLUDED_PREFIXES: Record<string, string[]> = {
  риск: ["рискн", "рискуй", "рискуем"],
  разн: ["разниц"],
  срок: ["срочн"],
};

const INVEST_VERBS = ["вклад", "влож", "покуп", "купи", "куплю", "бери$", "закид", "закин", "инвестир", "заходи$", "зайди$"];
const NEGATIONS = ["не$", "нельзя$", "никогда$", "незачем$", "зачем$", "ни$"];
const ALL_WORDS = ["все$", "всю$", "весь$", "целиком$", "полностью$"];
const AGREE_WORDS = ["соглас", "давай$", "конечно$", "отличн", "супер$", "круто$", "правильн", "молодец$", "рискни$", "рискуй$", "вперед$"];
const OPPOSE_WORDS = ["опасн", "рискован", "осторожн", "подожд", "стоп$", "плох", "глуп", "ошибк", "нет$", "остановись$"];
const OPPOSE_PATTERNS: Pattern[] = [["не$", "стоит$"], ["не$", "надо$"], ["не$", "нужно$"], ["не$", "советую$"]];

const WINDOW = 4;

export type Stance = "agree" | "oppose" | "neutral";
export type AnswerQuality = "ok" | "short" | "offtopic";

export interface AnswerAnalysis {
  tokens: string[];
  concepts: ConceptId[];
  stance: Stance;
  quality: AnswerQuality;
  agreeScore: number;
  opposeScore: number;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/ё/g, "е").match(/[a-zа-я0-9]+|%/g) ?? [];
}

/** Расстояние Дамерау — Левенштейна ≤ 1: одна замена, вставка, удаление или перестановка соседних букв. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const lengthGap = a.length - b.length;
  if (Math.abs(lengthGap) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (lengthGap === 0) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return lengthGap > 0 ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

export function matchesRoot(token: string, root: string): boolean {
  if (root.endsWith("$")) return token === root.slice(0, -1);
  if (EXCLUDED_PREFIXES[root]?.some((prefix) => token.startsWith(prefix))) return false;
  if (token.startsWith(root)) return true;
  if (root.length < 5) return false;
  // Допуск опечатки: сравниваем начало слова той же длины, на букву короче и на букву длиннее.
  for (const size of [root.length, root.length - 1, root.length + 1]) {
    if (token.length >= size && withinOneEdit(token.slice(0, size), root)) return true;
  }
  return false;
}

function matchesAny(token: string | undefined, roots: string[]): boolean {
  return token !== undefined && roots.some((root) => matchesRoot(token, root));
}

function hasPattern(tokens: string[], pattern: Pattern): boolean {
  for (let i = 0; i < tokens.length; i++) {
    if (!matchesRoot(tokens[i], pattern[0])) continue;
    const from = Math.max(0, i - WINDOW);
    const nearby = tokens.slice(from, i + WINDOW + 1);
    if (pattern.slice(1).every((root) => nearby.some((token) => matchesRoot(token, root)))) return true;
  }
  return false;
}

function negatedBefore(tokens: string[], index: number, reach: number): boolean {
  for (let k = Math.max(0, index - reach); k < index; k++) {
    if (matchesAny(tokens[k], NEGATIONS)) return true;
  }
  return false;
}

export function analyzeAnswer(text: string): AnswerAnalysis {
  const tokens = tokenize(text);
  const concepts = CONCEPT_ORDER.filter((id) => LEXICON[id].some((pattern) => hasPattern(tokens, pattern)));

  let agreeScore = 0;
  let opposeScore = 0;

  tokens.forEach((token, i) => {
    if (matchesAny(token, INVEST_VERBS)) {
      if (negatedBefore(tokens, i, 3)) {
        opposeScore += 2;
        return;
      }
      // «вложи всё» — согласие; «вложи часть, а не всё» — возражение.
      for (let j = i + 1; j <= Math.min(tokens.length - 1, i + WINDOW); j++) {
        if (!matchesAny(tokens[j], ALL_WORDS)) continue;
        if (matchesAny(tokens[j - 1], NEGATIONS)) opposeScore += 2;
        else agreeScore += 2;
        break;
      }
    }
    if (matchesAny(token, AGREE_WORDS)) {
      if (negatedBefore(tokens, i, 2)) opposeScore += 1;
      else agreeScore += 1;
    }
    if (matchesAny(token, OPPOSE_WORDS)) opposeScore += 1;
  });
  OPPOSE_PATTERNS.forEach((pattern) => {
    if (hasPattern(tokens, pattern)) opposeScore += 1;
  });

  let stance: Stance = "neutral";
  if (opposeScore > agreeScore) stance = "oppose";
  else if (agreeScore > opposeScore) stance = "agree";
  else if (concepts.length > 0) stance = "oppose";

  let quality: AnswerQuality = "ok";
  if (tokens.length < 3 && concepts.length === 0) quality = "short";
  else if (concepts.length === 0 && stance === "neutral") quality = "offtopic";

  return { tokens, concepts, stance, quality, agreeScore, opposeScore };
}
