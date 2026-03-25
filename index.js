const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ── Variables de entorno ──────────────────────────────────────────────────────
const CLAUDE_API_KEY  = process.env.CLAUDE_API_KEY;       // tu key de Anthropic
const CHATWOOT_TOKEN  = process.env.CHATWOOT_TOKEN;
const ACCOUNT_ID      = process.env.CHATWOOT_ACCOUNT_ID;
const CHATWOOT_URL    = "https://app.chatwoot.com/api/v1";

// ── Función de clasificación con Claude ───────────────────────────────────────
async function clasificarMensaje(mensaje) {
    const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
            model: "claude-haiku-4-5",   // el más rápido y económico
            max_tokens: 10,
            messages: [
                {
                    role: "user",
                    content: `Clasificá este mensaje de un cliente de Tienda Fonopel en UNA SOLA PALABRA, sin puntuación: "Venta", "Soporte" o "Reclamo". Mensaje: "${mensaje}"`
                }
            ]
        },
        {
            headers: {
                "x-api-key": CLAUDE_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json"
            }
        }
    );

    return response.data.content[0].text.trim().replace(/[^a-zA-Z]/g, "");
}

// ── Función para aplicar etiqueta en Chatwoot ─────────────────────────────────
async function aplicarEtiqueta(conversationId, etiqueta) {
    await axios.post(
        `${CHATWOOT_URL}/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
        { labels: [etiqueta] },
        {
            headers: {
                "api_access_token": CHATWOOT_TOKEN,
                "Content-Type": "application/json"
            }
        }
    );
}

// ── Webhook principal ─────────────────────────────────────────────────────────
app.all('*', async (req, res) => {
    const data = req.body;

    if (data.event === "message_created" && data.message_type === "incoming") {
        const conversationId  = data.conversation.id;
        const messageContent  = data.content;

        console.log(`--- Procesando para Tienda Fonopel: "${messageContent}" ---`);

        try {
            const clasificacion = await clasificarMensaje(messageContent);
            console.log(`IA Clasificó como: ${clasificacion}`);

            await aplicarEtiqueta(conversationId, clasificacion);
            console.log(`✅ Etiqueta "${clasificacion}" aplicada con éxito.`);

            // ── PRÓXIMAS FUNCIONES (descomentar cuando estés listo) ──────────
            // await responderMensaje(conversationId, clasificacion, messageContent);
            // await consultarStock(messageContent);
            // await escalarAHumano(conversationId, clasificacion);

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

// ── Servidor ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Cerebro Fonopel PRO activo en puerto ${PORT}`));
