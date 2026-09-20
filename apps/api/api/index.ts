/**
 * Entrada serverless (Vercel). Reaproveita o MESMO `createApp` do servidor tradicional:
 * nenhuma rota é duplicada aqui.
 *
 * Diferenças para o `server.ts`:
 *   - não há `listen`: a plataforma entrega a requisição ao handler exportado;
 *   - o app e o pool do banco são criados UMA vez por instância e reaproveitados entre
 *     invocações (a variável de módulo sobrevive enquanto a instância estiver quente);
 *   - as variáveis vêm de `process.env` (não há arquivo .env em produção);
 *   - a `DATABASE_URL` deve apontar para o "Transaction pooler" do Supabase (porta 6543),
 *     porque funções serverless abrem e fecham conexões o tempo todo. O cliente já usa
 *     `prepare: false`, exigido por esse modo.
 */
import { createApp } from '../src/app.js';
import { parseApiEnv } from '../src/config/env.js';
import { createDbClient } from '../src/infrastructure/db/index.js';
import { createLogger } from '../src/infrastructure/logger.js';

import type { Express } from 'express';

let cachedApp: Express | null = null;

function getApp(): Express {
  if (cachedApp) return cachedApp;
  const env = parseApiEnv(process.env);
  const logger = createLogger(env);
  const db = createDbClient(env.DATABASE_URL);
  cachedApp = createApp(env, { logger, db });
  return cachedApp;
}

/** A Vercel aceita um app do Express como handler. */
export default function handler(req: unknown, res: unknown): void {
  (getApp() as unknown as (a: unknown, b: unknown) => void)(req, res);
}
