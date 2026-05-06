/**
 * SchoolSafe - Gemini AI Integration Service
 * Handles communication with Google Gemini Flash API
 * NOW SYNCED WITH ADMIN PANEL CLUSTER
 */

let GEMINI_API_KEYS = []; // Se llena dinámicamente desde Firestore
let currentKeyIndex = 0;
let aiInitialized = false;

/**
 * Inicializa el servicio esperando a que Firebase esté listo
 * y suscribiéndose a las llaves gestionadas por el Administrador.
 */
function initAiService() {
    const fb = window.ss_firebase;
    
    if (fb && typeof fb.subscribeToAiConfig === 'function') {
        fb.subscribeToAiConfig((config) => {
            GEMINI_API_KEYS = config.active_keys || [];
            aiInitialized = true;
            console.log(`🤖 IA de Padres: Sincronizada con ${GEMINI_API_KEYS.length} llaves desde el Panel Admin.`);
            
            // Si la UI ya está cargada, avisarle que ya puede generar el reporte
            if (typeof window.loadSafetyTip === 'function') {
                window.loadSafetyTip();
            }
        });
    } else {
        // Reintento por si firebase.js aún no se carga
        setTimeout(initAiService, 500);
    }
}

// Iniciar sincronización de inmediato
initAiService();

/**
 * Sends a prompt to Gemini and returns the text response.
 * Implements key rotation for reliability.
 */
async function askGemini(prompt, retryCount = 0) {
    if (!aiInitialized) {
        // Pequeña espera si se intenta usar antes de sincronizar
        await new Promise(r => setTimeout(r, 1000));
    }

    if (GEMINI_API_KEYS.length === 0) {
        throw new Error("El administrador no ha configurado llaves de IA activas.");
    }

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
            
            console.error(`❌ Error en IA (Llave ${currentKeyIndex}): Status ${response.status}`, err);
            
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
