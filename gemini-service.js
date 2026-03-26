/**
 * SchoolSafe - Gemini AI Integration Service
 * Handles communication with Google Gemini Flash API
 */

const GEMINI_API_KEYS = [
    "AIzaSyA8E7RHyHsKcaJyw5njcBFtCX5dn7A_zIk", // Key 1
    "AIzaSyB74PgDbik7wVEkkZy5HR_D5EWIXwjZ7ko", // Key 2
    "AIzaSyBYn93oGfTwA4f9pu3yD5F7vhL1sJl6jWM", // Key 3
    "AIzaSyDMlB_JIfi2coXFSchPGkbmjZl9VEgFMbI"  // Key 4
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
            
            // Si la cuota se excedió (429) o la llave es inválida, rotar y reintentar
            if (response.status === 429 || errMsg.includes("API_KEY_INVALID") || response.status === 400) {
                console.warn(`Llave ${currentKeyIndex} falló. Rotando...`);
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
    const systemPrompt = `ASISTENTE DE SEGURIDAD PROFESIONAL.
Analiza y genera un reporte consiso para el padre.
REGLAS:
- Máximo 45 palabras.
- Solo texto plano profesional.
- No uses emojis, iconos ni markdown.
- Tono directo y serio.

DATOS:
Alumno: ${studentData.name}
SOS: ${studentData.sos ? "ACTIVO/PELIGRO" : "Inactivo"}
Batería: ${Math.round(studentData.battery * 100)}%
Ubicación: ${studentData.location || "No disponible"}
Estado: ${studentData.motion || "Normal"}
`;

    return await askGemini(systemPrompt);
}

/**
 * Generates a random daily safety tip.
 * @returns {Promise<string>}
 */
async function getSafetyTip() {
    const prompt = "Genera un consejo de seguridad escolar profesional y muy breve para un padre (máximo 12 palabras, sin emojis).";
    return await askGemini(prompt);
}

// Global export for use in index.html
window.ss_gemini = {
    ask: askGemini,
    summarize: generateSafetySummary,
    getTip: getSafetyTip
};
