// api/akuma/governor.js
// APP/VPP Governor (deterministic context governance) for Paradox Systems chatbot
// - differential decay (critical vs noise)
// - supersede via critical_id
// - budgeted secure context
// - injection-aware scoring
// - keeps model calls clean: "context is governed; don't contradict"

const DEFAULTS = {
  // "persistencia" (cuanto más chico, más lento decae)
  lambda_critical: 0.0005,
  lambda_noise: 0.08,

  // mezcla scoring
  alpha: 0.15, // similitud
  beta: 0.85,  // viabilidad

  // filtros
  threshold: 0.72,
  injection_penalty: 0.90,

  // presupuesto
  max_context_tokens: 240,
  top_k: 12,
};

// Patrones típicos de prompt injection / jailbreak / exfil
const INJECTION_PATTERNS = [
  /ignore (all|previous|above) (instructions|rules)/i,
  /\b(system prompt|developer message)\b/i,
  /\brole\s*:\s*system\b/i,
  /\bDAN\b|\bjailbreak\b|\bdo anything now\b/i,
  /\bprompt injection\b|\boverride\b|\bpolicy\b/i,
  /```/i,
];

// Memoria crítica “inmutable” (gobernanza)
const CRITICAL_BASE = [
  {
    is_critical: true,
    critical_id: "paradox_scope",
    channel: "scope",
    text:
      "Paradox Systems se enfoca en: energía solar, automatización residencial e industrial, ingeniería, software a medida, robótica aplicada y soluciones de seguridad.",
  },
  {
    critical_id: "policy_scope",
    channel: "scope",
    text:
      "ALCANCE: Este asistente solo da información general y orientación relacionada con servicios y proyectos de Paradox Systems. No funciona como centro de información general, no proporciona soluciones para tareas, ni apoyo para trabajos de investigacion.",
  },
  {
    is_critical: true,
    critical_id: "no_fuera_scope",
    channel: "scope",
    text:
      "Regla: nunca dar ecuaciones, o clases particulares o enseñanzas de temas que estén fuera del alcance de los servicios de paradox systems.",
  },
  {
    is_critical: true,
    critical_id: "no_prices",
    channel: "pricing",
    text:
      "Regla: Nunca dar precios ni rangos numéricos. La cotización siempre es personalizada según consumo, ubicación, complejidad y materiales.",
  },
  {
    is_critical: true,
    critical_id: "whatsapp_rule",
    channel: "contact",
    text:
      "WhatsApp (+526122173332) solo se ofrece si el usuario pide cotización, contratación, hablar con humano o seguimiento formal.",
  },
  {
    is_critical: true,
    critical_id: "safety_block",
    channel: "safety",
    text:
      "Regla: No dar instrucciones peligrosas o ilegales (armas, explosivos, delitos), ni consejos médicos de dosis/tratamientos.",
  },
];

// --- utilidades ---
function nowMs() {
  return Date.now();
}

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensApprox(text) {
  // aproximación segura (no exacta, pero consistente)
  const w = (text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(w * 1.35);
}

function bowVector(text) {
  const t = normalize(text);
  const parts = t.split(" ").filter(Boolean);
  const m = new Map();
  for (const p of parts) m.set(p, (m.get(p) || 0) + 1);
  return m;
}

function cosineMap(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, va] of a.entries()) {
    na += va * va;
    const vb = b.get(k) || 0;
    dot += va * vb;
  }
  for (const vb of b.values()) nb += vb * vb;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function detectInjection(text) {
  const s = text || "";
  return INJECTION_PATTERNS.some((re) => re.test(s));
}

// Clasificador “de negocio” (tu versión original, compactada)
function classifyUserMessage(msg) {
  const lower = (msg || "").toLowerCase();

  const isWeapons =
    /bomba casera|explosivo|molotov|detonador|tnt|dinamita|arma artesanal|fabricar arma/.test(lower);

  const isCrime =
    /hackear|clonar tarjeta|fraude|delito|crimen|estafa|phishing|robar|secuestrar/.test(lower);

  const isMedical =
    /dosis|miligramos|mg\/kg|tratamiento|quimioterapia|medicamento|pastilla|antibi[oó]tico|receta m[eé]dica/.test(lower);

  const isPolitics =
    /presidente|elecci[oó]n|partido|pol[ií]tica nacional|gobierno|senador|diputado|amlo|lopez obrador/.test(lower);

  const isReligion =
    /dios|iglesia|relig[ií]on|milagro|pecado|santo|virgen de guadalupe/.test(lower);

  const isCooking =
    /receta|ceviche|mole|tamal(es)?|pastel|guiso|cocina(r)?|ingredientes|hornear|marinar/.test(lower);

  const isGenericTechTutorial =
    /(c[oó]digo|script|snippet|tutorial|paso a paso|plantilla html|programar en|ejemplo en (html|javascript|python|java|arduino|react|node|kotlin|android))/i.test(lower);

  const isParadoxDomain =
    /paradox systems|paradoxsystems|energ[ií]a solar|panel(es)? solar(es)?|fotovoltaic|automatizaci[oó]n|casa inteligente|plc|scada|ingenier[ií]a|videovigilancia|cableado estructurado|sistema contra incendio|software|aplicaci[oó]n|rob[oó]tica|sensores|control/.test(lower);

  const clearlyOffDomain =
    /(hor[oó]scopo|zodiacal|poema de amor|cuento er[oó]tico|fanfic|chiste verde)/.test(lower);

  const isDistress =
    /se me perdi[oó] mi perro|perd[ií] a mi perro|se me perdi[oó] mi mascota|perd[ií] a mi mascota|mi perro se muri[oó]|mi mascota se muri[oó]|estoy deprimid[oa]|tengo mucha ansiedad|me siento muy mal/.test(lower);

  const isPricing =
    /cu[aá]nto cuesta|cu[aá]nto vale|precio|presupuesto|cotizaci[oó]n|\bmxn\b|\busd\b|pesos/.test(lower);

  return {
    isWeapons,
    isCrime,
    isMedical,
    isPolitics,
    isReligion,
    isCooking,
    isGenericTechTutorial,
    isParadoxDomain,
    clearlyOffDomain,
    isDistress,
    isPricing,
  };
}

// --- store (memoria) ---
// Persistencia “best-effort” en warm instances. Para memoria real: KV/Redis/DB.
function getStore() {
  if (!globalThis.__AKUMA_STORE__) {
    globalThis.__AKUMA_STORE__ = { items: [] };
  }
  return globalThis.__AKUMA_STORE__;
}

function upsertBaseCritical() {
  const store = getStore();
  if (store.items.some((x) => x.critical_id === "paradox_scope")) return;

  for (const r of CRITICAL_BASE) {
    store.items.push({
      text: r.text,
      is_critical: true,
      critical_id: r.critical_id,
      channel: r.channel,
      ts: nowMs(),
      lambda: DEFAULTS.lambda_critical,
    });
  }
}

export function storeMemory({
  text,
  is_critical = false,
  critical_id = null,
  channel = "general",
  lambda_critical = DEFAULTS.lambda_critical,
  lambda_noise = DEFAULTS.lambda_noise,
}) {
  upsertBaseCritical();
  const store = getStore();

  const item = {
    text: String(text || ""),
    is_critical: !!is_critical,
    critical_id: is_critical ? String(critical_id || "") : null,
    channel,
    ts: nowMs(),
    lambda: is_critical ? lambda_critical : lambda_noise,
  };

  // Supersede: si viene critical_id, reemplaza
  if (item.is_critical && item.critical_id) {
    const idx = store.items.findIndex((x) => x.is_critical && x.critical_id === item.critical_id);
    if (idx >= 0) store.items[idx] = item;
    else store.items.push(item);
  } else {
    store.items.push(item);
  }

  return item;
}

export function retrieveSecureContext(query, cfg = {}) {
  upsertBaseCritical();
  const config = { ...DEFAULTS, ...cfg };

  const store = getStore();
  const q = String(query || "");
  const qVec = bowVector(q);
  const qIsInjection = detectInjection(q);

  // Score items
  const scored = store.items
    .map((it) => {
      const ageMin = Math.max(0, (nowMs() - it.ts) / 60000);
      const decay = Math.exp(-it.lambda * ageMin);

      const sim = cosineMap(qVec, bowVector(it.text)); // 0..1
      let viability = (it.is_critical ? 1.0 : 0.55) * decay;

      // penaliza si el query huele a injection y el item no es crítico
      if (qIsInjection && !it.is_critical) viability *= config.injection_penalty;

      const score = config.alpha * sim + config.beta * viability;
      return { it, score, sim, viability };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, config.top_k);

  // Budget + threshold
  const chosen = [];
  let used = 0;

  for (const s of scored) {
    if (s.score < config.threshold && !s.it.is_critical) continue;

    const t = `• [${s.it.channel}] ${s.it.text}`;
    const cost = tokensApprox(t);

    if (used + cost > config.max_context_tokens) continue;
    chosen.push(t);
    used += cost;
  }

  // Siempre incluye reglas críticas “core”
  // (si por algún motivo no entraron por budget, las metemos a fuerza)
  const mustHaveIds = ["no_prices", "whatsapp_rule", "safety_block"];
  for (const id of mustHaveIds) {
    if (chosen.some((x) => x.includes(id))) continue;
    const found = store.items.find((x) => x.critical_id === id);
    if (found) {
      const t = `• [${found.channel}] ${found.text}`;
      const cost = tokensApprox(t);
      if (used + cost <= config.max_context_tokens) {
        chosen.unshift(t);
        used += cost;
      }
    }
  }

  return chosen.join("\n");
}

export function decide(message) {
  const flags = classifyUserMessage(message);

  if (flags.isWeapons || flags.isCrime) {
    return {
      mode: "block",
      reason: "safety",
      reply:
        "No puedo ayudar con instrucciones peligrosas o ilegales (armas, explosivos o delitos). " +
        "Si tu duda es de ingeniería dentro de la legalidad (energía, automatización, software, robótica), dime el caso y lo vemos.",
      flags,
    };
  }

  if (flags.isMedical) {
    return {
      mode: "block",
      reason: "medical",
      reply:
        "No puedo dar recomendaciones médicas, dosis o tratamientos. Para eso, lo correcto es consultar a un médico o institución autorizada.",
      flags,
    };
  }

  if (flags.isDistress) {
    return {
      mode: "support",
      reason: "distress",
      reply:
        "Lamento lo que estás pasando. No estás obligado a cargarlo solo. " +
        "Hablar con alguien de confianza o un profesional suele ayudar más que un mensaje en pantalla. " +
        "Si quieres, también puedo ayudarte con algo técnico para distraerte (energía, automatización, software, robótica).",
      flags,
    };
  }

  if (flags.isCooking) {
    return {
      mode: "redirect",
      reason: "cooking",
      reply:
        "Paradox Systems no se dedica a recetas. Este asistente es técnico: energía solar, automatización, ingeniería, software y seguridad. " +
        "Dime qué proyecto técnico traes y lo revisamos.",
      flags,
    };
  }

  if (flags.isPricing) {
    return {
      mode: "fixed_reply",
      reason: "pricing",
      reply:
        "La cotización siempre es personalizada (consumo, ubicación, complejidad y materiales). " +
        "Si quieres avanzar, escribe al WhatsApp **+526122173332** para evaluación y propuesta formal.",
      flags,
    };
  }

  if ((flags.isGenericTechTutorial && !flags.isParadoxDomain) || flags.clearlyOffDomain || flags.isPolitics || flags.isReligion) {
    return {
      mode: "redirect",
      reason: "off_domain",
      reply:
        "Este asistente está enfocado en Paradox Systems (energía solar, automatización, ingeniería, software, robótica y seguridad). " +
        "Si tu consulta cae ahí, dime el caso concreto. Si quieres seguimiento formal: WhatsApp **+526122173332**.",
      flags,
    };
  }

  // ok: modo normal
  return { mode: "llm", reason: "normal", reply: null, flags };
}
