// tests/app.test.js
const request = require('supertest');
const app = require('../app');

describe('Health Check Endpoint', () => {
    it('should return a 200 OK status and operational message', async () => {
        const response = await request(app).get('/health');
        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe('success');
    });
});
