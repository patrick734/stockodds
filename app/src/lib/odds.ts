import { catalog } from "@/generated/catalog";

export const P = 3600;
export const W = 300;

export type CardQuestion = {
  key: string;
  kind: "noul" | "choice" | "score";
  text: string;
  options: string[];
};
export type Card = { id: number; name: "weekday" | "weekend"; questions: CardQuestion[] };

const NAMES: Record<string, string> = { ETH: "ETH", NVDA: "NVIDIA", GOOGL: "Alphabet" };

/** The cards from config, with display labels for every option. */
export const CARDS: Card[] = (Object.entries(catalog.cards) as [Card["name"], (typeof catalog.cards)["weekday"]][]).map(([name, c]) => ({
  id: c.id,
  name,
  questions: c.questions.map((q) => {
    const anyQ = q as unknown as { key: string; kind: CardQuestion["kind"]; text: string; assets?: string[]; buckets?: string[] };
    const options =
      anyQ.kind === "noul" ? ["Yes", "No"] : anyQ.kind === "choice" ? (anyQ.assets ?? []).map((a) => NAMES[a] ?? a) : (anyQ.buckets ?? []);
    return { key: anyQ.key, kind: anyQ.kind, text: anyQ.text, options };
  }),
}));

export const cardById = (id: number | bigint | undefined) => CARDS.find((c) => BigInt(c.id) === BigInt(id ?? -1));

export const openRound = (t: number) => Math.floor((t + W) / P) + 1;
export const timing = (n: number) => {
  const start = n * P;
  return { opens: start - W - P, locks: start - W, start, end: start + P };
};

/** Whole basis points summing to exactly 10,000 (largest remainder, ties to the lower index). */
export function toBasisPoints(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const exact = weights.map((p) => (total === 1 && weights.every((x) => x === 0) ? 10000 / weights.length : (p / total) * 10000));
  const out = exact.map(Math.floor);
  let left = 10000 - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let i = 0; left > 0; i++, left--) out[order[i % order.length][1]] += 1;
  return out;
}

/** Packs per-question basis points into the uint256 enter() takes: option i of the card at bits 16i. */
export function pack(perQuestion: number[][]): bigint {
  return perQuestion.flat().reduce((acc, p, i) => acc | (BigInt(p) << BigInt(16 * i)), 0n);
}

export function unpack(probs: bigint, card: Card): number[][] {
  let i = 0;
  return card.questions.map((q) => q.options.map(() => Number((probs >> BigInt(16 * i++)) & 0xffffn)));
}

export function countdown(seconds: number) {
  if (seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export const hourLabel = (n: number) => {
  const d = new Date(n * P * 1000);
  const e = new Date((n + 1) * P * 1000);
  const f = (x: Date) => x.toISOString().slice(11, 16);
  return `${f(d)}–${f(e)} UTC`;
};
