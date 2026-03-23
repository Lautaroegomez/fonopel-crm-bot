const express = require('express');
const app = express();

// IMPORTANTE: Railway inyecta el puerto en la variable process.env.PORT
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('¡Servidor de Fonopel VIVO y Funcionando!');
});

app.post('/webhook', (req, res) => {
    res.status(200).send('OK');
});

// Usamos 0.0.0.0 para que sea accesible externamente
app.listen(PORT, '0.0.0.0', () => {
    console.log(`El servidor está corriendo en el puerto ${PORT}`);
});
