const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get('/', (req, res) => res.send('🚀 CRM Fonopel Online'));

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
        console.log("Error Gemini:", e.message);
    }

    try {
        // RUTA CORREGIDA: Sin barras extras y con los IDs limpios
        const accountId = process.env.CHATWOOT_ACCOUNT_ID.trim();
        const inboxId = process.env.CHATWOOT_INBOX_ID.trim();
        const chatwootUrl = `https://app.chatwoot.com/api/v1/accounts/${accountId}/conversations`;
        
        await axios.post(chatwootUrl, {
            source_id: telefono,
            inbox_id: inboxId,
            contact_name: nombre,
            message: { content: `[${categoria}] ${mensaje}` }
        }, { 
            headers: { 
                'api_access_token': process.env.CHATWOOT_TOKEN.trim(),
                'Content-Type': 'application/json'
            } 
        });

        res.json({ status: "success", info: "¡Mensaje en Chatwoot!" });

    } catch (error) {
        // Esto nos mostrará el error real de la API si falla
        const errorData = error.response?.data || error.message;
        console.error("Error Chatwoot:", errorData);
        res.status(200).send("Resultado: " + JSON.stringify(errorData));
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log("Online!"));
