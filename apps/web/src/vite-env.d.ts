/// <reference types="vite/client" />

// Variáveis que o Vite expõe ao navegador (VITE_*), lidas do .env da raiz do monorepo.
// O schema de validação está em @inovaapss/validation (clientEnvSchema).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
