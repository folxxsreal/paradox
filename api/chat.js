// /api/chat.js
// Versión con APP Governor "lite" para Lolin (Paradox Systems)
// Usa Groq (llama-3.1-8b-instant)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY not configured');
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // 1) APP GOVERNOR: decide qué hacer con el mensaje
    const decision = appGovernor(message);

    // Casos en los que NO llamamos al LLM (bloqueo o redirección)
    if (decision.mode === 'block' || decision.mode === 'redirect') {
      return res.status(200).json({
        response: decision.reply,
        // Si algún día quieres depurar, aquí viene la razón:
        meta: {
          mode: decision.mode,
          reason: decision.reason,
          activeRules: decision.activeRules.map(r => r.id),
        },
      });
    }

    // 2) Si el mensaje es viable → llamamos al LLM bajo las reglas APP
    const systemPrompt = buildSystemPrompt(decision.activeRules);

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
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
      console.error('Groq API Error:', response.status, errorData);
      throw new Error(
        `Groq API Error: ${response.status} - ${
          errorData.error?.message || 'Unknown error'
        }`
      );
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0]?.message) {
      throw new Error('No response generated from Groq');
    }

    const botResponse = data.choices[0].message.content;

    return res.status(200).json({
      response: botResponse,
      meta: {
        mode: decision.mode,
        activeRules: decision.activeRules.map(r => r.id),
      },
    });
  } catch (error) {
    console.error('Detailed error:', error);

    if (String(error.message).includes('401')) {
      return res.status(500).json({ error: 'API key inválida' });
    }
    if (String(error.message).includes('429')) {
      return res.status(500).json({ error: 'Límite de requests excedido' });
    }

    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/* ============================================================
   APP GOVERNOR "LITE" PARA Lolin
   ============================================================ */

// Reglas críticas (núcleo de viabilidad y guardas)
const APP_RULES = [
  {
    id: 'domain_paradox',
    type: 'invariant', // núcleo de viabilidad
    description:
      'Solo hablar de servicios y capacidades de Paradox Systems (energía solar, automatización residencial e industrial, ingeniería, software, videovigilancia, etc.).',
  },
  {
    id: 'safety_weapons',
    type: 'guard',
    description:
      'No dar instrucciones para fabricar armas, explosivos, drogas, ni actividades peligrosas.',
  },
  {
    id: 'safety_selfharm',
    type: 'guard',
    description:
      'No fomentar autolesiones ni suicidio; orientar a ayuda profesional.',
  },
  {
    id: 'politics_block',
    type: 'guard',
    description:
      'No opinar de política partidista, campañas, partidos o figuras políticas.',
  },
  {
    id: 'medical_block',
    type: 'guard',
    description:
      'No dar diagnóstico médico ni ajustar tratamientos; solo información general y sugerir médico.',
  },
];

// Heurísticas baratas para detección de temas (no perfectas, pero suficientes)
function detectTopicFlags(text) {
  const t = text.toLowerCase();

  const offDomainKeywords = [
    'novia',
    'chisme',
    'horóscopo',
    'signo zodiacal',
    'poesía',
    'cuento',
    'historia de terror',
  ];

  const politicsKeywords = [
    'presidente',
    'elección',
    'elecciones',
    'partido',
    'política nacional',
    'senador',
    'diputado',
    'campaña',
  ];

  const weaponsKeywords = [
    'bomba casera',
    'explosivo',
    'molotov',
    'arma casera',
    'pólvora',
    'detonador',
  ];

  const selfharmKeywords = [
    'suicid',
    'hacerme daño',
    'ya no quiero vivir',
    'lastimarme',
  ];

  const medicalKeywords = [
    'diagnóstico',
    'dosis',
    'medicina',
    'pastilla',
    'inyección',
    'antibiótico',
    'quimioterapia',
    'nivolumab',
  ];

  const paradoxKeywords = [
    'paneles solares',
    'sistema fotovoltaico',
    'energía solar',
    'automatización residencial',
    'casa inteligente',
    'domótica',
    'plc',
    'scada',
    'automatización industrial',
    'cableado estructurado',
    'videovigilancia',
    'cámara ip',
    'control de acceso',
    'firewall',
    'ingeniería marítima',
    'sistema contra incendios',
    'software a medida',
    'paradox systems',
  ];

  const isParadoxDomain = paradoxKeywords.some(k => t.includes(k));
  const isPolitics = politicsKeywords.some(k => t.includes(k));
  const isWeapons = weaponsKeywords.some(k => t.includes(k));
  const isSelfHarm = selfharmKeywords.some(k => t.includes(k));
  const isMedical = medicalKeywords.some(k => t.includes(k));
  const isOffDomain =
    !isParadoxDomain &&
    !isPolitics &&
    !isWeapons &&
    !isSelfHarm &&
    !isMedical &&
    offDomainKeywords.some(k => t.includes(k));

  return {
    isParadoxDomain,
    isPolitics,
    isWeapons,
    isSelfHarm,
    isMedical,
    isOffDomain,
  };
}

/**
 * Núcleo APP:
 * - Decide si bloquea, redirige o delega al LLM.
 * - Devuelve:
 *   { mode: 'block' | 'redirect' | 'llm', reply?, reason?, activeRules[] }
 */
function appGovernor(userMessage) {
  const flags = detectTopicFlags(userMessage);

  // 1) Rutas de mortalidad duras: armas, daño, etc. → block
  if (flags.isWeapons) {
    return {
      mode: 'block',
      reason: 'weapons',
      reply:
        'Este asistente no puede ayudar con instrucciones peligrosas o dañinas, como fabricar armas, explosivos o dispositivos peligrosos. ' +
        'Si tienes dudas sobre soluciones de ingeniería, automatización o energía, con gusto puedo orientarte en esos temas.',
      activeRules: APP_RULES.filter(r =>
        ['safety_weapons', 'domain_paradox'].includes(r.id)
      ),
    };
  }

  if (flags.isSelfHarm) {
    return {
      mode: 'block',
      reason: 'self_harm',
      reply:
        'Lamento que te sientas así. Este asistente no puede dar indicaciones relacionadas con autolesiones o suicidio. ' +
        'Te recomiendo hablar con un profesional de la salud o con alguien de confianza. Si estás en una situación de emergencia, por favor contacta a los servicios de ayuda de tu localidad.',
      activeRules: APP_RULES.filter(r =>
        ['safety_selfharm', 'domain_paradox'].includes(r.id)
      ),
    };
  }

  // 2) Política partidista → redirección suave
  if (flags.isPolitics) {
    return {
      mode: 'redirect',
      reason: 'politics',
      reply:
        'Este asistente está enfocado en los servicios de Paradox Systems (energía solar, automatización residencial e industrial, ingeniería y soluciones tecnológicas). ' +
        'No emite opiniones sobre política partidista o figuras públicas. ' +
        'Si tienes un proyecto relacionado con energía, automatización o ingeniería, dime en qué estás pensando y te ayudo a aterrizarlo.',
      activeRules: APP_RULES.filter(r =>
        ['politics_block', 'domain_paradox'].includes(r.id)
      ),
    };
  }

  // 3) Peticiones claramente fuera de dominio → redirección
  if (flags.isOffDomain) {
    return {
      mode: 'redirect',
      reason: 'off_domain',
      reply:
        'Este asistente está diseñado para ayudarte específicamente con proyectos de Paradox Systems: energía solar, automatización residencial e industrial, ingeniería, software a medida, videovigilancia y soluciones afines. ' +
        'Si me cuentas qué necesitas en alguno de esos temas, puedo darte una recomendación concreta.',
      activeRules: APP_RULES.filter(r => r.id === 'domain_paradox'),
    };
  }

  // 4) Preguntas médicas específicas → redirección
  if (flags.isMedical) {
    return {
      mode: 'redirect',
      reason: 'medical',
      reply:
        'No puedo dar diagnósticos médicos ni ajustar tratamientos. ' +
        'Puedo ayudarte a entender, a nivel general, cómo una solución tecnológica podría apoyar procesos de salud (por ejemplo, monitoreo, automatización o energía de respaldo), ' +
        'pero siempre debes consultar tus dudas médicas directamente con un profesional de la salud.',
      activeRules: APP_RULES.filter(r =>
        ['medical_block', 'domain_paradox'].includes(r.id)
      ),
    };
  }

  // 5) Mensajes dentro del dominio Paradox → delegar al LLM
  //    con reglas activas (núcleo de viabilidad)
  const activeRules = [APP_RULES.find(r => r.id === 'domain_paradox')].filter(
    Boolean
  );

  // Podríamos añadir más reglas activas según el tipo de proyecto,
  // pero para esta primera versión basta el núcleo de viabilidad.

  return {
    mode: 'llm',
    reason: 'viable',
    activeRules,
  };
}

/**
 * Construye el prompt de sistema a partir de las reglas activas del APP.
 */
function buildSystemPrompt(activeRules) {
  const rulesText = activeRules
    .map(r => `- ${r.description}`)
    .join('\n');

  return `Actúas como Lolin, asistente de Paradox Systems, empresa de ingeniería y tecnología ubicada en La Paz, Baja California Sur, México.
Solo debes mencionar la ubicación una vez si es relevante al contexto, y después concentrarte en dar respuestas claras, técnicas y sin rodeos.

Debes cumplir estrictamente las siguientes reglas de viabilidad:

${rulesText}

Estás especializada en:
- Energía solar residencial, comercial e industrial.
- Automatización residencial (casas inteligentes).
- Automatización industrial (PLCs, SCADA, control de procesos).
- Ingeniería marítima y soluciones en entornos costeros.
- Diseño y construcción de máquinas y prototipos.
- Cableado estructurado, redes y comunicaciones.
- Videovigilancia, control de accesos y sistemas contra incendios.
- Desarrollo de software a medida.

Si la pregunta se sale de estos temas, redirige amablemente la conversación hacia un problema o proyecto donde Paradox Systems pueda aportar valor, sin inventar servicios que no ofrecemos.

Responde siempre en español, con tono profesional, directo y respetuoso. No repitas tu presentación en cada mensaje.`;
}
