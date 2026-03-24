const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.all('/webhook', async (req, res) => {
    const mensaje = req.body.message || req.query.message || "Hola";
    const nombre = req.body.contact_name || req.query.contact_name || "Cliente Prueba";
    const telefono = req.body.contact_phone || req.query.contact_phone || "549341000111";

    const config = { headers: { 'api_access_token': process.env.CHATWOOT_TOKEN.trim(), 'Content-Type': 'application/json' } };
    const accId = process.env.CHATWOOT_ACCOUNT_ID.trim();
    const inboxId = Number(process.env.CHATWOOT_INBOX_ID.trim());

    try {
        // 1. CLASIFICACIÓN GEMINI
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`Clasificá en una palabra (VENTAS, SOPORTE o ADMIN): ${mensaje}`);
        const categoria = result.response.text().trim().toUpperCase().split(/\s+/)[0];

        // 2. CREAR O BUSCAR CONTACTO (Esto evita el 404)
        const contactRes = await axios.post(`https://app.chatwoot.com/api/v1/accounts/${accId}/contacts`, {
            name: nombre,
            phone_number: `+${telefono}`,
            inbox_id: inboxId
        }, config).catch(e => e.response); // Si ya existe, nos da el dato igual

        const contactSourceId = contactRes.data?.payload?.contact_inboxes?.[0]?.source_id || telefono;

        // 3. CREAR CONVERSACIÓN Y MENSAJE
        await axios.post(`https://app.chatwoot.com/api/v1/accounts/${accId}/conversations`, {
            source_id: contactSourceId,
            inbox_id: inboxId,
            message: { content: `[${categoria}] ${mensaje}`, message_type: "incoming" }
        }, config);

        res.json({ status: "success" });

    } catch (error) {
        console.error("Error:", error.response?.data || error.message);
        res.status(200).send("Error Final: " + JSON.stringify(error.response?.data || error.message));
    }
});

app.get('/', (req, res) => res.send('🚀 Servidor Fonopel Online'));
app.listen(process.env.PORT || 8080);
