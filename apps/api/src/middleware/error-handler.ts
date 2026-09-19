/**
 * Último middleware da cadeia: transforma qualquer erro em JSON
 * `{ error: { code, message, requestId, details? } }`.
 *
 * - AppError: status/code definidos por quem lançou.
 * - ZodError: 400 VALIDATION_ERROR com as issues em `details`.
 * - Erros do body parser (JSON inválido, corpo acima de 1mb): 400/413.
 * - Qualquer outro: 500. Em produção a mensagem é genérica; a stack vai só para o log.
 */
import { ZodError } from 'zod';

import { AppError } from '../shared/errors.js';
import { getRequestId } from '../shared/request.js';

import type { ErrorRequestHandler } from 'express';

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

interface HttpLikeError {
  status?: unknown;
  statusCode?: unknown;
  type?: unknown;
  message?: unknown;
}

function asHttpLike(err: unknown): HttpLikeError | undefined {
  return typeof err === 'object' && err !== null ? (err as HttpLikeError) : undefined;
}

function httpStatusOf(err: HttpLikeError): number | undefined {
  const candidate = err.status ?? err.statusCode;
  return typeof candidate === 'number' && candidate >= 400 && candidate < 600
    ? candidate
    : undefined;
}

const BODY_PARSER_CODES: Record<string, { code: string; message: string }> = {
  'entity.too.large': {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Corpo da requisição acima do limite permitido.',
  },
  'entity.parse.failed': {
    code: 'INVALID_JSON',
    message: 'Corpo da requisição não é JSON válido.',
  },
  'encoding.unsupported': {
    code: 'UNSUPPORTED_ENCODING',
    message: 'Codificação do corpo não suportada.',
  },
};

export function createErrorHandler(options: { exposeDetails: boolean }): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    const requestId = getRequestId(req);

    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Erro interno do servidor.';
    let details: unknown;

    if (err instanceof AppError) {
      status = err.statusCode;
      code = err.code;
      message = err.message;
      details = err.details;
    } else if (err instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Dados inválidos.';
      details = err.issues;
    } else {
      const httpLike = asHttpLike(err);
      const httpStatus = httpLike !== undefined ? httpStatusOf(httpLike) : undefined;
      if (httpLike !== undefined && httpStatus !== undefined) {
        status = httpStatus;
        const known =
          typeof httpLike.type === 'string' ? BODY_PARSER_CODES[httpLike.type] : undefined;
        code = known?.code ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
        message =
          known?.message ??
          (status >= 500 || typeof httpLike.message !== 'string'
            ? 'Requisição inválida.'
            : httpLike.message);
      } else if (options.exposeDetails && err instanceof Error) {
        message = err.message;
      }
    }

    if (status >= 500) {
      req.log.error({ err, requestId }, 'Erro não tratado na requisição');
    } else {
      req.log.warn({ code, status, requestId }, 'Requisição rejeitada');
    }

    if (res.headersSent) {
      next(err);
      return;
    }

    const body: ErrorBody = { error: { code, message, requestId } };
    if (details !== undefined) {
      body.error.details = details;
    }
    res.status(status).json(body);
  };
}
