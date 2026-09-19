import type { Request } from 'express';

/** Id da requisição definido pelo middleware request-id (sempre string na prática). */
export function getRequestId(req: Request): string {
  const id: unknown = req.id;
  return typeof id === 'string' ? id : String(id ?? '');
}
