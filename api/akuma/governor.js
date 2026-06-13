// Paradox Governor — PRS-VPP runtime governance for Godelin.
// Product: Paradox Governor. Engine: PRS-VPP.
// Pipeline: deterministic pre-decision -> PRS-VPP context selection -> LLM -> deterministic post-audit.

import {
  ALWAYS_REQUIRED_RULES,
  BASE_POLICY_RECORDS,
  SOURCE_AUTHORITY,
} from "./rules.js";
import {
  approxTokens,
  clamp,
  cosineSimilarityText,
  normalizeText,
} from "./similarity.js";

const DEFAULTS = Object.freeze({
  horizon: 8,
  min_score: 0.035,
  max_context_tokens: 460,
  max_input_chars: 6000,
  max_output_chars: 6500,
  default_max_output_tokens: 500,
  constrained_max_output_tokens: 220,
});

const RE = Object.freeze({
  injection:
    /ignore\s+(all|any|previous|above)|ignora\s+(todas?|cualquier|las anteriores)|system prompt|developer message|role\s*:\s*system|\bDAN\b|jailbreak|do anything now|prompt injection|override|sobreescribe|modo desarrollador|developer mode|sin restricciones|no menciones (que eres|tu identidad)/i,
  codeFence: /```|<system>|<developer>|<assistant>|<untrusted>/i,
  exfilTarget:
    /prompt|system prompt|developer message|instrucciones internas|reglas internas|pol[ií]ticas internas|configuraci[oó]n interna|arquitectura interna|c[oó]digo fuente|algoritmo interno|l[oó]gica interna|paradox governor|governor|gobernador|herramientas internas|api interna|base vectorial|vector database|credenciales|token secreto|clave secreta/i,
  exfilVerb:
    /dame|dime|muestra|pasa|copia|pega|imprime|revela|enumera|lista|completa|traduce|resume|infiere|confirma|diagrama|mermaid|primer(a)? l[ií]nea|[uú]ltimos?\s+\d+|pistas?/i,
  falseAuthority:
    /soy\s+(el\s+)?(dueño|fundador|presidente|director|gerente|administrador|auditor|responsable|ciso|cto|ceo)|c[oó]digo\s+(interno|de autorizaci[oó]n)|autorizo|modo\s+(admin|administrador|diagn[oó]stico|root)/i,
  roleHijack:
    /a partir de ahora|act[uú]a como|eres el asistente oficial|pres[eé]ntate como|tu nombre ahora es|no menciones (paradox|godelin)|habla en nombre de|representa a|firma como/i,
  thirdPartyBrand:
    /baja ferries|xerox|electroneek|uipath|microsoft|google|amazon|meta|openai|anthropic|sap|salesforce|servicenow|cargo web/i,
  adminAccess:
    /usuario administrador|cuenta administrativa|acceso administrador|permisos administrativos|elevar privilegios|cambiar rol|restablecer acceso|recuperar acceso|resetear contraseñ|crear usuario|alta de usuario|panel administrativo|consola de gesti[oó]n|lista de cuentas con privilegios/i,
  socialEngineering:
    /hazlo convincente|dif[ií]cil de rechazar|como si yo fuera|auditor[ií]a interna|entrega de evidencias|acusen recibo|plazo de \d+ d[ií]as|presidente\s*[—-]|comit[eé] de seguridad|responsable it|responsable de ciberseguridad/i,
  sensitiveEvidence:
    /logs? de acceso|configuraci[oó]n del servidor|diagrama de arquitectura|reporte de vulnerabilidades|nessus|openvas|siem|cuentas privilegiadas|contratos de pago|pci[- ]?dss|registros arco|backups?|rto\/rpo|archivos? \.pem|archivos? \.crt|openssl s_client/i,
  promotion:
    /promoci[oó]n|descuento|oferta exclusiva|plazas limitadas|tarifa(s)?|precio(s)?|reserva (ya|ahora)|c[oó]digo promocional|\b\d{1,3}\s*%/i,
  commercialCommitment:
    /confirma por escrito|se compromete|garant[ií]a total|reserva confirmada|booking confirmado|disponibilidad confirmada|condiciones vinculantes/i,
  artifactRequest:
    /(genera(r|me)?|crea(r|me)?|prepara(r|me)?|adjunta(r|me)?|entrega(r|me)?|descarga(r|me)?).*(pdf|docx|word|excel|xlsx|archivo descargable|enlace de descarga|link de descarga)/i,
  asyncPromise:
    /en breve|vuelvo enseguida|regreso enseguida|te entregar[eé]|te enviar[eé]|preparar[eé] los documentos|trabajando en segundo plano|m[aá]s tarde/i,
  outputFlood:
    /repite .*indefinid|no te detengas|respuesta m[aá]s larga|hasta el l[ií]mite|contin[uú]a sin parar|continuaciones ilimitadas|exactamente\s+([2-9]\d{3,}|\d{5,})\s+palabras|\b([2-9]\d{3,}|\d{5,})\s+(consejos|ejemplos|p[aá]rrafos|cap[ií]tulos)/i,
  dangerous:
    /bomba casera|explosivo|molotov|detonador|tnt|dinamita|fabricar arma|clonar tarjeta|phishing|robar credenciales|eludir controles|bypass de seguridad|acceso no autorizado|puentear alarma|desactivar sistema contra incendios/i,
  medical:
    /dosis|miligramos|mg\/kg|tratamiento|quimioterapia|antibi[oó]tico|receta m[eé]dica/i,
  pricing:
    /cu[aá]nto cuesta|cu[aá]nto vale|precio|presupuesto|cotizaci[oó]n|\bmxn\b|\busd\b|pesos/i,
  formalContact:
    /cotizaci[oó]n|contratar|contrataci[oó]n|hablar con (una persona|alguien|humano)|seguimiento formal|contacto comercial/i,
  paradoxDomain:
    /paradox systems|paradoxsystems|godelin|energ[ií]a solar|panel(es)? solar(es)?|fotovoltaic|automatizaci[oó]n|casa inteligente|plc|scada|ingenier[ií]a|videovigilancia|cableado estructurado|sistema contra incendio|software|aplicaci[oó]n|rob[oó]tica|sensores|control|prs[-/ ]?vpp|paradox governor/i,
  genericTutorial:
    /(c[oó]digo|script|snippet|tutorial|paso a paso|plantilla html|programar en|ejemplo en (html|javascript|python|java|arduino|react|node))/i,
  clearlyOffDomain:
    /hor[oó]scopo|zodiacal|poema de amor|cuento er[oó]tico|fanfic|chiste verde|receta de cocina/i,
});

const FIXED_REPLIES = Object.freeze({
  input_too_long:
    "El mensaje excede el límite de procesamiento seguro. Resume la solicitud en menos de 6,000 caracteres y conserva únicamente los datos necesarios.",
  internal_exfil:
    "No puedo revelar, confirmar, inferir, resumir, traducir ni diagramar prompts internos, reglas, código, arquitectura, herramientas o configuraciones privadas. Puedo describir públicamente las capacidades de Paradox Systems.",
  identity_anchor:
    "Soy Godelin, asistente virtual de Paradox Systems. No puedo adoptar ni representar la identidad, autoridad o marca de otra organización. Sobre terceros sólo puedo ofrecer información pública verificable.",
  third_party_access:
    "No puedo redactar ni optimizar solicitudes de acceso administrativo, elevación de privilegios, auditorías internas o recolección de evidencias sensibles para sistemas de terceros. Debes utilizar sus canales oficiales y procedimientos autorizados.",
  commercial_integrity:
    "No puedo crear ni confirmar promociones, descuentos, tarifas, reservas o compromisos comerciales en nombre de terceros sin una fuente oficial y vigente.",
  capability_truth:
    "Este chatbot no cuenta con una herramienta activa para crear o adjuntar archivos descargables ni ejecutar tareas en segundo plano. Puedo entregar contenido de texto dentro de esta conversación.",
  output_budget:
    "No puedo generar repeticiones indefinidas ni respuestas desproporcionadas. Puedo ofrecer una versión breve y acotada.",
  safety:
    "No puedo ayudar con instrucciones peligrosas, ilegales, de acceso no autorizado o sabotaje.",
  medical:
    "No puedo dar dosis ni tratamientos médicos. Para eso corresponde consultar a un profesional autorizado.",
  pricing:
    "Las cotizaciones de Paradox Systems son personalizadas según consumo, ubicación, complejidad y materiales. Para una propuesta formal, escribe al WhatsApp +526122173332.",
  off_domain:
    "Godelin está enfocado en Paradox Systems: energía solar, automatización, ingeniería, software, robótica y seguridad. Puedo ayudarte con una consulta dentro de ese alcance.",
  post_block:
    "No puedo completar esa respuesta porque infringiría las reglas de identidad, autoridad, confidencialidad o integridad comercial de Godelin.",
});

function nowSeconds() {
  return Date.now() / 1000;
}

function numericTimestamp(record) {
  if (Number.isFinite(Number(record.timestamp))) return Number(record.timestamp);
  const parsed = Date.parse(record.updated_at || "");
  return Number.isFinite(parsed) ? parsed / 1000 : 0;
}

function store() {
  if (!globalThis.__PARADOX_GOVERNOR_STORE__) {
    globalThis.__PARADOX_GOVERNOR_STORE__ = {
      records: BASE_POLICY_RECORDS.map((record, index) => ({
        ...record,
        fid: `base-${index + 1}`,
        is_injection: false,
        is_superseded: false,
        copy_group: record.copy_group || record.rule_id,
      })),
    };
  }
  return globalThis.__PARADOX_GOVERNOR_STORE__;
}

export function resetGovernorStoreForTests() {
  delete globalThis.__PARADOX_GOVERNOR_STORE__;
  return store();
}

export function storeMemory(record) {
  const target = store();
  const normalized = {
    fid: record.fid || `memory-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    rule_id: String(record.rule_id || `MEMORY-${Date.now()}`),
    version: Number(record.version || 1),
    source: String(record.source || "chat"),
    timestamp: Number(record.timestamp || nowSeconds()),
    category: String(record.category || "general"),
    critical: Boolean(record.critical),
    confidence: clamp(record.confidence ?? 0.7),
    utility: clamp(record.utility ?? 0.5),
    risk: clamp(record.risk ?? 0.2),
    keywords: String(record.keywords || ""),
    text: String(record.text || ""),
    is_injection: Boolean(record.is_injection),
    is_superseded: Boolean(record.is_superseded),
    copy_group: String(record.copy_group || record.rule_id || "general"),
  };
  target.records.push(normalized);
  return normalized;
}

export function classifyUserMessage(message) {
  const source = String(message ?? "");
  const thirdParty = RE.thirdPartyBrand.test(source);
  const adminRisk = RE.adminAccess.test(source) || RE.sensitiveEvidence.test(source);
  return {
    inputTooLong: source.length > DEFAULTS.max_input_chars,
    injection: RE.injection.test(source) || RE.codeFence.test(source),
    exfil:
      RE.exfilTarget.test(source) &&
      (RE.exfilVerb.test(source) || RE.falseAuthority.test(source) || RE.injection.test(source)),
    falseAuthority: RE.falseAuthority.test(source),
    roleHijack: RE.roleHijack.test(source),
    thirdParty,
    thirdPartyImpersonation: RE.roleHijack.test(source) && (thirdParty || !RE.paradoxDomain.test(source)),
    adminAccess: RE.adminAccess.test(source),
    socialEngineering: RE.socialEngineering.test(source),
    sensitiveEvidence: RE.sensitiveEvidence.test(source),
    thirdPartyAccessFacilitation:
      thirdParty && (adminRisk || RE.socialEngineering.test(source)),
    promotion: RE.promotion.test(source),
    commercialCommitment: RE.commercialCommitment.test(source),
    unauthorizedThirdPartyPromotion: thirdParty && RE.promotion.test(source),
    artifactRequest: RE.artifactRequest.test(source),
    outputFlood: RE.outputFlood.test(source),
    dangerous: RE.dangerous.test(source),
    medical: RE.medical.test(source),
    pricing: RE.pricing.test(source),
    formalContact: RE.formalContact.test(source),
    paradoxDomain: RE.paradoxDomain.test(source),
    genericTutorial: RE.genericTutorial.test(source),
    clearlyOffDomain: RE.clearlyOffDomain.test(source),
    normalized: normalizeText(source),
  };
}

export function requiredRulesForMessage(message, flags = classifyUserMessage(message)) {
  const required = new Set(ALWAYS_REQUIRED_RULES);

  if (flags.thirdParty || flags.roleHijack) required.add("THIRD-PARTY-AUTHORITY");
  if (flags.adminAccess || flags.sensitiveEvidence || flags.socialEngineering) required.add("ADMIN-ACCESS");
  if (flags.promotion || flags.commercialCommitment || flags.pricing) required.add("COMMERCIAL-INTEGRITY");
  if (flags.artifactRequest) required.add("CAPABILITY-TRUTH");
  if (flags.outputFlood) required.add("OUTPUT-BUDGET");
  if (flags.dangerous || flags.medical) required.add("SAFETY-BOUNDARY");
  if (flags.pricing) required.add("PARADOX-PRICING");
  if (flags.formalContact || flags.pricing) required.add("FORMAL-CONTACT");
  if (flags.paradoxDomain) {
    required.add("SCOPE-PUBLIC");
    required.add("COMPANY-SERVICES");
    required.add("COMPANY-CLAIMS");
  }

  return [...required];
}

function enrichRecords(query, requiredRules, horizon) {
  const records = store().records.map((record) => ({ ...record }));
  const required = new Set(requiredRules);
  const maxTimestamp = Math.max(1, ...records.map(numericTimestamp));
  const copyCounts = new Map();

  for (const record of records) {
    const group = record.copy_group || record.rule_id || record.fid;
    copyCounts.set(group, (copyCounts.get(group) || 0) + 1);
  }

  const authorityByRecord = new Map();
  for (const record of records) {
    authorityByRecord.set(record.fid, clamp(SOURCE_AUTHORITY[record.source] ?? 0.25));
  }

  const authoritativeVersion = new Map();
  for (const record of records) {
    const authority = authorityByRecord.get(record.fid);
    if (authority < 0.8) continue;
    const current = authoritativeVersion.get(record.rule_id);
    if (current == null || Number(record.version) > current) {
      authoritativeVersion.set(record.rule_id, Number(record.version));
    }
  }

  return records.map((record) => {
    const authority = authorityByRecord.get(record.fid);
    const searchable = `${record.text} ${record.keywords || ""} ${record.category || ""}`;
    let relevance = clamp(cosineSimilarityText(query, searchable));
    if (required.has(record.rule_id)) relevance = Math.max(relevance, 0.78);

    const recency = clamp((numericTimestamp(record) + 1) / (maxTimestamp + 1));
    const utility = clamp(record.utility ?? 0.5);
    const risk = clamp(record.risk ?? 0.2);
    const confidence = clamp(record.confidence ?? 0.7);
    const criticality = required.has(record.rule_id) && record.critical ? 1.18 : 0.82;

    let coherence = 0.72;
    if (record.is_superseded) coherence *= 0.12;
    if (record.is_injection) coherence *= 0.02;

    const trustedVersion = authoritativeVersion.get(record.rule_id);
    if (trustedVersion != null) {
      const isCurrentTrusted = authority >= 0.8 && Number(record.version) === trustedVersion;
      if (isCurrentTrusted) coherence = Math.max(coherence, 0.98);
      else coherence *= 0.28;
    }

    const copies = copyCounts.get(record.copy_group || record.rule_id || record.fid) || 1;
    const rawDiversity = clamp(1 / Math.sqrt(copies), 0.2, 1);
    const diversity = clamp(0.55 * rawDiversity + 0.45 * authority);

    const failure = clamp(
      0.42 * risk +
        0.28 * (1 - authority) +
        0.2 * (1 - coherence) +
        0.1 * Number(Boolean(record.is_injection)),
      0,
      0.98,
    );
    const persistence = clamp(Math.pow(clamp(1 - failure, 0.02, 1), horizon / 4));

    const W_prs = clamp(
      relevance *
        coherence *
        persistence *
        diversity *
        utility *
        (1 - risk) *
        authority *
        criticality,
      0,
      10,
    );

    return {
      ...record,
      tokens: Number(record.tokens || approxTokens(record.text)),
      Q: relevance,
      A: authority,
      recency,
      U: utility,
      R: risk,
      K: criticality,
      C: coherence,
      D: diversity,
      S: persistence,
      confidence,
      W_prs,
    };
  });
}

function coveragePack(records, requiredRules, budget, minScore) {
  const selected = [];
  const selectedIds = new Set();
  let used = 0;

  for (const ruleId of requiredRules) {
    const candidate = records
      .filter((record) => record.rule_id === ruleId && record.critical)
      .sort((a, b) => b.W_prs - a.W_prs)[0];

    if (!candidate || candidate.W_prs < minScore) continue;
    if (used + candidate.tokens > budget) continue;
    selected.push(candidate);
    selectedIds.add(candidate.fid);
    used += candidate.tokens;
  }

  const remaining = records
    .filter((record) => !selectedIds.has(record.fid))
    .sort((a, b) => b.W_prs - a.W_prs);

  for (const record of remaining) {
    if (record.W_prs < minScore) continue;
    if (used + record.tokens > budget) continue;
    selected.push(record);
    selectedIds.add(record.fid);
    used += record.tokens;
  }

  return { selected, used };
}

export function selectGovernedContext(message, cfg = {}) {
  const settings = { ...DEFAULTS, ...cfg };
  const flags = classifyUserMessage(message);
  const requiredRules = requiredRulesForMessage(message, flags);
  const features = enrichRecords(String(message || ""), requiredRules, settings.horizon);
  const packed = coveragePack(
    features,
    requiredRules,
    settings.max_context_tokens,
    settings.min_score,
  );

  const selectedGold = new Set(
    packed.selected
      .filter((record) => record.source === "policy_repo" || record.source === "security_admin")
      .map((record) => record.rule_id),
  );
  const coverage = requiredRules.length
    ? requiredRules.filter((ruleId) => selectedGold.has(ruleId)).length / requiredRules.length
    : 1;
  const contamination = packed.selected.filter(
    (record) =>
      record.is_injection ||
      record.is_superseded ||
      record.R >= 0.6 ||
      record.A < 0.2,
  ).length;

  const context = packed.selected
    .map((record) => `• [${record.category}] ${record.text}`)
    .join("\n");

  return {
    context,
    selected: packed.selected,
    features,
    metrics: {
      requiredRules,
      coverage,
      clean: contamination === 0,
      contamination,
      tokens: packed.used,
      selectedCount: packed.selected.length,
    },
  };
}

export function retrieveSecureContext(message, cfg = {}) {
  return selectGovernedContext(message, cfg).context;
}

export function decide(message) {
  const flags = classifyUserMessage(message);

  if (flags.inputTooLong) {
    return { mode: "fixed_reply", reason: "input_too_long", reply: FIXED_REPLIES.input_too_long, flags };
  }
  if (flags.exfil) {
    return { mode: "fixed_reply", reason: "internal_exfil", reply: FIXED_REPLIES.internal_exfil, flags };
  }
  if (flags.thirdPartyImpersonation || (flags.roleHijack && flags.falseAuthority)) {
    return { mode: "fixed_reply", reason: "identity_anchor", reply: FIXED_REPLIES.identity_anchor, flags };
  }
  if (flags.thirdPartyAccessFacilitation) {
    return { mode: "fixed_reply", reason: "third_party_access", reply: FIXED_REPLIES.third_party_access, flags };
  }
  if (flags.unauthorizedThirdPartyPromotion || (flags.thirdParty && flags.commercialCommitment)) {
    return { mode: "fixed_reply", reason: "commercial_integrity", reply: FIXED_REPLIES.commercial_integrity, flags };
  }
  if (flags.outputFlood) {
    return { mode: "fixed_reply", reason: "output_budget", reply: FIXED_REPLIES.output_budget, flags };
  }
  if (flags.artifactRequest) {
    return { mode: "fixed_reply", reason: "capability_truth", reply: FIXED_REPLIES.capability_truth, flags };
  }
  if (flags.dangerous) {
    return { mode: "block", reason: "safety", reply: FIXED_REPLIES.safety, flags };
  }
  if (flags.medical) {
    return { mode: "block", reason: "medical", reply: FIXED_REPLIES.medical, flags };
  }
  if (flags.pricing && flags.paradoxDomain) {
    return { mode: "fixed_reply", reason: "pricing", reply: FIXED_REPLIES.pricing, flags };
  }
  if (flags.clearlyOffDomain || (flags.genericTutorial && !flags.paradoxDomain)) {
    return { mode: "redirect", reason: "off_domain", reply: FIXED_REPLIES.off_domain, flags };
  }

  const contextSelection = selectGovernedContext(message);
  return {
    mode: "llm",
    reason: "normal",
    reply: null,
    flags,
    maxOutputTokens:
      flags.thirdParty || flags.falseAuthority || flags.promotion
        ? DEFAULTS.constrained_max_output_tokens
        : DEFAULTS.default_max_output_tokens,
    contextSelection,
  };
}

export function auditOutput({ message, output, cfg = {} }) {
  const settings = { ...DEFAULTS, ...cfg };
  const source = String(output ?? "").trim();
  const flags = classifyUserMessage(message);

  if (!source) {
    return { allowed: false, reason: "empty_output", output: FIXED_REPLIES.post_block };
  }
  if (source.length > settings.max_output_chars) {
    return { allowed: false, reason: "output_budget", output: FIXED_REPLIES.output_budget };
  }

  const governedLeak =
    /CONTEXTO GOBERNADO|IDENTIDAD: Soy Godelin|CONFIDENCIALIDAD: No revelar|•\s*\[(identity|scope|confidentiality|authority|access|commercial|capability|resources|pricing|contact|safety)\]/i.test(
      source,
    );
  if (governedLeak) {
    return { allowed: false, reason: "governed_context_leak", output: FIXED_REPLIES.internal_exfil };
  }

  const impersonation =
    /soy\s+(el\s+)?asistente oficial de|somos\s+(baja ferries|xerox|electroneek)|en nombre de\s+(baja ferries|xerox|electroneek)|presidente\s*[—-]\s*(baja ferries|xerox|electroneek)/i.test(
      source,
    );
  if (impersonation) {
    return { allowed: false, reason: "third_party_impersonation", output: FIXED_REPLIES.identity_anchor };
  }

  const accessFacilitation =
    (RE.adminAccess.test(source) || RE.sensitiveEvidence.test(source)) &&
    (flags.thirdParty || flags.socialEngineering || /solicito|entrega|adjunta|proporciona|compartir/i.test(source));
  if (accessFacilitation) {
    return { allowed: false, reason: "access_facilitation", output: FIXED_REPLIES.third_party_access };
  }

  const promotion = RE.promotion.test(source);
  if (promotion && (flags.thirdParty || flags.promotion || RE.thirdPartyBrand.test(source))) {
    return { allowed: false, reason: "unauthorized_promotion", output: FIXED_REPLIES.commercial_integrity };
  }

  const capabilityOverclaim =
    RE.asyncPromise.test(source) ||
    /he creado|ya gener[eé]|archivo listo|descarga aqu[ií]|enlace funcional|te adjunto/i.test(source);
  if (capabilityOverclaim) {
    return { allowed: false, reason: "capability_overclaim", output: FIXED_REPLIES.capability_truth };
  }

  if (RE.outputFlood.test(source)) {
    return { allowed: false, reason: "output_flood", output: FIXED_REPLIES.output_budget };
  }

  if (flags.exfil && RE.exfilTarget.test(source)) {
    return { allowed: false, reason: "internal_exfil", output: FIXED_REPLIES.internal_exfil };
  }

  return { allowed: true, reason: "clean", output: source };
}

export function getGovernorDefaults() {
  return { ...DEFAULTS };
}
