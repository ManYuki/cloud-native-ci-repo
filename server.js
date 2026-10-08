// server.js
const app = require('./app.js');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Service running on port ${PORT}`);
});
