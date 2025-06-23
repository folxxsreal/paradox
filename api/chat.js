export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        // Updated model name - use gemini-1.5-flash or gemini-1.5-pro
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Eres Lolin, el asistente virtual de Paradox Systems. Eres amigable, profesional y conoces todos los servicios de la empresa: Casas Inteligentes, Plantas Solares, Ingeniería Marítima, Automatización de Procesos, Diseño de Máquinas, Cableado Estructurado, Desarrollo de Software, Sistemas Contra Incendios, y Videovigilancia y Control de Accesos. Siempre responde en español y de manera concisa pero informativa. La empresa está ubicada en La Paz, Baja California Sur, México.

Usuario pregunta: ${message}`
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 200,
                }
            })
        });

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message);
        }

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('No response generated');
        }

        const botResponse = data.candidates[0].content.parts[0].text;
        res.status(200).json({ response: botResponse });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error processing request' });
    }
}