const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get('/', (req, res) => res.send('🚀 Servidor de Fonopel Vivo'));

app.all('/webhook', async (req, res) => {
    console.log("Solicitud recibida");
    const mensaje = req.body.message || req.query.message || "Hola";
    const nombre = req.body.contact_name || req.query.contact_name || "Cliente Prueba";
    const telefono = req.body.contact_phone || req.query.contact_phone || "549341000111";

    let categoria = "PENDIENTE";

    // Intentamos Gemini, si falla, seguimos adelante
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(mensaje);
        const response = await result.response;
        categoria = response.text().substring(0, 15); 
    } catch (e) {
        console.log("Gemini falló, pero Chatwoot recibirá el mensaje.");
    }

  // 2. Enviamos a Chatwoot (Ruta Directa de Contacto)
        const chatwootUrl = `https://app.chatwoot.com/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}/inboxes/${process.env.CHATWOOT_INBOX_ID}/contacts`;
        
        await axios.post(chatwootUrl, {
            name: nombre,
            phone_number: `+${telefono}`, // Chatwoot prefiere el formato internacional
            message: { 
                content: `[${categoria}] ${mensaje}` // Metemos la categoría de Gemini en el texto
            }
        }, { 
            headers: { 'api_access_token': process.env.CHATWOOT_TOKEN } 
        });

        res.json({ status: "success", info: "¡Mensaje en Chatwoot!" });

    } catch (error) {
        console.error("Detalle del error:", error.response?.data || error.message);
        res.status(200).send("Error en Chatwoot: " + (error.response?.data?.message || error.message));
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log("Online!"));
