const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

// Verificamos que la llave exista para que no explote el código
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

app.get('/', (req, res) => {
    if (!apiKey) {
        res.send('⚠️ Servidor vivo, pero falta la GEMINI_API_KEY en Variables de Railway.');
    } else {
        res.send('✅ ¡Cerebro de Fonopel Online y Clasificando!');
    }
});

app.post('/webhook', async (req, res) => {
    const mensajeCliente = req.body.message || "Hola"; 
    
    if (!genAI) return res.status(500).send("Falta API KEY");

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Sos el clasificador de Tienda Fonopel. Analizá y respondé SOLO: VENTAS, SOPORTE o ADMIN. Mensaje: "${mensajeCliente}"`;
        const result = await model.generateContent(prompt);
        res.status(200).send({ categoria: result.response.text().trim() });
    } catch (error) {
        res.status(200).send({ error: "Error de IA, pero servidor vivo" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Puerto activo: ${PORT}`);
});
