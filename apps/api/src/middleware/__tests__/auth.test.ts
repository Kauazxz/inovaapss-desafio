import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createRequireAuth, extractBearerToken, type GetUserByToken } from '../auth.js';
import { createErrorHandler } from '../error-handler.js';

function buildApp(getUser: GetUserByToken, options: { cacheTtlMs?: number; now?: () => number }) {
  const app = express();
  // O error-handler usa req.log (pino-http); nos testes um stub basta.
  app.use((req, _res, next) => {
    req.log = { warn: () => {}, error: () => {} } as unknown as typeof req.log;
    next();
  });
  app.get('/private', createRequireAuth({ getUser, ...options }), (req, res) => {
    res.json({ auth: req.auth });
  });
  app.use(createErrorHandler({ exposeDetails: true }));
  return app;
}

describe('extractBearerToken', () => {
  it('lê o token do cabeçalho Bearer (sem diferenciar maiúsculas)', () => {
    expect(extractBearerToken('Bearer abc.def')).toBe('abc.def');
    expect(extractBearerToken('bearer abc')).toBe('abc');
  });

  it('ignora cabeçalho ausente, vazio ou de outro esquema', () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
    expect(extractBearerToken('')).toBeUndefined();
    expect(extractBearerToken('Basic abc')).toBeUndefined();
    expect(extractBearerToken('Bearer')).toBeUndefined();
  });
});

describe('requireAuth', () => {
  const user = { userId: '4b1f2a8e-7c3d-4e5f-8a9b-0c1d2e3f4a5b', email: 'ana@example.com' };

  it('responde 401 UNAUTHORIZED sem cabeçalho Authorization', async () => {
    const getUser = vi.fn<GetUserByToken>(async () => user);
    const res = await request(buildApp(getUser, {})).get('/private');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(typeof res.body.error.message).toBe('string');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('responde 401 quando o Supabase não reconhece o token', async () => {
    const getUser = vi.fn<GetUserByToken>(async () => null);
    const res = await request(buildApp(getUser, {}))
      .get('/private')
      .set('Authorization', 'Bearer invalido');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(getUser).toHaveBeenCalledWith('invalido');
  });

  it('coloca o usuário em req.auth quando o token é válido', async () => {
    const getUser = vi.fn<GetUserByToken>(async () => user);
    const res = await request(buildApp(getUser, {}))
      .get('/private')
      .set('Authorization', 'Bearer ok');
    expect(res.status).toBe(200);
    expect(res.body.auth).toEqual(user);
  });

  it('valida cada token uma vez a cada 60 s (cache em memória)', async () => {
    let clock = 1_000;
    const getUser = vi.fn<GetUserByToken>(async () => user);
    const app = buildApp(getUser, { now: () => clock });

    await request(app).get('/private').set('Authorization', 'Bearer ok');
    await request(app).get('/private').set('Authorization', 'Bearer ok');
    expect(getUser).toHaveBeenCalledTimes(1);

    clock += 59_000;
    await request(app).get('/private').set('Authorization', 'Bearer ok');
    expect(getUser).toHaveBeenCalledTimes(1);

    clock += 2_000;
    await request(app).get('/private').set('Authorization', 'Bearer ok');
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('não guarda tokens inválidos no cache', async () => {
    const getUser = vi.fn<GetUserByToken>(async () => null);
    const app = buildApp(getUser, {});
    await request(app).get('/private').set('Authorization', 'Bearer x');
    await request(app).get('/private').set('Authorization', 'Bearer x');
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('com cacheTtlMs = 0 valida sempre', async () => {
    const getUser = vi.fn<GetUserByToken>(async () => user);
    const app = buildApp(getUser, { cacheTtlMs: 0 });
    await request(app).get('/private').set('Authorization', 'Bearer ok');
    await request(app).get('/private').set('Authorization', 'Bearer ok');
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});
