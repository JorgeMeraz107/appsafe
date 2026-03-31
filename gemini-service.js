/**
 * SchoolSafe - Gemini AI Integration Service
 * Handles communication with Google Gemini Flash API
 */

const GEMINI_API_KEYS = [
    "AIzaSyDrBf97fISf8FfNC9HL03WRrxv00begO9M", // Key 1
    "AIzaSyDHfax49kOT8EeUznoZc_Ub6X1qbA1q3ck", // Key 2
    "AIzaSyAlLFDkgvGobDZm_QxEGu7JyZRmqGEQZ8o"  // Key 3
];

let currentKeyIndex = 0;

/**
 * Sends a prompt to Gemini and returns the text response.
 * Implements key rotation for reliability.
 */
async function askGemini(prompt, retryCount = 0) {
    if (retryCount >= GEMINI_API_KEYS.length) {
        throw new Error("RESTRICCION_DE_USO");
    }

    const currentKey = GEMINI_API_KEYS[currentKeyIndex];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${currentKey}`;

    try {
        const response = await fetch(url, {
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
            const errMsg = err.error?.message || "";
            
            // Log detallado para que el usuario sepa por qué falla realmente
            console.error(`❌ Error en IA (Llave ${currentKeyIndex}): Status ${response.status}`, err);
            
            // Si la cuota se excedió (429) o la llave es inválida, rotar y reintentar
            if (response.status === 429 || errMsg.includes("API_KEY_INVALID") || response.status === 400) {
                console.warn(`🔄 Rotando llave ${currentKeyIndex}...`);
                currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
                return await askGemini(prompt, retryCount + 1);
            }
            throw new Error(errMsg || "Error en la API de Gemini");
        }

        const data = await response.json();
        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return resultText || "Resumen no disponible en este momento.";
    } catch (error) {
        if (error.message === "RESTRICCION_DE_USO") throw error;
        
        // Reintento genérico para errores de conexión
        if (retryCount < GEMINI_API_KEYS.length - 1) {
            currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
            return await askGemini(prompt, retryCount + 1);
        }
        
        console.error("Gemini Critical Error:", error);
        throw new Error("El sistema de inteligencia está en mantenimiento técnico.");
    }
}

/**
 * Specialized function to generate a safety report.
 * @param {Object} studentData - Sensor and status data.
 * @returns {Promise<string>}
 */
async function generateSafetySummary(studentData) {
    const systemPrompt = `ACTÚA COMO UN ASISTENTE DE SEGURIDAD EMPÁTICO Y PROFESIONAL.
Responde al padre sobre el estado de su hijo(a) ${studentData.name}.
ESTILO:
- Tono humano, cálido y tranquilizador, pero muy profesional.
- Usa saltos de línea para que NO sea un párrafo pegado.
- Máximo 60 palabras.
- Sin emojis, sin iconos, solo texto profesional.

DATOS PARA ANALIZAR:
Alumno: ${studentData.name}
SOS: ${studentData.sos ? "ALERTA SOS ACTIVA (Peligro)" : "Normal (sin alertas)"}
Batería: ${Math.round(studentData.battery * 100)}%
Ubicación: ${studentData.location || "No disponible"}
Movimiento: ${studentData.motion || "Reposo/Normal"}
`;

    return await askGemini(systemPrompt);
}

/**
 * Generates a random daily safety tip.
 * @returns {Promise<string>}
 */
async function getSafetyTip() {
    const prompt = "Genera un consejo de seguridad escolar breve, cálido y humano para un padre (máximo 15 palabras, sin emojis).";
    return await askGemini(prompt);
}

// Global export for use in index.html
window.ss_gemini = {
    ask: askGemini,
    summarize: generateSafetySummary,
    getTip: getSafetyTip
};
