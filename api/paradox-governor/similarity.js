export function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s%+._:/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value) {
  return normalizeText(value).split(" ").filter(Boolean);
}

export function bagOfWords(value) {
  const bag = new Map();
  for (const token of tokenize(value)) {
    bag.set(token, (bag.get(token) || 0) + 1);
  }
  return bag;
}

export function cosineSimilarityText(a, b) {
  const left = bagOfWords(a);
  const right = bagOfWords(b);
  if (!left.size || !right.size) return 0;

  let dot = 0;
  let normLeft = 0;
  let normRight = 0;

  for (const [token, count] of left.entries()) {
    normLeft += count * count;
    dot += count * (right.get(token) || 0);
  }
  for (const count of right.values()) normRight += count * count;

  if (!normLeft || !normRight) return 0;
  return dot / Math.sqrt(normLeft * normRight);
}

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function approxTokens(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
