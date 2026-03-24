const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// --- CONFIGURACIÓN DE TIENDA FONOPEL ---
const OPCIONES = {
    "1": { label: "posventa-ml", texto: "Posventa Mercado Libre" },
    "2": { label: "compras",     texto: "Comprar articulos" },
    "3": { label: "factura",     texto: "Solicitar Factura" },
    "4": { label: "mayorista",   texto: "Cotizacion mayorista" }
};

const MENU = `¡Hola! Bienvenido a Fonopel. ¿En qué podemos ayudarte?\n\n1 - Posventa Mercado Libre\n2 - Comprar artículos\n3 - Solicitar Factura\n4 - Cotización mayorista\n\nResponde solo con el número de tu opción.`;

// --- FUNCIONES DE APOYO (MANTENEMOS TU LÓGICA) ---
async function buscarOCrearContacto(base, telefono, nombre, inboxId, config) {
    try {
        const searchRes = await axios.get(`${base}/contacts/search?q=%2B${telefono}`, config);
        const lista = searchRes.data.payload;
        if (lista && lista.length > 0) return lista[0].id;
    } catch (e) { console.log("Error búsqueda:", e.message); }

    try {
        const res = await axios.post(`${base}/contacts`, {
            name: nombre, phone_number: `+${telefono}`, inbox_id: inboxId
        }, config);
        return res.data?.id || res.data?.contact?.id || res.data?.data?.id;
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
        const res = await axios.get(`${base}/contacts/${contactId}/conversations`, config);
        const abierta = res.data.payload?.find(c => c.status === "open" && c.inbox_id === inboxId);
        if (abierta) return { convId: abierta.id, mensajes: abierta.messages || [] };
    } catch (e) { console.log("Error conv:", e.message); }

    const res = await axios.post(`${base}/conversations`, { contact_id: contactId, inbox_id: inboxId }, config);
    return { convId: res.data?.id || res.data?.data?.id, mensajes: [] };
}

// --- WEBHOOK PRINCIPAL CON ESCUDO ANTI-LOOP ---
app.all('/webhook', async (req, res) => {
    // 🛡️ PASO 1: ROMPER EL LOOP (Si el mensaje es saliente o de bot, ignorar)
    if (req.body.message_type === 'outgoing' || req.body.sender_type === 'bot' || req.body.event === 'message_updated') {
        return res.json({ status: "ignored" });
    }

    // Captura de datos (Chatwoot usa .content en webhooks reales)
    const mensaje = (req.body.content || req.query.message || "").toString().trim();
    const nombre = req.body.sender?.name || req.query.contact_name || "Cliente";
    const telefono = (req.body.sender?.phone_number || req.query.contact_phone || "549341000111").replace(/\D/g, '');
    const conversationId = req.body.conversation?.id;

    if (!mensaje) return res.json({ status: "no_content" });

    const config = { headers: { 'api_access_token': process.env.CHATWOOT_TOKEN.trim(), 'Content-Type': 'application/json' } };
    const accId = process.env.CHATWOOT_ACCOUNT_ID.trim();
    const inboxId = Number(process.env.CHATWOOT_INBOX_ID.trim());
    const base = `https://app.chatwoot.com/api/v1/accounts/${accId}`;

    try {
        let convId = conversationId;
        let listaMensajes = [];

        // Si es un test manual (no viene de webhook real), creamos contacto/conv
        if (!convId) {
            const contactId = await buscarOCrearContacto(base, telefono, nombre, inboxId, config);
            const convData = await buscarOCrearConversacion(base, contactId, inboxId, config);
            convId = convData.convId;
            listaMensajes = convData.mensajes;
        }

        const opcion = OPCIONES[mensaje];

        if (opcion) {
            // 1. ASIGNAR ETIQUETA
            await axios.post(`${base}/conversations/${convId}/labels`, { labels: [opcion.label] }, config);
            
            // 2. RESPONDER AL CLIENTE
            await axios.post(`${base}/conversations/${convId}/messages`, {
                content: `¡Entendido! Te asignamos al área de ${opcion.texto}. Un agente te atenderá pronto.`,
                message_type: "outgoing"
            }, config);

            // 3. OPCIONAL: RESOLVER PARA CERRAR EL FLUJO DEL BOT
            await axios.patch(`${base}/conversations/${convId}/toggle_status`, { status: "resolved" }, config);

        } else {
            // SI NO ES UNA OPCIÓN, MANDAR MENÚ (Solo si no es una respuesta del agente)
            await axios.post(`${base}/conversations/${convId}/messages`, {
                content: MENU,
                message_type: "outgoing"
            }, config);
        }

        res.json({ status: "success", conversacion: convId });

    } catch (error) {
        console.error("Error:", error.message);
        res.status(200).json({ status: "error", details: error.message });
    }
});

app.get('/', (req, res) => res.send('🚀 Servidor Fonopel Online y Anti-Loop'));
app.listen(process.env.PORT || 8080);
