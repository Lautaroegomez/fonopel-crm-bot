const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

// Configuración de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Ruta de inicio para verificar que el servidor vive
app.get('/', (req, res) => res.send('🚀 CRM Fonopel Online y Conectado'));

// Webhook Principal
app.all('/webhook', async (req, res) => {
    console.log("Solicitud recibida en /webhook");
    
    // Captura datos del link (query) o de un mensaje real (body)
    const mensaje = req.body.message || req.query.message || "Hola";
    const nombre = req.body.contact_name || req.query.contact_name || "Cliente Prueba";
    const telefono = req.body.contact_phone || req.query.contact_phone || "549341000111";

    let categoria = "PENDIENTE";

    try {
        // 1. Clasificación con Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Sos el clasificador de Tienda Fonopel. Analizá y respondé SOLO con una palabra: VENTAS, SOPORTE o ADMIN. Mensaje: "${mensaje}"`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        categoria = response.text().trim().toUpperCase();
    } catch (e) {
        console.log("Error en Gemini, se enviará como PENDIENTE:", e.message);
    }

    try {
        // 2. Envío a Chatwoot (Ruta Robusta de Contactos)
        const chatwootUrl = `https://app.chatwoot.com/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}/inboxes/${process.env.CHATWOOT_INBOX_ID}/contacts`;
        
        await axios.post(chatwootUrl, {
            name: nombre,
            phone_number: `+${telefono}`, // El + es obligatorio para Chatwoot
            message: { 
                content: `[${categoria}] ${mensaje}` 
            }
        }, { 
            headers: { 
                'api_access_token': process.env.CHATWOOT_TOKEN,
                'Content-Type': 'application/json'
            } 
        });

        res.json({ status: "success", info: "¡Mensaje en Chatwoot!" });

    } catch (error) {
        console.error("Error detallado en Chatwoot:", error.response?.data || error.message);
        res.status(200).send("Error Chatwoot: " + JSON.stringify(error.response?.data || error.message));
    }
});

// Configuración del Puerto
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor Online en puerto ${PORT}`));
