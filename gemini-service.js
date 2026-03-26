/**
 * SchoolSafe - Gemini AI Integration Service
 * Handles communication with Google Gemini Flash API
 */

const GEMINI_API_KEY = "AIzaSyA8E7RHyHsKcaJyw5njcBFtCX5dn7A_zIk";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

/**
 * Sends a prompt to Gemini and returns the text response.
 * @param {string} prompt - The user or system prompt.
 * @returns {Promise<string>} - The AI response text.
 */
async function askGemini(prompt) {
    try {
        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Error en la API de Gemini");
        }

        const data = await response.json();
        // Extract the text from the response structure
        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return resultText || "No recibí respuesta de la IA.";
    } catch (error) {
        console.error("Gemini Error:", error);
        return `Lo siento, hubo un problema al conectar con mi cerebro de IA: ${error.message}`;
    }
}

/**
 * Specialized function to generate a safety report.
 * @param {Object} studentData - Sensor and status data.
 * @returns {Promise<string>}
 */
async function generateSafetySummary(studentData) {
    const systemPrompt = `
    Actúa como el Asistente Inteligente de SchoolSafe. Tu objetivo es informar al padre de familia
    sobre la seguridad de su hijo de forma moderna, empática y profesional.
    
    DATOS ACTUALES DEL ESTUDIANTE:
    - Nombre: ${studentData.name}
    - Estado de Alerta: ${studentData.sos ? "🚨 SOS ACTIVADO" : "✅ SEGURO"}
    - Batería: ${Math.round(studentData.battery * 100)}%
    - Última Ubicación: ${studentData.location || "Desconocida"}
    - Movimiento: ${studentData.motion || "Reposo"}
    
    INSTRUCCIONES:
    1. Si hay un SOS, sé urgente pero calmado, dando recomendaciones de seguridad.
    2. Si todo está bien, sé positivo y breve.
    3. Usa iconos (emojis) para que sea visualmente moderno.
    4. El reporte debe ser corto (máximo 3 párrafos).
    5. No inventes datos que no se mencionan.
    6. Habla directamente al padre/madre.
    `;

    return await askGemini(systemPrompt);
}

/**
 * Generates a random daily safety tip.
 * @returns {Promise<string>}
 */
async function getSafetyTip() {
    const prompt = "Genera un consejo de seguridad escolar corto y útil para un padre de familia. Usa un emoji. Máximo 15 palabras.";
    return await askGemini(prompt);
}

// Global export for use in index.html
window.ss_gemini = {
    ask: askGemini,
    summarize: generateSafetySummary,
    getTip: getSafetyTip
};
