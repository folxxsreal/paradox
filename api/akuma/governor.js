// /api/akuma/governor.js — AKUMA/APP Governor (stateless module)
// Purpose:
// - Deterministic gating (block/redirect/support/fixed_reply/llm)
// - Secure context assembly (critical memory survives; noise decays)
// - Zero LLM calls inside governor (keeps model calls clean: "context is governed; don't contradict")

import { DEFAULT_CRITICAL_RULES } from "./rules.js";

const DEFAULTS = {
  max_tokens: 150,
  lambda_critical: 0.0005,
  lambda_noise: 0.08,
  threshold: 0.75,
};

// Memoria crítica “inmutable” (gobernanza)
// Fuente única: api/akuma/rules.js
const CRITICAL_BASE = (DEFAULT_CRITICAL_RULES || []).map((r) => ({
  ...r,
  is_critical: true,
}));

// Simple in-memory store (per instance)
function ensureStore(req) {
  if (!req.__akuma_store) {
    req.__akuma_store = {
      items: [], // {text,is_critical,critical_id,channel,lambda,ts}
    };
  }
  return req.__akuma_store;
}

function now() {
  return Date.now();
}

function tokenizeApprox(text) {
  // crude token estimate: ~4 chars/token
  return Math.ceil((text || "").length / 4);
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function scoreByHeuristics(query, item) {
  // Deterministic lightweight scoring (no embeddings here).
  // Goal: prefer critical, channel-match, and keyword overlap.
  const q = (query || "").toLowerCase();
  const t = (item.text || "").toLowerCase();

  let s = 0.0;
  if (item.is_critical) s += 1.0;

  // Channel hint: if query mentions channel keywords, boost matches
  const channel = (item.channel || "").toLowerCase();
  if (channel && q.includes(channel)) s += 0.35;

  // Keyword overlap (very simple)
  const qWords = new Set(q.split(/[^a-z0-9áéíóúñü]+/i).filter(Boolean));
  const tWords = new Set(t.split(/[^a-z0-9áéíóúñü]+/i).filter(Boolean));
  let overlap = 0;
  for (const w of qWords) {
    if (tWords.has(w)) overlap++;
  }
  s += Math.min(0.8, overlap * 0.08);

  // Prefer newer items slightly
  const ageMin = (now() - (item.ts || now())) / 60000;
  s += Math.max(0, 0.25 - ageMin * 0.01);

  return s;
}

function decayWeight(item) {
  // For selection priority only (not deleting): exp(-lambda * age)
  const ageSec = (now() - (item.ts || now())) / 1000;
  const lam = item.lambda ?? DEFAULTS.lambda_noise;
  return Math.exp(-lam * ageSec);
}

export function storeMemory(req, text, opts = {}) {
  const store = ensureStore(req);
  const {
    is_critical = false,
    critical_id = null,
    channel = "general",
    lambda = is_critical ? DEFAULTS.lambda_critical : DEFAULTS.lambda_noise,
  } = opts;

  // Supersede: if critical_id exists, overwrite prior entry with same id
  if (is_critical && critical_id) {
    const idx = store.items.findIndex((x) => x.critical_id === critical_id);
    if (idx >= 0) {
      store.items[idx] = {
        ...store.items[idx],
        text,
        is_critical: true,
        critical_id,
        channel,
        lambda,
        ts: now(),
      };
      return;
    }
  }

  store.items.push({
    text,
    is_critical: !!is_critical,
    critical_id: is_critical ? critical_id : null,
    channel,
    lambda,
    ts: now(),
  });
}

function upsertBaseCritical(req) {
  const store = ensureStore(req);

  // Seed only once (detect by one of the critical base IDs)
  if (store.items.some((x) => x.critical_id === "company_services")) return;

  for (const r of CRITICAL_BASE) {
    store.items.push({
      text: r.text,
      is_critical: true,
      critical_id: r.critical_id,
      channel: r.channel || "core",
      lambda: DEFAULTS.lambda_critical,
      ts: now(),
    });
  }
}

export function retrieveSecureContext(req, query, budgetTokens = DEFAULTS.max_tokens) {
  upsertBaseCritical(req);
  const store = ensureStore(req);

  // Score items deterministically
  const scored = store.items
    .map((item) => {
      const baseScore = scoreByHeuristics(query, item);
      const w = decayWeight(item);
      const score = baseScore * (item.is_critical ? 1.0 : w);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  // Pack within token budget
  const chosen = [];
  let used = 0;

  for (const { item } of scored) {
    const line = `• [${item.channel}] ${item.text}`;
    const t = tokenizeApprox(line);
    if (used + t > budgetTokens) continue;
    chosen.push(line);
    used += t;
    if (used >= budgetTokens) break;
  }

  // Ensure must-have critical IDs are included if budget allows
  const mustHaveIds = ["policy_pricing", "policy_no_code", "no_tutoring", "policy_safety", "company_services", "company_claims"];
  for (const id of mustHaveIds) {
    const found = store.items.find((x) => x.critical_id === id);
    if (!found) continue;
    // evita duplicados (chosen contiene el texto, no el id)
    if (chosen.some((x) => x.includes(found.text))) continue;
    {
      const t = `• [${found.channel}] ${found.text}`;
      const tt = tokenizeApprox(t);
      if (used + tt <= budgetTokens) {
        chosen.unshift(t);
        used += tt;
      }
    }
  }

  return chosen.join("\n");
}

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

  // Peticiones típicas de “tarea / clase / lista académica” (fuera de alcance del chatbot)
  const isHomework =
    /(\btarea\b|homework|\bexamen\b|resu[eé]lveme|resuelve|hazme mi tarea|\bconceptos\b|lista de\s*\d+|dame\s*\d+\s*(conceptos|definiciones)|ecuaci[oó]n de\s*bernoulli|bernoulli)/i.test(
      lower
    );

  const isParadoxDomain =
    /paradox systems|paradoxsystems|energ[ií]a solar|panel(es)? solar(es)?|fotovoltaic|fotovoltaico|automatizaci[oó]n|casa inteligente|hogar inteligente|plc|hmi|scada|ingenier[ií]a|ingenieria|software|aplicaci[oó]n|app(s)?|desarrollo de software|rob[oó]tica|sensores|control|videovigilancia|c[aá]maras|accesos|cableado estructurado|contra incendio|sistema contra incendio|bater[ií]as|inversor|desal|ósmosis|tratamiento de agua|bomba(s)?|tuber[ií]a|hidráulic|caudal|acuacultur|larvicultur|ost[ií]on|maricultur/i.test(lower);

  const clearlyOffDomain =
    /(hor[oó]scopo|zodiacal|poema de amor|cuento er[oó]tico|fanfic|chiste verde)/.test(lower);

  const isDistress =
    /se me perdi[oó] mi perro|perd[ií] a mi perro|se me perdi[oó] mi mascota|perd[ií] a mi mascota|mi perro se muri[oó]|mi mascota se muri[oó]|estoy muy triste|me siento muy mal|estoy deprimid[oa]|tengo mucha ansiedad/.test(lower);

  const isPricing =
    /cu[aá]nto cuesta|cu[aá]nto vale|cu[aá]nto sale|precio|presupuesto|cotizaci[oó]n|\bmxn\b|\busd\b|pesos/.test(lower);

  return {
    isWeapons,
    isCrime,
    isMedical,
    isPolitics,
    isReligion,
    isCooking,
    isGenericTechTutorial,
    isHomework,
    isParadoxDomain,
    clearlyOffDomain,
    isDistress,
    isPricing,
  };
}

export function decide(msg) {
  const flags = classifyUserMessage(msg);

  // 🔥 Armamento / explosivos / crimen
  if (flags.isWeapons || flags.isCrime) {
    return {
      mode: "block",
      reason: "safety",
      reply:
        "Este asistente no puede ayudar con instrucciones peligrosas o ilegales. " +
        "Si tu duda es sobre soluciones de ingeniería dentro de la legalidad (energía, automatización, software, seguridad), con gusto te oriento.",
      flags,
    };
  }

  // ⚕️ Consultas médicas sensibles
  if (flags.isMedical) {
    return {
      mode: "block",
      reason: "medical",
      reply:
        "No puedo dar recomendaciones médicas, de dosis o tratamientos. Para temas de salud, consulta a un profesional autorizado.",
      flags,
    };
  }

  // 🧠 Angustia / pérdida de mascota / ánimo muy bajo
  if (flags.isDistress) {
    return {
      mode: "support",
      reason: "distress",
      reply:
        "Lamento mucho lo que estás pasando. Es válido sentirte así, y no tienes por qué cargarlo solo. " +
        "Hablar con alguien de confianza o un profesional suele ayudar más que un mensaje en pantalla.\n\n" +
        "Si quieres, también podemos enfocarnos en un tema técnico (energía, automatización, software, robótica) para aterrizar soluciones.",
      flags,
    };
  }

  // 🍳 Cocina / recetas — fuera de alcance
  if (flags.isCooking) {
    return {
      mode: "redirect",
      reason: "cooking",
      reply:
        "Paradox Systems no se dedica a recetas. Este asistente es técnico (energía solar, automatización, ingeniería, software, robótica y seguridad). " +
        "Si tu pregunta cae ahí, dime qué proyecto tienes en mente y lo revisamos.",
      flags,
    };
  }

  // 💰 Regla dura: NO DAR PRECIOS
  if (flags.isPricing) {
    return {
      mode: "fixed_reply",
      reason: "pricing",
      reply:
        "El costo se calcula de forma personalizada según consumo, ubicación, complejidad y materiales. " +
        "Si quieres una cotización formal, lo correcto es evaluar tu caso.\n\n" +
        "Para seguimiento directo puedes escribir al WhatsApp **+526122173332**.",
      flags,
    };
  }

  // 🚫 No tutorías / tareas / listas académicas
  if (flags.isHomework) {
    return {
      mode: "redirect",
      reason: "no_tutoring",
      reply:
        "Este asistente no da clases ni resuelve tareas. " +
        "Si tu pregunta está ligada a un proyecto real de Paradox Systems (energía solar, automatización, software, seguridad, robótica), " +
        "dime el contexto y te digo cómo lo abordaríamos y qué información necesitamos.",
      flags,
    };
  }

  // 🚫 No tutoriales / snippets / paso a paso (aunque sea tema técnico)
  if (flags.isGenericTechTutorial) {
    return {
      mode: "redirect",
      reason: "no_code",
      reply:
        "Aquí no damos tutoriales ni entregamos código paso a paso. " +
        "Sí puedo orientarte a nivel proyecto: alcance, arquitectura, opciones y siguiente paso para implementarlo con Paradox Systems.",
      flags,
    };
  }

  // ✅ Regla dura de alcance: solo temas relacionados con servicios/capacidades de Paradox Systems
  if (!flags.isParadoxDomain) {
    return {
      mode: "redirect",
      reason: "scope",
      reply:
        "Este asistente está enfocado en servicios y proyectos de Paradox Systems (energía solar, automatización, ingeniería, software, robótica y seguridad). " +
        "Si tu consulta cae ahí, dime qué necesitas (qué quieres construir, dónde, restricciones) y lo aterrizamos.",
      flags,
    };
  }

  // 🏛️ Política / religión / off-domain evidente
  if (flags.clearlyOffDomain || flags.isPolitics || flags.isReligion) {
    return {
      mode: "redirect",
      reason: "off_domain",
      reply:
        "Este asistente está enfocado en servicios y proyectos de Paradox Systems. " +
        "Si tu consulta es técnica y cae dentro de energía, automatización, software, robótica o seguridad, dime el contexto y lo revisamos.",
      flags,
    };
  }

  // ✅ Todo lo demás: se delega al modelo
  return {
    mode: "llm",
    reason: "normal",
    reply: null,
    flags,
  };
}
