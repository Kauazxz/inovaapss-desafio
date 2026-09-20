/**
 * Cliente do Supabase para o navegador (só a chave anon; a service_role nunca chega aqui).
 *
 * Criado sob demanda para o app não quebrar na importação quando o .env ainda não existe
 * (testes, primeiro `pnpm dev`). A Etapa 1 usa `getSupabaseClient().auth` no login.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { parseClientEnv } from '@inovaapss/validation';

let client: SupabaseClient | null = null;

/** Devolve o mesmo client em toda chamada; lança erro legível se faltar VITE_SUPABASE_*. */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  let env;
  try {
    env = parseClientEnv({
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
      VITE_API_URL: import.meta.env.VITE_API_URL,
    });
  } catch {
    // Vazio no .env (como no .env.example) cai aqui: a tela mostra "Autenticação não configurada".
    throw new Error(
      'Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env da raiz (modelo em .env.example) com os valores do painel do Supabase.',
    );
  }
  client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
