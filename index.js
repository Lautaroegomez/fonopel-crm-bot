const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const CHATWOOT_URL = "https://app.chatwoot.com/api/v1";

app.all('*', async (req, res) => {
    const data = req.body;

    if (data.event === "message_created" && data.message_type === "incoming") {
        const conversationId = data.conversation.id;
        const messageContent = data.content;

        console.log(`--- Procesando para Tienda Fonopel: "${messageContent}" ---`);

        try {
            // ✅ Modelo actualizado: gemini-2.0-flash (reemplaza al deprecado gemini-pro)
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

            const geminiResponse = await axios.post(geminiUrl, {
                contents: [{
                    parts: [{
                        text: `Clasifica este mensaje de un cliente de Tienda Fonopel en una sola palabra: "Venta", "Soporte", "Reclamo". Mensaje: "${messageContent}"`
                    }]
                }]
            });

            // Extraemos la respuesta
            const classification = geminiResponse.data.candidates[0].content.parts[0].text.trim().replace(/[^a-zA-Z]/g, "");
            console.log(`IA Clasificó como: ${classification}`);

            // Aplicar etiqueta en Chatwoot
            await axios.post(
                `${CHATWOOT_URL}/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
                { labels: [classification] },
                { headers: { 'api_access_token': CHATWOOT_TOKEN, 'Content-Type': 'application/json' } }
            );

            console.log(`✅ Etiqueta "${classification}" aplicada con éxito.`);

        } catch (error) {
            console.error("❌ Error en el proceso:");
            if (error.response) {
                console.error(JSON.stringify(error.response.data, null, 2));
            } else {
                console.error(error.message);
            }
        }
    }

    res.status(200).send("OK");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Cerebro Fonopel PRO activo en puerto ${PORT}`));
