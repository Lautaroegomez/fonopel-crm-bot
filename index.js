const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Mapa de opciones -> labels
const OPCIONES = {
    "1": { label: "posventa-ml", texto: "Posventa Mercado Libre" },
    "2": { label: "compras",     texto: "Comprar articulos" },
    "3": { label: "factura",     texto: "Solicitar Factura" },
    "4": { label: "mayorista",   texto: "Cotizacion mayorista" }
};

const MENU = `Hola! Bienvenido a Fonopel. En que podemos ayudarte?\n\n1 - Posventa Mercado Libre\n2 - Comprar articulos\n3 - Solicitar Factura\n4 - Cotizacion mayorista\n\nResponde con el numero de tu opcion.`;

// Estado simple en memoria
const sesiones = {};

app.all('/webhook', async (req, res) => {
    const mensaje  = (req.body.message  || req.query.message  || "").trim();
    const nombre   = req.body.contact_name  || req.query.contact_name  || "Cliente";
    const telefono = req.body.contact_phone || req.query.contact_phone || "549341000111";

    const config = {
        headers: {
            'api_access_token': process.env.CHATWOOT_TOKEN.trim(),
            'Content-Type': 'application/json'
        }
    };

    const accId   = process.env.CHATWOOT_ACCOUNT_ID.trim();
    const inboxId = Number(process.env.CHATWOOT_INBOX_ID.trim());
    const base    = `https://app.chatwoot.com/api/v1/accounts/${accId}`;

    try {
        // -- 1. BUSCAR O CREAR CONTACTO ---------------------
        let contactId = null;

        try {
            const searchRes = await axios.get(
                `${base}/contacts/search?q=%2B${telefono}&include_contacts=true`,
                config
            );
            const encontrados = searchRes.data.payload;
            if (encontrados && encontrados.length > 0) {
                contactId = encontrados[0].id;
            }
        } catch (e) {
            console.log("Error buscando contacto:", e.message);
        }

        if (!contactId) {
            const contactRes = await axios.post(`${base}/contacts`, {
                name: nombre,
                phone_number: `+${telefono}`,
                inbox_id: inboxId
            }, config);
            contactId = contactRes.data.id;
            console.log("Contacto creado, ID:", contactId);
        } else {
            console.log("Contacto encontrado, ID:", contactId);
        }

        // -- 2. BUSCAR O CREAR CONVERSACION -----------------
        let convId = sesiones[telefono] || null;

        if (!convId) {
            const convRes = await axios.post(`${base}/conversations`, {
                contact_id: contactId,
                inbox_id: inboxId,
            }, config);
            convId = convRes.data.id;
            sesiones[telefono] = convId;
            console.log("Conversacion creada, ID:", convId);
        }

        // -- 3. REGISTRAR MENSAJE DEL CLIENTE ---------------
        await axios.post(`${base}/conversations/${convId}/messages`, {
            content: mensaje,
            message_type: "incoming",
            private: false
        }, config);

        // -- 4. LOGICA DEL MENU -----------------------------
        const opcion = OPCIONES[mensaje];

        if (opcion) {
            // Cliente eligio una opcion valida -> asignar label
            await axios.post(`${base}/conversations/${convId}/labels`, {
                labels: [opcion.label]
            }, config);

            // Confirmar al cliente
            await axios.post(`${base}/conversations/${convId}/messages`, {
                content: `Entendido! Te asignamos al area de ${opcion.texto}. Un agente teatendera pronto.`,
                message_type: "outgoing",
                private: false
            }, config);

            // Limpiar sesion para proxima conversacion
            delete sesiones[telefono];

        } else {
            // Cliente no eligio opcion valida -> mostrar menu
            await axios.post(`${base}/conversations/${convId}/messages`, {
                content: MENU,
                message_type: "outgoing",
                private: false
            }, config);
        }

        res.json({ status: "success", conversacion: convId, contactId });

    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(200).send("Error Chatwoot: " + JSON.stringify(error.response?.data || error.message));
    }
});

app.get('/', (req, res) => res.send('Servidor Fonopel Online'));
app.listen(process.env.PORT || 8080);
