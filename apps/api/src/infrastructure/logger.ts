/**
 * Logger estruturado (Pino, §46). pino-pretty só em development (é devDependency).
 * Cabeçalhos com credenciais são redigidos antes de ir para o log.
 */
import { type Logger, type LoggerOptions, pino } from 'pino';

import type { ApiEnv } from '../config/env.js';

export type { Logger };

export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

function defaultLevel(nodeEnv: ApiEnv['NODE_ENV']): string {
  switch (nodeEnv) {
    case 'test':
      return 'silent';
    case 'production':
      return 'info';
    default:
      return 'debug';
  }
}

export function createLogger(env: Pick<ApiEnv, 'NODE_ENV' | 'LOG_LEVEL'>): Logger {
  const options: LoggerOptions = {
    level: env.LOG_LEVEL ?? defaultLevel(env.NODE_ENV),
    base: { service: 'inovaapss-api' },
    redact: { paths: REDACTED_PATHS, censor: '[redigido]' },
  };

  if (env.NODE_ENV === 'development') {
    options.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
    };
  }

  return pino(options);
}
