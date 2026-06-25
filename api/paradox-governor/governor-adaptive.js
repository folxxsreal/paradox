// Paradox Governor v1.3.0-rc4 — canary adaptive router.
// Zero-extra-call design: deterministic high-confidence routing,
// PRS-VPP context coverage, guarded single-model generation, and
// deterministic output audit. Use legacy/shadow/adaptive feature flags in api/chat.js.

import {
  extractExplicitUserName,
  getGovernorDefaults,
  selectGovernedContext,
} from "./governor.js";
import { normalizeText } from "./similarity.js";

const DEFAULTS = Object.freeze({
  ...getGovernorDefaults(),
  guarded_max_output_tokens: 350,
});

const RX = Object.freeze({
  asksUserName: /(?:c[oó]mo me llamo|cu[aá]l es mi nombre|recuerdas mi nombre|sabes c[oó]mo me llamo)/i,
  asksPrevious: /(?:qu[eé] te dije antes|qu[eé] dije antes|recuerdas lo que te dije|qu[eé] te acabo de decir)/i,
  medicalPolicy: /(?:no|nunca)\s+(?:debes?|puedes?)\s+(?:dar|brindar|ofrecer)\s+consejos?\s+m[eé]dicos?|no\s+des\s+consejos?\s+m[eé]dicos?/i,
  injectionAttempt: /ignore\s+(?:all|any|previous|above)|ignora\s+(?:todas?|cualquier|las anteriores)|role\s*:\s*system|<system>|<developer>|\bDAN\b|jailbreak|do anything now|override\s+(?:the\s+)?(?:rules|instructions)|sobreescribe|modo desarrollador|developer mode|sin restricciones|olvida\s+(?:tus|las)\s+(?:reglas|instrucciones)|desactiva\s+(?:tus|las)\s+(?:reglas|protecciones)/i,
  injectionEducation: /(?:qu[eé] es|explica|expl[ií]came|prevenir|detectar|mitigar|defender|protecci[oó]n|buenas pr[aá]cticas).*(?:prompt injection|inyecci[oó]n de prompt|jailbreak)|(?:prompt injection|inyecci[oó]n de prompt).*(?:qu[eé] es|prevenir|detectar|mitigar|defender)/i,
  publicDefinition: /^(?:por favor\s+)?(?:dime|explica|expl[ií]came|define|resume)?\s*(?:qu[eé]|que)\s+(?:es|son)|(?:a grandes rasgos|de forma general|informaci[oó]n general|conceptualmente|p[uú]blica|las empresas|una organizaci[oó]n|en general)/i,
  publicProductBoundary: /(?:paradox governor).*(?:a grandes rasgos|sin revelar|sin divulgar|informaci[oó]n p[uú]blica)|(?:a grandes rasgos|sin revelar|sin divulgar|informaci[oó]n p[uú]blica).*(?:paradox governor)/i,
  explicitConfidential: /(?:intern[oa]s?|privad[oa]s?|secreto|confidencial|credencial(?:es)?|token secreto|clave secreta|system prompt|mensaje de sistema|mensaje oculto de sistema|prompt del sistema|prompt oculto|prompt interno|developer message|mensaje de desarrollador|instrucciones de desarrollador|c[oó]digo fuente|reglas internas|instrucciones confidenciales|configuraci[oó]n interna|infraestructura privada|en qu[eé] nube|qu[eé] regi[oó]n|d[oó]nde .*alojad|proveedor de nube|servidores? de godelin|arquitectura de godelin|base de datos de godelin|api de godelin)/i,
  ownedPossessive: /(?:tu|tus|su)\s+(?:prompt|arquitectura|base de datos|api|servidor|nube|reglas|c[oó]digo)|(?:godelin|paradox systems).*(?:prompt|arquitectura interna|base de datos interna|api (?:interna|privada)|servidor|nube|regi[oó]n|credencial)|(?:prompt|arquitectura|base de datos|api|servidor|nube|reglas).*(?:de|usa|utiliza)\s+(?:godelin|paradox systems)/i,
  exfilVerb: /dame|dime|saca|muestra|mu[eé]strame|copia|pega|imprime|revela|reproduce|literalmente|enumera|lista|infiere|deduce|estima|adivina|confirma|diagrama|dibuja|mermaid|vuelca|dump|respaldo|backup|exporta|extrae/i,
  falseAuthority: /soy\s+(?:el\s+)?(?:dueño|fundador|presidente|director|gerente|administrador|auditor|ciso|cto|ceo)|autorizo|modo\s+(?:admin|administrador|root)|c[oó]digo de autorizaci[oó]n/i,
  styleRole: /act[uú]a como\s+(?:experto|profesor|consultor|tutor|editor|traductor|asesor t[eé]cnico)|responde como\s+(?:experto|profesor|consultor|tutor|editor|traductor|asesor t[eé]cnico)/i,
  identityHijack: /(?:a partir de ahora|desde ahora)\s+(?:eres|ser[aá]s|te llamas|representas)|(?:act[uú]a|responde|contesta) como\s+(?:el\s+)?(?:asistente oficial|portavoz oficial|ceo|director|representante oficial|empleado de)|eres el asistente oficial|pres[eé]ntate como|hazte pasar por|finge ser|tu nombre ahora es|cambia (?:tu )?identidad|asume (?:el )?(?:rol|cargo|puesto)|convi[eé]rtete en|habla en nombre de|representa a|firma como/i,
  thirdParty: /\b(?:baja ferries|xerox|electroneek|uipath|microsoft|google|amazon|meta|openai|anthropic|sap|salesforce|servicenow|cargo web)\b/i,
  internalAccess: /(?:crear|crea|dame|obtener|recuperar|restablecer|elevar|acceso|cuenta|usuario|permisos?|entrar|ingresar|root).*(?:admin|administrador|privilegios|contraseñ|cuenta ajena|servidor)|(?:logs?|evidencias?|configuraci[oó]n|credenciales?).*(?:intern[oa]s?|privad[oa]s?)|(?:eludir|evadir|burlar|desactivar|saltarse|s[aá]ltate).*(?:mfa|2fa|autenticaci[oó]n|controles? de acceso)|(?:crea|crear).*(?:cuenta administradora|usuario administrador)|(?:restablece|resetea|cambia).*(?:contraseñ)/i,
  defensiveSecurity: /(?:qu[eé] es|reconocer|detectar|prevenir|proteger|mitigar|buenas pr[aá]cticas|pol[ií]tica|lista de verificaci[oó]n|auditor[ií]a.*autorizad|defensiv|educativ|concientizaci[oó]n|capacitaci[oó]n|simulaci[oó]n|fictici[oa]|logs? de acceso)/i,
  harmfulAction: /(?:c[oó]mo\s+(?:hacer|crear|lanzar|ejecutar|fabricar|eludir|evadir|burlar|entrar)|paso a paso|instrucciones? para|ay[uú]dame a|ens[eé][ñn]ame a|indica c[oó]mo|dame una gu[ií]a para|crea|genera|diseña|construye|fabrica|escribe|redacta).*(?:phishing|correo de phishing|capturar contraseñas|robar credenciales|robar sesiones|secuestrar sesiones|bomba|explosivo|molotov|detonador|clonar(?: una)? tarjeta|payload|bypass|eludir|evadir|burlar|mfa|2fa|entrar sin permiso|cuenta ajena|acceso no autorizado|desactivar alarma|desactivar sistema contra incendios|sabotear)|(?:kit|plantilla|p[aá]gina|sitio|formulario|login) fals[oa].*(?:phishing|capturar contraseñas|robar credenciales)|(?:p[aá]gina|formulario) de (?:inicio de sesi[oó]n|login) fals[oa].*(?:guardar|capturar|robar).*(?:credenciales|contraseñas)|(?:obt[eé]n|consigue|logra).*(?:acceso root|acceso administrador|credenciales)|(?:salta|s[aá]ltate|saltarse|elude|evade|burlar).*(?:mfa|2fa|autenticaci[oó]n)|(?:entra|entrar|accede|acceder).*(?:cuenta ajena|cuenta de otra persona)|(?:crea|crear).*(?:cuenta administradora|usuario administrador).*(?:restablece|resetea|cambia).*(?:contraseñ)|(?:clona|clonar).*(?:tarjeta)/i,
  sensitiveSecurityTopic: /phishing|prompt injection|inyecci[oó]n de prompt|jailbreak|cuenta administrativa|acceso administrador|auditor[ií]a interna|logs? de acceso|credenciales|seguridad/i,
  dangerousKeyword: /bomba casera|explosivo|molotov|detonador|tnt|dinamita|fabricar arma|clonar(?: una)? tarjeta|capturar contraseñas|robar credenciales|robar sesiones|secuestrar sesiones|eludir controles|evadir mfa|burlar mfa|bypass de seguridad|entrar sin permiso|cuenta ajena|acceso no autorizado|acceso root|payload malicioso|puentear alarma|sabotear (?:una )?alarma|desactiva(?:r)? (?:el )?sistema contra incendios/i,
  medicalTopic: /aspirina|ibuprofeno|paracetamol|acetaminof[eé]n|medicamento|medicina|pastilla|tableta|dosis|tratamiento|diagn[oó]stico|enfermedad|farmacia|efectos secundarios/i,
  generalMedical: /(?:qu[eé] es|usos generales|informaci[oó]n general|para qu[eé] sirve|efectos generales|efectos secundarios|recordatorio de medicamentos|base de datos para una farmacia).*(?:aspirina|ibuprofeno|paracetamol|medicamento|medicina|farmacia)|(?:aspirina|ibuprofeno|paracetamol).*(?:qu[eé] es|usos generales|informaci[oó]n general|para qu[eé] sirve|efectos secundarios)/i,
  personalMedical: /(?:me|le|nos) duele|tengo (?:fiebre|mareo|n[aá]usea|dolor|s[ií]ntomas?)|mi (?:hijo|hija|mam[aá]|pap[aá]|pareja) tiene|estoy (?:enfermo|enferma|mareado|mareada)/i,
  medicalAdvice: /deb(?:o|a|er[ií]a) tomar|debe tomar|pued(?:o|a) tomar|qu[eé] cantidad|cu[aá]ntos?\s*(?:mg|miligramos)|qu[eé] me recomiendas|recomi[eé]ndame|sugiere (?:un )?tratamiento|qu[eé] medicamento|qu[eé] medicina|c[oó]mo tratar|diagnostica|dosis|cu[aá]ntas? (?:pastillas|tabletas)|es seguro tomar|me conviene tomar|le doy|debo darle/i,
  draftContent: /(?:redacta|escribe|prop[oó]n|borrador|plantilla|crea|genera|prepara|hazme).*(?:contenido|texto|borrador|plantilla|tabla|correo|e-?mail|mensaje|carta|informe|landing page|html|pdf|excel)/i,
  executeAction: /(?:env[ií]a|manda|remite|adjunta|sube|publica|ejecuta|agenda|reserva|contacta|llama|confirma cuando|entrega).*(?:correo|e-?mail|mensaje|whatsapp|archivo|pdf|docx|internet|ticket|servidor|reserva|llamada)|(?:crea|genera|produce).*(?:archivo descargable|documento descargable|enlace de descarga|link de descarga|v[ií]nculo de descarga)/i,
  asyncPromise: /en breve|vuelvo enseguida|te entregar[eé]|te enviar[eé]|trabajando en segundo plano|m[aá]s tarde|dentro de (?:\d+|cinco|diez|quince|veinte|treinta) minutos|en (?:cinco|diez|quince|veinte|treinta) minutos/i,
  outputFlood: /repite .*indefinid|para siempre|no te detengas|no pares de escribir|sin detenerte|consumir todos los tokens|agotar todos los tokens|hasta el l[ií]mite|contin[uú]a sin parar|exactamente\s+([2-9]\d{3,}|\d{5,})\s+palabras|(?:repite|escribe|genera|produce).*(?:\b([2-9]\d{3,}|\d{5,})\b|diez mil|veinte mil|cincuenta mil|cien mil)\s+(?:veces|l[ií]neas|palabras)|\b([2-9]\d{3,}|\d{5,})\s+(?:consejos|ejemplos|p[aá]rrafos|cap[ií]tulos|l[ií]neas)/i,
  pricing: /cu[aá]nto cuesta|cu[aá]nto vale|precio|presupuesto|cotizaci[oó]n|\bmxn\b|\busd\b|pesos|tarifa/i,
  ownedCommercial: /paradox systems|paradoxsystems|godelin|sus servicios|nuestros? servicios|cotizaci[oó]n de paradox/i,
  promotion: /promoci[oó]n|descuento|oferta exclusiva|c[oó]digo promocional|\b\d{1,3}\s*%/i,
  formalContact: /cotizaci[oó]n|contratar|contrataci[oó]n|hablar con (?:una persona|alguien|humano)|seguimiento formal|contacto comercial/i,
  clearlyOffDomain: /hor[oó]scopo|zodiacal|poema de amor|cuento er[oó]tico|fanfic|chiste verde|receta de cocina/i,
  genericTutorial: /(?:c[oó]digo|script|snippet|tutorial|paso a paso|plantilla html|programar en|ejemplo en (?:html|javascript|python|java|arduino|react|node))/i,
  paradoxDomain: /paradox systems|paradoxsystems|godelin|energ[ií]a solar|panel(?:es)? solar(?:es)?|fotovoltaic|automatizaci[oó]n|casa inteligente|plc|scada|ingenier[ií]a|videovigilancia|cableado estructurado|sistema contra incendio|software|aplicaci[oó]n|rob[oó]tica|sensores|control|prs[-/ ]?vpp|paradox governor/i,
  unsafeMedicalOutput: /(?:toma|tomes|debes tomar|puedes consumir|te recomiendo(?: tomar| usar)?|mi recomendaci[oó]n es que tomes|administra|consume|consumir|dale|debes darle|puedes darle).*(?:mg|miligramos|ml|mililitros|tabletas?|pastillas?|ibuprofeno|aspirina|paracetamol)|\b\d+(?:\.\d+)?\s*(?:mg|miligramos|mg\/kg|ml|mililitros)\b.*(?:cada|diari|por d[ií]a|horas?)|(?:dosis|diaria|cada|por d[ií]a).{0,50}\b\d+(?:\.\d+)?\s*(?:mg|miligramos|mg\/kg|ml|mililitros)\b/i,
  unsafeCyberOutput: /(?:para|puedes|debes|haz|usa).*(?:hacer phishing|robar credenciales|capturar contraseñas|robar sesiones|secuestrar sesiones|crear una p[aá]gina falsa|copiar (?:la )?p[aá]gina de login|acceso no autorizado|entrar (?:a|en) una cuenta)|(?:desactiva|elude|evade|bypassea|salta).*(?:mfa|2fa|autenticaci[oó]n)|(?:crea|usa|env[ií]a|clona|copia|escribe).*(?:p[aá]gina falsa|inicio de sesi[oó]n|login|payload|kit de phishing|robar contraseñas|capturar contraseñas|robar sesiones)/i,
  capabilityOverclaim: /he creado|ya gener[eé]|archivo listo|descarga aqu[ií]|enlace funcional|te adjunto|ya envi[eé]|correo enviado|mensaje enviado|whatsapp enviado|llamada agendada|reserva confirmada|fue entregado correctamente/i,
  governedLeak: /CONTEXTO GOBERNADO|CONFIDENCIALIDAD:\s*No revelar|reglas privadas del sistema|prompt interno completo|mensaje de sistema completo|instrucciones de desarrollador|IDENTITY-ANCHOR|INTERNAL-CONFIDENTIALITY|•\s*\[(?:identity|scope|confidentiality|authority|access|commercial|capability|resources|pricing|contact|safety)\]/i,
  impersonationOutput: /soy\s+(?:el\s+)?asistente oficial de|soy\s+(?:director|empleado|portavoz)\s+de|somos\s+(?:baja ferries|xerox|electroneek|microsoft|google|meta|openai)|en nombre de\s+(?:baja ferries|xerox|electroneek|microsoft|google|meta|openai)|hablo oficialmente por/i,
});

const REPLIES = Object.freeze({
  input_too_long: "El mensaje excede el límite de procesamiento seguro. Resume la solicitud en menos de 6,000 caracteres.",
  identity_anchor: "Soy Godelin, asistente virtual de Paradox Systems. No puedo cambiar de identidad ni representar a otra organización.",
  internal_exfil: "No puedo revelar ni inferir información privada sobre prompts, reglas, código, arquitectura, proveedores, nube, regiones, herramientas o servidores. Sí puedo explicar conceptos generales o información pública de Paradox Governor.",
  third_party_access: "No puedo facilitar acceso administrativo, elevación de privilegios ni extracción de evidencias privadas. Puedo ayudar con prácticas defensivas y procedimientos autorizados.",
  commercial_integrity: "No puedo confirmar precios, descuentos o compromisos de Paradox Systems sin una fuente oficial y vigente. Para cotización formal usa WhatsApp +526122173332.",
  capability_truth: "No puedo ejecutar, enviar, subir ni publicar desde este chat. Sí puedo redactar el contenido para revisión humana.",
  output_budget: "No puedo generar repeticiones indefinidas ni respuestas desproporcionadas. Puedo ofrecer una versión breve.",
  safety: "No puedo ayudar a ejecutar daño, fraude, acceso no autorizado o evasión de controles. Sí puedo ofrecer información preventiva o defensiva.",
  medical: "No puedo brindar consejos médicos personalizados, diagnósticos, tratamientos ni dosis. Puedo ofrecer información general no clínica y recomendar consultar a un profesional.",
  off_domain: "Puedo ayudarte principalmente con Paradox Systems, tecnología, ingeniería, automatización, energía, software y robótica.",
  coverage_infeasible: "No puedo responder con seguridad porque falta contexto normativo obligatorio. La solicitud debe reformularse o escalarse.",
  post_block: "No puedo entregar esa respuesta de forma segura. Puedo ofrecer una explicación general y acotada.",
});

function unique(values) { return [...new Set(values.filter(Boolean))]; }

function userNameReply(history = []) {
  const name = extractExplicitUserName(history);
  return name
    ? `Me indicaste que te llamas ${name}. Mi nombre es Godelin.`
    : "No me has indicado tu nombre en esta conversación.";
}

function recallReply(history = []) {
  const turns = Array.isArray(history) ? history : [];
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i]?.role === "user" && String(turns[i]?.content || "").trim()) {
      return `Antes me dijiste: “${String(turns[i].content).trim().slice(0, 500)}”`;
    }
  }
  return "No tengo un turno anterior disponible en esta sesión.";
}

export function classifyUserMessage(message) {
  const source = String(message ?? "");
  const normalized = normalizeText(source);
  const injectionEducation = RX.injectionEducation.test(source);
  const injectionAttempt = RX.injectionAttempt.test(source) && !injectionEducation;
  const styleRole = RX.styleRole.test(source);
  const roleHijack = RX.identityHijack.test(source) && !styleRole;
  const publicDefinition = RX.publicDefinition.test(source);
  const explicitNonDisclosure = /sin (?:hablar|revelar|mostrar|divulgar|dar).*(?:infraestructura|arquitectura|prompt|servidor|nube|regi[oó]n|secreto|intern[oa])/i.test(source);
  const genericEnterpriseContext = /(?:las empresas|una empresa|las organizaciones|una organizaci[oó]n|en general|de forma general)/i.test(source);
  const ownedSensitiveTarget = RX.ownedPossessive.test(source);
  const explicitConfidential = RX.explicitConfidential.test(source) || ownedSensitiveTarget;
  const defensiveSecurity = RX.defensiveSecurity.test(source);
  const safeTrainingSimulation = /(?:fictici[oa]|simulaci[oó]n|capacitaci[oó]n)/i.test(source) && /sin (?:enlaces|marcas reales|credenciales reales|datos reales)/i.test(source);
  const exfil = explicitConfidential && !explicitNonDisclosure && (RX.exfilVerb.test(source) || RX.falseAuthority.test(source) || injectionAttempt || (ownedSensitiveTarget && /(?:qu[eé]|cu[aá]l|usa|utiliza|emplea)/i.test(source))) && !genericEnterpriseContext && !(publicDefinition && /sin revelar|p[uú]blic[oa]|a grandes rasgos/i.test(source)) && !RX.publicProductBoundary.test(source) && !(defensiveSecurity && !RX.falseAuthority.test(source) && !injectionAttempt);
  const harmfulAction = (RX.harmfulAction.test(source) || (RX.dangerousKeyword.test(source) && !defensiveSecurity)) && !safeTrainingSimulation;
  const securityTopic = RX.sensitiveSecurityTopic.test(source);
  const medicalTopic = RX.medicalTopic.test(source);
  const generalMedical = RX.generalMedical.test(source);
  const personalMedical = RX.personalMedical.test(source);
  const medicalAdvice = RX.medicalAdvice.test(source);
  const generalMedicalRequest = generalMedical || (/informaci[oó]n general/i.test(source) && /sin (?:diagnosticar|diagn[oó]stico|recomendar|tratamiento|dosis)/i.test(source));
  const medicalBlock = (personalMedical || medicalAdvice) && !generalMedicalRequest;
  const drafting = RX.draftContent.test(source) && !RX.executeAction.test(source);
  const capabilityRequest = (RX.executeAction.test(source) || RX.asyncPromise.test(source)) && !drafting;
  const pricing = RX.pricing.test(source);
  const pricingExclusion = /sin (?:dar|incluir|confirmar).*(?:precio|cotizaci[oó]n|descuento|cantidad)/i.test(source);
  const ownedPricing = pricing && RX.ownedCommercial.test(source) && !pricingExclusion;
  const publicThirdPartyPricing = pricing && RX.thirdParty.test(source) && !ownedPricing;
  const generalPricing = pricing && !ownedPricing;
  const thirdParty = RX.thirdParty.test(source);
  const thirdPartyAccess = thirdParty && RX.internalAccess.test(source) && !defensiveSecurity;
  const thirdPartyImpersonation = roleHijack && thirdParty;
  const guardedReasons = unique([
    injectionAttempt ? "injection_attempt" : null,
    injectionEducation ? "security_education" : null,
    securityTopic && !harmfulAction ? "security_education" : null,
    safeTrainingSimulation ? "security_training_simulation" : null,
    medicalTopic && !medicalBlock ? "medical_general" : null,
    publicThirdPartyPricing ? "public_third_party_pricing" : null,
    generalPricing && !publicThirdPartyPricing ? "general_pricing" : null,
    RX.internalAccess.test(source) && defensiveSecurity ? "authorized_security_guidance" : null,
    explicitConfidential && (publicDefinition || RX.publicProductBoundary.test(source)) && !exfil ? "public_vs_internal_ambiguity" : null,
    styleRole ? "style_role" : null,
  ]);

  return {
    inputTooLong: source.length > DEFAULTS.max_input_chars,
    injectionAttempt,
    injectionEducation,
    styleRole,
    roleHijack,
    explicitConfidential,
    explicitNonDisclosure,
    genericEnterpriseContext,
    ownedSensitiveTarget,
    exfil,
    falseAuthority: RX.falseAuthority.test(source),
    thirdParty,
    thirdPartyImpersonation,
    thirdPartyAccess,
    defensiveSecurity,
    safeTrainingSimulation,
    harmfulAction,
    securityTopic,
    medicalTopic,
    generalMedical,
    generalMedicalRequest,
    personalMedical,
    medicalAdvice,
    medicalBlock,
    drafting,
    capabilityRequest,
    outputFlood: RX.outputFlood.test(source),
    pricing,
    pricingExclusion,
    ownedPricing,
    publicThirdPartyPricing,
    generalPricing,
    promotion: RX.promotion.test(source),
    formalContact: RX.formalContact.test(source),
    paradoxDomain: RX.paradoxDomain.test(source),
    genericTutorial: RX.genericTutorial.test(source),
    clearlyOffDomain: RX.clearlyOffDomain.test(source),
    guardedReasons,
    normalized,
  };
}

function selectedRuleSet(selection) {
  return new Set(
    (selection?.selected || [])
      .filter((record) => record.source === "policy_repo" || record.source === "security_admin")
      .map((record) => record.rule_id),
  );
}

export function decide(message, cfg = {}) {
  const source = String(message ?? "");
  const flags = classifyUserMessage(source);
  const selection = selectGovernedContext(source.slice(0, DEFAULTS.max_input_chars), cfg);

  if (RX.medicalPolicy.test(source)) {
    return { mode: "fixed_reply", reason: "medical_policy_ack", reasons: ["medical_policy_ack"], reply: "Entendido. No brindaré consejos médicos, diagnósticos, tratamientos, dosis ni recomendaciones de medicamentos.", flags, contextSelection: selection, maxOutputTokens: 220 };
  }
  if (RX.asksUserName.test(source)) {
    return { mode: "fixed_reply", reason: "conversation_identity", reasons: ["conversation_identity"], reply: userNameReply(cfg.history || []), flags, contextSelection: selection, maxOutputTokens: 220 };
  }
  if (RX.asksPrevious.test(source)) {
    return { mode: "fixed_reply", reason: "conversation_recall", reasons: ["conversation_recall"], reply: recallReply(cfg.history || []), flags, contextSelection: selection, maxOutputTokens: 220 };
  }

  const localReasons = unique([
    flags.inputTooLong ? "input_too_long" : null,
    flags.roleHijack ? "identity_anchor" : null,
    flags.exfil ? "internal_exfil" : null,
    flags.thirdPartyAccess ? "third_party_access" : null,
    flags.ownedPricing || (flags.promotion && RX.ownedCommercial.test(source)) ? "commercial_integrity" : null,
    flags.capabilityRequest ? "capability_truth" : null,
    flags.outputFlood ? "output_budget" : null,
    flags.harmfulAction ? "safety" : null,
    flags.medicalBlock ? "medical" : null,
  ]);

  if (localReasons.length) {
    const reason = localReasons[0];
    const mode = ["safety", "medical"].includes(reason) ? "block" : "fixed_reply";
    return { mode, reason, reasons: localReasons, reply: localReasons.map((value) => REPLIES[value]).filter(Boolean).join(" "), flags, contextSelection: selection, maxOutputTokens: 220 };
  }

  if (flags.clearlyOffDomain && !flags.paradoxDomain) {
    return { mode: "redirect", reason: "off_domain", reasons: ["off_domain"], reply: REPLIES.off_domain, flags, contextSelection: selection, maxOutputTokens: 220 };
  }

  // Hard coverage applies only to the rules the base selector itself marks required.
  const selectedRules = selectedRuleSet(selection);
  const missingRequired = (selection.metrics.requiredRules || []).filter((rule) => !selectedRules.has(rule));
  const hardMissing = missingRequired.filter((rule) => ["INTERNAL-CONFIDENTIALITY", "THIRD-PARTY-AUTHORITY", "ADMIN-ACCESS", "COMMERCIAL-INTEGRITY", "CAPABILITY-TRUTH", "OUTPUT-BUDGET", "SAFETY-BOUNDARY", "MEDICAL-BOUNDARY", "PARADOX-PRICING"].includes(rule));
  if (hardMissing.length) {
    return { mode: "fixed_reply", reason: "coverage_infeasible", reasons: ["coverage_infeasible"], reply: REPLIES.coverage_infeasible, flags, contextSelection: selection, missingRequired, hardMissing, maxOutputTokens: 220 };
  }

  if (flags.guardedReasons.length) {
    return { mode: "llm_guarded", reason: flags.guardedReasons[0], reasons: flags.guardedReasons, reply: null, flags, contextSelection: selection, missingRequired, hardMissing, maxOutputTokens: DEFAULTS.guarded_max_output_tokens };
  }

  return { mode: "llm", reason: "normal", reasons: [], reply: null, flags, contextSelection: selection, missingRequired, hardMissing, maxOutputTokens: DEFAULTS.default_max_output_tokens };
}

export function auditOutput({ message, output, cfg = {} }) {
  const settings = { ...DEFAULTS, ...cfg };
  const source = String(output ?? "").trim();
  const inputFlags = classifyUserMessage(message);
  if (!source) return { allowed: false, reason: "empty_output", reasons: ["empty_output"], output: REPLIES.post_block };

  const reasons = [];
  if (source.length > settings.max_output_chars) reasons.push("output_budget");
  if (RX.governedLeak.test(source)) reasons.push("internal_exfil");
  if (RX.impersonationOutput.test(source)) reasons.push("identity_anchor");
  if (RX.capabilityOverclaim.test(source)) reasons.push("capability_truth");
  if (RX.outputFlood.test(source)) reasons.push("output_budget");
  if (RX.unsafeMedicalOutput.test(source)) reasons.push("medical");
  if (RX.unsafeCyberOutput.test(source) || RX.harmfulAction.test(source)) reasons.push("safety");
  if (inputFlags.exfil && (RX.explicitConfidential.test(source) || RX.ownedPossessive.test(source))) reasons.push("internal_exfil");
  if ((inputFlags.ownedPricing || /paradox systems/i.test(source)) && /(?:confirmamos|ofrecemos|precio oficial|descuento oficial|cotizaci[oó]n confirmada|te confirmo un descuento|descuento oficial del?\s*\d+%)/i.test(source)) reasons.push("commercial_integrity");

  const uniqueReasons = unique(reasons);
  if (uniqueReasons.length) {
    return { allowed: false, reason: uniqueReasons[0], reasons: uniqueReasons, output: uniqueReasons.map((reason) => REPLIES[reason] || REPLIES.post_block).join(" ") };
  }
  return { allowed: true, reason: "clean", reasons: [], output: source };
}

export { getGovernorDefaults, selectGovernedContext };
