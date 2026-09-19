import { describe, expect, it } from 'vitest';

import { paginationQuerySchema, slugSchema, uuidSchema } from './common.js';
import { healthClassSchema, metricSourceSchema } from './domain.js';
import { clientEnvSchema, parseServerEnv, serverEnvSchema } from './env.js';

describe('paginationQuerySchema (§61)', () => {
  it('aplica os padrões quando a query vem vazia', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, order: 'asc' });
  });

  it('converte strings da query string em números', () => {
    const parsed = paginationQuerySchema.parse({ page: '3', pageSize: '50', order: 'desc' });
    expect(parsed).toMatchObject({ page: 3, pageSize: 50, order: 'desc' });
  });

  it('recusa pageSize acima do máximo e página 0', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('recusa campo de ordenação com caracteres perigosos', () => {
    expect(paginationQuerySchema.safeParse({ sort: 'name; drop table' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ sort: 'created_at' }).success).toBe(true);
  });
});

describe('uuid e slug', () => {
  it('valida uuid', () => {
    expect(uuidSchema.safeParse('4b1f2a8e-7c3d-4e5f-8a9b-0c1d2e3f4a5b').success).toBe(true);
    expect(uuidSchema.safeParse('123').success).toBe(false);
  });

  it('valida slug', () => {
    expect(slugSchema.safeParse('globalsys').success).toBe(true);
    expect(slugSchema.safeParse('global-sys-2').success).toBe(true);
    expect(slugSchema.safeParse('-globalsys').success).toBe(false);
    expect(slugSchema.safeParse('Global Sys').success).toBe(false);
  });
});

describe('enums de domínio', () => {
  it('aceita JSON como fonte de métrica (ajuste A4)', () => {
    expect(metricSourceSchema.safeParse('JSON').success).toBe(true);
  });

  it('recusa classe de saúde desconhecida', () => {
    expect(healthClassSchema.safeParse('OK').success).toBe(false);
    expect(healthClassSchema.safeParse('RISK').success).toBe(true);
  });
});

describe('env do servidor (§52)', () => {
  const valido = {
    SUPABASE_URL: 'https://abc.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    DATABASE_URL: 'postgresql://user:pass@host:6543/postgres',
  };

  it('preenche padrões e separa CORS_ORIGINS por vírgula', () => {
    const env = parseServerEnv({ ...valido, CORS_ORIGINS: 'http://a.com, http://b.com' });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com']);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('trata opcionais vazias como não configuradas', () => {
    const env = serverEnvSchema.parse({ ...valido, ANTHROPIC_API_KEY: '', SENTRY_DSN: '' });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('lista o que falta em português', () => {
    expect(() => parseServerEnv({})).toThrow(/SUPABASE_URL/);
    expect(() => parseServerEnv({})).toThrow(/\.env\.example/);
  });

  it('recusa DATABASE_URL que não é postgres', () => {
    expect(serverEnvSchema.safeParse({ ...valido, DATABASE_URL: 'mysql://x' }).success).toBe(false);
  });
});

describe('env do front (§52)', () => {
  it('usa http://localhost:3001 como API padrão', () => {
    const env = clientEnvSchema.parse({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
    });
    expect(env.VITE_API_URL).toBe('http://localhost:3001');
  });
});
