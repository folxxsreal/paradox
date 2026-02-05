// api/chat.js
import { decide, retrieveSecureContext } from "./akuma/governor.js";

function setCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "https://www.paradoxsystems.xyz,https://paradoxsystems.xyz")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const origin = req.headers?.origin || "";
  if (allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function verifyRecaptchaIfEnabled(token) {
  // Si no hay secret, no se valida.
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };

  if (!token || typeof token !== "string") {
    return { ok: false, error: "Missing reCAPTCHA token" };
  }

  try {
    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", token);

    const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await r.json().catch(() => ({}));
    if (!data?.success) {
      return { ok: false, error: "reCAPTCHA failed", details: data };
    }
    return { ok: true, details: data };
  } catch (e) {
    return { ok: false, error: "reCAPTCHA verification error" };
  }
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, recaptchaToken } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    // reCAPTCHA (si está habilitado)
    const rc = await verifyRecaptchaIfEnabled(recaptchaToken);
    if (!rc.ok) {
      return res.status(400).json({ error: rc.error || "reCAPTCHA failed" });
    }

    // 1) Governor: decisiones duras (sin modelo)
    const decision = decide(message);
    if (decision.mode !== "llm") {
      return res.status(200).json({ response: decision.reply });
    }

    // 2) Solo aquí usamos el modelo
    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY not configured");
      return res.status(200).json({
        response:
          "Ahora mismo no puedo llamar al modelo (configuración de API pendiente). " +
          "Pero sí puedo ayudarte: dime qué servicio te interesa (solar/automatización/software/seguridad) y 3 datos (lugar, objetivo, restricciones).",
      });
    }

    const systemPrompt = `
Eres **Godelin**, asistente profesional de Paradox Systems.
Reglas:
- Solo orientación e información general relacionada con servicios y proyectos de Paradox Systems.
- No dar clases ni resolver tareas.
- No entregar tutoriales paso a paso ni scripts completos.
- Nunca dar precios ni rangos.
- Si el usuario quiere cotizar/contratar/hablar con humano: WhatsApp +526122173332.
`.trim();

    const secureContext = retrieveSecureContext(message);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
            role: "system",
            content:
              "Contexto gobernado (reglas/servicios). Úsalo para mantener consistencia y alcance:\n" +
              secureContext,
          },
          { role: "user", content: message },
        ],
        temperature: 0.2,
        max_tokens: 450,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Groq API Error:", response.status, errorData);

      // Fallback útil (evita “Lo siento, ocurrió un error” en UI)
      return res.status(200).json({
        response:
          "Tuve un problema temporal con el modelo. Mientras se resuelve: " +
          "dime qué quieres lograr y en qué servicio cae (solar/automatización/software/seguridad), " +
          "más ubicación y restricciones. Con eso lo aterrizamos.",
      });
    }

    const data = await response.json();
    const botResponse = data?.choices?.[0]?.message?.content;
    if (!botResponse) {
      return res.status(200).json({
        response:
          "No pude generar respuesta ahora mismo. Dime qué servicio te interesa y 3 datos (lugar, objetivo, restricciones) y lo aterrizo.",
      });
    }

    return res.status(200).json({ response: botResponse });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(200).json({
      response:
        "Tuve un error interno. Para avanzar: dime qué servicio te interesa (solar/automatización/software/seguridad) y 3 datos (lugar, objetivo, restricciones).",
    });
  }
}
