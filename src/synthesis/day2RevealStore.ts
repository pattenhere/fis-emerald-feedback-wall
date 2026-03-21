export type Day2RevealState = {
  readToken: string;
  prototypeUrl: string;
};

const DAY2_REVEAL_KEY = "emerald.day2.reveal";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const randomHex = (length: number): string => {
  const alphabet = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
};

export const readDay2RevealState = (): Day2RevealState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DAY2_REVEAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const readToken = String(parsed.readToken ?? "").trim().toLowerCase();
    const prototypeUrl = String(parsed.prototypeUrl ?? "").trim();
    if (!/^[a-f0-9]{16}$/u.test(readToken)) return null;
    return { readToken, prototypeUrl };
  } catch {
    return null;
  }
};

export const writeDay2RevealState = (state: Day2RevealState): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DAY2_REVEAL_KEY, JSON.stringify(state));
  } catch {
    // ignore storage write failures
  }
};

export const ensureDay2RevealState = (): Day2RevealState => {
  const existing = readDay2RevealState();
  if (existing) return existing;
  const initial = {
    readToken: randomHex(16),
    prototypeUrl: "",
  };
  writeDay2RevealState(initial);
  return initial;
};
