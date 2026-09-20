/// <reference types="vite/client" />

// Variáveis que o Vite expõe ao navegador (VITE_*), lidas do .env da raiz do monorepo.
// O schema de validação está em @inovaapss/validation (clientEnvSchema).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_API_URL?: string;
  /** 'mock' usa os dados de exemplo; qualquer outro valor (ou ausente) usa a API. */
  readonly VITE_DATA_SOURCE?: 'mock' | 'api';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
