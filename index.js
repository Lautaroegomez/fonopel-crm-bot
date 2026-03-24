const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

// 1. Configuración de Gemini con la versión estable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get('/', (req, res) => res.send('🚀 Servidor Fonopel Online y Blindado'));

app.all('/webhook', async (req, res) => {
    console.log("Solicitud recibida");

    // Capturamos datos y limpiamos posibles espacios
    const mensaje = (req.body.message || req.query.message || "Hola").toString();
    const nombre = (req.body.contact_name || req.query.contact_name || "Cliente Prueba").toString();
    const telefono = (req.body.contact_phone || req.query.contact_phone || "549341000111").toString();

    let categoria = "VENTAS";

    // 2. Clasificación con Gemini (con manejo de error para no trabar el proceso)
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Clasificá este mensaje de un cliente de Tienda Fonopel en una sola palabra (VENTAS, SOPORTE o ADMIN): ${mensaje}`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        categoria = response.text().trim().toUpperCase();
        // Si Gemini devuelve más de una palabra, nos quedamos con la primera
        categoria = categoria.split(/\s+/)[0].replace(/[^A-Z]/g, '');
    } catch (e) {
        console.error("Error Gemini:", e.message);
        categoria = "PENDIENTE";
    }

    // 3. Envío a Chatwoot (Ruta Estándar con IDs Limpios)
    try {
        const accountId = process.env.CHATWOOT_ACCOUNT_ID.trim();
        const inboxId = Number(process.env.CHATWOOT_INBOX_ID.trim()); // Forzamos que sea número
        const token = process.env.CHATWOOT_TOKEN.trim();

        const chatwootUrl = `https://app.chatwoot.com/api/v1/accounts/${accountId}/conversations`;
        
        const payload = {
            source_id: telefono,
            inbox_id: inboxId,
            contact_name: nombre,
            message: { 
                content: `[${categoria}] ${mensaje}`,
                message_type: "incoming"
            }
        };

        await axios.post(chatwootUrl, payload, { 
            headers: { 
                'api_access_token': token,
                'Content-Type': 'application/json'
            } 
        });

        res.json({ status: "success", info: "¡GOL! Mensaje en Chatwoot" });

    } catch (error) {
        const errorData = error.response?.data || error.message;
        console.error("Error Chatwoot Detallado:", JSON.stringify(errorData));
        
        // Si falla, devolvemos el error real para saber qué ID está molestando
        res.status(200).send("Error Final: " + JSON.stringify(errorData));
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Online en puerto ${PORT}`));
