const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

// Forzamos el uso de la API Key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get('/', (req, res) => res.send('🚀 Servidor Fonopel Vivo'));

app.all('/webhook', async (req, res) => {
    const mensaje = req.body.message || req.query.message || "Hola";
    const nombre = req.body.contact_name || req.query.contact_name || "Cliente Prueba";
    const telefono = req.body.contact_phone || req.query.contact_phone || "549341000111";

    let categoria = "VENTAS"; // Default para que no falle si Gemini se tilda

    try {
        // Usamos el modelo flash-latest que es más estable para el SDK
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const result = await model.generateContent(`Clasifica en una palabra (VENTAS, SOPORTE o ADMIN): ${mensaje}`);
        categoria = result.response.text().trim().toUpperCase();
    } catch (e) {
        console.log("Gemini falló, usamos default VENTAS");
    }

    try {
        // RUTA MAESTRA: Crear conversación y mensaje de un solo golpe
        const chatwootUrl = `https://app.chatwoot.com/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID.trim()}/inboxes/${process.env.CHATWOOT_INBOX_ID.trim()}/contacts`;
        
        await axios.post(chatwootUrl, {
            name: nombre,
            phone_number: `+${telefono}`,
            message: { 
                content: `[${categoria}] ${mensaje}`,
                message_type: "incoming"
            }
        }, { 
            headers: { 'api_access_token': process.env.CHATWOOT_TOKEN.trim() } 
        });

        res.json({ status: "success" });
    } catch (error) {
        const errorMsg = error.response?.data || error.message;
        console.error("Error Chatwoot:", errorMsg);
        res.status(200).send("Error: " + JSON.stringify(errorMsg));
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log("Online!"));
