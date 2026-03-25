const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// -- Variables de entorno ---------------------
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const ACCOUNT_ID     = process.env.CHATWOOT_ACCOUNT_ID;
const CHATWOOT_URL   = "https://app.chatwoot.com/api/v1";

// -- Horario de atencion (Argentina GMT-3) -----
const HORARIO = {
    dias: [1, 2, 3, 4, 5],
    horaInicio: 9,
    horaFin: 17
};

function estaEnHorario() {
    const ahora = new Date();
    const utc = ahora.getTime() + ahora.getTimezoneOffset() * 60000;
    const argentina = new Date(utc + (-3 * 60) * 60000);
    const dia  = argentina.getDay();
    const hora = argentina.getHours();
    const diaHabil  = HORARIO.dias.includes(dia);
    const horaHabil = hora >= HORARIO.horaInicio && hora < HORARIO.horaFin;
    console.log(`Hora Argentina: ${argentina.toLocaleString()} | En horario: ${diaHabil && horaHabil}`);
    return { enHorario: diaHabil && horaHabil, dia };
}

// -- Mensajes por clasificacion ---------------
const MENSAJES = {
    venta: `Hola! Gracias por contactarte con Tienda Fonopel.\n\nRecibimos tu consulta sobre una compra y en breve un asesor te va a atender para ayudarte a elegir el mejor producto.\n\nMientras esperás, podes ver nuestro catalogo completo en nuestra tienda de Mercado Libre.`,

    soporte: `Hola! Gracias por contactarte con Tienda Fonopel.\n\nRecibimos tu consulta de soporte tecnico. Un especialista va a revisar tu caso y te va a dar una solucion a la brevedad.\n\nSi tenes el numero de orden o factura a mano, tenerlo listo va a agilizar la atencion.`,

    reclamo: `Hola! Lamentamos los inconvenientes que tuviste.\n\nRecibimos tu reclamo y lo vamos a gestionar con prioridad. Un asesor va a contactarte a la brevedad para resolverlo.\n\nTe pedimos disculpas por las molestias causadas.`,

    "posventa-mercadolibre": `Hola! Gracias por contactarte con Tienda Fonopel.\n\nRecibimos tu consulta sobre tu compra en Mercado Libre. Un asesor especializado en posventa va a revisar tu caso y te va a responder a la brevedad.\n\nSi tenes el numero de orden de ML a mano, tenerlo listo va a agilizar la atencion.`,

    administrativo: `Hola! Gracias por contactarte con Tienda Fonopel.\n\nRecibimos tu solicitud administrativa (factura, ticket o comprobante). Nuestro equipo administrativo va a procesarla y te va a enviar lo que necesitas a la brevedad.\n\nSi tenes el numero de orden o fecha de compra a mano, compartilo para agilizar el tramite.`
};

const MENSAJE_FUERA_HORARIO = `Hola! Gracias por contactarte con Tienda Fonopel.\n\nEn este momento estamos fuera de nuestro horario de atencion.\n\nHorario: Lunes a Viernes de 9:00 a 17:00 hs.\n\nEn cuanto retomemos la actividad, un asesor te va a responder. Tu mensaje quedo registrado.`;

const MENSAJE_FINDE = `Hola! Gracias por contactarte con Tienda Fonopel.\n\nEn este momento no estamos disponibles porque es fin de semana.\n\nHorario de atencion: Lunes a Viernes de 9:00 a 17:00 hs.\n\nEl lunes a primera hora un asesor te va a responder.`;

// -- Clasificar mensaje con Claude ------------
async function clasificarMensaje(mensaje) {
    const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
            model: "claude-haiku-4-5",
            max_tokens: 20,
            messages: [
                {
                    role: "user",
                    content: `Clasificá este mensaje de un cliente de Tienda Fonopel en UNA SOLA PALABRA, sin puntuacion ni espacios. Las categorias posibles son exactamente estas cinco:
- "venta" → quiere comprar algo, pregunta por precio, disponibilidad o productos
- "soporte" → tiene un problema tecnico, el producto no funciona, necesita ayuda tecnica
- "reclamo" → esta enojado, quiere devolver algo, tuvo una mala experiencia
- "posventa-mercadolibre" → hizo una compra por Mercado Libre y tiene una consulta o problema con ese pedido
- "administrativo" → necesita factura, ticket, comprobante de pago o algun tramite administrativo

Mensaje del cliente: "${mensaje}"

Responde UNICAMENTE con una de estas palabras: venta, soporte, reclamo, posventa-mercadolibre, administrativo`
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

    const texto = response.data.content[0].text.trim().toLowerCase();
    // Validar que sea una categoria valida
    const categorias = ["venta", "soporte", "reclamo", "posventa-mercadolibre", "administrativo"];
    const encontrada = categorias.find(c => texto.includes(c));
    return encontrada || "venta";
}

// -- Aplicar etiqueta en Chatwoot -------------
async function aplicarEtiqueta(conversationId, etiqueta) {
    await axios.post(
        `${CHATWOOT_URL}/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
        { labels: [etiqueta] },
        { headers: { "api_access_token": CHATWOOT_TOKEN, "Content-Type": "application/json" } }
    );
}

// -- Enviar mensaje al cliente ----------------
async function enviarMensaje(conversationId, texto) {
    await axios.post(
        `${CHATWOOT_URL}/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        { content: texto, message_type: "outgoing", private: false },
        { headers: { "api_access_token": CHATWOOT_TOKEN, "Content-Type": "application/json" } }
    );
}

// -- Verificar si ya fue saludado -------------
async function yaFueSaludado(conversationId) {
    try {
        const res = await axios.get(
            `${CHATWOOT_URL}/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
            { headers: { "api_access_token": CHATWOOT_TOKEN } }
        );
        const mensajes = res.data.payload || [];
        const yaHayRespuesta = mensajes.some(m =>
            m.message_type === 1 &&
            m.content &&
            (m.content.includes("Gracias por contactarte con Tienda Fonopel") ||
             m.content.includes("fuera de nuestro horario") ||
             m.content.includes("fin de semana"))
        );
        console.log(`Conversacion ${conversationId} - Ya saludado: ${yaHayRespuesta}`);
        return yaHayRespuesta;
    } catch (e) {
        console.log("Error verificando historial:", e.message);
        return false;
    }
}

// -- Webhook principal ------------------------
app.all('*', async (req, res) => {
    const data = req.body;

    if (data.event === "message_created" && data.message_type === "incoming") {
        const conversationId = data.conversation.id;
        const messageContent = data.content;

        console.log(`--- Nuevo mensaje: "${messageContent}" | Conv: ${conversationId} ---`);

        try {
            // Verificar si ya fue saludado
            const saludado = await yaFueSaludado(conversationId);
            if (saludado) {
                console.log("Cliente ya fue saludado, ignorando.");
                return res.status(200).send("OK");
            }

            // Verificar horario
            const { enHorario, dia } = estaEnHorario();

            if (!enHorario) {
                const esFinde = dia === 0 || dia === 6;
                await enviarMensaje(conversationId, esFinde ? MENSAJE_FINDE : MENSAJE_FUERA_HORARIO);
                await aplicarEtiqueta(conversationId, "fuera-de-horario");
                console.log("Fuera de horario - mensaje enviado.");
                return res.status(200).send("OK");
            }

            // Clasificar y responder
            const clasificacion = await clasificarMensaje(messageContent);
            console.log(`Clasificado como: ${clasificacion}`);

            await aplicarEtiqueta(conversationId, clasificacion);
            await enviarMensaje(conversationId, MENSAJES[clasificacion]);
            console.log(`Etiqueta "${clasificacion}" aplicada y mensaje enviado.`);

        } catch (error) {
            console.error("Error en el proceso:");
            if (error.response) {
                console.error(JSON.stringify(error.response.data, null, 2));
            } else {
                console.error(error.message);
            }
        }
    }

    res.status(200).send("OK");
});

// -- Servidor ---------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor Fonopel activo en puerto ${PORT}`));
