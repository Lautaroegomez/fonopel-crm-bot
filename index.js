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

// Usamos app.all('*') para que acepte cualquier ruta (raíz o /webhook)
app.all('*', async (req, res) => {
    const data = req.body;

    // Log para ver qué llega a Railway
    console.log("--- Datos recibidos de Chatwoot ---");

    // Verificamos que sea un mensaje nuevo y entrante de un cliente
    if (data.event === "message_created" && data.message_type === "incoming") {
        const conversationId = data.conversation.id;
        const messageContent = data.content;

        console.log(`Procesando mensaje de Tienda Fonopel: "${messageContent}"`);

        try {
            // 1. Clasificación con Gemini (Modelo corregido)
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = `Actúa como un clasificador de mensajes para "Tienda Fonopel", una tienda de bindeadoras y suministros de oficina en Rosario.
            Clasifica el siguiente mensaje en exactamente UNA de estas categorías: "Venta", "Soporte", "Reclamo".
            Responde solo con la palabra de la categoría.
            Mensaje del cliente: "${messageContent}"`;

            const result = await model.generateContent(prompt);
            const responseIA = await result.response;
            const classification = responseIA.text().trim().replace(/[^a-zA-Z]/g, ""); // Limpiamos texto extra

            console.log(`IA Clasificó como: ${classification}`);

            // 2. Aplicar etiqueta en Chatwoot
            const labelUrl = `${chatwootUrl}/accounts/${accountId}/conversations/${conversationId}/labels`;
            
            await axios.post(
                labelUrl,
                { labels: [classification] },
                { headers: { 'api_access_token': chatwootToken, 'Content-Type': 'application/json' } }
            );

            console.log(`✅ Etiqueta "${classification}" aplicada con éxito en Chatwoot.`);

        } catch (error) {
            console.error("❌ Error en el proceso:", error.message);
            if (error.response) console.error("Detalle error Chatwoot:", error.response.data);
        }
    }

    // Siempre respondemos 200 OK a Chatwoot para que no reintente el envío
    res.status(200).send("OK");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Cerebro de Tienda Fonopel activo en puerto ${PORT}`);
});
