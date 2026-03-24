const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

// Forzamos la configuración de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.all('/webhook', async (req, res) => {
    const mensaje = req.body.message || req.query.message || "Hola";
    const nombre = req.body.contact_name || req.query.contact_name || "Cliente Prueba";
    const telefono = req.body.contact_phone || req.query.contact_phone || "549341000111";

    const config = { headers: { 'api_access_token': process.env.CHATWOOT_TOKEN.trim(), 'Content-Type': 'application/json' } };
    const accId = process.env.CHATWOOT_ACCOUNT_ID.trim();
    const inboxId = Number(process.env.CHATWOOT_INBOX_ID.trim());

    let categoria = "GENERAL";

    // 1. INTENTO DE CLASIFICACIÓN (Con salvavidas)
    try {
        // Usamos gemini-1.5-flash-latest que es la versión más compatible
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const result = await model.generateContent(`Clasificá en una palabra (VENTAS, SOPORTE o ADMIN): ${mensaje}`);
        const textResponse = result.response.text().trim().toUpperCase();
        categoria = textResponse.split(/\s+/)[0].replace(/[^A-Z]/g, '');
    } catch (e) {
        console.log("Gemini falló, pero seguimos adelante...");
    }

    try {
        // 2. CREAR O BUSCAR CONTACTO
        const contactRes = await axios.post(`https://app.chatwoot.com/api/v1/accounts/${accId}/contacts`, {
            name: nombre,
            phone_number: `+${telefono}`,
            inbox_id: inboxId
        }, config).catch(e => e.response);

        // 3. CREAR CONVERSACIÓN
        await axios.post(`https://app.chatwoot.com/api/v1/accounts/${accId}/conversations`, {
            source_id: telefono,
            inbox_id: inboxId,
            message: { content: `[${categoria}] ${mensaje}`, message_type: "incoming" }
        }, config);

        res.json({ status: "success" });

    } catch (error) {
        res.status(200).send("Error Chatwoot: " + JSON.stringify(error.response?.data || error.message));
    }
});

app.get('/', (req, res) => res.send('🚀 Servidor Fonopel Online'));
app.listen(process.env.PORT || 8080);
