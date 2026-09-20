/**
 * Schema Drizzle da API.
 *
 * Convenção (ETAPAS.md): cada módulo tem o SEU arquivo aqui — `organizations.ts`,
 * `portfolio-clients.ts`, `metrics.ts`... — e a única linha que a etapa acrescenta neste index é
 * o reexport: `export * from './<modulo>.js';`. Assim duas etapas nunca editam o mesmo schema.
 *
 * Depois de alterar um schema, rode `pnpm --filter @inovaapss/api db:generate` para gravar a
 * migration em supabase/migrations/.
 */
export * from './organizations.js';
export * from './metrics.js';
export * from './clients.js';
export * from './contracts.js';
