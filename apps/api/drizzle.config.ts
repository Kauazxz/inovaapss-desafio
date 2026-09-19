/**
 * Configuração do drizzle-kit (ajuste A8 da spec).
 *
 * - `schema`: um arquivo por módulo em src/db/schema/, reexportados em index.ts.
 * - `out`: as migrations vão direto para supabase/migrations/, a pasta que o workflow
 *   deploy-supabase.yml aplica com `supabase db push` a cada push na main.
 * - `migrations.prefix = 'supabase'`: gera `YYYYMMDDHHMMSS_nome.sql`, o formato que a CLI do
 *   Supabase entende (opção confirmada em drizzle-kit 0.31 — `Prefix` em index.d.mts).
 * - `entities.roles.provider = 'supabase'`: o `db:check` ignora as roles internas do Supabase.
 *
 * Uso: `pnpm --filter @inovaapss/api db:generate` (gera) e `db:check` (confere).
 * Precisa de DATABASE_URL apenas para comandos que falam com o banco (push, introspect);
 * generate e check funcionam só com o schema e a pasta de migrations.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: '../../supabase/migrations',
  migrations: {
    prefix: 'supabase',
  },
  entities: {
    roles: {
      provider: 'supabase',
    },
  },
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
