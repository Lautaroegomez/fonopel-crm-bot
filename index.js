const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

// Configuración de las APIs desde variables de entorno
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const chatwootToken = process.env.CHATWOOT_TOKEN;
const chatwootUrl = "https://app.chatwoot.com/api/v1";
const accountId = process.env.CHATWOOT_ACCOUNT_ID;

// Aceptamos cualquier ruta (raíz o /webhook)
app.all('*', async (req, res) => {
    const data = req.body;

    // Solo procesamos mensajes nuevos de clientes
    if (data.event === "message_created" && data.message_type === "incoming") {
        const conversationId = data.conversation.id;
        const messageContent = data.content;

        console.log(`--- Procesando para Tienda Fonopel: "${messageContent}" ---`);

        try {
            // Usamos gemini-pro para evitar errores de compatibilidad
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            
            const prompt = `Actúa como clasificador para Tienda Fonopel (papelería y bindeadoras).
            Clasifica este mensaje en una sola palabra: "Venta", "Soporte" o "Reclamo".
            Mensaje: "${messageContent}"`;

            const result = await model.generateContent(prompt);
            const responseIA = await result.response;
            const classification = responseIA.text().trim().replace(/[^a-zA-Z]/g, "");
            
            console.log(`IA Clasificó como: ${classification}`);

            // Aplicamos la etiqueta en Chatwoot
            const labelUrl = `${chatwootUrl}/accounts/${accountId}/conversations/${conversationId}/labels`;
            
            await axios.post(
                labelUrl,
                { labels: [classification] },
                { headers: { 'api_access_token': chatwootToken, 'Content-Type': 'application/json' } }
            );

            console.log(`✅ Etiqueta "${classification}" aplicada en Chatwoot.`);

        } catch (error) {
            console.error("❌ Error en el proceso:", error.message);
        }
    }
    res.status(200).send("OK");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Cerebro de Fonopel listo en puerto ${PORT}`));
