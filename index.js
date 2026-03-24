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

    let categoria = "VENTAS";

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`Clasificá en una palabra (VENTAS, SOPORTE o ADMIN): ${mensaje}`);
        categoria = result.response.text().trim().toUpperCase();
    } catch (e) {
        console.log("Error Gemini, usando default.");
    }

    try {
        // ESTA ES LA RUTA QUE NO FALLA EN CHATWOOT OFICIAL
        const chatwootUrl = `https://app.chatwoot.com/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}/conversations`;
        
        await axios.post(chatwootUrl, {
            source_id: telefono,
            inbox_id: process.env.CHATWOOT_INBOX_ID,
            contact_name: nombre,
            message: { 
                content: `[${categoria}] ${mensaje}`,
                message_type: "incoming" // Fundamental para que aparezca como mensaje del cliente
            }
        }, { 
            headers: { 
                'api_access_token': process.env.CHATWOOT_TOKEN,
                'Content-Type': 'application/json'
            } 
        });

        res.json({ status: "success", info: "Mensaje en camino" });

    } catch (error) {
        // Si esto falla, nos dirá exactamente qué campo (ID o Token) no encuentra
        const errorData = error.response?.data || error.message;
        console.error("Error Real:", errorData);
        res.status(200).send("Respuesta de Chatwoot: " + JSON.stringify(errorData));
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor Fonopel Online!"));
