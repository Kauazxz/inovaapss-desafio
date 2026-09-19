/**
 * Ponto de entrada: carrega o .env, valida as variáveis, sobe o servidor na PORT (padrão 3001)
 * e desliga com calma em SIGINT/SIGTERM (fecha o HTTP e o pool do banco).
 */
import { createApp } from './app.js';
import { type ApiEnv, loadEnvFiles, parseApiEnv } from './config/env.js';
import { createDbClient } from './infrastructure/db/index.js';
import { createLogger } from './infrastructure/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function readEnv(): ApiEnv {
  loadEnvFiles();
  try {
    return parseApiEnv(process.env);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const env = readEnv();
const logger = createLogger(env);
const db = createDbClient(env.DATABASE_URL);
const app = createApp(env, { logger, db });

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      db: db.isConfigured ? 'configurado' : 'não configurado',
      docs: env.NODE_ENV === 'production' ? undefined : `http://localhost:${env.PORT}/api/docs`,
    },
    'API no ar',
  );
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Desligando a API');

  const forceExit = setTimeout(() => {
    logger.error('Desligamento demorou demais; encerrando à força');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));
  try {
    await db.close();
  } catch (err) {
    logger.warn({ err }, 'Falha ao fechar o pool do banco');
  }
  logger.info('API desligada');
  process.exit(0);
}

process.on('SIGINT', (signal) => void shutdown(signal));
process.on('SIGTERM', (signal) => void shutdown(signal));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Promise rejeitada sem tratamento');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Exceção não capturada');
  process.exit(1);
});
