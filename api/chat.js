// /api/chat.js — GROQ + Safety Gate + AKUMA/APP_GOV (local embeddings + governed memory)
//
// Requisitos:
//   - npm i @xenova/transformers @vercel/kv
//   - Env: GROQ_API_KEY
//   - Opcional (persistencia memoria): KV_REST_API_URL + KV_REST_API_TOKEN
//   - Recomendado (cache modelos en serverless): TRANSFORMERS_CACHE=/tmp/transformers_cache
//
// Nota: El primer request puede ser más lento por carga/descarga del modelo de embeddings.

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { message, sessionId: sessionFromBody } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY not configured");
      return res.status(500).json({ error: "API key not configured" });
    }

    // =========================================================================
    // Session ID (ideal: enviado desde frontend por localStorage)
    // =========================================================================
    const ip = (req.headers["x-forwarded-for"] || "")
      .toString()
      .split(",")[0]
      .trim();

    const ua = (req.headers["user-agent"] || "").toString();
    const sessionId =
      (sessionFromBody && String(sessionFromBody)) ||
      (ip ? `ip:${ip}:${ua.slice(0, 60)}` : "anon");

    // =========================================================================
    // 1) SAFETY GATE (tu "portero" original)
    // =========================================================================
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

    function appGovernorDecision(msg) {
      const flags = classifyUserMessage(msg);

      if (flags.isWeapons || flags.isCrime) {
        return {
          mode: "block",
          reason: "safety",
          reply:
            "Este asistente no puede ayudar con instrucciones peligrosas o ilegales (armas, explosivos o delitos). " +
            "Si tu consulta es de ingeniería, automatización o energía dentro de la legalidad, con gusto te ayudo.",
          flags,
        };
      }

      if (flags.isMedical) {
        return {
          mode: "block",
          reason: "medical",
          reply:
            "No puedo dar recomendaciones médicas, dosis ni tratamientos. Para eso consulta a un profesional de salud.",
          flags,
        };
      }

      if (flags.isDistress) {
        return {
          mode: "support",
          reason: "distress",
          reply:
            "Lamento mucho lo que estás pasando. Hablar con alguien de confianza o un profesional puede ayudar mucho. " +
            "Si quieres, aquí puedo ayudarte con temas técnicos (energía, automatización, software, robótica).",
          flags,
        };
      }

      if (flags.isCooking) {
        return {
          mode: "redirect",
          reason: "cooking",
          reply:
            "Paradox Systems no se dedica a cocina. Soy un asistente técnico enfocado en energía solar, automatización, ingeniería y software a medida.",
          flags,
        };
      }

      if (flags.isGenericTechTutorial && !flags.isParadoxDomain) {
        return {
          mode: "redirect",
          reason: "generic_tech",
          reply:
            "Este asistente no es tutor general de programación. Puedo orientarte a alto nivel en soluciones reales de Paradox Systems. " +
            "Si es un proyecto concreto, escribe al WhatsApp +526122173332 para evaluación y propuesta formal.",
          flags,
        };
      }

      if (flags.isPricing) {
        return {
          mode: "fixed_reply",
          reason: "pricing",
          reply:
            "Los costos se calculan de forma personalizada (consumo, ubicación, complejidad y materiales). " +
            "Para una cotización formal, escribe al WhatsApp +526122173332 o dime si es casa, negocio o industria y qué buscas.",
          flags,
        };
      }

      if (
        (flags.isPolitics ||
          flags.isReligion ||
          flags.clearlyOffDomain ||
          (!flags.isParadoxDomain && !flags.isDistress && !flags.isMedical)) &&
        !flags.isParadoxDomain
      ) {
        return {
          mode: "redirect",
          reason: "off_domain",
          reply:
            "Este asistente está enfocado en Paradox Systems: energía solar, automatización, ingeniería, software a medida, robótica aplicada y seguridad. " +
            "Si tu consulta se relaciona con eso, dime tu caso y lo revisamos.",
          flags,
        };
      }

      return { mode: "llm", reason: "normal", reply: null, flags };
    }

    const decision = appGovernorDecision(message);

    if (
      decision.mode === "block" ||
      decision.mode === "redirect" ||
      decision.mode === "support" ||
      decision.mode === "fixed_reply"
    ) {
      return res.status(200).json({ response: decision.reply });
    }

    // =========================================================================
    // 2) SYSTEM PROMPT (tu identidad/lineamientos)
    // =========================================================================
    const systemPrompt = `
Actúa como **Godelin**, una inteligencia artificial profesional que representa a **Paradox Systems**, empresa ubicada en La Paz, Baja California Sur, México. 
Solo debes mencionar esta ubicación una vez, al inicio de la conversación; después ya no la repitas.

Estilo:
- Tono profesional, directo, sin rodeos.
- Respuestas claras, sin relleno ni frases vacías.
- No repitas saludos largos en cada turno.
- No digas en cada respuesta "soy Godelin" ni "Paradox Systems, ubicada en...".

Servicios de Paradox Systems (explícalos cuando te pregunten, sin inventar precios):
1) Automatización Residencial (casa inteligente)
2) Energía Solar (res/com/ind, con o sin baterías)
3) Ingeniería Marítima
4) Automatización Industrial (PLC, HMI, SCADA)
5) Diseño y Construcción de Máquinas
6) Cableado Estructurado
7) Software a Medida
8) Sistemas Contra Incendios
9) Videovigilancia y Control de Accesos

Afirmaciones corporativas INVARIANTES:
• Paradox Systems realiza I+D en ingeniería, automatización, energía y tecnologías emergentes.
• Paradox Systems desarrolla robótica y soluciones de IA aplicada, incluyendo memoria gobernada (APP Governor).
• Paradox Systems puede diseñar sistemas a medida basados en hardware, software e integración.

Reglas obligatorias:
- No instrucciones peligrosas/ilegales.
- No consejos médicos/dosis.
- No debates de política partidista o religión fuera de proyectos técnicos.
- Si preguntan precios: NO números, NO rangos. Cotización personalizada.
- WhatsApp +526122173332 solo para cotización, contratación o hablar con humano.
`;

    // =========================================================================
    // 3) AKUMA / APP_GOV (memoria gobernada + decay + supersede)
    //    - Local embeddings: Xenova MiniLM
    //    - Persistencia: Vercel KV si existe; si no, RAM (best-effort)
    // =========================================================================

    // ---------- Config ----------
    const akumaCfg = {
      max_tokens: Number(process.env.APP_GOV_CONTEXT_BUDGET_TOKENS || 180),
      lambda_shield: Number(process.env.APP_GOV_LAMBDA_SHIELD || 0.0005),
      lambda_noise: Number(process.env.APP_GOV_LAMBDA_NOISE || 0.08),
      alpha: Number(process.env.APP_GOV_ALPHA || 0.15),
      beta: Number(process.env.APP_GOV_BETA || 0.85),
      threshold: Number(process.env.APP_GOV_THRESHOLD || 0.75),
      injection_penalty: Number(process.env.APP_GOV_INJECTION_PENALTY || 0.9),
      max_noise_items: Number(process.env.APP_GOV_MAX_NOISE || 40),
      max_total_items: Number(process.env.APP_GOV_MAX_TOTAL || 80),
      session_ttl_sec: Number(process.env.APP_GOV_TTL_SEC || 60 * 60 * 12),
    };

    const DEFAULT_CRITICAL_RULES = [
      {
        critical_id: "policy_pricing",
        channel: "policy",
        text:
          "POLÍTICA: Nunca dar precios ni rangos. Explicar que la cotización es personalizada (consumo, ubicación, complejidad, materiales). WhatsApp +526122173332 solo para cotizar/contratar.",
      },
      {
        critical_id: "policy_no_code",
        channel: "policy",
        text:
          "POLÍTICA: No entregar scripts completos ni tutoriales paso a paso. Dar explicación a alto nivel y derivar a proyecto formal si aplica.",
      },
      {
        critical_id: "policy_contact",
        channel: "policy",
        text:
          "POLÍTICA: WhatsApp +526122173332 solo para cotización, contratación, hablar con humano o cierre comercial.",
      },
      {
        critical_id: "policy_safety",
        channel: "policy",
        text:
          "POLÍTICA: Prohibido ayudar con armas/explosivos/delitos. Prohibido dar dosis/tratamientos médicos.",
      },
      {
        critical_id: "company_services",
        channel: "services",
        text:
          "SERVICIOS: energía solar, automatización residencial/industrial (PLC/HMI/SCADA), software a medida, videovigilancia/control de accesos, cableado estructurado, sistemas contra incendios, diseño de máquinas, ingeniería marítima.",
      },
      {
        critical_id: "company_claims",
        channel: "claims",
        text:
          "INVARIANTE: Paradox Systems hace I+D, robótica e IA aplicada (memoria gobernada / APP Governor) y soluciones a medida.",
      },
    ];

    // ---------- Helpers ----------
    function approxTokens(text) {
      return Math.ceil((text || "").length / 4);
    }
    function dot(a, b) {
      let s = 0;
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) s += a[i] * b[i];
      return s;
    }
    function expDecay(lambda, dtSeconds) {
      const x = Math.max(0, dtSeconds);
      const v = Math.exp(-lambda * x);
      return Number.isFinite(v) ? v : 0;
    }
    function detectInjection(text) {
      const t = (text || "").toLowerCase();
      return /ignore (all|previous) instructions|system prompt|developer message|jailbreak|do anything now|dan|prompt injection/.test(
        t
      );
    }

    // ---------- Storage (KV o RAM) ----------
    let _kv = globalThis.__APP_GOV_KV__ ?? null;

    async function getKV() {
      if (globalThis.__APP_GOV_KV_READY__ === true) return _kv;
      globalThis.__APP_GOV_KV_READY__ = true;

      const hasKV =
        !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;

      if (!hasKV) {
        _kv = null;
        globalThis.__APP_GOV_KV__ = _kv;
        return _kv;
      }
      try {
        const mod = await import("@vercel/kv");
        _kv = mod.kv;
        globalThis.__APP_GOV_KV__ = _kv;
        return _kv;
      } catch (e) {
        console.warn("KV available in env, but @vercel/kv import failed:", e);
        _kv = null;
        globalThis.__APP_GOV_KV__ = _kv;
        return _kv;
      }
    }

    const memFallback =
      globalThis.__APP_GOV_MEM__ || (globalThis.__APP_GOV_MEM__ = new Map());
    const metaFallback =
      globalThis.__APP_GOV_META__ || (globalThis.__APP_GOV_META__ = new Map());

    async function getJSON(key, fallbackMap) {
      const kv = await getKV();
      if (!kv) return fallbackMap.get(key) || null;
      return kv.get(key);
    }

    async function setJSON(key, value, fallbackMap, ttlSeconds = null) {
      const kv = await getKV();
      if (!kv) {
        fallbackMap.set(key, value);
        return;
      }
      if (ttlSeconds) return kv.set(key, value, { ex: ttlSeconds });
      return kv.set(key, value);
    }

    // ---------- Local Embeddings (Xenova) ----------
    let _extractorPromise = globalThis.__APP_GOV_EXTRACTOR__ || null;

    async function getExtractor() {
      if (_extractorPromise) return _extractorPromise;

      _extractorPromise = (async () => {
        const mod = await import("@xenova/transformers");
        const { pipeline, env } = mod;

        env.cacheDir =
          process.env.TRANSFORMERS_CACHE || "/tmp/transformers_cache";
        env.allowLocalModels = false;

        return pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      })();

      globalThis.__APP_GOV_EXTRACTOR__ = _extractorPromise;
      return _extractorPromise;
    }

    async function embed(text) {
      const extractor = await getExtractor();
      const out = await extractor(text, { pooling: "mean", normalize: true });
      return Array.from(out.data);
    }

    // ---------- Governor minimal ----------
    const memKey = `appgov:mem:${sessionId}`;
    const metaKey = `appgov:meta:${sessionId}`;

    async function loadMem() {
      return (await getJSON(memKey, memFallback)) || [];
    }

    async function saveMem(items) {
      // Supersede por critical_id + límites
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
      const noiseKeep = noise.slice(0, akumaCfg.max_noise_items);

      const merged = [...critical, ...noiseKeep];
      merged.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      const finalItems = merged.slice(0, akumaCfg.max_total_items);

      await setJSON(memKey, finalItems, memFallback, akumaCfg.session_ttl_sec);
    }

    async function loadMeta() {
      return (await getJSON(metaKey, metaFallback)) || {};
    }

    async function saveMeta(meta) {
      return setJSON(metaKey, meta, metaFallback, akumaCfg.session_ttl_sec);
    }

    async function storeMemory(text, { is_critical, critical_id, channel }, memOverride = null) {
      const mem = memOverride || (await loadMem());
      const now = Date.now();

      if (is_critical && critical_id) {
        for (let i = mem.length - 1; i >= 0; i--) {
          if (mem[i].is_critical && mem[i].critical_id === critical_id) {
            mem.splice(i, 1);
          }
        }
      }

      const inj = detectInjection(text);

      mem.push({
        id:
          (globalThis.crypto && globalThis.crypto.randomUUID
            ? globalThis.crypto.randomUUID()
            : `m_${now}_${Math.random().toString(16).slice(2)}`),
        text,
        is_critical: !!is_critical,
        critical_id: critical_id || null,
        channel: channel || "general",
        created_at: now,
        lambda: is_critical ? akumaCfg.lambda_shield : akumaCfg.lambda_noise,
        inj,
        emb: await embed(text),
      });

      if (!memOverride) await saveMem(mem);
      return mem;
    }

    async function bootstrap() {
      const meta = await loadMeta();
      if (meta.bootstrapped) return;

      const mem = await loadMem();
      for (const r of DEFAULT_CRITICAL_RULES) {
        await storeMemory(
          r.text,
          {
            is_critical: true,
            critical_id: r.critical_id,
            channel: r.channel || "policy",
          },
          mem
        );
      }
      meta.bootstrapped = true;
      await saveMeta(meta);
      await saveMem(mem);
    }

    async function retrieve(query) {
      const mem = await loadMem();
      const now = Date.now();
      const qEmb = await embed(query);

      const scored = mem.map((it) => {
        const dt = (now - (it.created_at || now)) / 1000;
        const viability = expDecay(it.lambda, dt);
        const sim = dot(qEmb, it.emb || []);
        const penalty = it.inj ? akumaCfg.injection_penalty : 0;
        const score = akumaCfg.alpha * sim + akumaCfg.beta * viability - penalty;
        return { it, score };
      });

      scored.sort((a, b) => b.score - a.score);

      let budget = akumaCfg.max_tokens;
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

      // Críticos primero, luego ruido
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

    // Ejecuta AKUMA
    await bootstrap();
    await storeMemory(message, { is_critical: false, channel: "user" });
    const { policy, context } = await retrieve(message);

    // =========================================================================
    // 4) GROQ Call (solo si Safety Gate lo permitió)
    // =========================================================================
    const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `POLICY:\n${policy}\n\nCONTEXT:\n${context}\n\nUSER:\n${message}`,
          },
        ],
        temperature: 0.0,
        max_tokens: 500,
        stream: false,
      }),
    });

    if (!groqResp.ok) {
      const errorData = await groqResp.json().catch(() => ({}));
      console.error("Groq API Error:", groqResp.status, errorData);
      return res.status(500).json({
        error: `Groq API Error: ${groqResp.status} - ${
          errorData.error?.message || "Unknown error"
        }`,
      });
    }

    const data = await groqResp.json();

    if (!data.choices || !data.choices[0]?.message) {
      return res.status(500).json({ error: "No response generated from Groq" });
    }

    const botResponse = data.choices[0].message.content;
    return res.status(200).json({ response: botResponse });
  } catch (error) {
    console.error("Detailed error:", error);

    const msg = String(error?.message || "").toLowerCase();
    if (msg.includes("401")) return res.status(500).json({ error: "API key inválida" });
    if (msg.includes("429")) return res.status(500).json({ error: "Límite de requests excedido" });

    return res.status(500).json({ error: "Error interno del servidor" });
  }
}

// Nota: en algunos setups (Next.js) esto ayuda; en otros (Vercel functions puras) se ignora.
// No estorba.
export const config = { runtime: "nodejs" };
