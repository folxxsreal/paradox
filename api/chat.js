// /api/chat.js - Versión con Groq + APP-Governor Lite

// ============================
// 1. APP-GOVERNOR LITE
// ============================

/**
 * Evalúa el mensaje del usuario según reglas de viabilidad
 * para el chat de Paradox Systems.
 *
 * Devuelve un objeto:
 *  - state: "OK" | "OUT_OF_DOMAIN" | "SAFETY_BLOCK"
 *  - reason: texto breve interno (para logs)
 */
function evaluateAppGovernor(message) {
    const text = (message || "").toLowerCase();

    // -------- Canal 1: Seguridad / Contenido delicado --------
    const safetyKeywords = [
        "bomba casera", "explosivo", "tnt", "molotov",
        "arma casera", "pistola casera", "detonador",
        "hackear", "hackeo", "piratear", "crackear",
        "fraude", "estafa", "clonar tarjeta", "phishing",
        "suicidio", "quitarme la vida", "hacer daño a otros",
        "fabricar droga", "cocinar droga", "metanfetamina"
    ];

    const hitSafety = safetyKeywords.some(k => text.includes(k));
    if (hitSafety) {
        return {
            state: "SAFETY_BLOCK",
            reason: "Detected high-risk / harmful content"
        };
    }

    // -------- Canal 2: Dominio Paradox Systems --------
    // Palabras y frases que indican que la pregunta está
    // dentro del dominio útil de la empresa.
    const domainKeywords = [
        // Marca y empresa
        "paradox systems", "lolin",

        // Energía solar y fotovoltaica
        "energía solar", "energia solar", "paneles solares",
        "panel solar", "fotovoltaico", "fotovoltaica",
        "inversor", "inversores", "inversor híbrido",
        "baterías", "baterias", "banco de baterías",
        "sistema aislado", "sistema interconectado",
        "victron", "pylontech",

        // Automatización residencial
        "casa inteligente", "domótica", "domotica",
        "automatización residencial", "automatizacion residencial",
        "luces inteligentes", "persianas inteligentes",
        "cerraduras inteligentes", "sensores de movimiento",
        "asistente de voz", "alexa", "google home",

        // Automatización industrial
        "automatización industrial", "automatizacion industrial",
        "plc", "pac", "scada", "hmi", "control industrial",
        "proceso industrial", "línea de producción", "linea de produccion",

        // Ingeniería marítima
        "ingeniería marítima", "ingenieria maritima",
        "embarcación", "embarcaciones", "muelle", "puerto",
        "carga y descarga", "brazos de carga", "loading arm",

        // Cableado, redes, seguridad
        "cableado estructurado", "red de datos", "rack de comunicaciones",
        "videovigilancia", "cámaras de seguridad", "camaras de seguridad",
        "control de accesos", "lector biométrico", "lector biometrico",

        // Software y soluciones a medida
        "software a medida", "desarrollo de software",
        "aplicación a medida", "app a medida",

        // Incendios
        "sistema contra incendios", "detección de humo",
        "deteccion de humo", "rociadores", "supresión de incendios",
        "supresion de incendios",

        // Consultoría / cotización
        "cotización", "cotizacion", "presupuesto", "proyecto",
        "instalación", "instalacion", "servicio", "asesoría",
        "asesoria", "consultoría", "consultoria"
    ];

    const inDomain = domainKeywords.some(k => text.includes(k));

    if (!inDomain) {
        return {
            state: "OUT_OF_DOMAIN",
            reason: "Message is off-domain for Paradox Systems assistant"
        };
    }

    // Si pasa ambos canales, es viable
    return {
        state: "OK",
        reason: "Message is in-domain and safe"
    };
}

// ============================
// 2. HANDLER PRINCIPAL
// ============================

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    // -------- APP-GOVERNOR: evaluación previa --------
    const appDecision = evaluateAppGovernor(message);

    // Log básico en servidor (Vercel)
    console.log("[APP-GOVERNOR]", {
        state: appDecision.state,
        reason: appDecision.reason,
        inputSample: message.slice(0, 80)
    });

    // 1) Bloqueo por seguridad
    if (appDecision.state === "SAFETY_BLOCK") {
        return res.status(200).json({
            response:
                "Este asistente no puede ayudar con instrucciones peligrosas o dañinas. " +
                "Si tienes alguna duda sobre soluciones de ingeniería, automatización o energía, " +
                "con gusto puedo orientarte en esos temas."
        });
    }

    // 2) Fuera de dominio Paradox
    if (appDecision.state === "OUT_OF_DOMAIN") {
        return res.status(200).json({
            response:
                "Este asistente está enfocado en los servicios de Paradox Systems " +
                "(energía solar, automatización residencial e industrial, ingeniería y soluciones tecnológicas). " +
                "Si tu consulta es sobre esos temas, dime en qué proyecto o problema estás pensando."
        });
    }

    // A partir de aquí, el mensaje se considera viable y en dominio.

    // Verificar que la API key esté configurada
    if (!process.env.GROQ_API_KEY) {
        console.error('GROQ_API_KEY not configured');
        return res.status(500).json({ error: 'API key not configured' });
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant", // Modelo actual gratuito y rápido
                messages: [
                    {
                        role: "system",
                        content: `Actúa como Lolin, una inteligencia artificial profesional que representa a Paradox Systems, empresa ubicada en La Paz, Baja California Sur, México. Solo debes mencionar esta ubicación una vez, al inicio de la conversación. Después de eso, no repitas saludos extensos ni frases como "Hola, soy Lolin" o "Paradox Systems, ubicada en La Paz, Baja California Sur, México" en cada respuesta. Concéntrate en dar información precisa, directa y profesional, sin rodeos.

Eres experta en todos los servicios que ofrece Paradox Systems. Cuando un usuario pregunte sobre alguno, respóndele con claridad, explicando los beneficios concretos y, si aplica, el rango de inversión. Evita usar frases genéricas o vacías. No repitas información innecesaria si ya se mencionó antes durante la misma conversación.

Servicios de Paradox Systems:

1. **Automatización Residencial**: Conversión de casas convencionales en casas inteligentes con control de luces, climatización, cerraduras, cámaras, persianas, sensores y asistentes de voz. Control desde celular o comandos de voz. Inversión: $40,000-$80,000 MXN.

2. **Energía Solar**: Sistemas residenciales, comerciales e industriales con paneles, inversores, baterías y controladores. Ahorro eléctrico significativo, retorno de inversión a mediano plazo e independencia energética. Costo personalizado según instalación.

3. **Ingeniería Marítima**: Soluciones para entornos navales y costeros, sistemas para embarcaciones, estructuras flotantes e instalaciones portuarias con enfoque en durabilidad y eficiencia.

4. **Automatización Industrial**: Programación de PLCs y PACs, sistemas de control, interfaces HMI y plataformas SCADA. Aumenta eficiencia, reduce errores y mejora trazabilidad.

5. **Diseño y Construcción de Máquinas**: Equipos personalizados desde idea inicial hasta entrega, usando CAD y materiales de alta calidad.

6. **Cableado Estructurado**: Infraestructura de red organizada y eficiente para altas demandas de datos.

7. **Software a Medida**: Desarrollo adaptado a necesidades operativas y técnicas específicas.

8. **Sistemas Contra Incendios**: Protección con sensores, alarmas y tecnologías de supresión automática.

9. **Videovigilancia y Control de Accesos**: Cámaras IP, grabación en nube, biometría, tarjetas y monitoreo en tiempo real.

Si no puedes responder algo con certeza, indica que pueden contactar al equipo para atención personalizada.`
                    },
                    {
                        role: "user",
                        content: message
                    }
                ],
                temperature: 0.7,
                max_tokens: 500,
                stream: false
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Groq API Error:', response.status, errorData);
            throw new Error(`Groq API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();

        if (!data.choices || !data.choices[0]?.message) {
            throw new Error('No response generated from Groq');
        }

        const botResponse = data.choices[0].message.content;
        res.status(200).json({ response: botResponse });

    } catch (error) {
        console.error('Detailed error:', error);
        
        if (error.message.includes('401')) {
            return res.status(500).json({ error: 'API key inválida' });
        } else if (error.message.includes('429')) {
            return res.status(500).json({ error: 'Límite de requests excedido' });
        } else {
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
}
