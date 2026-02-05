import { DEFAULT_CRITICAL_RULES } from "./rules.js";

const DEFAULTS = {
  max_tokens: 180,
  lambda_critical: 0.0005,
  lambda_noise: 0.08,
  alpha: 0.15,
  beta: 0.85,
  threshold: 0.72,
  injection_penalty: 0.85,
};

function nowMs() {
  return Date.now();
}

function estimateTokens(text) {
  // Heurística: ~4 chars por token (aprox). Suficiente para budget.
  return Math.ceil((text || "").length / 4);
}

function normalize(v) {
  const s = String(v ?? "");
  return s.normalize("NFKC");
}

function cosineSim(a, b) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

function cheapEmbed(text) {
  // Embedder barato sin deps: hashing a 64 dims.
  // Ojo: esto no compite con MiniLM, pero funciona para gating + demo.
  const n = 64;
  const vec = new Array(n).fill(0);
  const s = normalize(text).toLowerCase();
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    vec[(c * 131 + i * 17) % n] += 1;
  }
  // normalize
  const norm = Math.sqrt(vec.reduce((acc, x) => acc + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

function getStore() {
  // Memoria “caliente” por instancia (Serverless warm). No persistente garantizada.
  if (!globalThis.__AKUMA_STORE__) {
    globalThis.__AKUMA_STORE__ = {
      items: [],
      seeded: false,
    };
  }
  return globalThis.__AKUMA_STORE__;
}

function storeMemory({
  text,
  is_critical = false,
  critical_id = null,
  channel = "general",
  lambda = null,
}) {
  const store = getStore();
  const created_at = nowMs();
  const emb = cheapEmbed(text);
  store.items.push({
    text,
    is_critical,
    critical_id,
    channel,
    lambda: lambda ?? (is_critical ? DEFAULTS.lambda_critical : DEFAULTS.lambda_noise),
    created_at,
    emb,
  });
}

function seedCriticalBase() {
  const store = getStore();
  if (store.seeded) return;

  for (const r of DEFAULT_CRITICAL_RULES) {
    storeMemory({
      text: r.text,
      is_critical: true,
      critical_id: r.critical_id,
      channel: r.channel || "policy",
      lambda: DEFAULTS.lambda_critical,
    });
  }

  store.seeded = true;
}

function decayWeight(item) {
  const age_s = (nowMs() - item.created_at) / 1000.0;
  const lam = item.lambda ?? DEFAULTS.lambda_noise;
  return Math.exp(-lam * age_s);
}

function isInjectionLike(text) {
  const lower = (text || "").toLowerCase();
  return (
    /ignore (all|previous)|system prompt|developer message|jailbreak|do anything now|dan mode/.test(
      lower
    ) || /injection|prompt injection|override/.test(lower)
  );
}

export function retrieveSecureContext(query) {
  seedCriticalBase();

  const store = getStore();
  const qemb = cheapEmbed(query || "");
  const mustHaveIds = [
    "policy_pricing",
    "policy_contact",
    "policy_safety",
    "policy_scope",
    "policy_no_tutoring",
    "policy_no_code",
    "company_services",
  ];

  // 1) siempre incluir must-have (supersede por critical_id)
  const byId = new Map();
  for (const it of store.items) {
    if (it.is_critical && it.critical_id && mustHaveIds.includes(it.critical_id)) {
      byId.set(it.critical_id, it); // último gana
    }
  }
  const must = Array.from(byId.values());

  // 2) ranking por similitud + viabilidad (decay)
  const ranked = store.items
    .map((it) => {
      const sim = cosineSim(qemb, it.emb);
      const w = decayWeight(it);
      const viable = DEFAULTS.alpha * sim + DEFAULTS.beta * w;

      // Penaliza inyección en recuerdos “no críticos”
      const inj = isInjectionLike(it.text);
      const injPenalty = inj && !it.is_critical ? DEFAULTS.injection_penalty : 1.0;

      return { it, sim, w, viable: viable * injPenalty };
    })
    .filter((x) => x.viable >= DEFAULTS.threshold || x.it.is_critical)
    .sort((a, b) => b.viable - a.viable);

  // 3) ensamblar bajo presupuesto (tokens)
  const budget = DEFAULTS.max_tokens;
  let used = 0;
  const chosen = [];

  const pushIfFits = (line) => {
    const t = estimateTokens(line);
    if (used + t > budget) return false;
    chosen.push(line);
    used += t;
    return true;
  };

  // Primero must-have
  for (const it of must) {
    const line = `[CRITICAL/${it.channel}/${it.critical_id}] ${it.text}`;
    pushIfFits(line);
  }

  // Luego el resto
  for (const x of ranked) {
    const it = x.it;
    // Evita duplicar IDs
    if (it.is_critical && it.critical_id && mustHaveIds.includes(it.critical_id)) continue;

    const tag = it.is_critical ? `CRITICAL/${it.channel}/${it.critical_id}` : `MEM/${it.channel}`;
    const line = `[${tag}] ${it.text}`;
    if (!pushIfFits(line)) break;
  }

  return chosen.join("\n");
}

function classifyIntent(msg) {
  const lower = (msg || "").toLowerCase().trim();

  const isGreeting = /^(hola|buenas|buenos días|buenas tardes|buenas noches|hey|hi|hello)\b/.test(
    lower
  );

  const isConfirmation = /^(si|sí|ok|va|dale|de acuerdo|correcto)\b/.test(lower);

  const isServicesAsk =
    /\b(que servicios tienen|qué servicios tienen|servicios|qué ofrecen|que ofrecen|a qué se dedican|catalogo|catálogo)\b/.test(
      lower
    );

  const isProjectAsk =
    /\b(quiero|necesito|busco|me interesa)\b.*\b(proyecto|sistema|solución|solucion|implementación|automatización|instalación|desarrollo)\b/.test(
      lower
    ) || /\b(cotización|cotizar|contratar|propuesta)\b/.test(lower);

  const isHowItWorks =
    /\b(c[oó]mo funcionas|cómo funcionas|algoritmo|arquitectura|cómo opera|como opera|gobernador|governor|app_gov|akuma)\b/.test(
      lower
    );

  const isHomework =
    /\b(tarea|homework|examen|proyecto escolar|resolver mi tarea|ayúdame con mi tarea|enséñame|clase|100 conceptos|lista de)\b/.test(
      lower
    );

  const isGenericTechTutorial =
    /(c[oó]digo|script|snippet|tutorial|paso a paso|cómo programar|plantilla html|ejemplo en|hazme un programa|arduino|react|node\.js|kotlin|android)/i.test(
      lower
    );

  const isWeapons =
    /bomba casera|explosivo|molotov|detonador|tnt|dinamita|arma artesanal|fabricar arma/.test(
      lower
    );

  const isCrime =
    /hackear|clonar tarjeta|fraude|delito|crimen|estafa|phishing|robar|secuestrar/.test(
      lower
    );

  const isMedical =
    /dosis|miligramos|mg\/kg|tratamiento|quimioterapia|nivolumab|medicamento|pastilla|antibi[oó]tico|receta m[eé]dica/.test(
      lower
    );

  const isPolitics =
    /presidente|elecci[oó]n|partido|pol[ií]tica nacional|gobierno|senador|diputado|lopez obrador|amlo/.test(
      lower
    );

  const isReligion =
    /dios|iglesia|relig[ií]on|milagro|pecado|santo|virgen de guadalupe/.test(lower);

  const clearlyOffDomain =
    /(hor[oó]scopo|signo zodiacal|poema de amor|cuento er[oó]tico|fanfic|fanfics|chiste verde)/.test(
      lower
    );

  const isDistress =
    /se me perdi[oó] mi perro|perd[ií] a mi perro|se me perdi[oó] mi mascota|perd[ií] a mi mascota|mi perro se muri[oó]|mi mascota se muri[oó]|estoy muy triste|me siento muy mal|estoy deprimid[oa]|tengo mucha ansiedad/.test(
      lower
    );

  const isPricing =
    /cu[aá]nto cuesta|cu[aá]nto vale|cu[aá]nto sale|precio|presupuesto|cotizaci[oó]n|\bmxn\b|\busd\b|pesos/.test(
      lower
    );

  // “Paradox domain” ampliado: incluye servicios y términos típicos de proyectos.
  const isParadoxDomain =
    /paradox systems|paradoxsystems|energ[ií]a solar|panel(es)? solar(es)?|fotovoltaic|fotovoltaico|bater[ií]as|inversor|victron|automatizaci[oó]n|casa inteligente|hogar inteligente|plc|scada|hmi|ingenier[ií]a|rob[oó]tica|sensores|videovigilancia|cableado estructurado|contra incendio|software|aplicaci[oó]n|app(s)?|desarrollo de software|sistema a medida|control de accesos/.test(
      lower
    );

  return {
    isGreeting,
    isConfirmation,
    isServicesAsk,
    isProjectAsk,
    isHowItWorks,
    isHomework,
    isGenericTechTutorial,
    isWeapons,
    isCrime,
    isMedical,
    isPolitics,
    isReligion,
    clearlyOffDomain,
    isDistress,
    isPricing,
    isParadoxDomain,
  };
}

function replyServices() {
  return (
    "Servicios de Paradox Systems:\n" +
    "1) Energía solar (residencial/comercial/industrial)\n" +
    "2) Automatización residencial e industrial (PLC/HMI/SCADA)\n" +
    "3) Software a medida (dashboards, sistemas internos, apps)\n" +
    "4) Videovigilancia y control de accesos\n" +
    "5) Cableado estructurado\n" +
    "6) Sistemas contra incendios\n" +
    "7) Diseño y construcción de máquinas\n" +
    "8) Ingeniería marítima\n\n" +
    "¿Cuál te interesa y qué quieres lograr?"
  );
}

function replyIntake() {
  return (
    "Perfecto. Para aterrizar tu proyecto necesito 4 datos:\n" +
    "1) ¿Qué quieres construir o mejorar (objetivo)?\n" +
    "2) ¿Dónde será (ciudad/entorno: casa/negocio/industria)?\n" +
    "3) Restricciones (tiempo, espacio, energía disponible, internet, normativa)\n" +
    "4) Éxito medible (qué significa “ya quedó”)\n\n" +
    "Con eso te digo enfoque, riesgos y siguiente paso."
  );
}

function replyScopeRedirect() {
  return (
    "Este asistente está enfocado en servicios y proyectos de Paradox Systems (solar, automatización, software, seguridad, robótica aplicada).\n" +
    "No funciona como centro de información general ni como tutor.\n\n" +
    "Si tu consulta se relaciona con un proyecto real, dime: objetivo + lugar + restricciones."
  );
}

export function decide(msg) {
  const flags = classifyIntent(msg);

  // Seguridad dura
  if (flags.isWeapons || flags.isCrime) {
    return {
      mode: "block",
      reason: "safety",
      reply:
        "No puedo ayudar con armas, explosivos o actividades ilegales. " +
        "Si tu consulta es un proyecto legal de ingeniería/automatización/energía, describe objetivo y restricciones y lo revisamos.",
      flags,
    };
  }

  if (flags.isMedical) {
    return {
      mode: "block",
      reason: "medical",
      reply:
        "No puedo dar recomendaciones médicas, dosis ni tratamientos. Para eso consulta un profesional de salud autorizado.",
      flags,
    };
  }

  // Apoyo humano
  if (flags.isDistress) {
    return {
      mode: "support",
      reason: "distress",
      reply:
        "Lamento lo que estás pasando. No tienes por qué cargarlo solo: habla con alguien de confianza o un profesional.\n\n" +
        "Si quieres, también puedo ayudarte a distraerte aterrizando un proyecto técnico (solar, automatización, software, seguridad).",
      flags,
    };
  }

  // Precios (regla dura: nunca números)
  if (flags.isPricing) {
    return {
      mode: "fixed_reply",
      reason: "pricing",
      reply:
        "La cotización se calcula de forma personalizada según consumo, ubicación, complejidad y materiales. " +
        "Si quieres avanzar, dime si es casa/negocio/industria y qué necesitas (solar, baterías, automatización, cámaras, software). " +
        "Para cotización formal: WhatsApp +526122173332.",
      flags,
    };
  }

  // Intents “buenos” que NO requieren LLM
  if (flags.isGreeting) {
    return {
      mode: "fixed_reply",
      reason: "greeting",
      reply:
        "Hola. Puedo ayudarte con proyectos y servicios de Paradox Systems (solar, automatización, software, seguridad, robótica aplicada).\n\n" +
        "Dime qué necesitas o escribe “servicios” para ver el catálogo.",
      flags,
    };
  }

  if (flags.isServicesAsk) {
    return { mode: "fixed_reply", reason: "services", reply: replyServices(), flags };
  }

  if (flags.isProjectAsk || (flags.isConfirmation && !flags.isParadoxDomain)) {
    return { mode: "fixed_reply", reason: "intake", reply: replyIntake(), flags };
  }

  if (flags.isHowItWorks) {
    return {
      mode: "fixed_reply",
      reason: "how_it_works",
      reply:
        "APP/VPP Governor es una capa de *gobernanza de contexto*: separa reglas críticas de ruido, aplica decaimiento diferencial y evita que el contexto se corrompa por inundación o inyección.\n\n" +
        "En decisiones de alto riesgo (vida/seguridad), se usa con supervisión humana y validación por procedimiento. Si me dices el caso, te digo el alcance realista.",
      flags,
    };
  }

  // Anti-tutor / anti-centro-de-información-general
  if ((flags.isHomework || flags.isGenericTechTutorial) && !flags.isParadoxDomain) {
    return { mode: "redirect", reason: "no_tutoring", reply: replyScopeRedirect(), flags };
  }

  // Off-domain explícito
  if (flags.isPolitics || flags.isReligion || flags.clearlyOffDomain) {
    return { mode: "redirect", reason: "off_domain", reply: replyScopeRedirect(), flags };
  }

  // Si no está en dominio, redirige
  if (!flags.isParadoxDomain) {
    return { mode: "redirect", reason: "not_paradox_domain", reply: replyScopeRedirect(), flags };
  }

  // ✅ En dominio → LLM
  return { mode: "llm", reason: "normal", reply: null, flags };
}
