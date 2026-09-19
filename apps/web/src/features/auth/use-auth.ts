import { useContext } from 'react';

import { AuthContext, type AuthContextValue } from './auth-context';

/** Sessão, usuário, organização atual (`me`) e `signOut`. Precisa estar dentro do AuthProvider. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  }
  return value;
}
