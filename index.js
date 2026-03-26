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

// -- Reglas de clasificacion manual (PRIORITARIAS antes de llamar a Claude)
function clasificacionManual(mensaje) {
    const m = mensaje.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Administrativo - palabras clave muy especificas
    const palabrasAdmin = ["factura", "ticket", "comprobante", "recibo", "fiscal", "afip", "cuit", "facturacion", "necesito la factura", "me mandan la factura", "datos fiscales"];
    if (palabrasAdmin.some(p => m.includes(p))) return "administrativo";

    // Posventa ML - palabras clave muy especificas
    const palabrasML = ["mercado libre", "mercadolibre", " ml ", "compre en ml", "pedido de ml", "compra de ml", "envio de ml", "ml me", "por ml"];
    if (palabrasML.some(p => m.includes(p))) return "posventa-mercadolibre";

    // Reclamo
    const palabrasReclamo = ["reclamo", "queja", "devolucion", "devolver", "roto", "danado", "no funciona", "no sirve", "mal estado", "problema con", "inconveniente", "estafa", "fraude"];
    if (palabrasReclamo.some(p => m.includes(p))) return "reclamo";

    // Soporte
    const palabrasSoporte = ["no enciende", "como se usa", "ayuda tecnica", "no funciona", "se trabo", "error", "falla", "tutorial", "instrucciones", "manual"];
    if (palabrasSoporte.some(p => m.includes(p))) return "soporte";

    return null; // No detectado manualmente, usar Claude
}

// -- Clasificar mensaje con Claude (solo si la clasificacion manual no alcanza)
async function clasificarConClaude(mensaje) {
    const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
            model: "claude-sonnet-4-20250514",
            max_tokens: 100,
            messages: [{
                role: "user",
                content: `Sos un clasificador de mensajes para Tienda Fonopel que vende maquinaria de oficina. Analizá el mensaje y detecta TODAS las categorias que aplican. Devuelve UNICAMENTE un JSON sin texto adicional ni backticks.

CATEGORIAS (pueden aplicar varias a la vez):
- "administrativo": el cliente pide factura, ticket, comprobante, recibo o datos fiscales. CUALQUIER mencion a factura = administrativo.
- "posventa-mercadolibre": hizo o menciona una compra por Mercado Libre o ML.
- "reclamo": se queja, quiere devolver, tuvo problema, menciona reclamo, producto roto o en mal estado.
- "soporte": tiene un problema tecnico, necesita ayuda para usar un producto que ya tiene.
- "venta": quiere comprar algo, pregunta precio o disponibilidad. SOLO si no hay otro motivo mas especifico.

EJEMPLOS DE CLASIFICACION:
- "necesito la factura" -> ["administrativo"]
- "quiero la factura de mi compra" -> ["administrativo"]
- "hice una compra por ML y necesito factura" -> ["posventa-mercadolibre", "administrativo"]
- "quiero hacer un reclamo" -> ["reclamo"]
- "cuanto sale la guillotina" -> ["venta"]
- "compre una espiraladora y no funciona" -> ["soporte", "reclamo"]
- "hola buen dia" -> ["venta"]

PRODUCTOS (el mas relacionado al mensaje):
espiraladora-doble-alambre, espiraladora-plastico, guillotina, combo, tapa, espiral-doble-alambre, espiral-plastico, laminadora, contadora-billetes, caja-archivo, general

Mensaje: "${mensaje}"

JSON de respuesta:
{"categorias": ["categoria1"], "producto": "nombre-producto"}`
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
        const categorias = (parsed.categorias || []).filter(c => categoriasValidas.includes(c));
        const producto   = productosValidos.includes(parsed.producto) ? parsed.producto : "general";
        if (categorias.length === 0) categorias.push("venta");
        return { categorias, producto };
    } catch (e) {
        console.log("Error parseando JSON de Claude:", e.message);
        return { categorias: ["venta"], producto: "general" };
    }
}

// -- Funcion principal de clasificacion -------
async function clasificarMensaje(mensaje) {
    // Primero intentar clasificacion manual (mas rapida y precisa para casos obvios)
    const manual = clasificacionManual(mensaje);
    if (manual) {
        console.log(`Clasificacion manual: ${manual}`);
        // Si encontro una categoria manual, igual llamar a Claude para detectar categorias adicionales
        const { categorias, producto } = await clasificarConClaude(mensaje);
        // Asegurarse de que la categoria manual siempre este incluida
        if (!categorias.includes(manual)) categorias.unshift(manual);
        return { categorias, producto };
    }
    // Si no hay clasificacion manual clara, usar solo Claude
    return await clasificarConClaude(mensaje);
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
function armarMensaje(categorias, producto, enHorario) {
    const item = CATALOGO[producto] || CATALOGO["general"];
    const linkProducto = producto !== "general"
        ? `\n\nPodes ver todos nuestros ${item.nombre} aca: ${item.url}`
        : `\n\nPodes ver todos nuestros productos en nuestra tienda: ${item.url}`;

    // Prioridad del mensaje principal
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
            const saludado = await yaFueSaludado(conversationId);
            if (saludado) {
                console.log("Cliente ya fue saludado, ignorando.");
                return res.status(200).send("OK");
            }

            const { enHorario } = estaEnHorario();
            const { categorias, producto } = await clasificarMensaje(messageContent);

            const etiquetas = [...categorias];
            if (!enHorario) etiquetas.push("fuera-de-horario");

            await aplicarEtiquetas(conversationId, etiquetas);
            console.log(`Etiquetas aplicadas: ${etiquetas.join(", ")}`);

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
