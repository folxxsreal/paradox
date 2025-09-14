// api/chat.js - Versión con Groq (GRATIS)
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

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