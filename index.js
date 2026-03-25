const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

// Configuración de las APIs
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const chatwootToken = process.env.CHATWOOT_TOKEN;
const chatwootUrl = "https://app.chatwoot.com/api/v1";
const accountId = process.env.CHATWOOT_ACCOUNT_ID;

app.post('/webhook', async (req, res) => {
    const data = req.body;

    // Solo procesamos mensajes entrantes de clientes
    if (data.event === "message_created" && data.message_type === "incoming") {
        const conversationId = data.conversation.id;
        const messageContent = data.content;

        console.log(`--- Procesando mensaje de Tienda Fonopel: "${messageContent}" ---`);

        try {
            // 1. Consultamos a Gemini para clasificar el mensaje
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = `Analiza este mensaje de un cliente de una tienda de bindeadoras y papelería llamada "Tienda Fonopel". 
            Clasifícalo en UNA SOLA palabra de estas tres: "Venta", "Soporte", "Reclamo". 
            Mensaje: "${messageContent}"`;

            const result = await model.generateContent(prompt);
            const classification = result.response.text().trim();
            console.log(`IA Clasificó como: ${classification}`);

            // 2. Le ponemos la etiqueta a la conversación en Chatwoot
            await axios.post(
                `${chatwootUrl}/accounts/${accountId}/conversations/${conversationId}/labels`,
                { labels: [classification] },
                { headers: { 'api_access_token': chatwootToken } }
            );

            console.log(`Etiqueta "${classification}" aplicada con éxito.`);

        } catch (error) {
            console.error("Error procesando con IA:", error.response ? error.response.data : error.message);
        }
    }

    res.status(200).send("OK");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Cerebro de Fonopel activo en puerto ${PORT}`));
