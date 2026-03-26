/**
 * Vercel Serverless Function for Gemini API Proxy
 * Place this in /api/gemini.js
 */

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { contents } = req.body;
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: 'API Key not configured on Vercel' });
    }

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${API_KEY}`;

    try {
        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
