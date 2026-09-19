import { createContext } from 'react';

import type { Me } from './api';
import type { Session, User } from '@supabase/supabase-js';

export type AuthStatus =
  /** Ainda lendo a sessão guardada no navegador. */
  | 'loading'
  | 'signed_out'
  | 'signed_in'
  /** Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: o app não consegue autenticar. */
  | 'unconfigured';

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** Mensagem quando status = 'unconfigured'. */
  configError: string | null;
  /** Usuário chegou por um link de redefinição de senha: precisa definir a nova senha. */
  passwordRecovery: boolean;
  /** GET /me — organização atual e papel. Só é consultado com sessão. */
  me: Me | null;
  meStatus: 'idle' | 'loading' | 'ready' | 'error';
  meError: Error | null;
  refetchMe(): Promise<unknown>;
  signOut(): Promise<void>;
  /** Marca a recuperação de senha como concluída (depois do updateUser). */
  finishPasswordRecovery(): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
