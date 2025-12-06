// /api/chat.js — Versión con GROQ + APP Governor (afinada)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required" });
  }

  if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY not configured");
    return res.status(500).json({ error: "API key not configured" });
  }

  // ======================================================
  // 1) CLASIFICADOR DE MENSAJES (APP GOVERNOR)
  // ======================================================
  function classifyUserMessage(msg) {
    const lower = (msg || "").toLowerCase();

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
      /dios|iglesia|relig[ií]on|milagro|pecado|santo|virgen de guadalupe/.test(
        lower
      );

    const isCooking =
      /receta|ceviche|mole|tamal(es)?|pastel|guiso|cocina(r)?|ingredientes|hornear|marinar/.test(
        lower
      );

    // Genérico: pedir código, tutoriales, “programar en…”
    const isGenericTechTutorial =
      /(c[oó]digo|script|ejemplo en|snippet|plantilla html|html b[aá]sico|estructura html|programar en|c[oó]mo programar|tutorial de|paso a paso en (html|javascript|python|java|c\+\+|arduino|react|node\.js|kotlin|android|app m[oó]vil))/i.test(
        lower
      );

    const isParadoxDomain =
      /paradox systems|paradoxsystems|energ[ií]a solar|panel(es)? solar(es)?|fotovoltaic|fotovoltaico|automatizaci[oó]n|casa inteligente|hogar inteligente|plc|scada|ingenier[ií]a|videovigilancia|cableado estructurado|sistema contra incendio|software|aplicaci[oó]n|app(s)?|desarrollo de software|sistema a medida|proyecto de automatizaci[oó]n|soluciones tecnol[oó]gicas/.test(
        lower
      );

    const clearlyOffDomain =
      /(hor[oó]scopo|signo zodiacal|poema de amor|cuento er[oó]tico|fanfic|fanfics|chiste verde)/.test(
        lower
      );

    const isDistress =
      /se me perdi[oó] mi perro|perd[ií] a mi perro|se me perdi[oó] mi mascota|perd[ií] a mi mascota|mi perro se muri[oó]|mi mascota se muri[oó]|estoy muy triste|me siento muy mal|estoy deprimid[oa]|tengo mucha ansiedad/.test(
        lower
      );

    const isPricing =
      /cu[aá]nto cuesta|cu[aá]nto vale|cu[aá]nto sale|precio|presupuesto|cotizaci[oó]n|cu[aá]nto me cobrar[ií]an|\bmxn\b|\busd\b|pesos/.test(
        lower
      );

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

  // ======================================================
  // 2) APP GOVERNOR: DECISIÓN DE VIABILIDAD
  // ======================================================
  function appGovernorDecision(msg) {
    const flags = classifyUserMessage(msg);

    // 🔥 Armamento / explosivos / crimen
    if (flags.isWeapons || flags.isCrime) {
      return {
        mode: "block",
        reason: "safety",
        reply:
          "Este asistente no puede ayudar con instrucciones peligrosas o ilegales, como fabricar armas, explosivos o cometer delitos. " +
          "Si tienes dudas sobre soluciones de ingeniería, automatización o energía dentro de la legalidad, con gusto puedo orientarte en esos temas.",
        flags,
      };
    }

    // ⚕️ Consultas médicas sensibles
    if (flags.isMedical) {
      return {
        mode: "block",
        reason: "medical",
        reply:
          "No puedo dar recomendaciones médicas, de dosis o tratamientos. " +
          "Para temas de salud, lo adecuado es que consultes directamente con un médico o institución de salud autorizada.",
        flags,
      };
    }

    // 🧠 Angustia / pérdida de mascota / ánimo muy bajo
    if (flags.isDistress) {
      return {
        mode: "support",
        reason: "distress",
        reply:
          "Lamento mucho lo que estás pasando. Desde Paradox Systems solo puedo acompañarte con un mensaje de apoyo: " +
          "es válido sentirte así, y no tienes por qué cargarlo solo.\n\n" +
          "Hablar con alguien de confianza (familia, amigo cercano o un profesional de salud mental) suele ayudar mucho más que un mensaje en pantalla. " +
          "Si además quieres distraerte platicando de proyectos técnicos (energía, automatización, software, robótica), aquí sí puedo ayudarte sin problema.",
        flags,
      };
    }

    // 🍳 Cocina / recetas — NO es nuestro negocio
    if (flags.isCooking) {
      return {
        mode: "redirect",
        reason: "cooking",
        reply:
          "Paradox Systems no se dedica a cocina ni a recetas. " +
          "Soy un asistente técnico enfocado en energía solar, automatización, ingeniería, software y seguridad.\n\n" +
          "Si quieres, dime qué proyecto técnico tienes en mente (por ejemplo: paneles solares, automatización de una casa o desarrollo de software) y lo revisamos.",
        flags,
      };
    }

    // 💻 Tutoriales de programación / código genérico fuera de contexto Paradox
    if (flags.isGenericTechTutorial && !flags.isParadoxDomain) {
      return {
        mode: "redirect",
        reason: "generic_tech",
        reply:
          "Este asistente no está pensado como tutor de programación ni generador de código genérico. " +
          "Mi función es ayudarte a entender qué podemos hacer desde Paradox Systems en proyectos reales de ingeniería, automatización, energía y software a medida.\n\n" +
          "Si estás pensando en un proyecto concreto (por ejemplo, una página web para tu negocio, una app a medida o un sistema de monitoreo), " +
          "puedo orientarte sobre la solución y, si quieres avanzar, puedes escribir al WhatsApp **+526122173332** para una evaluación y propuesta formal.",
        flags,
      };
    }

    // 💰 Regla dura: NO DAR PRECIOS
    if (flags.isPricing) {
      return {
        mode: "fixed_reply",
        reason: "pricing",
        reply:
          "El costo de un sistema o servicio de Paradox Systems siempre se calcula de forma personalizada, según consumo, ubicación, complejidad y materiales.\n\n" +
          "En lugar de inventar un número aquí, lo correcto es hacer una evaluación rápida de tu caso (tipo de inmueble, carga instalada, si necesitas baterías, nivel de automatización, etc.) y a partir de eso generar una cotización formal.\n\n" +
          "Si quieres avanzar, puedes escribir directamente al WhatsApp **+526122173332** para una cotización personalizada, o decirme aquí si se trata de casa, negocio o industria y qué estás buscando (por ejemplo: solo generación solar, respaldo con baterías, automatización, videovigilancia, etc.).",
        flags,
      };
    }

    // 🏛️ Política / religión / off-domain evidente
    if (
      (flags.isPolitics ||
        flags.isReligion ||
        flags.clearlyOffDomain ||
        (!flags.isParadoxDomain && !flags.isDistress && !flags.isMedical)) &&
      !flags.isParadoxDomain
    ) {
      // Nota: este último término corta TODO lo que no sea Paradox, salvo distress/medical que ya filtramos arriba.
      return {
        mode: "redirect",
        reason: "off_domain",
        reply:
          "Este asistente está enfocado en los servicios y capacidades de Paradox Systems: energía solar, automatización residencial e industrial, ingeniería, desarrollo de software a medida, robótica aplicada y soluciones de seguridad.\n\n" +
          "No funciono como centro de información general. " +
          "Si tu consulta está relacionada con alguno de estos temas, dime en qué proyecto o problema estás pensando y lo revisamos. " +
          "Si deseas hablar con alguien del equipo directamente, puedes escribir al WhatsApp **+526122173332**.",
        flags,
      };
    }

    // ✅ Todo lo demás: se delega al modelo (modo normal)
    return {
      mode: "llm",
      reason: "normal",
      reply: null,
      flags,
    };
  }

  // ======================================================
  // 3) PROMPT DEL SISTEMA (IDENTIDAD DE Godelin)
  // ======================================================
  const systemPrompt = `
Actúa como **Godelin**, una inteligencia artificial profesional que representa a **Paradox Systems**, empresa ubicada en La Paz, Baja California Sur, México. 
Solo debes mencionar esta ubicación una vez, al inicio de la conversación; después ya no la repitas.

Estilo:
- Tono profesional, directo, sin rodeos.
- Respuestas claras, sin relleno ni frases vacías.
- No repitas saludos largos en cada turno.
- No digas en cada respuesta "soy Godelin" ni "Paradox Systems, ubicada en...".

Servicios de Paradox Systems (explícalos cuando te pregunten, sin inventar precios):

1. **Automatización Residencial**  
   Conversión de casas convencionales en casas inteligentes con control de luces, clima, cerraduras, cámaras, persianas, sensores y asistentes de voz. 
   Control desde celular o por voz. 
   La inversión SIEMPRE se cotiza de forma personalizada según el proyecto; NO des montos ni rangos de precios.

2. **Energía Solar**  
   Sistemas residenciales, comerciales e industriales con paneles, inversores, baterías y controladores. 
   Ahorro en el recibo eléctrico, posibilidad de respaldo ante fallas de red y mayor independencia energética. 
   El costo depende del consumo, espacio disponible, tipo de inversor y si incluye baterías; NUNCA des precios ni rangos numéricos, solo explica los factores relevantes.

3. **Ingeniería Marítima**  
   Soluciones para entornos navales y costeros: sistemas para embarcaciones, estructuras flotantes e instalaciones portuarias, con enfoque en durabilidad y eficiencia.

4. **Automatización Industrial**  
   Programación de PLCs y PACs, sistemas de control, HMI y SCADA. 
   Objetivo: aumentar eficiencia, reducir errores y mejorar trazabilidad.

5. **Diseño y Construcción de Máquinas**  
   Equipos personalizados desde la idea inicial hasta la entrega, usando CAD y materiales adecuados al entorno de operación.

6. **Cableado Estructurado**  
   Infraestructura de red organizada y escalable para oficinas, comercios e industrias.

7. **Software a Medida**  
   Desarrollo de software y aplicaciones adaptadas a necesidades operativas específicas (interfaces, sistemas internos, dashboards, etc.).

8. **Sistemas Contra Incendios**  
   Diseño y selección de sensores, alarmas y tecnologías de supresión acordes a la normativa y al tipo de riesgo.

9. **Videovigilancia y Control de Accesos**  
   Cámaras IP, grabación local o en la nube, control por tarjetas, biometría y monitoreo en tiempo real.
   
Afirmaciones corporativas INVARIANTES (no deben contradecirse jamás):

• Paradox Systems realiza **Investigación y Desarrollo (I+D)** en ingeniería, automatización, energía y tecnologías emergentes.
• Paradox Systems desarrolla **robótica** en colaboración con clientes y como parte de proyectos propios (prototipos, automatización especializada, robots experimentales).
• Paradox Systems trabaja con **Inteligencia Artificial aplicada**, incluyendo memoria gobernada y agentes viables (APP Governor).
• Paradox Systems puede diseñar **sistemas a medida** basados en hardware, software e integración de sensores, actuadores y control de movimiento.
• Si un servicio no aparece en el catálogo estándar, **no debe asumirse que no se hace**; se debe responder:
  "Podemos evaluar tu proyecto de innovación tecnológica y desarrollar una solución a la medida. ¿Quieres que revisemos tu caso?"

Reglas adicionales de comportamiento:

- Este asistente **NO es un centro de información general**. 
  Si la pregunta no está relacionada con los servicios y capacidades de Paradox Systems, debes redirigir amablemente indicando tu foco.
- No des **recetas de cocina** ni instrucciones culinarias.
- No proporciones **código fuente, scripts completos ni tutoriales paso a paso** de programación.
  Si el usuario pide código o ejemplos técnicos detallados, explica a alto nivel qué implica el desarrollo y sugiere contactar por WhatsApp para un proyecto formal.

Uso del WhatsApp (+526122173332):

- Solo menciona el WhatsApp cuando:
  - El usuario pida una cotización,
  - Quiera hablar con alguien del equipo,
  - Pregunte cómo contratar un servicio,
  - O cuando necesites derivar un proyecto técnico a atención humana.
- No ofrezcas WhatsApp como canal para temas médicos, legales o de emergencia.

Reglas obligatorias (APP Governor):

- No des instrucciones para actividades peligrosas o ilegales (armas, explosivos, delitos).
- No des consejos médicos ni de dosis de medicamentos.
- No participes en debates de política partidista o religión si no está directamente vinculado a un proyecto técnico de Paradox Systems.
- Cuando el usuario pregunte por **precios, costos o “cuánto cuesta”**, NUNCA des un número, ni aproximado, ni rango. Explica que la cotización es personalizada y sugiere contacto directo.
- Cuando el usuario quiera hablar con un humano, solicitar cotización, visita o más información, indícale que puede escribir al WhatsApp **+526122173332** para atención directa.

Si no puedes responder algo con certeza o está fuera del alcance de Paradox Systems, dilo claramente y redirige al WhatsApp **+526122173332** para seguimiento personalizado.
`;

  // ======================================================
  // 4) APLICAR APP GOVERNOR ANTES DE LLAMAR A GROQ
  // ======================================================
  const decision = appGovernorDecision(message);

  if (
    decision.mode === "block" ||
    decision.mode === "redirect" ||
    decision.mode === "support" ||
    decision.mode === "fixed_reply"
  ) {
    // APP responde directamente; no se llama al modelo
    return res.status(200).json({ response: decision.reply });
  }

  // ======================================================
  // 5) LLAMADA A GROQ (solo si APP lo permite)
  // ======================================================
  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: message,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
          stream: false,
        }),
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

    const botResponse = data.choices[0].message.content;
    return res.status(200).json({ response: botResponse });
  } catch (error) {
    console.error("Detailed error:", error);

    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("401")) {
      return res.status(500).json({ error: "API key inválida" });
    }
    if (msg.includes("429")) {
      return res.status(500).json({ error: "Límite de requests excedido" });
    }

    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
