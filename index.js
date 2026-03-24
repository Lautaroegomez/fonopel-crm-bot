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

    const config = {
        headers: {
            'api_access_token': process.env.CHATWOOT_TOKEN.trim(),
            'Content-Type': 'application/json'
        }
    };
    const accId = process.env.CHATWOOT_ACCOUNT_ID.trim();
    const inboxId = Number(process.env.CHATWOOT_INBOX_ID.trim());
    const base = `https://app.chatwoot.com/api/v1/accounts/${accId}`;

    let categoria = "GENERAL";
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const result = await model.generateContent(
            `Clasificá en una palabra (VENTAS, SOPORTE o ADMIN): ${mensaje}`
        );
        const textResponse = result.response.text().trim().toUpperCase();
        categoria = textResponse.split(/\s+/)[0].replace(/[^A-Z]/g, '');
    } catch (e) {
        console.log("Gemini falló, continuando...");
    }

    try {
        let contactId = null;

        // 1. BUSCAR si el contacto ya existe por teléfono
        try {
            const searchRes = await axios.get(
                `${base}/contacts/search?q=%2B${telefono}&include_contacts=true`,
                config
            );
            const encontrados = searchRes.data.payload;
            if (encontrados && encontrados.length > 0) {
                contactId = encontrados[0].id; // ← ya existe, usamos su ID
                console.log("Contacto encontrado, ID:", contactId);
            }
        } catch (e) {
            console.log("Error buscando contacto:", e.message);
        }

        // 2. Si NO existe, crearlo
        if (!contactId) {
            const contactRes = await axios.post(`${base}/contacts`, {
                name: nombre,
                phone_number: `+${telefono}`,
                inbox_id: inboxId
            }, config);
            contactId = contactRes.data.id;
            console.log("Contacto creado, ID:", contactId);
        }

        // 3. CREAR CONVERSACIÓN
        const convRes = await axios.post(`${base}/conversations`, {
            contact_id: contactId,
            inbox_id: inboxId,
        }, config);
        const convId = convRes.data.id;

        // 4. ENVIAR MENSAJE
        await axios.post(`${base}/conversations/${convId}/messages`, {
            content: `[${categoria}] ${mensaje}`,
            message_type: "incoming",
            private: false
        }, config);

        res.json({ status: "success", conversacion: convId, categoria, contactId });

    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(200).send("Error Chatwoot: " + JSON.stringify(error.response?.data || error.message));
    }
});

app.get('/', (req, res) => res.send('🚀 Servidor Fonopel Online'));
app.listen(process.env.PORT || 8080);
