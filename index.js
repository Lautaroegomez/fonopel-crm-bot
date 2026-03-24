const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

app.all('/webhook', async (req, res) => {
    console.log("--- NUEVO MENSAJE RECIBIDO ---");
    console.log("Cuerpo del mensaje:", JSON.stringify(req.body, null, 2));

    if (req.body.message_type === 'outgoing' || req.body.sender_type === 'bot') {
        return res.json({ status: "ignored" });
    }

    const content = req.body.content;
    const convId = req.body.conversation?.id;

    if (content && convId) {
        console.log("Respondiendo a la conversación:", convId);
        try {
            const accId = process.env.CHATWOOT_ACCOUNT_ID.trim();
            const base = `https://app.chatwoot.com/api/v1/accounts/${accId}`;
            const config = { headers: { 'api_access_token': process.env.CHATWOOT_TOKEN.trim() } };

            await axios.post(`${base}/conversations/${convId}/messages`, {
                content: "🤖 Bot activo: He recibido tu mensaje.",
                message_type: "outgoing"
            }, config);
            console.log("Respuesta enviada con éxito.");
        } catch (e) {
            console.error("ERROR AL ENVIAR RESPUESTA:", e.response?.data || e.message);
        }
    }

    res.json({ status: "success" });
});

app.listen(process.env.PORT || 8080, () => console.log("Servidor escuchando..."));
