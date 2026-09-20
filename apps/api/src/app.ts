/**
 * Monta o Express sem dar listen (server.ts faz isso; os testes usam o app direto).
 *
 * Ordem dos middlewares:
 *   request-id -> pino-http -> helmet -> cors -> rate limit -> json (1mb)
 *   -> /health, /ready -> /api/docs -> /api/v1 -> 404 -> error handler
 */
import cors from 'cors';
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { API_VERSION } from './config/version.js';
import { createDbClient, type DbClient } from './infrastructure/db/index.js';
import { createLogger, type Logger } from './infrastructure/logger.js';
import { createSupabaseClients, type SupabaseClients } from './infrastructure/supabase.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requestId } from './middleware/request-id.js';
import { type ApiV1Dependencies, API_V1_PREFIX, createApiV1Router } from './routes/api-v1.js';
import { createDocsRouter } from './routes/docs.js';
import { createHealthRouter } from './routes/health.js';
import { getRequestId } from './shared/request.js';

import type { ApiEnv } from './config/env.js';

export interface AppDependencies {
  logger?: Logger;
  db?: DbClient;
  supabase?: SupabaseClients;
  /** Testes: dublês de auth/persistência para o /api/v1 (ver routes/api-v1.ts). */
  apiV1?: Omit<ApiV1Dependencies, 'db' | 'supabase'>;
}

const HEALTH_PATHS = new Set(['/health', '/ready']);

export function createApp(env: ApiEnv, deps: AppDependencies = {}): Express {
  const logger = deps.logger ?? createLogger(env);
  const db = deps.db ?? createDbClient(env.DATABASE_URL);
  const supabase = deps.supabase ?? createSupabaseClients(env);
  const isProduction = env.NODE_ENV === 'production';

  const app = express();
  app.disable('x-powered-by');
  // Render/Railway colocam um proxy na frente: confiar em 1 salto para o IP real chegar ao
  // rate limit. Fora de produção não há proxy.
  app.set('trust proxy', isProduction ? 1 : false);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => HEALTH_PATHS.has(req.url ?? '') },
    }),
  );

  app.use(helmet());

  const allowedOrigins = new Set(env.CORS_ORIGINS);
  app.use(
    cors({
      // Sem cabeçalho Origin (curl, health checks) passa; com Origin, só os da lista.
      origin: (origin, callback) => {
        callback(null, origin === undefined || allowedOrigins.has(origin));
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (req) => HEALTH_PATHS.has(req.path),
      handler: (req, res) => {
        res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Muitas requisições. Tente novamente em instantes.',
            requestId: getRequestId(req),
          },
        });
      },
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  app.use(
    createHealthRouter({ db, version: API_VERSION, readyTimeoutMs: env.DB_READY_TIMEOUT_MS }),
  );
  app.use('/api', createDocsRouter({ enableUi: !isProduction }));
  app.use(API_V1_PREFIX, createApiV1Router({ db, supabase, ...deps.apiV1 }));

  app.use(notFound);
  app.use(createErrorHandler({ exposeDetails: !isProduction }));

  return app;
}
