/**
 * Dublê do client do Supabase para os testes do front: só a parte de `auth` que o app usa.
 * Guarda a sessão em memória e dispara `onAuthStateChange` como o client real.
 */
import { vi } from 'vitest';

import type { AuthChangeEvent, Session, SupabaseClient, User } from '@supabase/supabase-js';

type Listener = (event: AuthChangeEvent, session: Session | null) => void;

export function makeSession(email: string, overrides: Partial<Session> = {}): Session {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email,
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-09-19T00:00:00.000Z',
  } as unknown as User;
  return {
    access_token: `token-${email}`,
    refresh_token: 'refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
    ...overrides,
  };
}

export interface FakeSupabase {
  client: SupabaseClient;
  setSession(session: Session | null): void;
  emit(event: AuthChangeEvent, session: Session | null): void;
  auth: {
    getSession: ReturnType<typeof vi.fn>;
    onAuthStateChange: ReturnType<typeof vi.fn>;
    signInWithPassword: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
    resetPasswordForEmail: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
  };
}

export function createFakeSupabase(
  options: { session?: Session | null; signInError?: { code: string; message: string } } = {},
): FakeSupabase {
  let session: Session | null = options.session ?? null;
  const listeners = new Set<Listener>();
  const emit = (event: AuthChangeEvent, next: Session | null) => {
    session = next;
    for (const listener of listeners) listener(event, next);
  };

  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: vi.fn((listener: Listener) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    }),
    signInWithPassword: vi.fn(async ({ email }: { email: string; password: string }) => {
      if (options.signInError) {
        return { data: { session: null, user: null }, error: options.signInError };
      }
      const next = makeSession(email);
      emit('SIGNED_IN', next);
      return { data: { session: next, user: next.user }, error: null };
    }),
    signOut: vi.fn(async () => {
      emit('SIGNED_OUT', null);
      return { error: null };
    }),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    updateUser: vi.fn(async () => ({ data: { user: session?.user ?? null }, error: null })),
  };

  return {
    client: { auth } as unknown as SupabaseClient,
    auth,
    emit,
    setSession(next) {
      session = next;
    },
  };
}

/** Resposta padrão de GET /api/v1/me para os testes: com ou sem organização. */
export function meResponse(email: string, organization: { name: string; slug: string } | null) {
  return {
    user: { id: '11111111-1111-4111-8111-111111111111', email },
    organization: organization
      ? {
          id: '9d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
          name: organization.name,
          slug: organization.slug,
          createdAt: '2026-09-19T00:00:00.000Z',
          updatedAt: '2026-09-19T00:00:00.000Z',
        }
      : null,
    role: organization ? 'owner' : null,
  };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
