const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get('/', (req, res) => res.send('🚀 CRM Fonopel Online y Conectado a Chatwoot'));

app.all('/webhook', async (req, res) => {
    // Simulamos o recibimos datos del cliente
    // Acepta datos tanto de un link (query) como de un mensaje real (body)
    const mensaje = req.body.message || req.query.message || "Hola";
    const nombre = req.body.contact_name || req.query.contact_name || "Cliente Nuevo";
    const telefono = req.body.contact_phone || req.query.contact_phone || "123456";
    try {
        // 1. Gemini clasifica el mensaje
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Sos el clasificador de Tienda Fonopel. Analizá el mensaje y respondé SOLO con: VENTAS, SOPORTE o ADMIN. Mensaje: "${mensaje}"`;
        const result = await model.generateContent(prompt);
        const categoria = result.response.text().trim();

        // 2. Enviamos la conversación a Chatwoot con la etiqueta de Gemini
        const chatwootUrl = `https://app.chatwoot.com/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}/conversations`;
        
        await axios.post(chatwootUrl, {
            source_id: telefono,
            inbox_id: process.env.CHATWOOT_INBOX_ID,
            contact_name: nombre,
            message: { content: mensaje },
            additional_attributes: { category: categoria }
        }, { 
            headers: { 'api_access_token': process.env.CHATWOOT_TOKEN } 
        });

        console.log(`✅ Clasificado como ${categoria} y enviado a Chatwoot`);
        res.status(200).send({ status: "success", category: categoria });

    } catch (error) {
        console.error("❌ Error:", error.message);
        res.status(200).send("Error procesado");
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor activo en puerto ${PORT}`));
