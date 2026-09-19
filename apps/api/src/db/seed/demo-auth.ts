/**
 * Seed de demonstração (§64): a organização "GlobalSys (demo)" e o usuário owner.
 *
 * Idempotente: pode rodar quantas vezes quiser. Cria o que falta e atualiza a senha do usuário
 * demo para a informada (a senha das variáveis é a verdade).
 *
 * Variáveis obrigatórias (sem padrão — senha nunca fica no código):
 *   SEED_DEMO_EMAIL      e-mail do usuário demo
 *   SEED_DEMO_PASSWORD   senha (12+ caracteres, letras, números e símbolo)
 * Além de SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY e DATABASE_URL do .env.
 *
 * Uso:  SEED_DEMO_EMAIL=demo@exemplo.com SEED_DEMO_PASSWORD='...' pnpm --filter @inovaapss/api seed:demo
 */
import { loadEnvFiles, parseApiEnv, requireEnv } from '../../config/env.js';
import { createDbClient } from '../../infrastructure/db/index.js';
import { createSupabaseClients } from '../../infrastructure/supabase.js';
import { createOrganizationsRepository } from '../../modules/organizations/repository.js';

export const DEMO_ORGANIZATION = { name: 'GlobalSys (demo)', slug: 'globalsys-demo' } as const;

const STRONG_PASSWORD = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{12,}$/;

function readSeedCredentials(): { email: string; password: string } {
  const email = process.env.SEED_DEMO_EMAIL?.trim();
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Defina SEED_DEMO_EMAIL e SEED_DEMO_PASSWORD no ambiente (só no shell, nunca em arquivo versionado).',
    );
  }
  if (!STRONG_PASSWORD.test(password)) {
    throw new Error(
      'SEED_DEMO_PASSWORD precisa ter 12+ caracteres com letras, números e ao menos um símbolo.',
    );
  }
  return { email, password };
}

export async function seedDemoAuth(): Promise<{
  organizationId: string;
  userId: string;
  created: { organization: boolean; user: boolean; membership: boolean };
}> {
  loadEnvFiles();
  const env = parseApiEnv(process.env);
  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
  ] as const) {
    requireEnv(env, key);
  }
  const { email, password } = readSeedCredentials();

  const db = createDbClient(env.DATABASE_URL);
  const supabase = createSupabaseClients(env);
  const repository = createOrganizationsRepository(() => db.getDb());
  const admin = supabase.getAdmin().auth.admin;
  const created = { organization: false, user: false, membership: false };

  try {
    // 1. Usuário no Supabase Auth (e-mail já confirmado).
    let userId = await repository.findAuthUserIdByEmail(email);
    if (userId === null) {
      const { data, error } = await admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`Falha ao criar o usuário demo: ${error?.message}`);
      userId = data.user.id;
      created.user = true;
    } else {
      const { error } = await admin.updateUserById(userId, { password, email_confirm: true });
      if (error) throw new Error(`Falha ao atualizar a senha do usuário demo: ${error.message}`);
    }

    // 2. Organização demo.
    let organization = await repository.findBySlug(DEMO_ORGANIZATION.slug);
    if (organization === null) {
      organization = await repository.createWithOwner({
        name: DEMO_ORGANIZATION.name,
        slug: DEMO_ORGANIZATION.slug,
        ownerAuthUserId: userId,
      });
      created.organization = true;
      created.membership = true;
    } else {
      // 3. Vínculo owner (se a organização já existia sem este usuário).
      const member = await repository.findMember(organization.id, userId);
      if (member === null) {
        await repository.addMember({
          organizationId: organization.id,
          authUserId: userId,
          role: 'owner',
        });
        created.membership = true;
      }
    }

    return { organizationId: organization.id, userId, created };
  } finally {
    await db.close();
  }
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('/db/seed/demo-auth.ts') === true;
if (isMain) {
  seedDemoAuth()
    .then((result) => {
      console.log('Seed de demonstração concluído.');
      console.log(`  organização: ${DEMO_ORGANIZATION.name} (${result.organizationId})`);
      console.log(`  usuário:     ${process.env.SEED_DEMO_EMAIL} (${result.userId})`);
      console.log(
        `  criados agora: organização=${result.created.organization} usuário=${result.created.user} vínculo=${result.created.membership}`,
      );
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
