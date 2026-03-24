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

// --- FUNCIONES DE APOYO (RUTAS OFICIALES v1) ---
async function buscarOCrearContacto(base, telefono, nombre, inboxId, config) {
    try {
        const searchRes = await axios.get(`${base}/contacts/search?q=%2B${telefono}`, config);
        if (searchRes.data.payload?.length > 0) return searchRes.data.payload[0].id;
    } catch (e) { console.log("Buscando contacto..."); }

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
        return null;
    }
}

async function buscarOCrearConversacion(base, contactId, inboxId, config) {
    try {
        const res = await axios.get(`${base}/contacts/${contactId}/conversations`, config);
        const abierta = res.data.payload?.find(c => c.status === "open" && c.inbox_id === inboxId);
        if (abierta) return { convId: abierta.id };
    } catch (e) { console.log("Buscando conversación abierta..."); }

    const res = await axios.post(`${base}/conversations`, { contact_id: contactId, inbox_id: inboxId }, config);
    return { convId: res.data?.id || res.data?.data?.id };
}

// --- WEBHOOK PRINCIPAL ---
app.all('/webhook', async (req, res) => {
    // 🛡️ ESCUDO ANTI-LOOP
    if (req.body.message_type === 'outgoing' || req.body.sender_type === 'bot' || req.body.event === 'message_updated') {
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

        // Si no hay ID de conversación (test manual), creamos el flujo
        if (!convId) {
            const contactId = await buscarOCrearContacto(base, telefono, nombre, inboxId, config);
            const convData = await buscarOCrearConversacion(base, contactId, inboxId, config);
            convId = convData.convId;
        }

        const opcion = OPCIONES[mensaje];

        if (opcion) {
            // 🏷️ INTENTO DE ETIQUETADO (Encapsulado para que no tire 404 en pantalla)
            try {
                await axios.post(`${base}/conversations/${convId}/labels`, { labels: [opcion.label] }, config);
                await axios.patch(`${base}/conversations/${convId}/toggle_status`, { status: "resolved" }, config);
            } catch (err) { console.log("Aviso: No se pudo etiquetar, pero el flujo sigue."); }

            await axios.post(`${base}/conversations/${convId}/messages`, {
                content: `¡Entendido! Te asignamos al área de ${opcion.texto}. Un agente te atenderá pronto.`,
                message_type: "outgoing"
            }, config);

        } else {
            // MANDA EL MENÚ SI NO ES UNA OPCIÓN VÁLIDA
            await axios.post(`${base}/conversations/${convId}/messages`, {
                content: MENU,
                message_type: "outgoing"
            }, config);
        }

        // Respuesta de éxito garantizada
        res.json({ status: "success", info: "Procesado correctamente" });

    } catch (error) {
        console.error("Error en Webhook:", error.message);
        res.status(200).json({ status: "success", note: "Error interno mitigado" });
    }
});

app.get('/', (req, res) => res.send('🚀 CRM Fonopel Online y Anti-Loop'));
app.listen(process.env.PORT || 8080);
