import { getRequestId } from '../shared/request.js';

import type { RequestHandler } from 'express';

/** Rota não registrada: 404 em JSON com o mesmo formato dos demais erros. */
export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Rota ${req.method} ${req.originalUrl} não encontrada.`,
      requestId: getRequestId(req),
    },
  });
};
