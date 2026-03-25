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
const HORARIO = { dias: [1, 2, 3, 4, 5], horaInicio: 9, horaFin: 17 };

function estaEnHorario() {
    const ahora = new Date();
    const utc = ahora.getTime() + ahora.getTimezoneOffset() * 60000;
    const argentina = new Date(utc + (-3 * 60) * 60000);
    const dia  = argentina.getDay();
    const hora = argentina.getHours();
    const enHorario = HORARIO.dias.includes(dia) && hora >= HORARIO.horaInicio && hora < HORARIO.horaFin;
    console.log(`Hora Argentina: ${argentina.toLocaleString()} | En horario: ${enHorario}`);
    return { enHorario, dia };
}

// -- Catalogo de productos con URLs -----------
const CATALOGO = {
    "espiraladora-doble-alambre": { nombre: "Espiraladoras Doble Alambre", url: "https://www.tiendafonopel.com.ar/espiraladora-doble-alambre/" },
    "espiraladora-plastico":      { nombre: "Espiraladoras para Espirales Plasticos", url: "https://www.tiendafonopel.com.ar/espiraladoras/espiraladora-pvc/" },
    "guillotina":                 { nombre: "Guillotinas", url: "https://www.tiendafonopel.com.ar/guillotinas/" },
    "combo":                      { nombre: "Combos", url: "https://www.tiendafonopel.com.ar/combos/" },
    "tapa":                       { nombre: "Tapas de Polipropileno", url: "https://www.tiendafonopel.com.ar/tapas-polipropileno/" },
    "espiral-doble-alambre":      { nombre: "Espirales Doble Alambre", url: "https://www.tiendafonopel.com.ar/espirales-doble-alambre/" },
    "espiral-plastico":           { nombre: "Espirales Plasticos", url: "https://www.tiendafonopel.com.ar/espirales-plasticos/" },
    "laminadora":                 { nombre: "Plastificadoras y Laminadoras", url: "https://www.tiendafonopel.com.ar/laminadora/" },
    "contadora-billetes":         { nombre: "Contadoras de Billetes", url: "https://www.tiendafonopel.com.ar/contadoras-de-billetes/" },
    "caja-archivo":               { nombre: "Cajas de Archivo", url: "https://www.tiendafonopel.com.ar/cajas-de-archivo/" },
    "general":                    { nombre: "Tienda Fonopel", url: "https://www.tiendafonopel.com.ar/" }
};

// -- Clasificar mensaje con Claude ------------
// Ahora devuelve MULTIPLES categorias si el mensaje las tiene
async function clasificarMensaje(mensaje) {
    const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
            model: "claude-haiku-4-5",
            max_tokens: 100,
            messages: [{
                role: "user",
                content: `Sos un clasificador de mensajes para Tienda Fonopel. Analizá el mensaje y detecta TODAS las categorias que aplican (puede ser mas de una). Devuelve UNICAMENTE un JSON sin texto adicional ni backticks.

CATEGORIAS:
- "venta": quiere comprar, pregunta precio o disponibilidad de producto
  Ejemplos: "cuanto sale la guillotina", "tienen espirales", "quiero comprar", "precio de laminadora"

- "soporte": tiene problema tecnico con un producto que ya tiene
  Ejemplos: "como se usa", "no enciende", "necesito ayuda tecnica", "se trabo la maquina"

- "reclamo": se queja, quiere devolver, mala experiencia, inconveniente
  Ejemplos: "quiero hacer un reclamo", "me llego roto", "quiero devolver", "no funciona lo que compre"

- "posventa-mercadolibre": hizo una compra por Mercado Libre
  Ejemplos: "compre por ML", "mi pedido de mercado libre", "hice una compra en mercadolibre"

- "administrativo": necesita factura, ticket, comprobante, datos fiscales
  Ejemplos: "necesito factura", "me pueden dar el ticket", "comprobante de pago", "necesito la factura de mi compra"

IMPORTANTE: Un mensaje puede tener MULTIPLES categorias. Ejemplo:
- "hice una compra por mercado libre y necesito la factura" -> ["posventa-mercadolibre", "administrativo"]
- "compre una guillotina y no funciona" -> ["soporte", "reclamo"]
- "quiero comprar una espiraladora" -> ["venta"]

PRODUCTOS (elegir el mas relacionado, o "general" si no menciona producto):
espiraladora-doble-alambre, espiraladora-plastico, guillotina, combo, tapa, espiral-doble-alambre, espiral-plastico, laminadora, contadora-billetes, caja-archivo, general

Mensaje del cliente: "${mensaje}"

Responde UNICAMENTE con este JSON:
{"categorias": ["categoria1", "categoria2"], "producto": "nombre-producto"}`
            }]
        },
        {
            headers: {
                "x-api-key": CLAUDE_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json"
            }
        }
    );

    try {
        const texto = response.data.content[0].text.trim();
        const parsed = JSON.parse(texto);
        const categoriasValidas = ["venta", "soporte", "reclamo", "posventa-mercadolibre", "administrativo"];
        const productosValidos  = Object.keys(CATALOGO);

        // Filtrar solo categorias validas
        const categorias = (parsed.categorias || []).filter(c => categoriasValidas.includes(c));
        const producto   = productosValidos.includes(parsed.producto) ? parsed.producto : "general";

        // Si no detecto ninguna categoria valida, usar venta por defecto
        if (categorias.length === 0) categorias.push("venta");

        console.log(`Categorias detectadas: ${categorias.join(", ")} | Producto: ${producto}`);
        return { categorias, producto };

    } catch (e) {
        console.log("Error parseando JSON de Claude:", e.message);
        return { categorias: ["venta"], producto: "general" };
    }
}

// -- Aplicar etiquetas en Chatwoot ------------
async function aplicarEtiquetas(conversationId, etiquetas) {
    await axios.post(
        `${CHATWOOT_URL}/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
        { labels: etiquetas },
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
        return mensajes.some(m =>
            m.message_type === 1 &&
            m.content &&
            (m.content.includes("Gracias por contactarte con Tienda Fonopel") ||
             m.content.includes("fuera de horario") ||
             m.content.includes("fin de semana"))
        );
    } catch (e) {
        console.log("Error verificando historial:", e.message);
        return false;
    }
}

// -- Armar mensaje segun categorias y producto
// Usa la primera categoria para el mensaje principal
function armarMensaje(categorias, producto, enHorario) {
    const item = CATALOGO[producto] || CATALOGO["general"];
    const linkProducto = producto !== "general"
        ? `\n\nPodes ver todos nuestros ${item.nombre} aca: ${item.url}`
        : `\n\nPodes ver todos nuestros productos en nuestra tienda: ${item.url}`;

    // Prioridad de mensaje: reclamo > administrativo > posventa-ml > soporte > venta
    const prioridad = ["reclamo", "administrativo", "posventa-mercadolibre", "soporte", "venta"];
    const categoriaPrincipal = prioridad.find(p => categorias.includes(p)) || "venta";

    const cuerpos = {
        venta: `Hola! Gracias por contactarte con Tienda Fonopel.\n\nRecibimos tu consulta sobre una compra y en breve un asesor te va a atender para ayudarte a elegir el mejor producto.${linkProducto}`,
        soporte: `Hola! Gracias por contactarte con Tienda Fonopel.\n\nRecibimos tu consulta de soporte tecnico. Un especialista va a revisar tu caso a la brevedad.\n\nSi tenes el numero de orden o factura a mano, tenerlo listo va a agilizar la atencion.`,
        reclamo: `Hola! Lamentamos los inconvenientes que tuviste.\n\nRecibimos tu reclamo y lo vamos a gestionar con prioridad. Un asesor va a contactarte a la brevedad para resolverlo.\n\nTe pedimos disculpas por las molestias causadas.`,
        "posventa-mercadolibre": `Hola! Gracias por contactarte con Tienda Fonopel.\n\nRecibimos tu consulta sobre tu compra en Mercado Libre. Un asesor especializado en posventa va a revisar tu caso.\n\nSi tenes el numero de orden de ML a mano, compartilo para agilizar la atencion.`,
        administrativo: `Hola! Gracias por contactarte con Tienda Fonopel.\n\nRecibimos tu solicitud de factura o comprobante. Nuestro equipo administrativo la va a procesar a la brevedad.\n\nSi tenes el numero de orden o fecha de compra, compartilo para agilizar el tramite.`
    };

    let mensaje = cuerpos[categoriaPrincipal] || cuerpos.venta;

    if (!enHorario) {
        mensaje += `\n\nTe avisamos que en este momento estamos fuera de horario. Nuestro horario de atencion es Lunes a Viernes de 9:00 a 17:00 hs. Tu mensaje quedo registrado y te respondemos en cuanto volvamos.`;
    }

    return mensaje;
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
            const { enHorario } = estaEnHorario();

            // Clasificar (ahora devuelve multiples categorias)
            const { categorias, producto } = await clasificarMensaje(messageContent);

            // Armar etiquetas: todas las categorias detectadas + fuera-de-horario si aplica
            const etiquetas = [...categorias];
            if (!enHorario) etiquetas.push("fuera-de-horario");

            await aplicarEtiquetas(conversationId, etiquetas);
            console.log(`Etiquetas aplicadas: ${etiquetas.join(", ")}`);

            // Armar y enviar mensaje
            const mensaje = armarMensaje(categorias, producto, enHorario);
            await enviarMensaje(conversationId, mensaje);
            console.log("Mensaje enviado al cliente.");

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
