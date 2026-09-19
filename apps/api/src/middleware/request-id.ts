/**
 * Dá um id a cada requisição e o devolve no cabeçalho `x-request-id`.
 * Aceita um id vindo do cliente/proxy só se for curto e sem caracteres estranhos;
 * caso contrário gera um UUID. O pino-http reaproveita esse id nos logs.
 */
import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get(REQUEST_ID_HEADER);
  const id = incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
};
