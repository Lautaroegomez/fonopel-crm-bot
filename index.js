const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const OPCIONES = {
    "1": { label: "posventa-ml", texto: "Posventa Mercado Libre" },
    "2": { label: "compras",     texto: "Comprar articulos" },
    "3": { label: "factura",     texto: "Solicitar Factura" },
    "4": { label: "mayorista",   texto: "Cotizacion mayorista" }
};

const MENU = `¡Hola! Bienvenido a Fonopel. ¿En qué podemos ayudarte?\n\n1 - Posventa Mercado Libre\n2 - Comprar artículos\n3 - Solicitar Factura\n4 - Cotización mayorista\n\nResponde solo con el número de tu opción.`;

// --- FUNCIONES CORREGIDAS (RUTAS OFICIALES) ---
async function buscarOCrearContacto(base, telefono, nombre, inboxId, config) {
    try {
        const searchRes = await axios.get(`${base}/contacts/search?q=%2B${telefono}`, config);
        if (searchRes.data.payload?.length > 0) return searchRes.data.payload[0].id;
    } catch (e) { console.log("Error búsqueda contacto:", e.message); }

    try {
        const res = await axios.post(`${base}/contacts`, {
            name: nombre, phone_number: `+${telefono}`, inbox_id: inboxId
        }, config);
        return res.data?.payload?.contact?.id || res.data?.id;
    } catch (e) {
        if (e.response?.status === 422) {
            const retry = await axios.get(`${base}/contacts/search?q=%2B${telefono}`, config);
            return retry.data.payload[0]?.id;
        }
        throw e;
    }
}

async function buscarOCrearConversacion(base, contactId, inboxId, config) {
    try {
        // CORRECCIÓN: La ruta correcta para ver conversaciones de un contacto
        const res = await axios.get(`${base}/contacts/${contactId}/conversations`, config);
        const abierta = res.data.payload?.find(c => c.status === "open" && c.inbox_id === inboxId);
        if (abierta) return { convId: abierta.id, mensajes: abierta.messages || [] };
    } catch (e) { console.log("Error buscando conv:", e.message); }

    // CORRECCIÓN: La ruta para crear conversación es /conversations directamente bajo la cuenta
    const res = await axios.post(`${base}/conversations`, { 
        contact_id: contactId, 
        inbox_id: inboxId 
    }, config);
    return { convId: res.data?.id, mensajes: [] };
}

app.all('/webhook', async (req, res) => {
    if (req.body.message_type === 'outgoing' || req.body.sender_type === 'bot') {
        return res.json({ status: "ignored" });
    }

    const mensaje = (req.body.content || req.query.message || "").toString().trim();
    const nombre = req.body.sender?.name || req.query.contact_name || "Cliente";
    const telefono = (req.body.sender?.phone_number || req.query.contact_phone || "549341000111").replace(/\D/g, '');
    const conversationId = req.body.conversation?.id;

    if (!mensaje && !req.body.content) return res.json({ status: "no_content" });

    const config = { headers: { 'api_access_token': process.env.CHATWOOT_TOKEN.trim(), 'Content-Type': 'application/json' } };
    const accId = process.env.CHATWOOT_ACCOUNT_ID.trim();
    const inboxId = Number(process.env.CHATWOOT_INBOX_ID.trim());
    const base = `https://app.chatwoot.com/api/v1/accounts/${accId}`;

    try {
        let convId = conversationId;
        let listaMensajes = [];

        if (!convId) {
            const contactId = await buscarOCrearContacto(base, telefono, nombre, inboxId, config);
            const convData = await buscarOCrearConversacion(base, contactId, inboxId, config);
            convId = convData.convId;
            listaMensajes = convData.mensajes;
        }

        const opcion = OPCIONES[mensaje];

        if (opcion) {
            await axios.post(`${base}/conversations/${convId}/labels`, { labels: [opcion.label] }, config);
            await axios.post(`${base}/conversations/${convId}/messages`, {
                content: `¡Entendido! Te asignamos al área de ${opcion.texto}. Un agente te atenderá pronto.`,
                message_type: "outgoing"
            }, config);
            await axios.patch(`${base}/conversations/${convId}/toggle_status`, { status: "resolved" }, config);
        } else {
            await axios.post(`${base}/conversations/${convId}/messages`, {
                content: MENU,
                message_type: "outgoing"
            }, config);
        }

        res.json({ status: "success", conversacion: convId });

    } catch (error) {
        console.error("Error final:", error.response?.data || error.message);
        res.status(200).json({ status: "error", details: error.message });
    }
});

app.get('/', (req, res) => res.send('🚀 CRM Fonopel Online'));
app.listen(process.env.PORT || 8080);
