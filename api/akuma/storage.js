let _kv = null;

export async function getKV() {
  if (_kv !== null) return _kv;
  const hasKV =
    !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
  if (!hasKV) {
    _kv = null;
    return _kv;
  }
  const mod = await import("@vercel/kv");
  _kv = mod.kv;
  return _kv;
}

const memFallback =
  globalThis.__APP_GOV_MEM__ || (globalThis.__APP_GOV_MEM__ = new Map());
const metaFallback =
  globalThis.__APP_GOV_META__ || (globalThis.__APP_GOV_META__ = new Map());

export async function getJSON(key, fallbackMap) {
  const kv = await getKV();
  if (!kv) return fallbackMap.get(key) || null;
  return kv.get(key);
}

export async function setJSON(key, value, fallbackMap, ttlSeconds = null) {
  const kv = await getKV();
  if (!kv) {
    fallbackMap.set(key, value);
    return;
  }
  if (ttlSeconds) return kv.set(key, value, { ex: ttlSeconds });
  return kv.set(key, value);
}

export function getFallbackMaps() {
  return { memFallback, metaFallback };
}
