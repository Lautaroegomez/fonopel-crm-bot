const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get('/', (req, res) => res.send('🚀 Servidor de Fonopel Online'));

app.all('/webhook', async (req, res) => {
    const mensaje = req.body.message || req.query.message || "Hola";
    const nombre = req.body.contact_name || req.query.contact_name || "Cliente Prueba";
    const telefono = req.body.contact_phone || req.query.contact_phone || "549341000111";

    let categoria = "PENDIENTE";

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`Clasificá en una palabra (VENTAS, SOPORTE o ADMIN): ${mensaje}`);
        const response = await result.response;
        categoria = response.text().trim().toUpperCase();
    } catch (e) {
        console.log("Error en Gemini, siguiendo sin clasificación...");
    }

    try {
        const chatwootUrl = `https://app.chatwoot.com/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}/inboxes/${process.env.CHATWOOT_INBOX_ID}/contacts`;
        
        await axios.post(chatwootUrl, {
            name: nombre,
            phone_number: `+${telefono}`,
            message: { content: `[${categoria}] ${mensaje}` }
        }, { 
            headers: { 'api_access_token': process.env.CHATWOOT_TOKEN } 
        });

        res.json({ status: "success" });

    } catch (error) {
        console.error("Error en Chatwoot:", error.message);
        res.status(200).send("Error: " + error.message);
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log("Online!"));
