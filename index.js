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

const MENU = `Hola! Bienvenido a Fonopel. En que podemos ayudarte?\n\n1 - Posventa Mercado Libre\n2 - Comprar articulos\n3 - Solicitar Factura\n4 - Cotizacion mayorista\n\nResponde con el numero de tu opcion.`;

async function buscarOCrearContacto(base, telefono, nombre, inboxId, config) {
    // Primero buscar
    try {
        const searchRes = await axios.get(
            `${base}/contacts/search?q=%2B${telefono}&include_contacts=true`, config
        );
        const lista = searchRes.data.payload;
        if (lista && lista.length > 0) {
            console.log("Contacto encontrado:", lista[0].id);
            return lista[0].id;
        }
    } catch (e) {
        console.log("Error en busqueda:", e.message);
    }

    // Si no existe, crear
    try {
        const res = await axios.post(`${base}/contacts`, {
            name: nombre,
            phone_number: `+${telefono}`,
            inbox_id: inboxId
        }, config);
        console.log("Contacto creado:", res.data.id);
        return res.data.id;
    } catch (e) {
        // Si falla al crear (ya existe por race condition), buscar de nuevo
        if (e.response && e.response.status === 422) {
            console.log("Contacto ya existia, buscando de nuevo...");
            const searchRes2 = await axios.get(
                `${base}/contacts/search?q=%2B${telefono}&include_contacts=true`, config
            );
            const lista2 = searchRes2.data.payload;
            if (lista2 && lista2.length > 0) {
                return lista2[0].id;
            }
        }
        throw e;
    }
}

async function buscarOCrearConversacion(base, contactId, inboxId, config) {
    try {
        const res = await axios.get(
            `${base}/contacts/${contactId}/conversations`, config
        );
        const conversaciones = res.data.payload;
        const abierta = conversaciones.find(c =>
            c.status === "open" && c.inbox_id === inboxId
        );
        if (abierta) {
            console.log("Conversacion abierta encontrada:", abierta.id);
            return { convId: abierta.id, mensajes: abierta.messages || [] };
        }
    } catch (e) {
        console.log("Error buscando conversacion:", e.message);
    }

    const res = await axios.post(`${base}/conversations`, {
        contact_id: contactId,
        inbox_id: inboxId,
    }, config);
    console.log("Conversacion nueva:", res.data.id);
    return { convId: res.data.id, mensajes: [] };
}

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
        // -- 1. CONTACTO ---------------------
        const contactId = await buscarOCrearContacto(base, telefono, nombre, inboxId, config);

        // -- 2. CONVERSACION -----------------
        const { convId, mensajes } = await buscarOCrearConversacion(base, contactId, inboxId, config);

        // -- 3. REGISTRAR MENSAJE CLIENTE ----
        await axios.post(`${base}/conversations/${convId}/messages`, {
            content: mensaje,
            message_type: "incoming",
            private: false
        }, config);

        // -- 4. LOGICA -----------------------
        const opcion = OPCIONES[mensaje];

        // Verificar si el menu ya fue enviado en esta conversacion
        const yaManduMenu = mensajes.some(m =>
            m.message_type === 1 &&
            m.content &&
            m.content.includes("Posventa Mercado Libre")
        );

        if (opcion) {
            await axios.post(`${base}/conversations/${convId}/labels`, {
                labels: [opcion.label]
            }, config);

            await axios.post(`${base}/conversations/${convId}/messages`, {
                content: `Entendido! Te asignamos al area de ${opcion.texto}. Un agente te atendera pronto.`,
                message_type: "outgoing",
                private: false
            }, config);

            await axios.patch(
                `${base}/conversations/${convId}/toggle_status`,
                { status: "resolved" }, config
            );

        } else if (yaManduMenu) {
            await axios.post(`${base}/conversations/${convId}/messages`, {
                content: `Por favor responde solo con el numero de tu opcion (1, 2, 3 o 4).`,
                message_type: "outgoing",
                private: false
            }, config);

        } else {
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
