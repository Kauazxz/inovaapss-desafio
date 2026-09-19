/**
 * Schema Drizzle da API.
 *
 * Convenção (ETAPAS.md): cada módulo tem o SEU arquivo aqui — `organizations.ts`,
 * `portfolio-clients.ts`, `metrics.ts`... — e a única linha que a etapa acrescenta neste index é
 * o reexport: `export * from './<modulo>.js';`. Assim duas etapas nunca editam o mesmo schema.
 *
 * Ainda não há tabelas (Etapa 0). Quando a primeira entrar, rode
 * `pnpm --filter @inovaapss/api db:generate` para gravar a migration em supabase/migrations/.
 */
export {};
