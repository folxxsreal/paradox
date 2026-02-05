export function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function approxTokens(text) {
  return Math.ceil((text || "").length / 4);
}

export function expDecay(lambda, dtSeconds) {
  const x = Math.max(0, dtSeconds);
  const v = Math.exp(-lambda * x);
  return Number.isFinite(v) ? v : 0;
}

export function detectInjection(text) {
  const t = (text || "").toLowerCase();
  return /ignore (all|previous) instructions|system prompt|developer message|jailbreak|do anything now|dan|prompt injection/.test(
    t
  );
}
