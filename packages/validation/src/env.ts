import { z } from 'zod';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

/** Aceita string vazia como "não configurado" (as opcionais do .env.example ficam vazias). */
const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional();

const optionalUrl = optionalString.pipe(z.url().optional());

/** "a,b , c" -> ["a", "b", "c"]. */
function splitCommaList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/**
 * §52 — variáveis do servidor (apps/api). Só o backend lê SUPABASE_SERVICE_ROLE_KEY.
 * Use `parseServerEnv(process.env)` na inicialização e falhe cedo se algo faltar.
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CORS_ORIGINS: z.string().default('http://localhost:5173').transform(splitCommaList),
  SUPABASE_URL: z.url({ message: 'SUPABASE_URL precisa ser uma URL (Project Settings -> API).' }),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY é obrigatória.'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY é obrigatória.'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL é obrigatória.')
    .refine(
      (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
      'DATABASE_URL precisa começar com postgresql://',
    ),
  ANTHROPIC_API_KEY: optionalString,
  /** Modelo usado para analisar documentos; vazio usa o modelo econômico padrão da API. */
  ANTHROPIC_MODEL: optionalString,
  SENTRY_DSN: optionalUrl,
});
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** §52 — variáveis do front (apps/web). Só as VITE_* chegam ao navegador. */
export const clientEnvSchema = z.object({
  VITE_SUPABASE_URL: z.url({ message: 'VITE_SUPABASE_URL precisa ser uma URL.' }),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, 'VITE_SUPABASE_ANON_KEY é obrigatória.'),
  VITE_API_URL: z
    .url({ message: 'VITE_API_URL precisa ser uma URL.' })
    .default('http://localhost:3001'),
});
export type ClientEnv = z.infer<typeof clientEnvSchema>;

/** Valores brutos de `process.env` ou `import.meta.env`. */
export type RawEnv = Readonly<Record<string, string | undefined>>;

function formatIssues(prefix: string, error: z.ZodError): string {
  const lines = error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  return `${prefix}\n${lines.join('\n')}\nConfira o .env (modelo em .env.example).`;
}

/** Lê e valida o env do servidor; lança erro legível listando o que falta. */
export function parseServerEnv(raw: RawEnv): ServerEnv {
  const result = serverEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatIssues('Variáveis de ambiente do servidor inválidas:', result.error));
  }
  return result.data;
}

/** Lê e valida o env do front (import.meta.env); lança erro legível listando o que falta. */
export function parseClientEnv(raw: RawEnv): ClientEnv {
  const result = clientEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatIssues('Variáveis de ambiente do front inválidas:', result.error));
  }
  return result.data;
}
