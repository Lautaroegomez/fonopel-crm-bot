const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ── Variables de entorno ──────────────────────────────────────────────────────
const CLAUDE_API_KEY  = process.env.CLAUDE_API_KEY;
const CHATWOOT_TOKEN  = process.env.CHATWOOT_TOKEN;
const ACCOUNT_ID      = process.env.CHATWOOT_ACCOUNT_ID;
const CHATWOOT_URL    = "https://app.chatwoot.com/api/v1";

// ── Mensajes automáticos por clasificación ────────────────────────────────────
const MENSAJES = {
    venta:   "¡Hola! 👋 Gracias por contactarte con Tienda Fonopel. En breve un asesor te va a atender para ayudarte con tu compra. 🛒",
    soporte: "¡Hola! 👋 Gracias por contactarte con Tienda Fonopel. Recibimos tu consulta de soporte y en breve un especialista te va a atender. 🔧",
    reclamo: "¡Hola! 👋 Lamentamos los inconvenientes. Recibimos tu reclamo y lo vamos a gestionar a la brevedad. Un asesor te contactará pronto. 🙏"
};

// ── Función de clasificación con Claude ───────────────────────────────────────
async function clasificarMensaje(mensaje) {
    const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
            model: "claude-haiku-4-5",
            max_tokens: 10,
            messages: [
                {
                    role: "user",
                    content: `Clasificá este mensaje de un cliente de Tienda Fonopel en UNA SOLA PALABRA, sin puntuación: "venta", "soporte" o "reclamo". Mensaje: "${mensaje}"`
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

    return response.data.content[0].text.trim().replace(/[^a-zA-Z]/g, "").toLowerCase();
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

// ── Función para enviar mensaje automático al cliente ─────────────────────────
async function enviarMensaje(conversationId, clasificacion) {
    const texto = MENSAJES[clasificacion] || MENSAJES.venta;

    await axios.post(
        `${CHATWOOT_URL}/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        {
            content: texto,
            message_type: "outgoing",
            private: false
        },
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

            await enviarMensaje(conversationId, clasificacion);
            console.log(`💬 Mensaje automático enviado al cliente.`);

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
