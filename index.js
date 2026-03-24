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
                `${base}/contacts/search?q=%2B${telefono}&include_contacts=true`, config
            );
            const encontrados = searchRes.data.payload;
            if (encontrados && encontrados.length > 0) {
                contactId = encontrados[0].id;
            }
        } catch (e) {}

        if (!contactId) {
            const contactRes = await axios.post(`${base}/contacts`, {
                name: nombre,
                phone_number: `+${telefono}`,
                inbox_id: inboxId
            }, config);
            contactId = contactRes.data.id;
        }

        // -- 2. BUSCAR CONVERSACION ABIERTA EN CHATWOOT -----
        let convId = null;
        let esperandoOpcion = false;

        try {
            const convsRes = await axios.get(
                `${base}/contacts/${contactId}/conversations`, config
            );
            const conversaciones = convsRes.data.payload;

            const abierta = conversaciones.find(c =>
                c.status === "open" && c.inbox_id === inboxId
            );

            if (abierta) {
                convId = abierta.id;

                // Verificar si el bot ya mando el menu en esta conversacion
                const mensajes = abierta.messages || [];
                const yaManduMenu = mensajes.some(m =>
                    m.message_type === 1 && m.content && m.content.includes("Posventa Mercado Libre")
                );
                if (yaManduMenu) {
                    esperandoOpcion = true;
                }

                console.log("Conversacion abierta encontrada:", convId, "| Esperando opcion:", esperandoOpcion);
            }
        } catch (e) {
            console.log("Error buscando conversaciones:", e.message);
        }

        if (!convId) {
            const convRes = await axios.post(`${base}/conversations`, {
                contact_id: contactId,
                inbox_id: inboxId,
            }, config);
            convId = convRes.data.id;
            console.log("Conversacion nueva creada:", convId);
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

            await axios.post(`${base}/conversations/${convId}/messages`, {
                content: `Entendido! Te asignamos al area de ${opcion.texto}. Un agente te atendera pronto.`,
                message_type: "outgoing",
                private: false
            }, config);

            // Resolver la conversacion
            await axios.patch(
                `${base}/conversations/${convId}/toggle_status`,
                { status: "resolved" }, config
            );

        } else if (esperandoOpcion) {
            // Ya mando el menu pero el cliente no eligio opcion valida
            await axios.post(`${base}/conversations/${convId}/messages`, {
                content: `Por favor responde solo con el numero de tu opcion (1, 2, 3 o 4).`,
                message_type: "outgoing",
                private: false
            }, config);

        } else {
            // Primera vez -> mandar menu
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
