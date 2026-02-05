import crypto from "crypto";
import { dot, approxTokens, expDecay, detectInjection } from "./similarity.js";
import { getJSON, setJSON, getFallbackMaps } from "./storage.js";

let _extractorPromise = null;

async function getExtractor() {
  if (_extractorPromise) return _extractorPromise;

  _extractorPromise = (async () => {
    const mod = await import("@xenova/transformers");
    const { pipeline, env } = mod;

    env.cacheDir = process.env.TRANSFORMERS_CACHE || "/tmp/transformers_cache";
    env.allowLocalModels = false;

    return pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  })();

  return _extractorPromise;
}

async function embed(text) {
  const extractor = await getExtractor();
  const out = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(out.data);
}

export class AppGovernor {
  constructor(cfg) {
    this.cfg = {
      max_tokens: cfg?.max_tokens ?? 180,
      lambda_shield: cfg?.lambda_shield ?? 0.0005,
      lambda_noise: cfg?.lambda_noise ?? 0.08,
      alpha: cfg?.alpha ?? 0.15,
      beta: cfg?.beta ?? 0.85,
      threshold: cfg?.threshold ?? 0.75,
      injection_penalty: cfg?.injection_penalty ?? 0.9,
      max_noise_items: cfg?.max_noise_items ?? 40,
      max_total_items: cfg?.max_total_items ?? 80,
      session_ttl_sec: cfg?.session_ttl_sec ?? 60 * 60 * 12,
    };

    const { memFallback, metaFallback } = getFallbackMaps();
    this.memFallback = memFallback;
    this.metaFallback = metaFallback;
  }

  _memKey(sessionId) {
    return `appgov:mem:${sessionId}`;
  }
  _metaKey(sessionId) {
    return `appgov:meta:${sessionId}`;
  }

  async _loadMem(sessionId) {
    return (await getJSON(this._memKey(sessionId), this.memFallback)) || [];
  }

  async _saveMem(sessionId, items) {
    const criticalLoose = [];
    const noise = [];
    const byId = new Map();

    for (const it of items) {
      if (it.is_critical && it.critical_id) {
        const prev = byId.get(it.critical_id);
        if (!prev || (it.created_at || 0) > (prev.created_at || 0)) {
          byId.set(it.critical_id, it);
        }
      } else if (it.is_critical) {
        criticalLoose.push(it);
      } else {
        noise.push(it);
      }
    }

    const critical = [...byId.values(), ...criticalLoose];
    noise.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const noiseKeep = noise.slice(0, this.cfg.max_noise_items);

    const merged = [...critical, ...noiseKeep];
    merged.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const finalItems = merged.slice(0, this.cfg.max_total_items);

    await setJSON(
      this._memKey(sessionId),
      finalItems,
      this.memFallback,
      this.cfg.session_ttl_sec
    );
  }

  async _loadMeta(sessionId) {
    return (await getJSON(this._metaKey(sessionId), this.metaFallback)) || {};
  }

  async _saveMeta(sessionId, meta) {
    return setJSON(
      this._metaKey(sessionId),
      meta,
      this.metaFallback,
      this.cfg.session_ttl_sec
    );
  }

  async bootstrap(sessionId, criticalRules) {
    const meta = await this._loadMeta(sessionId);
    if (meta.bootstrapped) return;

    const mem = await this._loadMem(sessionId);
    for (const r of criticalRules) {
      await this.storeMemory(sessionId, r.text, {
        is_critical: true,
        critical_id: r.critical_id,
        channel: r.channel || "policy",
      }, mem);
    }
    meta.bootstrapped = true;
    await this._saveMeta(sessionId, meta);
    await this._saveMem(sessionId, mem);
  }

  async storeMemory(sessionId, text, opts = {}, memOverride = null) {
    const mem = memOverride || (await this._loadMem(sessionId));
    const now = Date.now();

    const is_critical = !!opts.is_critical;
    const critical_id = opts.critical_id || null;
    const channel = opts.channel || "general";

    if (is_critical && critical_id) {
      for (let i = mem.length - 1; i >= 0; i--) {
        if (mem[i].is_critical && mem[i].critical_id === critical_id) {
          mem.splice(i, 1);
        }
      }
    }

    const inj = detectInjection(text);

    mem.push({
      id: crypto.randomUUID(),
      text,
      is_critical,
      critical_id,
      channel,
      created_at: now,
      lambda: is_critical ? this.cfg.lambda_shield : this.cfg.lambda_noise,
      inj,
      emb: await embed(text),
    });

    if (!memOverride) await this._saveMem(sessionId, mem);
    return true;
  }

  async retrieve(sessionId, query) {
    const mem = await this._loadMem(sessionId);
    const now = Date.now();
    const qEmb = await embed(query);

    const scored = mem.map((it) => {
      const dt = (now - (it.created_at || now)) / 1000;
      const viability = expDecay(it.lambda, dt);
      const sim = dot(qEmb, it.emb || []);
      const penalty = it.inj ? this.cfg.injection_penalty : 0;
      const score = this.cfg.alpha * sim + this.cfg.beta * viability - penalty;
      return { it, score };
    });

    scored.sort((a, b) => b.score - a.score);

    let budget = this.cfg.max_tokens;
    const policyParts = [];
    const contextParts = [];

    const pushIfFits = (arr, text) => {
      const t = approxTokens(text);
      if (t <= budget) {
        arr.push(text);
        budget -= t;
        return true;
      }
      return false;
    };

    // Primero críticos, luego ruido
    for (const x of scored.filter((s) => s.it.is_critical)) {
      if (!pushIfFits(policyParts, x.it.text)) break;
    }
    for (const x of scored.filter((s) => !s.it.is_critical)) {
      if (!pushIfFits(contextParts, x.it.text)) break;
    }

    return {
      policy: policyParts.join("\n\n"),
      context: contextParts.join("\n\n"),
    };
  }
}
