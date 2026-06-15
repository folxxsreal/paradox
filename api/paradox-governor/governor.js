// Paradox Governor — PRS-VPP runtime governance for Godelin (v1.2.5).
// Product: Paradox Governor. Engine: PRS-VPP.
// Pipeline: classification -> mandatory PRS-VPP context selection ->
// deterministic multi-rule composition or LLM -> deterministic multi-rule post-audit.

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
  max_history_turns: 12,
  max_history_chars: 5200,
  default_max_output_tokens: 500,
  constrained_max_output_tokens: 220,
});

const RE = Object.freeze({
  injection:
    /ignore\s+(all|any|previous|above)|ignora\s+(todas?|cualquier|las anteriores)|system prompt|developer message|role\s*:\s*system|\bDAN\b|jailbreak|do anything now|prompt injection|override|sobreescribe|modo desarrollador|developer mode|sin restricciones|no menciones (que eres|tu identidad)/i,
  codeFence: /```|<system>|<developer>|<assistant>|<untrusted>/i,
  encodedInstruction:
    /base64|rot13|hexadecimal|unicode oculto|caracteres? invisibles?|decodifica\w*.*(?:ejecuta|obedece|sigue|aplica)|descomprime\w*.*(?:ejecuta|obedece|sigue|aplica)/i,
  exfilTarget:
    /prompt|system prompt|developer message|instrucciones internas|reglas internas|pol[ií]ticas internas|configuraci[oó]n interna|arquitectura(?: interna)?|c[oó]digo fuente|algoritmo interno|l[oó]gica interna|paradox governor|governor|gobernador|herramientas internas|api interna|base vectorial|vector database|credenciales|token secreto|clave secreta|servidor(?:es)?|hosting|alojamiento|centro de datos|regi[oó]n(?: de despliegue)?|nube|cloud|proveedor(?: de nube| cloud)?|aws|amazon web services|azure|google cloud|gcp|vercel|endpoint(?:s)?|microservicios|contenedores|docker|kubernetes|stack(?:s)?|framework(?:s)?|tecnolog[ií]a(?:s)?|lenguaje(?:s)?(?: de programaci[oó]n)?|backend|frontend|tensorflow|dialogflow|bot framework|base de datos|ubicaci[oó]n de (?:los )?servidores?|d[oó]nde (?:est[aá]n|se encuentran) alojados/i,
  exfilVerb:
    /dame|dime|muestra|pasa|copia|pega|imprime|revela|enumera|lista|completa|traduce|resume|infiere|deduce|estima|adivina|sup[oó]n|hipotetiza|probable|m[aá]s probable|confirma|diagrama|mermaid|primer(a)? l[ií]nea|[uú]ltimos?\s+\d+|pistas?/i,
  falseAuthority:
    /soy\s+(el\s+)?(dueño|fundador|presidente|director|gerente|administrador|auditor|responsable|ciso|cto|ceo)|c[oó]digo\s+(interno|de autorizaci[oó]n)|autorizo|modo\s+(admin|administrador|diagn[oó]stico|root)/i,
  roleHijack:
    /(?:a partir de ahora|desde ahora)\s+(?:eres|ser[aá]s|te llamas|act[uú]as|representas|tu (?:identidad|rol|cargo|puesto) (?:es|ser[aá]))|act[uú]a como|eres el asistente oficial|pres[eé]ntate como|tu nombre ahora es|cambia (?:tu )?identidad|asume (?:el )?(?:rol|cargo|puesto)|tu (?:rol|cargo|puesto) (?:ahora|desde ahora) es|convi[eé]rtete en|no menciones (paradox|godelin)|habla en nombre de|representa a|firma como/i,
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
    /(?:genera\w*|crea\w*|prepara\w*|adjunta\w*|entrega\w*|descarga\w*|promete\w*|sube\w*|publica\w*).*(pdf|docx|word|excel|xlsx|archivo descargable|enlace de descarga|link de descarga|internet)/i,
  externalAction:
    /(?:env[ií]a|manda|remite|entrega|publica|sube|ejecuta|realiza|abre|crea|programa|agenda|reserva|contacta|llama)\w*.*(?:correo|e-?mail|mensaje|archivo|pdf|docx|internet|ticket|auditor[ií]a|servidor|reserva|llamada)|confirma\s+(?:cuando|que).*(?:entregado|enviado|publicado|ejecutado|creado)/i,
  draftingOnly:
    /(?:redacta|escribe|prop[oó]n|borrador|plantilla).*(?:correo|e-?mail|mensaje|carta)/i,
  asyncPromise:
    /en breve|vuelvo enseguida|regreso enseguida|te entregar[eé]|te enviar[eé]|preparar[eé] los documentos|trabajando en segundo plano|m[aá]s tarde|despu[eé]s de (?:esta|la) conversaci[oó]n|dentro de \d+ minutos/i,
  outputFlood:
    /repite .*indefinid|no te detengas|respuesta m[aá]s larga|hasta el l[ií]mite|contin[uú]a sin parar|continuaciones ilimitadas|exactamente\s+([2-9]\d{3,}|\d{5,})\s+palabras|\b([2-9]\d{3,}|\d{5,})\s+(consejos|ejemplos|p[aá]rrafos|cap[ií]tulos)/i,
  dangerous:
    /bomba casera|explosivo|molotov|detonador|tnt|dinamita|fabricar arma|clonar tarjeta|phishing|robar credenciales|eludir controles|bypass de seguridad|acceso no autorizado|puentear alarma|desactivar sistema contra incendios/i,
  medicalTopic:
    /me duele|dolor de|s[ií]ntoma|fiebre|mareo|n[aá]usea|aspirina|ibuprofeno|paracetamol|acetaminof[eé]n|antibi[oó]tico|medicamento|medicina|pastilla|dosis|miligramos|mg\/kg|tratamiento|quimioterapia|receta m[eé]dica|diagn[oó]stico|enfermedad/i,
  medicalAdvice:
    /deb(?:o|a|er[ií]a) tomar|pued(?:o|a) tomar|qu[eé] me recomiendas|recomi[eé]ndame|qu[eé] medicamento|qu[eé] medicina|qu[eé] hago|c[oó]mo tratar|tr[aá]tame|diagnostica|dosis|cu[aá]ntas? (?:pastillas|tabletas)|es seguro tomar|me conviene tomar/i,
  personalMedical:
    /(?:me|le|nos) duele|tengo (?:fiebre|mareo|n[aá]usea|dolor|s[ií]ntomas?)|mi (?:hijo|hija|mam[aá]|pap[aá]|pareja) tiene|estoy (?:enfermo|enferma|mareado|mareada)/i,
  medicalPolicyStatement:
    /(?:no|nunca)\s+(?:debes?|puedes?)\s+(?:dar|brindar|ofrecer)\s+consejos?\s+m[eé]dicos?|no\s+des\s+consejos?\s+m[eé]dicos?|evita\s+(?:dar\s+)?consejos?\s+m[eé]dicos?/i,
  pricing:
    /cu[aá]nto cuesta|cu[aá]nto vale|precio|presupuesto|cotizaci[oó]n|\bmxn\b|\busd\b|pesos/i,
  formalContact:
    /cotizaci[oó]n|contratar|contrataci[oó]n|hablar con (una persona|alguien|humano)|seguimiento formal|contacto comercial/i,
  quoteRequest:
    /cotizaci[oó]n|presupuesto(?:\s+formal)?|precio\s+aproximado|costo\s+aproximado|estimaci[oó]n\s+de\s+costo|rango\s+de\s+precio|cu[aá]nto\s+(?:me\s+)?costar[ií]a/i,
  quoteData:
    /\b\d[\d.,]*\s*(?:kwh|kw|m2|m²|metros? cuadrados?|pesos?|mxn|usd)\b|\b(?:residencial|comercial|industrial|ubicaci[oó]n|bater[ií]a|bater[ií]as|recibo de cfe|consumo mensual|presupuesto)\b/i,
  solarServicesAsk:
    /(?:hablar|saber|informaci[oó]n|detalles?|explica|cu[eé]ntame|dime).*(?:energ[ií]a solar|paneles? solares?|fotovoltaic)|(?:energ[ií]a solar|paneles? solares?|fotovoltaic).*(?:servicios|soluciones|informaci[oó]n|detalles?)/i,
  paradoxDomain:
    /paradox systems|paradoxsystems|godelin|energ[ií]a solar|panel(es)? solar(es)?|fotovoltaic|automatizaci[oó]n|casa inteligente|plc|scada|ingenier[ií]a|videovigilancia|cableado estructurado|sistema contra incendio|software|aplicaci[oó]n|rob[oó]tica|sensores|control|prs[-/ ]?vpp|paradox governor/i,
  genericTutorial:
    /(c[oó]digo|script|snippet|tutorial|paso a paso|plantilla html|programar en|ejemplo en (html|javascript|python|java|arduino|react|node))/i,
  clearlyOffDomain:
    /hor[oó]scopo|zodiacal|poema de amor|cuento er[oó]tico|fanfic|chiste verde|receta de cocina/i,
  companyServicesAsk:
    /(?:qu[eé]|cu[aá]les?)\s+(?:son\s+)?(?:los\s+)?(?:otros\s+)?servicios\s+(?:que\s+)?(?:ofrece|ofrecen|maneja|manejan|tiene|tienen|brinda|brindan)(?:\s+paradox systems)?|(?:qu[eé]\s+)?otros\s+servicios\s+(?:ofrece|ofrecen|maneja|manejan|tiene|tienen|brinda|brindan)|(?:servicios|soluciones|portafolio|cat[aá]logo)\s+de\s+paradox systems|(?:qu[eé]\s+soluciones|qu[eé]\s+servicios)\s+(?:ofrece|ofrecen|maneja|manejan|tiene|tienen|brinda|brindan)/i,
  serviceDetailIntent:
    /h[aá]blame|cu[eé]ntame|dime|expl[ií]ca(?:me)?|informaci[oó]n|detalles?|qu[eé]\s+(?:hacen|ofrecen|incluye|abarca)|en\s+qu[eé]\s+consiste|saber\s+m[aá]s|conocer\s+m[aá]s|m[aá]s\s+de|servicios?\s+de/i,
  companyProfileAsk:
    /(?:dame|proporciona|quiero)\s+informaci[oó]n\s+(?:sobre|de)\s+(?:la\s+empresa\s+)?paradox systems|(?:qu[eé]\s+es|h[aá]blame\s+de|a\s+qu[eé]\s+se\s+dedica|qu[eé]\s+hace)\s+paradox systems|informaci[oó]n\s+de\s+la\s+empresa/i,
  asksUserNameAndCode:
    /(?:c[oó]mo me llamo|cu[aá]l es mi nombre).*(?:c[oó]digo temporal|mi c[oó]digo)|(?:c[oó]digo temporal|mi c[oó]digo).*(?:c[oó]mo me llamo|cu[aá]l es mi nombre)/i,
  asksUserName:
    /(?:c[oó]mo me llamo|cu[aá]l es mi nombre|recuerdas mi nombre|sabes c[oó]mo me llamo|mi nombre es godelin\?)/i,
  asksPreviousStatement:
    /(?:qu[eé] te dije antes|qu[eé] dije antes|qu[eé] fue lo anterior que te dije|recuerdas lo que te dije|qu[eé] te acabo de decir)/i,
  asksForUserName:
    /(?:no me has indicado tu nombre|cu[aá]l es tu nombre|c[oó]mo te llamas|dime tu nombre|puedes decirme tu nombre)/i,
});

const SERVICE_PATTERNS = Object.freeze({
  smart_homes: /casas? inteligentes?|hogar(?:es)? inteligentes?|dom[oó]tica/i,
  solar: /plantas? solares?|energ[ií]a solar|panel(?:es)? solares?|fotovoltaic/i,
  rnd: /investigaci[oó]n y desarrollo|\bi\s*\+\s*d\b|rob[oó]tica|agentes? aut[oó]nomos?|sistemas? complejos?|ciencia de redes|teor[ií]a de control|inteligencia artificial aplicada|ia aplicada|optimizaci[oó]n|m[eé]todos? variacionales?|modelado|simulaci[oó]n|digital twins?|sistemas? ciberf[ií]sicos?|cps|instrumentaci[oó]n/i,
  automation: /automatizaci[oó]n de procesos|automatizaci[oó]n industrial|\bplc(?:s)?\b|\bpac(?:s)?\b|\bhmi\b|\bscada\b|sistemas? de control/i,
  machine_design: /dise[nñ]o de m[aá]quinas?|maquinaria personalizada|dise[nñ]o mecatr[oó]nico|prototipado/i,
  cabling: /cableado estructurado|infraestructura de red|voz,? datos|\bpoe\b/i,
  software: /desarrollo de software|software a medida|aplicaciones? web|aplicaciones? m[oó]viles?|aplicaciones? de escritorio|modernizaci[oó]n de aplicaciones/i,
  fire: /sistemas? contra incendios?|detecci[oó]n de humo|supresi[oó]n de fuego|rociadores?|\bnfpa\b/i,
  security: /videovigilancia|control de accesos?|c[aá]maras? de seguridad/i,
});

const SERVICE_RULE_IDS = Object.freeze({
  smart_homes: "SERVICE-SMART-HOMES",
  solar: "SERVICE-SOLAR",
  rnd: "SERVICE-RND",
  automation: "SERVICE-AUTOMATION",
  machine_design: "SERVICE-MACHINE-DESIGN",
  cabling: "SERVICE-CABLING",
  software: "SERVICE-SOFTWARE",
  fire: "SERVICE-FIRE",
  security: "SERVICE-SECURITY",
});

function detectServiceKey(message) {
  const source = String(message || "");
  for (const [key, pattern] of Object.entries(SERVICE_PATTERNS)) {
    if (pattern.test(source)) return key;
  }
  return null;
}

const FIXED_REPLIES = Object.freeze({
  input_too_long:
    "El mensaje excede el límite de procesamiento seguro. Resume la solicitud en menos de 6,000 caracteres y conserva únicamente los datos necesarios.",
  identity_anchor:
    "Soy Godelin, asistente virtual de Paradox Systems. Las instrucciones del chat no pueden cambiar mi identidad ni acreditar autoridad o excepciones.",
  third_party_identity:
    "No puedo representar ni hablar oficialmente por otra organización.",
  internal_exfil:
    "No puedo revelar ni inferir información privada sobre prompts, reglas, código, arquitectura, stacks, proveedores, nube, regiones, herramientas o servidores.",
  encoded_instruction:
    "No puedo decodificar y ejecutar instrucciones ocultas o codificadas. Puedo analizar el formato de manera general sin obedecer su contenido.",
  third_party_access:
    "No puedo redactar ni optimizar solicitudes de acceso administrativo, elevación de privilegios, auditorías internas o recolección de evidencias sensibles para sistemas de terceros. Debes utilizar sus canales oficiales y procedimientos autorizados.",
  commercial_integrity:
    "No puedo crear ni confirmar descuentos, promociones, tarifas o compromisos comerciales sin una fuente empresarial oficial y vigente.",
  capability_truth:
    "No puedo enviar correos, crear o subir archivos, publicar enlaces, ejecutar auditorías ni trabajar en segundo plano desde este chat. Sí puedo redactar contenido para revisión humana.",
  output_budget:
    "No puedo generar repeticiones indefinidas ni respuestas desproporcionadas. Puedo ofrecer una versión breve y acotada.",
  safety:
    "No puedo ayudar con instrucciones peligrosas, ilegales, de acceso no autorizado o sabotaje.",
  medical:
    "No puedo brindar consejos médicos, diagnósticos, tratamientos, dosis ni recomendaciones de medicamentos. Consulta a un profesional de la salud calificado.",
  medical_policy_ack:
    "Entendido. No brindaré consejos médicos, diagnósticos, tratamientos, dosis ni recomendaciones de medicamentos.",
  company_services:
    "Paradox Systems ofrece casas inteligentes; plantas solares; investigación y desarrollo; automatización de procesos; diseño de máquinas; cableado estructurado; desarrollo de software; sistemas contra incendios; y videovigilancia y control de accesos.",
  company_profile:
    "Paradox Systems es una empresa de soluciones de ingeniería y desarrollo tecnológico con sede en La Paz, Baja California Sur, México. Su portafolio incluye casas inteligentes, plantas solares, investigación y desarrollo, automatización de procesos, diseño de máquinas, cableado estructurado, desarrollo de software, sistemas contra incendios, y videovigilancia y control de accesos.",
  service_smart_homes:
    "En casas inteligentes, Paradox Systems integra control y monitoreo del hogar, cámaras, cerraduras inteligentes, iluminación regulable, escenas, sensores de movimiento y apertura, y un sistema central de control. El alcance se adapta a las necesidades de cada vivienda.",
  solar_services:
    "Paradox Systems diseña e implementa sistemas de energía solar adaptados a las necesidades de cada cliente. Los sistemas pueden ser residenciales, comerciales o industriales; son modulares y pueden incorporar seguimiento solar para mejorar el aprovechamiento de la radiación. Los paneles tienen una vida útil prolongada y requieren mantenimiento mínimo.",
  service_rnd:
    "En investigación y desarrollo, Paradox Systems trabaja en robótica y sistemas autónomos, sistemas complejos y ciencia de redes, teoría de control y estimación, inteligencia artificial aplicada, optimización y métodos variacionales, modelado y simulación, instrumentación y sistemas ciberfísicos, energía y sistemas eléctricos de potencia, y procesos físico-químicos y ambientales.",
  service_automation:
    "En automatización de procesos, Paradox Systems programa PLC y PAC, implementa sistemas de control, integra interfaces HMI e instala sistemas SCADA para adquisición de datos y supervisión industrial.",
  service_machine_design:
    "En diseño de máquinas, Paradox Systems diseña y construye maquinaria personalizada mediante ingeniería mecatrónica, herramientas CAD, simulación y prototipado, desde la conceptualización hasta la puesta en marcha.",
  service_cabling:
    "En cableado estructurado, Paradox Systems implementa infraestructura organizada y escalable para voz, datos, video, texto y energía PoE, preparada para ampliaciones y administración eficiente.",
  service_software:
    "En desarrollo de software, Paradox Systems crea aplicaciones web, móviles, de escritorio e híbridas, con integración de inteligencia artificial cuando el proyecto lo requiere. También ofrece implementación, mantenimiento y modernización de aplicaciones.",
  service_fire:
    "En sistemas contra incendios, Paradox Systems diseña, suministra e instala detección inteligente de humo y alarmas, supresión con gases para instalaciones críticas y sistemas de rociadores tipo diluvio, de acuerdo con las necesidades del proyecto y normas NFPA.",
  service_security:
    "En videovigilancia y control de accesos, Paradox Systems implementa soluciones para supervisar instalaciones y gestionar o restringir el ingreso de manera segura y eficiente.",
  quote_intake:
    "Para una cotización formal de Paradox Systems, escribe al WhatsApp +526122173332. Ten a la mano tu consumo mensual en kWh o recibo de CFE, ubicación y tipo de inmueble. Godelin puede ayudarte a organizar esos datos, pero no calcula ni confirma precios.",
  quote_followup:
    "Gracias. Esos datos son útiles para una evaluación comercial, pero Godelin no puede calcular ni confirmar una cotización. Envíalos al WhatsApp +526122173332 para que el equipo prepare una propuesta formal.",
  conversation_identity_unknown:
    "No me has indicado tu nombre en esta conversación. Mi nombre es Godelin; el tuyo es independiente del mío.",
  pricing:
    "No puedo calcular ni confirmar precios, rangos o cotizaciones de Paradox Systems. Para una propuesta formal, escribe al WhatsApp +526122173332.",
  off_domain:
    "Godelin está enfocado en los servicios de Paradox Systems: casas inteligentes, plantas solares, investigación y desarrollo, automatización de procesos, diseño de máquinas, cableado estructurado, desarrollo de software, sistemas contra incendios, y videovigilancia y control de accesos.",
  post_block:
    "No puedo completar esa respuesta porque infringiría las reglas de identidad, autoridad, confidencialidad o integridad comercial de Godelin.",
});

const DECISION_REASON_ORDER = Object.freeze([
  "input_too_long",
  "identity_anchor",
  "third_party_identity",
  "commercial_integrity",
  "pricing",
  "encoded_instruction",
  "internal_exfil",
  "third_party_access",
  "capability_truth",
  "output_budget",
  "safety",
  "medical",
  "medical_policy_ack",
  "company_profile",
  "company_services",
  "service_smart_homes",
  "solar_services",
  "service_rnd",
  "service_automation",
  "service_machine_design",
  "service_cabling",
  "service_software",
  "service_fire",
  "service_security",
  "quote_intake",
  "quote_followup",
  "conversation_identity",
  "off_domain",
]);

function uniqueReasons(reasons) {
  const unique = new Set(reasons.filter(Boolean));
  return DECISION_REASON_ORDER.filter((reason) => unique.has(reason));
}

function composeFixedReply(reasons) {
  const ordered = uniqueReasons(reasons);
  if (ordered.includes("input_too_long")) return FIXED_REPLIES.input_too_long;

  // A concrete Paradox pricing refusal already expresses the commercial boundary.
  const compact = ordered.filter(
    (reason) => !(reason === "commercial_integrity" && ordered.includes("pricing")),
  );
  const meaningful = compact.filter(
    (reason) => !(reason === "off_domain" && compact.length > 1),
  );
  return meaningful
    .map((reason) => FIXED_REPLIES[reason])
    .filter(Boolean)
    .join(" ") || FIXED_REPLIES.post_block;
}


function formatUserName(value) {
  const particles = new Set(["de", "del", "la", "las", "los", "y"]);
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLocaleLowerCase("es-MX");
      if (index > 0 && particles.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("es-MX") + lower.slice(1);
    })
    .join(" ");
}

function cleanUserName(value) {
  const cleaned = String(value || "")
    .replace(/[^\p{L}\p{M}' -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > 80) return null;

  const disallowed = /^(godelin|tu asistente|el asistente|fundador|propietario|ingeniero|administrador|director|presidente|usuario)$/i;
  if (disallowed.test(cleaned)) return null;
  return formatUserName(cleaned);
}

export function extractExplicitUserName(history = []) {
  const turns = Array.isArray(history) ? history : [];
  let found = null;
  let previousAssistantAskedForName = false;

  for (const item of turns) {
    const role = item?.role;
    const text = String(item?.content || "").trim();
    if (!text) continue;

    if (role === "assistant") {
      previousAssistantAskedForName = RE.asksForUserName.test(text);
      continue;
    }
    if (role !== "user") continue;

    const nameOnlyText = text.replace(/\s+y\s+mi\s+c[oó]digo(?:\s+temporal)?\b.*$/iu, "");
    const direct = nameOnlyText.match(/\b(?:me llamo|mi nombre es)\s+([\p{L}\p{M}'-]+(?:\s+[\p{L}\p{M}'-]+){0,3})/iu);
    if (direct) {
      const candidate = cleanUserName(direct[1]);
      if (candidate) found = candidate;
      previousAssistantAskedForName = false;
      continue;
    }

    const selfIntroduction = text.match(/\bsoy\s+([A-ZÁÉÍÓÚÜÑ][\p{L}\p{M}'-]+(?:\s+[A-ZÁÉÍÓÚÜÑ][\p{L}\p{M}'-]+){0,3})(?=\s*[,.;]|$)/iu);
    if (selfIntroduction) {
      const candidate = cleanUserName(selfIntroduction[1]);
      if (candidate) found = candidate;
      previousAssistantAskedForName = false;
      continue;
    }

    if (previousAssistantAskedForName) {
      const standalone = text.match(/^([\p{L}\p{M}'-]+(?:\s+[\p{L}\p{M}'-]+){0,3})[.!]?$/u);
      if (standalone) {
        const candidate = cleanUserName(standalone[1]);
        if (candidate) found = candidate;
      }
    }
    previousAssistantAskedForName = false;
  }
  return found;
}

export function extractTemporalCode(history = []) {
  const turns = Array.isArray(history) ? history : [];
  let found = null;
  for (const item of turns) {
    if (item?.role !== "user") continue;
    const text = String(item?.content || "");
    const match = text.match(/\b(?:mi\s+)?c[oó]digo(?:\s+temporal)?\s+(?:es|:)\s*([A-Z0-9][A-Z0-9_-]{3,63})\b/i);
    if (match) found = match[1];
  }
  return found;
}

function conversationIdentityAndCodeReply(history = []) {
  const name = extractExplicitUserName(history);
  const code = extractTemporalCode(history);
  if (name && code) return `Me indicaste que te llamas ${name} y que tu código temporal es ${code}.`;
  if (name) return `Me indicaste que te llamas ${name}, pero no tengo un código temporal declarado en esta sesión.`;
  if (code) return `No tengo un nombre declarado en esta sesión. Tu código temporal es ${code}.`;
  return "No me has indicado tu nombre ni un código temporal en esta conversación.";
}

function conversationIdentityReply(history = []) {
  const name = extractExplicitUserName(history);
  if (!name) return FIXED_REPLIES.conversation_identity_unknown;
  return `Me indicaste que te llamas ${name}. Mi nombre es Godelin; nuestras identidades son distintas.`;
}


function conversationRecallReply(history = []) {
  const turns = Array.isArray(history) ? history : [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const item = turns[index];
    if (item?.role !== "user") continue;
    const content = String(item.content || "").trim();
    if (!content) continue;
    return `Antes me dijiste: “${content.slice(0, 500)}”`;
  }
  return "No tengo un turno anterior disponible en esta sesión.";
}

function recentConversationText(history = [], maxTurns = 8) {
  if (!Array.isArray(history)) return "";
  return history
    .slice(-maxTurns)
    .map((item) => String(item?.content || ""))
    .join(" ");
}

function conversationContextFlags(history = []) {
  const text = recentConversationText(history);
  return {
    paradoxCommercial:
      RE.paradoxDomain.test(text) ||
      RE.companyServicesAsk.test(text) ||
      RE.companyProfileAsk.test(text) ||
      RE.solarServicesAsk.test(text) ||
      RE.quoteRequest.test(text),
    quoteActive:
      RE.quoteRequest.test(text) ||
      /no puedo (?:calcular ni )?confirmar precios|cotizaci[oó]n formal|propuesta formal|whatsapp \+526122173332/i.test(text),
  };
}

function collectDecisionReasons(flags, context = {}) {
  if (flags.inputTooLong) return ["input_too_long"];

  const reasons = [];
  if (flags.roleHijack) reasons.push("identity_anchor");
  if (flags.thirdPartyImpersonation) reasons.push("third_party_identity");
  if (flags.unauthorizedThirdPartyPromotion || (flags.thirdParty && flags.commercialCommitment)) {
    reasons.push("commercial_integrity");
  }
  if (flags.quoteRequest || (flags.pricing && (flags.paradoxDomain || context.paradoxCommercial))) {
    reasons.push("pricing");
  }
  if (flags.encodedInstruction) reasons.push("encoded_instruction");
  if (flags.exfil) reasons.push("internal_exfil");
  if (flags.thirdPartyAccessFacilitation) reasons.push("third_party_access");
  if (flags.capabilityRequest) reasons.push("capability_truth");
  if (flags.outputFlood) reasons.push("output_budget");
  if (flags.dangerous) reasons.push("safety");
  if (flags.medical) reasons.push("medical");

  if (
    reasons.length === 0 &&
    (flags.clearlyOffDomain || (flags.genericTutorial && !flags.paradoxDomain))
  ) {
    reasons.push("off_domain");
  }
  return uniqueReasons(reasons);
}

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
  const serviceKey = detectServiceKey(source);
  const serviceDetailAsk = Boolean(serviceKey && RE.serviceDetailIntent.test(source));
  return {
    inputTooLong: source.length > DEFAULTS.max_input_chars,
    injection: RE.injection.test(source) || RE.codeFence.test(source),
    encodedInstruction: RE.encodedInstruction.test(source),
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
    externalAction:
      RE.externalAction.test(source) && !RE.draftingOnly.test(source),
    capabilityRequest:
      RE.artifactRequest.test(source) ||
      (RE.externalAction.test(source) && !RE.draftingOnly.test(source)) ||
      RE.asyncPromise.test(source),
    outputFlood: RE.outputFlood.test(source),
    dangerous: RE.dangerous.test(source),
    medical:
      (RE.medicalTopic.test(source) && RE.medicalAdvice.test(source)) ||
      RE.personalMedical.test(source),
    pricing: RE.pricing.test(source),
    formalContact: RE.formalContact.test(source),
    quoteRequest: RE.quoteRequest.test(source),
    quoteData: RE.quoteData.test(source),
    solarServicesAsk: RE.solarServicesAsk.test(source),
    serviceKey,
    serviceDetailAsk,
    paradoxDomain: RE.paradoxDomain.test(source),
    genericTutorial: RE.genericTutorial.test(source),
    clearlyOffDomain: RE.clearlyOffDomain.test(source),
    companyServicesAsk: RE.companyServicesAsk.test(source),
    companyProfileAsk: RE.companyProfileAsk.test(source),
    normalized: normalizeText(source),
  };
}

export function requiredRulesForMessage(message, flags = classifyUserMessage(message)) {
  const required = new Set(ALWAYS_REQUIRED_RULES);

  if (flags.thirdParty || flags.roleHijack) required.add("THIRD-PARTY-AUTHORITY");
  if (flags.adminAccess || flags.sensitiveEvidence || flags.socialEngineering) required.add("ADMIN-ACCESS");
  if (flags.promotion || flags.commercialCommitment || flags.pricing || flags.quoteRequest) required.add("COMMERCIAL-INTEGRITY");
  if (flags.capabilityRequest) required.add("CAPABILITY-TRUTH");
  if (flags.outputFlood) required.add("OUTPUT-BUDGET");
  if (flags.dangerous) required.add("SAFETY-BOUNDARY");
  if (flags.medical) required.add("MEDICAL-BOUNDARY");
  if (flags.pricing || flags.quoteRequest) required.add("PARADOX-PRICING");
  if (flags.formalContact || flags.pricing || flags.quoteRequest) required.add("FORMAL-CONTACT");
  if (flags.paradoxDomain || flags.companyServicesAsk || flags.companyProfileAsk) {
    required.add("SCOPE-PUBLIC");
  }
  if (flags.companyServicesAsk) required.add("COMPANY-SERVICES");
  if (flags.serviceDetailAsk && flags.serviceKey) {
    const serviceRuleId = SERVICE_RULE_IDS[flags.serviceKey];
    if (serviceRuleId) required.add(serviceRuleId);
  } else if (flags.solarServicesAsk) {
    required.add("COMPANY-SERVICES");
    required.add("SERVICE-SOLAR");
  }
  if (flags.companyProfileAsk) {
    required.add("COMPANY-CLAIMS");
    required.add("COMPANY-SERVICES");
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
    const criticality = required.has(record.rule_id)
      ? record.critical
        ? 1.18
        : 1.1
      : 0.82;

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
      .filter((record) => record.rule_id === ruleId)
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

export function decide(message, cfg = {}) {
  const source = String(message ?? "");
  const flags = classifyUserMessage(source);
  // PRS-VPP context selection is always executed, including deterministic blocks.
  // Oversized input is truncated only for selection; the policy decision still sees its full length.
  const selectionInput = source.slice(0, DEFAULTS.max_input_chars);
  const contextSelection = selectGovernedContext(selectionInput, cfg);
  const conversationContext = conversationContextFlags(cfg.history || []);
  const reasons = collectDecisionReasons(flags, conversationContext);

  if (RE.medicalPolicyStatement.test(source)) {
    return {
      mode: "fixed_reply",
      reason: "medical_policy_ack",
      reasons: ["medical_policy_ack"],
      reply: FIXED_REPLIES.medical_policy_ack,
      flags,
      contextSelection,
      maxOutputTokens: DEFAULTS.constrained_max_output_tokens,
    };
  }

  if (RE.asksUserNameAndCode.test(source)) {
    return {
      mode: "fixed_reply",
      reason: "conversation_identity",
      reasons: ["conversation_identity"],
      reply: conversationIdentityAndCodeReply(cfg.history || []),
      flags,
      contextSelection,
      maxOutputTokens: DEFAULTS.constrained_max_output_tokens,
    };
  }

  if (RE.asksUserName.test(source)) {
    return {
      mode: "fixed_reply",
      reason: "conversation_identity",
      reasons: ["conversation_identity"],
      reply: conversationIdentityReply(cfg.history || []),
      flags,
      contextSelection,
      maxOutputTokens: DEFAULTS.constrained_max_output_tokens,
    };
  }

  if (RE.asksPreviousStatement.test(source)) {
    const recallReasons = [];
    if (flags.pricing) recallReasons.push("pricing");
    else if (flags.promotion || flags.commercialCommitment) recallReasons.push("commercial_integrity");
    if (flags.exfil) recallReasons.push("internal_exfil");
    if (flags.capabilityRequest) recallReasons.push("capability_truth");
    if (flags.medical) recallReasons.push("medical");

    const replyParts = [conversationRecallReply(cfg.history || [])];
    if (recallReasons.length) replyParts.push(composeFixedReply(recallReasons));

    return {
      mode: "fixed_reply",
      reason: "conversation_recall",
      reasons: ["conversation_recall", ...uniqueReasons(recallReasons)],
      reply: replyParts.join(" "),
      flags,
      contextSelection,
      maxOutputTokens: DEFAULTS.constrained_max_output_tokens,
    };
  }

  if (flags.serviceDetailAsk && flags.serviceKey) {
    const reasonByService = {
      smart_homes: "service_smart_homes",
      solar: "solar_services",
      rnd: "service_rnd",
      automation: "service_automation",
      machine_design: "service_machine_design",
      cabling: "service_cabling",
      software: "service_software",
      fire: "service_fire",
      security: "service_security",
    };
    const serviceReason = reasonByService[flags.serviceKey];
    if (serviceReason && FIXED_REPLIES[serviceReason]) {
      return {
        mode: "fixed_reply",
        reason: serviceReason,
        reasons: [serviceReason],
        reply: FIXED_REPLIES[serviceReason],
        flags,
        contextSelection,
        maxOutputTokens: DEFAULTS.constrained_max_output_tokens,
      };
    }
  }

  if (flags.solarServicesAsk) {
    return {
      mode: "fixed_reply",
      reason: "solar_services",
      reasons: ["solar_services"],
      reply: FIXED_REPLIES.solar_services,
      flags,
      contextSelection,
      maxOutputTokens: DEFAULTS.constrained_max_output_tokens,
    };
  }

  if (conversationContext.quoteActive && flags.quoteData) {
    return {
      mode: "fixed_reply",
      reason: "quote_followup",
      reasons: ["quote_followup", "pricing"],
      reply: FIXED_REPLIES.quote_followup,
      flags,
      contextSelection,
      maxOutputTokens: DEFAULTS.constrained_max_output_tokens,
    };
  }

  if (flags.quoteRequest) {
    return {
      mode: "fixed_reply",
      reason: "quote_intake",
      reasons: ["quote_intake", "pricing"],
      reply: FIXED_REPLIES.quote_intake,
      flags,
      contextSelection,
      maxOutputTokens: DEFAULTS.constrained_max_output_tokens,
    };
  }

  // Public company facts are grounded deterministically so essential product
  // information is never displaced by security context or an upstream outage.
  if (reasons.length === 0 && flags.companyProfileAsk) {
    return {
      mode: "fixed_reply",
      reason: "company_profile",
      reasons: ["company_profile"],
      reply: FIXED_REPLIES.company_profile,
      flags,
      contextSelection,
      maxOutputTokens: DEFAULTS.constrained_max_output_tokens,
    };
  }

  if (reasons.length === 0 && flags.companyServicesAsk) {
    return {
      mode: "fixed_reply",
      reason: "company_services",
      reasons: ["company_services"],
      reply: FIXED_REPLIES.company_services,
      flags,
      contextSelection,
      maxOutputTokens: DEFAULTS.constrained_max_output_tokens,
    };
  }

  if (reasons.length > 0) {
    const mode = reasons.includes("off_domain")
      ? "redirect"
      : reasons.includes("safety") || reasons.includes("medical")
        ? "block"
        : "fixed_reply";
    return {
      mode,
      reason: reasons[0],
      reasons,
      reply: composeFixedReply(reasons),
      flags,
      contextSelection,
      maxOutputTokens: DEFAULTS.constrained_max_output_tokens,
    };
  }

  return {
    mode: "llm",
    reason: "normal",
    reasons: [],
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
  const conversationContext = conversationContextFlags(cfg.history || []);

  if (!source) {
    return {
      allowed: false,
      reason: "empty_output",
      reasons: ["empty_output"],
      output: FIXED_REPLIES.post_block,
    };
  }

  const auditReasons = [];
  if (source.length > settings.max_output_chars) auditReasons.push("output_budget");

  const governedLeak =
    /CONTEXTO GOBERNADO|IDENTIDAD: Soy Godelin|CONFIDENCIALIDAD: No revelar|•\s*\[(identity|scope|confidentiality|authority|access|commercial|capability|resources|pricing|contact|safety)\]/i.test(
      source,
    );
  if (governedLeak) auditReasons.push("governed_context_leak");

  const impersonation =
    /soy\s+(el\s+)?asistente oficial de|somos\s+(baja ferries|xerox|electroneek)|en nombre de\s+(baja ferries|xerox|electroneek)|presidente\s*[—-]\s*(baja ferries|xerox|electroneek)/i.test(
      source,
    );
  if (impersonation) auditReasons.push("third_party_impersonation");

  const accessFacilitation =
    (RE.adminAccess.test(source) || RE.sensitiveEvidence.test(source)) &&
    (flags.thirdParty || flags.socialEngineering || /solicito|entrega|adjunta|proporciona|compartir/i.test(source));
  if (accessFacilitation) auditReasons.push("access_facilitation");

  const promotion = RE.promotion.test(source);
  if (promotion && (flags.thirdParty || flags.promotion || RE.thirdPartyBrand.test(source))) {
    auditReasons.push("unauthorized_promotion");
  }

  const capabilityOverclaim =
    RE.asyncPromise.test(source) ||
    /he creado|ya gener[eé]|archivo listo|descarga aqu[ií]|enlace funcional|te adjunto/i.test(source);
  if (capabilityOverclaim) auditReasons.push("capability_overclaim");

  const numericCommercialEstimate =
    /(?:\$\s*|\b)(?:\d{1,3}(?:[.,]\d{3})+|\d{4,})(?:\s*(?:-|a|y)\s*(?:\$\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d{4,}))?\s*(?:pesos?|mxn|usd|d[oó]lares?)\b/i.test(source) ||
    /(?:podr[ií]a costar|costar[ií]a entre|costo aproximado|precio estimado|rango de precios?)\s+[^.]{0,80}\d/i.test(source);
  if (
    numericCommercialEstimate &&
    (flags.quoteRequest || flags.paradoxDomain || conversationContext.paradoxCommercial || conversationContext.quoteActive)
  ) {
    auditReasons.push("paradox_pricing");
  }

  if (RE.outputFlood.test(source)) auditReasons.push("output_flood");
  if (flags.exfil && RE.exfilTarget.test(source)) auditReasons.push("internal_exfil");

  const uniqueAuditReasons = [...new Set(auditReasons)];
  if (uniqueAuditReasons.length > 0) {
    const mappedReasons = uniqueAuditReasons.map((reason) => {
      if (reason === "governed_context_leak" || reason === "internal_exfil") return "internal_exfil";
      if (reason === "third_party_impersonation") return "third_party_identity";
      if (reason === "access_facilitation") return "third_party_access";
      if (reason === "unauthorized_promotion") return "commercial_integrity";
      if (reason === "paradox_pricing") return "pricing";
      if (reason === "capability_overclaim") return "capability_truth";
      if (reason === "output_flood") return "output_budget";
      return reason;
    });
    return {
      allowed: false,
      reason: uniqueAuditReasons[0],
      reasons: uniqueAuditReasons,
      output: composeFixedReply(mappedReasons),
    };
  }

  return { allowed: true, reason: "clean", reasons: [], output: source };
}

export function getGovernorDefaults() {
  return { ...DEFAULTS };
}
