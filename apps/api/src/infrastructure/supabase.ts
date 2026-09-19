/**
 * Clientes do Supabase para o backend (§5).
 *
 * - `admin`: chave service_role — ignora RLS e acessa a Admin API de auth (criar/convidar usuário).
 *   SÓ existe aqui; nunca vai para o navegador nem para logs.
 * - `anon`: chave anon — usado para validar o JWT do usuário (`auth.getUser(token)`), que funciona
 *   tanto com as chaves legadas (JWT) quanto com as novas (sb_publishable_/sb_secret_).
 *
 * Criados sob demanda: sem SUPABASE_* no ambiente a API sobe normalmente (testes, /health) e só
 * as rotas autenticadas respondem 503 SUPABASE_NOT_CONFIGURED.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { AppError } from '../shared/errors.js';

import type { ApiEnv } from '../config/env.js';

export type SupabaseEnv = Pick<
  ApiEnv,
  'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY'
>;

export interface SupabaseClients {
  /** true quando SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY existem. */
  readonly isConfigured: boolean;
  /** Client com service_role (somente backend). Lança SupabaseNotConfiguredError se faltar env. */
  getAdmin(): SupabaseClient;
  /** Client com a chave anon, para validar tokens de usuário. */
  getAnon(): SupabaseClient;
}

export class SupabaseNotConfiguredError extends AppError {
  constructor() {
    super(
      503,
      'SUPABASE_NOT_CONFIGURED',
      'SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env da raiz (modelo em .env.example).',
    );
    this.name = 'SupabaseNotConfiguredError';
  }
}

const SERVER_AUTH_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export function createSupabaseClients(env: SupabaseEnv): SupabaseClients {
  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const isConfigured = url !== undefined && anonKey !== undefined && serviceRoleKey !== undefined;

  let admin: SupabaseClient | undefined;
  let anon: SupabaseClient | undefined;

  const require = (): { url: string; anonKey: string; serviceRoleKey: string } => {
    if (url === undefined || anonKey === undefined || serviceRoleKey === undefined) {
      throw new SupabaseNotConfiguredError();
    }
    return { url, anonKey, serviceRoleKey };
  };

  return {
    isConfigured,
    getAdmin() {
      if (admin === undefined) {
        const cfg = require();
        admin = createClient(cfg.url, cfg.serviceRoleKey, SERVER_AUTH_OPTIONS);
      }
      return admin;
    },
    getAnon() {
      if (anon === undefined) {
        const cfg = require();
        anon = createClient(cfg.url, cfg.anonKey, SERVER_AUTH_OPTIONS);
      }
      return anon;
    },
  };
}
