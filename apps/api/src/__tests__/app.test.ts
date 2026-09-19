import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { parseApiEnv } from '../config/env.js';

import type { DbClient } from '../infrastructure/db/index.js';

const env = parseApiEnv({ NODE_ENV: 'test' });
const app = createApp(env);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fakeDb(ping: () => Promise<void>): DbClient {
  return {
    isConfigured: true,
    getDb: () => {
      throw new Error('não usado no teste');
    },
    ping,
    close: async () => {},
  };
}

describe('GET /health', () => {
  it('responde 200 com status, version e uptime', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(typeof res.body.version).toBe('string');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });
});

describe('GET /ready', () => {
  it('responde not_configured quando não há DATABASE_URL', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', db: 'not_configured' });
  });

  it('responde ok quando o banco responde ao ping', async () => {
    const appWithDb = createApp(env, { db: fakeDb(async () => {}) });
    const res = await request(appWithDb).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', db: 'ok' });
  });

  it('responde 503 quando o banco não responde', async () => {
    const appWithDb = createApp(env, {
      db: fakeDb(async () => {
        throw new Error('timeout');
      }),
    });
    const res = await request(appWithDb).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready', db: 'error' });
  });
});

describe('GET /api/v1', () => {
  it('lista as rotas disponíveis', async () => {
    const res = await request(app).get('/api/v1');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('inovaapss-api');
    expect(Array.isArray(res.body.routes)).toBe(true);
    expect(res.body.routes).toContainEqual(
      expect.objectContaining({ method: 'GET', path: '/api/v1' }),
    );
  });
});

describe('rota inexistente', () => {
  it('responde 404 em JSON com code, message e requestId', async () => {
    const res = await request(app).get('/nao-existe');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.error.message).toContain('/nao-existe');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });
});

describe('request id', () => {
  it('devolve um x-request-id gerado (UUID)', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  it('reaproveita um x-request-id seguro vindo do cliente', async () => {
    const res = await request(app).get('/health').set('x-request-id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('ignora um x-request-id com caracteres inválidos', async () => {
    const res = await request(app).get('/health').set('x-request-id', 'a b<script>');
    expect(res.headers['x-request-id']).toMatch(UUID);
  });
});

describe('cabeçalhos de segurança', () => {
  it('helmet define x-content-type-options e some com x-powered-by', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS libera a origem configurada e barra as demais', async () => {
    const allowed = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const blocked = await request(app).get('/health').set('Origin', 'http://malicioso.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limit', () => {
  const limitedApp = createApp(
    parseApiEnv({ NODE_ENV: 'test', RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_MS: '60000' }),
  );

  it('responde 429 com code RATE_LIMITED depois do limite', async () => {
    const primeira = await request(limitedApp).get('/api/v1');
    expect(primeira.status).toBe(200);
    expect(primeira.headers['ratelimit']).toBeDefined();
    expect(primeira.headers['x-ratelimit-limit']).toBeUndefined();

    const segunda = await request(limitedApp).get('/api/v1');
    expect(segunda.status).toBe(200);

    const terceira = await request(limitedApp).get('/api/v1');
    expect(terceira.status).toBe(429);
    expect(terceira.body.error.code).toBe('RATE_LIMITED');
    expect(terceira.body.error.requestId).toBe(terceira.headers['x-request-id']);
  });

  it('não conta /health e /ready no limite', async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await request(limitedApp).get('/health')).status).toBe(200);
      expect((await request(limitedApp).get('/ready')).status).toBe(200);
    }
  });
});

describe('corpo da requisição', () => {
  it('rejeita JSON inválido com 400', async () => {
    const res = await request(app)
      .post('/api/v1')
      .set('Content-Type', 'application/json')
      .send('{"quebrado":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('rejeita corpo acima de 1mb com 413', async () => {
    const res = await request(app)
      .post('/api/v1')
      .set('Content-Type', 'application/json')
      .send({ dados: 'x'.repeat(1024 * 1024 + 1) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('documentação', () => {
  it('serve o OpenAPI em /api/docs.json', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.paths).toHaveProperty('/health');
    expect(res.body.paths).toHaveProperty('/ready');
  });

  it('serve o Swagger UI em /api/docs fora de produção', async () => {
    const res = await request(app).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('não serve o Swagger UI em produção', async () => {
    const prodApp = createApp(parseApiEnv({ NODE_ENV: 'production', LOG_LEVEL: 'silent' }));
    const ui = await request(prodApp).get('/api/docs/');
    expect(ui.status).toBe(404);
    const json = await request(prodApp).get('/api/docs.json');
    expect(json.status).toBe(200);
  });
});
