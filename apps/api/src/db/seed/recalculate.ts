/**
 * Recalcula a carteira da organização e grava os snapshots.
 *
 * Roda depois de seed:globalsys (as métricas) e seed:globalsys-data (a planilha).
 * Uso:  pnpm --filter @inovaapss/api recalculate
 */
import { eq } from 'drizzle-orm';

import { loadEnvFiles, parseApiEnv, requireEnv } from '../../config/env.js';
import { createDbClient } from '../../infrastructure/db/index.js';
import { recalculateOrganization } from '../../modules/scoring/recalculate.js';
import { organizations } from '../schema/index.js';

const DEFAULT_ORGANIZATION_SLUG = 'globalsys-demo';

async function main(): Promise<void> {
  loadEnvFiles();
  const env = parseApiEnv(process.env);
  requireEnv(env, 'DATABASE_URL');

  const slug = process.env.SEED_ORGANIZATION_SLUG?.trim() || DEFAULT_ORGANIZATION_SLUG;
  const periods = Number(process.env.RECALCULATE_PERIODS ?? '6');
  const client = createDbClient(env.DATABASE_URL);

  try {
    const db = client.getDb();
    const [organization] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (!organization) throw new Error(`Organização "${slug}" não encontrada.`);

    const started = process.hrtime.bigint();
    const result = await recalculateOrganization(db, {
      organizationId: organization.id,
      periods: Number.isFinite(periods) && periods > 0 ? periods : 6,
    });
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;

    console.log('Recálculo concluído.');
    console.log(`  clientes:          ${result.clients} (${result.withoutData} sem dados)`);
    console.log(`  snapshots cliente: ${result.clientSnapshots}`);
    console.log(`  snapshots métrica: ${result.metricSnapshots}`);
    console.log(`  tempo:             ${seconds.toFixed(1)} s`);
    console.log('  distribuição do último período:');
    for (const [classe, total] of Object.entries(result.distribution).sort()) {
      console.log(`    ${classe.padEnd(10)} ${total}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
