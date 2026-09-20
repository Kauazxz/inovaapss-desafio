/**
 * Carga da planilha do desafio (§26 e §34 de docs/DEFINICOES_METRICAS.md; SPEC §44, §64).
 *
 * Lê data/INOVAAPPS_base_de_dados.xlsx com @inovaapss/importer e grava na organização:
 *   - os planos encontrados (Essencial, Avançado, Enterprise);
 *   - os 80 clientes (portfolio_clients) e seus contratos, com valor mensal e SLA contratado;
 *   - quem cancelou (status cancelled + fim do contrato no mês da saída);
 *   - os valores mensais de cada métrica (metric_values), incluindo as taxas derivadas.
 *
 * Idempotente: clientes por código externo, contratos por cliente e valores por
 * (cliente, métrica, período). Rodar de novo atualiza em vez de duplicar.
 *
 * Regras do documento respeitadas aqui:
 *   §15 reuniões previstas = 0  → valor nulo (não se aplica), nunca 0 %.
 *   §16 NPS não respondido      → answered = 'false' e valor nulo, nunca nota zero.
 *
 * Pré-requisito: seed:demo (organização) e seed:globalsys (as 10 métricas).
 * Uso:  pnpm --filter @inovaapss/api seed:globalsys-data
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { and, eq } from 'drizzle-orm';

import { importGlobalSysWorkbook } from '@inovaapss/importer';

import { loadEnvFiles, parseApiEnv, requireEnv } from '../../config/env.js';
import { createDbClient } from '../../infrastructure/db/index.js';
import {
  monthBounds,
  monthlyMetricValues,
  npsMetricValue,
} from '../../modules/imports/metric-mapping.js';
import {
  contracts,
  metricDefinitions,
  metricValues,
  organizations,
  plans,
  portfolioClients,
} from '../schema/index.js';

type Db = ReturnType<ReturnType<typeof createDbClient>['getDb']>;

const DEFAULT_ORGANIZATION_SLUG = 'globalsys-demo';
const WORKBOOK = resolve(process.cwd(), '../../data/INOVAAPPS_base_de_dados.xlsx');
const CHUNK = 500;

export interface SeedDataResult {
  organizationId: string;
  plans: number;
  clients: number;
  contracts: number;
  cancelled: number;
  values: number;
  periods: { first: string; last: string };
  skipped: string[];
}

async function insertInChunks<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<number> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await insert(rows.slice(i, i + CHUNK));
  }
  return rows.length;
}

export async function seedGlobalSysData(): Promise<SeedDataResult> {
  loadEnvFiles();
  const env = parseApiEnv(process.env);
  requireEnv(env, 'DATABASE_URL');

  const slug = process.env.SEED_ORGANIZATION_SLUG?.trim() || DEFAULT_ORGANIZATION_SLUG;
  const workbookPath = process.env.SEED_WORKBOOK_PATH?.trim() || WORKBOOK;

  const result = importGlobalSysWorkbook(readFileSync(workbookPath));
  if (result.report.hasErrors) {
    const first = result.report.summary.errors.slice(0, 5);
    throw new Error(
      `A planilha tem ${result.report.summary.invalid} linhas inválidas. Primeiras: ${first
        .map((e) => `linha ${e.row} — ${e.message}`)
        .join(' | ')}`,
    );
  }

  const client = createDbClient(env.DATABASE_URL);
  const skipped: string[] = [];

  try {
    const db: Db = client.getDb();

    const [organization] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (!organization)
      throw new Error(`Organização "${slug}" não encontrada. Rode seed:demo antes.`);
    const organizationId = organization.id;

    // ------------------------------------------------------------- métricas
    const definitions = await db
      .select({ id: metricDefinitions.id, slug: metricDefinitions.slug })
      .from(metricDefinitions)
      .where(eq(metricDefinitions.organizationId, organizationId));
    const metricIdBySlug = new Map(definitions.map((d) => [d.slug, d.id]));
    if (metricIdBySlug.size === 0) {
      throw new Error('Nenhuma métrica cadastrada. Rode seed:globalsys antes.');
    }

    // ------------------------------------------------------------- planos
    const planNames = [...new Set(result.clients.map((c) => c.plan))].sort();
    const planIdByName = new Map<string, string>();
    for (const name of planNames) {
      const [existing] = await db
        .select({ id: plans.id })
        .from(plans)
        .where(and(eq(plans.organizationId, organizationId), eq(plans.name, name)))
        .limit(1);
      if (existing) {
        planIdByName.set(name, existing.id);
      } else {
        const [created] = await db
          .insert(plans)
          .values({ organizationId, name, description: `Plano ${name} (importado da planilha).` })
          .returning({ id: plans.id });
        if (created) planIdByName.set(name, created.id);
      }
    }

    // ------------------------------------------------------------- situação
    const statusByCode = new Map(result.clientStatus.map((s) => [s.external_code, s]));

    // ------------------------------------------------------------- clientes e contratos
    const clientIdByCode = new Map<string, string>();
    let cancelled = 0;
    let contractCount = 0;

    for (const row of result.clients) {
      const situation = statusByCode.get(row.external_code);
      const isCancelled = situation?.status === 'cancelled';
      if (isCancelled) cancelled += 1;

      const clientValues = {
        organizationId,
        externalCode: row.external_code,
        name: row.name ?? row.external_code,
        segment: row.segment,
        size: row.size,
        status: (isCancelled ? 'cancelled' : 'active') as 'cancelled' | 'active',
      };

      const [existingClient] = await db
        .select({ id: portfolioClients.id })
        .from(portfolioClients)
        .where(
          and(
            eq(portfolioClients.organizationId, organizationId),
            eq(portfolioClients.externalCode, row.external_code),
          ),
        )
        .limit(1);

      let clientId: string;
      if (existingClient) {
        await db
          .update(portfolioClients)
          .set({ ...clientValues, updatedAt: new Date() })
          .where(eq(portfolioClients.id, existingClient.id));
        clientId = existingClient.id;
      } else {
        const [created] = await db
          .insert(portfolioClients)
          .values(clientValues)
          .returning({ id: portfolioClients.id });
        if (!created) throw new Error(`Falha ao criar o cliente ${row.external_code}.`);
        clientId = created.id;
      }
      clientIdByCode.set(row.external_code, clientId);

      // Contrato: um por cliente. Cancelado encerra no último dia do mês da saída.
      const endDate =
        isCancelled && situation?.cancellation_period
          ? monthBounds(situation.cancellation_period).end
          : null;
      const contractValues = {
        organizationId,
        portfolioClientId: clientId,
        planId: planIdByName.get(row.plan) ?? null,
        monthlyValue: row.monthly_value.toFixed(2),
        currency: 'BRL',
        startDate: row.contract_start,
        endDate,
        status: (isCancelled ? 'ended' : 'active') as 'ended' | 'active',
        contractedSlaHours: row.contracted_sla_hours,
      };

      const [existingContract] = await db
        .select({ id: contracts.id })
        .from(contracts)
        .where(
          and(
            eq(contracts.organizationId, organizationId),
            eq(contracts.portfolioClientId, clientId),
          ),
        )
        .limit(1);

      if (existingContract) {
        await db
          .update(contracts)
          .set({ ...contractValues, updatedAt: new Date() })
          .where(eq(contracts.id, existingContract.id));
      } else {
        await db.insert(contracts).values(contractValues);
      }
      contractCount += 1;
    }

    // ------------------------------------------------------------- valores mensais
    type ValueRow = typeof metricValues.$inferInsert;
    const rows: ValueRow[] = [];
    const periods = new Set<string>();

    const push = (
      code: string,
      metricSlug: string,
      period: string,
      value: number | null,
      answered?: boolean,
    ): void => {
      const portfolioClientId = clientIdByCode.get(code);
      const metricDefinitionId = metricIdBySlug.get(metricSlug);
      if (!portfolioClientId) {
        skipped.push(`cliente ${code} não encontrado`);
        return;
      }
      if (!metricDefinitionId) {
        skipped.push(`métrica ${metricSlug} não cadastrada`);
        return;
      }
      const { start, end } = monthBounds(period);
      periods.add(period);
      rows.push({
        organizationId,
        portfolioClientId,
        metricDefinitionId,
        periodStart: start,
        periodEnd: end,
        rawValueNumeric: value,
        answered: answered === undefined ? null : String(answered),
        source: 'XLSX',
        sourceReference: 'INOVAAPPS_base_de_dados.xlsx',
      });
    };

    // A tradução coluna → métrica (inclusive as taxas derivadas dos §11 e §15) é a mesma que o
    // importador da Etapa 7 usa: modules/imports/metric-mapping.ts.
    for (const m of result.monthlyMetrics) {
      for (const draft of monthlyMetricValues(m)) {
        push(m.external_code, draft.metricSlug, m.period, draft.value);
      }
    }

    // §16: "não respondeu" é observação válida — valor nulo com answered = false.
    for (const n of result.nps) {
      const draft = npsMetricValue(n);
      push(n.external_code, draft.metricSlug, n.period, draft.value, draft.answered);
    }

    // Reescreve os valores desta organização e insere de novo (idempotente e simples).
    await db.delete(metricValues).where(eq(metricValues.organizationId, organizationId));
    const inserted = await insertInChunks(rows, (chunk) => db.insert(metricValues).values(chunk));

    const sortedPeriods = [...periods].sort();
    return {
      organizationId,
      plans: planIdByName.size,
      clients: clientIdByCode.size,
      contracts: contractCount,
      cancelled,
      values: inserted,
      periods: { first: sortedPeriods[0] ?? '-', last: sortedPeriods.at(-1) ?? '-' },
      skipped: [...new Set(skipped)],
    };
  } finally {
    await client.close();
  }
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('/db/seed/globalsys-data.ts') === true;
if (isMain) {
  seedGlobalSysData()
    .then((r) => {
      console.log('Planilha carregada.');
      console.log(`  organização: ${r.organizationId}`);
      console.log(`  planos:      ${r.plans}`);
      console.log(`  clientes:    ${r.clients} (${r.cancelled} cancelados)`);
      console.log(`  contratos:   ${r.contracts}`);
      console.log(`  valores:     ${r.values} de ${r.periods.first} a ${r.periods.last}`);
      if (r.skipped.length > 0) console.log(`  ignorados:   ${r.skipped.join(', ')}`);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
