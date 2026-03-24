const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Esta ruta es para que Railway sepa que la APP está viva
app.get('/', (req, res) => res.send('🚀 CRM Fonopel Online y Conectado'));

// Esta ruta acepta TODO (GET y POST) para que no falle nunca la prueba
app.all('/webhook', async (req, res) => {
    console.log("Solicitud recibida en /webhook");
    
    // Captura datos del link (query) o de un mensaje real (body)
    const mensaje = req.body.message || req.query.message || "Hola";
    const nombre = req.body.contact_name || req.query.contact_name || "Cliente Prueba";
    const telefono = req.body.contact_phone || req.query.contact_phone || "549341000111";

    try {
        // 1. Gemini Clasifica
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const prompt = `Sos el clasificador de Tienda Fonopel. Analizá y respondé SOLO: VENTAS, SOPORTE o ADMIN. Mensaje: "${mensaje}"`;
        const result = await model.generateContent(prompt);
        const categoria = result.response.text().trim();

        // 2. Enviamos a Chatwoot
        const chatwootUrl = `https://app.chatwoot.com/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}/conversations`;
        
        await axios.post(chatwootUrl, {
            source_id: telefono,
            inbox_id: process.env.CHATWOOT_INBOX_ID,
            contact_name: nombre,
            message: { content: mensaje },
            additional_attributes: { category: categoria }
        }, { headers: { 'api_access_token': process.env.CHATWOOT_TOKEN } });

        res.status(200).json({ status: "success", category: categoria });
    } catch (error) {
        console.error("Error detectado:", error.message);
        res.status(200).send("Servidor vivo, pero hubo un error de conexión.");
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Online en puerto ${PORT}`));
