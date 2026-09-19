/**
 * /health e /ready (§46).
 * - /health: processo vivo. Não toca no banco.
 * - /ready: pronto para receber tráfego. Com DATABASE_URL faz `select 1` com timeout curto;
 *   sem DATABASE_URL responde `db: 'not_configured'` (Etapa 0 ainda não tem tabelas).
 */
import { Router } from 'express';

import type { DbClient } from '../infrastructure/db/index.js';

export interface HealthRouterOptions {
  db: DbClient;
  version: string;
  readyTimeoutMs: number;
}

export function createHealthRouter({ db, version, readyTimeoutMs }: HealthRouterOptions): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', version, uptime: Math.round(process.uptime()) });
  });

  router.get('/ready', async (req, res) => {
    if (!db.isConfigured) {
      res.json({ status: 'ready', db: 'not_configured' });
      return;
    }
    try {
      await db.ping(readyTimeoutMs);
      res.json({ status: 'ready', db: 'ok' });
    } catch (err) {
      req.log.warn({ err }, 'Banco indisponível no /ready');
      res.status(503).json({ status: 'not_ready', db: 'error' });
    }
  });

  return router;
}
