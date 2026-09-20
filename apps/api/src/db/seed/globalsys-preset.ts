/**
 * Seed do preset GlobalSys v1 (§6 e §31 de docs/DEFINICOES_METRICAS.md; SPEC §12–§22, §64, §71).
 *
 * Cria, na organização indicada:
 *   - as 10 definições de métrica (metric_definitions), identificadas pelo slug;
 *   - o modelo "GlobalSys v1" (metric_models) no modo ASSISTED;
 *   - a versão 1 ATIVA (metric_model_versions) com os 10 itens (metric_model_items):
 *     peso da métrica, composição 45/35/20, normalização, faixas e gatilhos.
 *
 * Idempotente: rodar de novo atualiza as definições e os itens da versão 1 em vez de duplicar.
 * A configuração vem toda de presets/globalsys-v1.ts — é dado, não código; outra empresa pode
 * apagar tudo isso e montar as próprias métricas pelo configurador, sem tocar no motor.
 *
 * Variáveis: DATABASE_URL (e as do .env). Opcional: SEED_ORGANIZATION_SLUG (padrão globalsys-demo).
 * Uso:  pnpm --filter @inovaapss/api seed:globalsys
 */
import { and, eq } from 'drizzle-orm';

import { loadEnvFiles, parseApiEnv, requireEnv } from '../../config/env.js';
import { createDbClient } from '../../infrastructure/db/index.js';
import {
  metricDefinitions,
  metricModelItems,
  metricModelVersions,
  metricModels,
  organizations,
} from '../schema/index.js';
import {
  GLOBALSYS_V1_METRICS,
  GLOBALSYS_V1_MODEL_NAME,
  GLOBALSYS_V1_TOTAL_WEIGHT,
  PRESET_COMPONENT_WEIGHTS,
} from './presets/globalsys-v1.js';

export interface SeedPresetResult {
  organizationId: string;
  modelId: string;
  versionId: string;
  metrics: { created: number; updated: number };
  items: number;
  totalWeight: number;
}

const DEFAULT_ORGANIZATION_SLUG = 'globalsys-demo';

export async function seedGlobalSysPreset(): Promise<SeedPresetResult> {
  loadEnvFiles();
  const env = parseApiEnv(process.env);
  requireEnv(env, 'DATABASE_URL');

  // A versão só pode ficar ativa com os pesos somando 100 % (§41 da spec / §6 do documento).
  if (Math.abs(GLOBALSYS_V1_TOTAL_WEIGHT - 1) > 0.0001) {
    throw new Error(
      `Os pesos do preset somam ${GLOBALSYS_V1_TOTAL_WEIGHT}, e precisam somar 1,0000 para a versão ser ativada.`,
    );
  }

  const slug = process.env.SEED_ORGANIZATION_SLUG?.trim() || DEFAULT_ORGANIZATION_SLUG;
  const client = createDbClient(env.DATABASE_URL);

  try {
    const db = client.getDb();

    const [organization] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (!organization) {
      throw new Error(
        `Organização "${slug}" não encontrada. Rode o seed de demonstração antes (seed:demo) ou informe SEED_ORGANIZATION_SLUG.`,
      );
    }
    const organizationId = organization.id;

    // ---------------------------------------------------------------- métricas
    const metrics = { created: 0, updated: 0 };
    const definitionIdBySlug = new Map<string, string>();

    for (const metric of GLOBALSYS_V1_METRICS) {
      const values = {
        organizationId,
        name: metric.name,
        slug: metric.slug,
        description: metric.description,
        category: metric.category,
        metricType: metric.metricType,
        unit: metric.unit,
        direction: metric.direction,
        periodicity: metric.periodicity,
        sourceType: metric.sourceType,
        isActive: true,
      };

      const [existing] = await db
        .select({ id: metricDefinitions.id })
        .from(metricDefinitions)
        .where(
          and(
            eq(metricDefinitions.organizationId, organizationId),
            eq(metricDefinitions.slug, metric.slug),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(metricDefinitions)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(metricDefinitions.id, existing.id));
        definitionIdBySlug.set(metric.slug, existing.id);
        metrics.updated += 1;
      } else {
        const [inserted] = await db
          .insert(metricDefinitions)
          .values(values)
          .returning({ id: metricDefinitions.id });
        if (!inserted) throw new Error(`Falha ao criar a métrica ${metric.slug}.`);
        definitionIdBySlug.set(metric.slug, inserted.id);
        metrics.created += 1;
      }
    }

    // ---------------------------------------------------------------- modelo
    let [model] = await db
      .select({ id: metricModels.id })
      .from(metricModels)
      .where(
        and(
          eq(metricModels.organizationId, organizationId),
          eq(metricModels.name, GLOBALSYS_V1_MODEL_NAME),
        ),
      )
      .limit(1);

    if (!model) {
      [model] = await db
        .insert(metricModels)
        .values({
          organizationId,
          name: GLOBALSYS_V1_MODEL_NAME,
          // Modo assistido (§25 do documento): o sistema sugere pesos, a empresa aprova.
          mode: 'ASSISTED',
          isActive: true,
        })
        .returning({ id: metricModels.id });
    }
    if (!model) throw new Error('Falha ao criar o modelo de métricas.');

    // ---------------------------------------------------------------- versão 1
    let [version] = await db
      .select({ id: metricModelVersions.id })
      .from(metricModelVersions)
      .where(
        and(eq(metricModelVersions.metricModelId, model.id), eq(metricModelVersions.version, 1)),
      )
      .limit(1);

    if (!version) {
      [version] = await db
        .insert(metricModelVersions)
        .values({
          metricModelId: model.id,
          organizationId,
          version: 1,
          status: 'active',
          effectiveFrom: new Date(),
        })
        .returning({ id: metricModelVersions.id });
    } else {
      await db
        .update(metricModelVersions)
        .set({ status: 'active' })
        .where(eq(metricModelVersions.id, version.id));
    }
    if (!version) throw new Error('Falha ao criar a versão 1 do modelo.');

    // ---------------------------------------------------------------- itens
    // Reescreve os itens da versão 1 a partir do preset (idempotente e sem duplicar).
    await db.delete(metricModelItems).where(eq(metricModelItems.metricModelVersionId, version.id));

    for (const metric of GLOBALSYS_V1_METRICS) {
      const metricDefinitionId = definitionIdBySlug.get(metric.slug);
      if (!metricDefinitionId) throw new Error(`Métrica ${metric.slug} não foi criada.`);

      await db.insert(metricModelItems).values({
        metricModelVersionId: version.id,
        metricDefinitionId,
        weight: metric.weight,
        currentWeight: PRESET_COMPONENT_WEIGHTS.current,
        trendWeight: PRESET_COMPONENT_WEIGHTS.trend,
        persistenceWeight: PRESET_COMPONENT_WEIGHTS.persistence,
        normalizationStrategy: metric.normalizationStrategy,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- configuração validada no preset
        normalizationConfigJson: metric.normalizationConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- configuração validada no preset
        criticalTriggerConfigJson: (metric.triggers ?? []) as any,
        sortOrder: metric.sortOrder,
      });
    }

    return {
      organizationId,
      modelId: model.id,
      versionId: version.id,
      metrics,
      items: GLOBALSYS_V1_METRICS.length,
      totalWeight: GLOBALSYS_V1_TOTAL_WEIGHT,
    };
  } finally {
    await client.close();
  }
}

const isMain =
  process.argv[1]?.replace(/\\/g, '/').endsWith('/db/seed/globalsys-preset.ts') === true;
if (isMain) {
  seedGlobalSysPreset()
    .then((result) => {
      console.log('Preset GlobalSys v1 aplicado.');
      console.log(`  organização: ${result.organizationId}`);
      console.log(`  modelo:      ${GLOBALSYS_V1_MODEL_NAME} (${result.modelId})`);
      console.log(`  versão 1:    ${result.versionId} — ativa`);
      console.log(
        `  métricas:    ${result.metrics.created} criadas, ${result.metrics.updated} atualizadas`,
      );
      console.log(
        `  itens:       ${result.items} com pesos somando ${(result.totalWeight * 100).toFixed(0)} %`,
      );
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
