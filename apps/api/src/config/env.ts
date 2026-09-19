/**
 * Variáveis de ambiente da API (§52 da spec).
 *
 * O schema base vem de @inovaapss/validation (`serverEnvSchema`). Nesta etapa (0) as variáveis
 * do Supabase e a DATABASE_URL ainda são opcionais: a API sobe sem banco e responde /health e
 * /ready com `db: 'not_configured'`. Quem precisar delas chama `requireEnv(env, 'DATABASE_URL')`
 * e recebe uma mensagem clara caso falte.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { type RawEnv, serverEnvSchema } from '@inovaapss/validation';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Variáveis que só passam a ser obrigatórias quando o módulo que as usa existir. */
const OPTIONAL_FOR_NOW = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
] as const;

export const apiEnvSchema = serverEnvSchema
  .partial({
    SUPABASE_URL: true,
    SUPABASE_ANON_KEY: true,
    SUPABASE_SERVICE_ROLE_KEY: true,
    DATABASE_URL: true,
  })
  .extend({
    /** Nível do pino. Padrão: debug em development, silent em test, info em production. */
    LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
    /** Janela do rate limit em milissegundos (padrão 15 minutos). */
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
    /** Máximo de requisições por IP dentro da janela (padrão 300). */
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    /** Tempo máximo que o /ready espera o `select 1` do banco. */
    DB_READY_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** O .env.example deixa as opcionais vazias; vazio conta como "não configurado". */
function dropEmptyOptionals(raw: RawEnv): Record<string, string | undefined> {
  const copy: Record<string, string | undefined> = { ...raw };
  for (const key of OPTIONAL_FOR_NOW) {
    if (copy[key] !== undefined && copy[key].trim() === '') {
      delete copy[key];
    }
  }
  return copy;
}

function formatIssues(error: z.ZodError): string {
  const lines = error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  return [
    'Variáveis de ambiente da API inválidas:',
    ...lines,
    'Confira o .env na raiz do repositório (modelo em .env.example).',
  ].join('\n');
}

/** Lê e valida o env da API; lança um erro legível listando o que está errado. */
export function parseApiEnv(raw: RawEnv): ApiEnv {
  const result = apiEnvSchema.safeParse(dropEmptyOptionals(raw));
  if (!result.success) {
    throw new Error(formatIssues(result.error));
  }
  return result.data;
}

type OptionalKey = (typeof OPTIONAL_FOR_NOW)[number];

const HINTS: Record<OptionalKey, string> = {
  SUPABASE_URL: 'Painel do Supabase -> Project Settings -> API -> Project URL.',
  SUPABASE_ANON_KEY: 'Painel do Supabase -> Project Settings -> API -> anon public.',
  SUPABASE_SERVICE_ROLE_KEY:
    'Painel do Supabase -> Project Settings -> API -> service_role (somente no backend).',
  DATABASE_URL:
    'Painel do Supabase -> Connect -> Transaction pooler (porta 6543), trocando [YOUR-PASSWORD].',
};

/**
 * Devolve o valor de uma variável opcional nesta etapa ou lança um erro explicando onde
 * conseguir o valor. Use nos módulos que realmente dependem dela.
 */
export function requireEnv(env: ApiEnv, key: OptionalKey): string {
  const value = env[key];
  if (value === undefined) {
    throw new Error(
      `${key} não está configurada. Defina no .env da raiz (modelo em .env.example). ${HINTS[key]}`,
    );
  }
  return value;
}

/**
 * Carrega o .env da raiz do repositório e, se existir, o .env da pasta atual.
 * Variáveis já presentes no ambiente (ex.: definidas pela plataforma de deploy) têm
 * prioridade sobre o arquivo. Arquivo ausente é ignorado em silêncio.
 */
export function loadEnvFiles(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../../../.env'), // raiz do monorepo (src/config -> apps/api -> raiz)
    path.resolve(process.cwd(), '.env'),
  ];
  const loaded: string[] = [];
  for (const file of new Set(candidates)) {
    try {
      process.loadEnvFile(file);
      loaded.push(file);
    } catch {
      // sem .env neste caminho: segue com o que já está no ambiente
    }
  }
  return loaded;
}
