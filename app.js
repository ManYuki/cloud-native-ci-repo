// app.js
const express = require('express');
const app = express();

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'CI/CD Reference Architecture API is operational V2',
        timestamp: new Date().toISOString()
    });
});

module.exports = app;
