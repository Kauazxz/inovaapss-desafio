/**
 * requireAuth — passo 3 do fluxo da §5: a API valida o JWT emitido pelo Supabase Auth.
 *
 * Lê `Authorization: Bearer <jwt>`, valida com `supabase.auth.getUser(token)` e coloca em
 * `req.auth = { userId, email }`. Cada token validado fica num cache em memória por 60 s
 * (chaveado pelo hash do token, nunca pelo token em si), para não bater no Supabase a cada
 * requisição. Sem token ou token inválido: 401 UNAUTHORIZED no formato do error-handler.
 */
import { createHash } from 'node:crypto';

import { UnauthorizedError } from './http-errors.js';

import type { SupabaseClients } from '../infrastructure/supabase.js';
import type { RequestHandler } from 'express';

export interface AuthUser {
  userId: string;
  email: string | null;
}

declare global {
  // A augmentação de tipos do Express só funciona por namespace (é o padrão do @types/express).
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Usuário autenticado (definido por requireAuth). */
      auth?: AuthUser;
    }
  }
}

/** Valida um token e devolve o usuário, ou null se o token não for aceito. */
export type GetUserByToken = (token: string) => Promise<AuthUser | null>;

export interface RequireAuthOptions {
  getUser: GetUserByToken;
  /** Tempo de vida do cache por token (padrão 60 s). 0 desliga o cache. */
  cacheTtlMs?: number;
  /** Relógio injetável para os testes. */
  now?: () => number;
}

export const AUTH_CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 5_000;

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

export function extractBearerToken(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = BEARER_PATTERN.exec(header.trim());
  return match?.[1];
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Adapta o client do Supabase à interface `GetUserByToken`. */
export function supabaseGetUser(supabase: SupabaseClients): GetUserByToken {
  return async (token) => {
    const { data, error } = await supabase.getAnon().auth.getUser(token);
    if (error || !data.user) return null;
    return { userId: data.user.id, email: data.user.email ?? null };
  };
}

export function createRequireAuth(options: RequireAuthOptions): RequestHandler {
  const ttl = options.cacheTtlMs ?? AUTH_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { user: AuthUser; expiresAt: number }>();

  const remember = (key: string, user: AuthUser): void => {
    if (ttl <= 0) return;
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { user, expiresAt: now() + ttl });
  };

  return async (req, _res, next) => {
    try {
      const token = extractBearerToken(req.get('authorization'));
      if (token === undefined) {
        throw new UnauthorizedError();
      }

      const key = hashToken(token);
      const cached = cache.get(key);
      if (cached !== undefined && cached.expiresAt > now()) {
        req.auth = cached.user;
        next();
        return;
      }
      cache.delete(key);

      const user = await options.getUser(token);
      if (user === null) {
        throw new UnauthorizedError('Sessão inválida ou expirada. Faça login novamente.');
      }

      remember(key, user);
      req.auth = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Usuário autenticado da requisição; lança 401 se requireAuth não rodou antes. */
export function getAuthUser(req: { auth?: AuthUser }): AuthUser {
  if (req.auth === undefined) {
    throw new UnauthorizedError();
  }
  return req.auth;
}
