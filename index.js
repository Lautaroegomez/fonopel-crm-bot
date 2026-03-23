const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/webhook', async (req, res) => {
    const mensajeCliente = req.body.message || "Hola"; 
    
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Sos el clasificador de Tienda Fonopel. 
        Analizá este mensaje y respondé SOLO con una de estas tres palabras: VENTAS, SOPORTE o ADMIN.
        Mensaje del cliente: "${mensajeCliente}"`;

        const result = await model.generateContent(prompt);
        const categoria = result.response.text();

        console.log("Clasificación de Fonopel:", categoria);
        res.status(200).send({ categoria });
    } catch (error) {
        console.error("Error con Gemini:", error);
        res.status(500).send("Error interno");
    }
});

app.get('/', (req, res) => res.send('Servidor Fonopel Vivo!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor de Fonopel activo en puerto ${PORT}`));
