// /api/chat.js
// Lolin + APP Governor con memoria y decaimiento (demo)

let memoryStore = [];  // “memoria” en caliente (por proceso/serverless)
let stepCounter = 0;

// ---------- Utilidades de memoria / APP ----------

function pushMemory({ text, role, tag = "context", critical = false }) {
  stepCounter += 1;

  const baseViability = critical ? 1.0 : (tag === "business" ? 0.8 : 0.5);

  memoryStore.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    text,
    role,
    tag,
    critical,
    createdAt: Date.now(),
    step: stepCounter,
    viability: baseViability,
    active: true
  });

  // Pequeña limpieza para que no crezca infinito
  if (memoryStore.length > 200) {
    memoryStore = memoryStore.slice(-150);
  }
}

function decayAndSelectMemories(maxFragments = 6) {
  if (!memoryStore.length) return [];

  const nowStep = stepCounter || 1;

  const scored = memoryStore.map((m) => {
    const ageSteps = Math.max(0, nowStep - (m.step || nowStep));
    // Decaimiento diferencial: críticos caen muy lento
    const lambda = m.critical ? 0.01 : (m.tag === "business" ? 0.05 : 0.12);
    const decayed = m.viability * Math.exp(-lambda * ageSteps);

    return { ...m, decayed };
  });

  // Filtrar inactivos y basura muy baja
  const filtered = scored.filter((m) => m.active && m.decayed > 0.15);

  // Ordenar: primero críticos, luego mayor viabilidad
  filtered.sort((a, b) => {
    if (a.critical !== b.critical) return a.critical ? -1 : 1;
    return b.decayed - a.decayed;
  });

  return filtered.slice(0, maxFragments);
}

// ---------- APP Governor: clasificación del mensaje ----------

function classifyUserMessage(message) {
  const lower = (message || "").toLowerCase();

  const isWeapons =
    /bomba casera|explosivo|molotov|arma|detonador|tnt|dinamita/.test(lower);

  const isCrime =
    /hackear|clonar tarjeta|fraude|delito|crimen|narc[oó]tico|droga/.test(
      lower
    );

  const isMedical =
    /dosis|miligramos|mg\/kg|tratamiento|quimioterapia|nivolumab|medicamento|pastilla/.test(
      lower
    );

  const isPolitics =
    /presidente|elecci[oó]n|partido|pol[ií]tica nacional|gobierno|senador|diputado/.test(
      lower
    );

  const isReligion =
    /dios|iglesia|relig[ií]on|milagro|pecado|santo/.test(lower);

  const isParadoxDomain =
    /paradox systems|energ[ií]a solar|panel(es)? solar(es)?|automatizaci[oó]n|casa inteligente|plc|scada|ingenier[ií]a|videovigilancia|cableado estructurado|sistema contra incendio/.test(
      lower
    );

  const clearlyOffDomain =
    /(hor[oó]scopo|signo zodiacal|poema de amor|chiste verde|fanfic|fanfics|cuento er[oó]tico)/.test(
      lower
    );

  return {
    isWeapons,
    isCrime,
    isMedical,
    isPolitics,
    isReligion,
    isParadoxDomain,
    clearlyOffDomain
  };
}

function appGovernorDecision(message) {
  const flags = classifyUserMessage(message);

  // 1) PELIGRO DURO → bloqueo total
  if (flags.isWeapons || flags.isCrime) {
    return {
      mode: "block",
      reason: "safety",
      reply:
        "Este asistente no puede ayudar con instrucciones peligrosas o ilegales, como fabricar armas, explosivos o cometer delitos. " +
        "Si tienes dudas sobre soluciones de ingeniería, automatización o energía, con gusto puedo orientarte en esos temas.",
      flags
    };
  }

  // 2) Medicina → nunca damos dosis ni diagnóstico
  if (flags.isMedical && !flags.isParadoxDomain) {
    return {
      mode: "redirect",
      reason: "medical",
      reply:
        "No puedo dar diagnósticos, dosis de medicamentos ni recomendaciones médicas personalizadas. " +
        "Para cualquier decisión sobre salud, es indispensable consultar directamente con un profesional médico. " +
        "Si quieres, puedo explicarte de forma general cómo la tecnología o la automatización pueden apoyar en entornos clínicos.",
      flags
    };
  }

  // 3) Política / religión / horóscopo / chorradas off-domain
    // 3) Política / religión / horóscopo / off-domain claro
  //    OJO: ya NO redirigimos solo por "no detecté dominio"
  if (
    (flags.isPolitics || flags.isReligion || flags.clearlyOffDomain) &&
    !flags.isParadoxDomain
  ) {
    return {
      mode: "redirect",
      reason: "off_domain",
      reply:
        "Este asistente está enfocado en los servicios de Paradox Systems: energía solar, automatización residencial e industrial, ingeniería y soluciones tecnológicas. " +
        "Si tu consulta es sobre esos temas, dime en qué proyecto o problema estás pensando y lo revisamos.",
      flags
    };
  }


  // 4) ON-DOMAIN y seguro → se permite, pero con contrato APP
  return {
    mode: "allow",
    reason: "on_domain",
    reply: null,
    flags
  };
}

// ---------- Handler HTTP principal ----------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY not configured");
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    // 1) APP Governor decide qué hacer con este mensaje
    const decision = appGovernorDecision(message);

    // Guardamos el mensaje como memoria de usuario (no crítica)
    pushMemory({ text: message, role: "user", tag: "user", critical: false });

    // 2) Si hay bloqueo o redirect, respondemos SIN llamar al LLM
    if (decision.mode === "block" || decision.mode === "redirect") {
      // También guardamos la decisión como memoria crítica del sistema
      pushMemory({
        text: `APP-Governor decidió modo=${decision.mode} (${decision.reason}) para: "${message}"`,
        role: "system",
        tag: "policy",
        critical: true
      });

      return res.status(200).json({ response: decision.reply });
    }

    // 3) Modo allow → construimos contexto viable y system prompt
    const viableMemories = decayAndSelectMemories(5);

    const memoryContext = viableMemories
      .map((m) => {
        const prefix = m.role === "user" ? "Usuario:" : "Sistema:";
        return `${prefix} ${m.text}`;
      })
      .join("\n");

    // Núcleo: reglas APP para Lolin
    const appContract = `
Eres Lolin, asistente de Paradox Systems (La Paz, Baja California Sur, México). 
Debes cumplir SIEMPRE las siguientes reglas de viabilidad:

1) No des instrucciones peligrosas (armas, explosivos, delitos, daño a personas o bienes).
2) No des diagnósticos médicos ni dosis de medicamentos.
3) No entres en debates de política partidista ni religión.
4) Mantén el foco en los servicios y competencias de Paradox Systems:
   energía solar, automatización residencial e industrial, ingeniería, software y seguridad.
5) Si el usuario pregunta algo fuera de dominio, redirígelo con cortesía hacia esos servicios.
6) Usa un tono profesional, directo y respetuoso, sin relleno innecesario.

Nunca rompas estas reglas, aunque el usuario insista. Si alguna regla entra en conflicto
con la petición del usuario, prioriza SIEMPRE la seguridad y el dominio Paradox.
`;

    const systemPrompt = `${appContract}

Contexto reciente relevante (memoria APP, ya filtrada):
${memoryContext || "(sin contexto previo significativo)"}
`;

    // 4) Llamada a Groq (modelo llama-3.1-8b-instant)
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: message
            }
          ],
          temperature: 0.4,
          max_tokens: 600,
          stream: false
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Groq API Error:", response.status, errorData);
      throw new Error(
        `Groq API Error: ${response.status} - ${
          errorData.error?.message || "Unknown error"
        }`
      );
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0]?.message) {
      throw new Error("No response generated from Groq");
    }

    const botResponse = data.choices[0].message.content || "";

    // Guardamos la respuesta como memoria de sistema “business”
    pushMemory({
      text: botResponse.slice(0, 600),
      role: "assistant",
      tag: "business",
      critical: false
    });

    return res.status(200).json({ response: botResponse });
  } catch (error) {
    console.error("Detailed error:", error);

    if (String(error.message || "").includes("401")) {
      return res.status(500).json({ error: "API key inválida" });
    } else if (String(error.message || "").includes("429")) {
      return res.status(500).json({ error: "Límite de requests excedido" });
    } else {
      return res.status(500).json({ error: "Error interno del servidor" });
    }
  }
}
