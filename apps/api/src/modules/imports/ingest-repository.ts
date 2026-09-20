/**
 * Gravação do que a importação trouxe: planos, clientes, contratos e valores mensais.
 *
 * Reimportar o mesmo arquivo NÃO duplica nada: tudo é resolvido pela chave natural —
 * plano por nome, cliente por `external_code`, contrato por cliente e valor por
 * (cliente, métrica, início do período). O que já existe é atualizado, o que falta nasce.
 * Nada é apagado: um período que não veio no arquivo continua no banco, porque importar a
 * planilha de um mês não pode fazer os outros meses sumirem.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';

import { monthBounds } from './ingest.js';
import {
  contracts,
  metricDefinitions,
  metricValues,
  plans,
  portfolioClients,
} from '../../db/schema/index.js';

import type { MetricValueInput } from './ingest.js';
import type { Database } from '../../infrastructure/db/index.js';

/** Um cliente do arquivo, já com a situação e o contrato resolvidos. */
export interface IngestClientInput {
  externalCode: string;
  name: string | null;
  segment: string;
  size: string;
  plan: string;
  monthlyValue: number;
  contractedSlaHours: number;
  contractStart: string;
  status: 'active' | 'cancelled';
  /** Último dia do mês do cancelamento; null quando ativo. */
  contractEnd: string | null;
}

export interface IngestClientsResult {
  clientIdByCode: Map<string, string>;
  created: number;
  updated: number;
  cancelled: number;
  contractsCreated: number;
  contractsUpdated: number;
}

export interface IngestStatusInput {
  externalCode: string;
  status: 'active' | 'cancelled';
  contractEnd: string | null;
}

export interface ImportIngestRepository {
  /** Cria os planos que faltam e devolve o id de cada nome. */
  ensurePlans(
    organizationId: string,
    names: readonly string[],
  ): Promise<{ idByName: Map<string, string>; created: number }>;
  upsertClients(
    organizationId: string,
    inputs: readonly IngestClientInput[],
    planIdByName: ReadonlyMap<string, string>,
  ): Promise<IngestClientsResult>;
  /** Aplica só a situação, para arquivos que trazem `client_status` sem `clients`. */
  applyStatuses(
    organizationId: string,
    inputs: readonly IngestStatusInput[],
  ): Promise<{ updated: number; cancelled: number; missing: string[] }>;
  clientIdsByExternalCode(organizationId: string): Promise<Map<string, string>>;
  metricIdsBySlug(organizationId: string): Promise<Map<string, string>>;
  /** Grava os valores (upsert pela chave natural) e devolve quantos entraram. */
  upsertMetricValues(
    organizationId: string,
    values: readonly ResolvedMetricValue[],
    sourceReference: string,
    source: 'XLSX' | 'CSV' | 'JSON',
  ): Promise<number>;
}

/** Valor com cliente e métrica já resolvidos para uuid. */
export interface ResolvedMetricValue {
  portfolioClientId: string;
  metricDefinitionId: string;
  periodStart: string;
  periodEnd: string;
  value: number | null;
  answered: boolean | undefined;
}

const CHUNK = 500;

/**
 * Resolve cada valor para ids. O que não casa (cliente ainda não cadastrado, métrica não
 * existente na organização) sai da lista e o motivo entra em `skipped`, para a tela dizer o que
 * ficou de fora em vez de calar.
 */
export function resolveMetricValues(
  values: readonly MetricValueInput[],
  clientIdByCode: ReadonlyMap<string, string>,
  metricIdBySlug: ReadonlyMap<string, string>,
): { resolved: ResolvedMetricValue[]; skipped: string[] } {
  const resolved: ResolvedMetricValue[] = [];
  const skipped = new Set<string>();
  for (const value of values) {
    const portfolioClientId = clientIdByCode.get(value.externalCode);
    if (portfolioClientId === undefined) {
      skipped.add(`cliente ${value.externalCode} não cadastrado`);
      continue;
    }
    const metricDefinitionId = metricIdBySlug.get(value.metricSlug);
    if (metricDefinitionId === undefined) {
      skipped.add(`métrica ${value.metricSlug} não cadastrada`);
      continue;
    }
    const { start, end } = monthBounds(value.period);
    resolved.push({
      portfolioClientId,
      metricDefinitionId,
      periodStart: start,
      periodEnd: end,
      value: value.value,
      answered: value.answered,
    });
  }
  return { resolved, skipped: [...skipped] };
}

export function createImportIngestRepository(getDb: () => Database): ImportIngestRepository {
  return {
    async ensurePlans(organizationId, names) {
      const db = getDb();
      const idByName = new Map<string, string>();
      const wanted = [...new Set(names)].filter((name) => name.trim() !== '').sort();
      if (wanted.length === 0) return { idByName, created: 0 };

      const existing = await db
        .select({ id: plans.id, name: plans.name })
        .from(plans)
        .where(and(eq(plans.organizationId, organizationId), inArray(plans.name, wanted)));
      for (const row of existing) idByName.set(row.name, row.id);

      const missing = wanted.filter((name) => !idByName.has(name));
      if (missing.length === 0) return { idByName, created: 0 };

      const inserted = await db
        .insert(plans)
        .values(
          missing.map((name) => ({
            organizationId,
            name,
            description: `Plano ${name} (criado na importação de dados).`,
          })),
        )
        .returning({ id: plans.id, name: plans.name });
      for (const row of inserted) idByName.set(row.name, row.id);
      return { idByName, created: inserted.length };
    },

    async upsertClients(organizationId, inputs, planIdByName) {
      const db = getDb();
      const result: IngestClientsResult = {
        clientIdByCode: new Map(),
        created: 0,
        updated: 0,
        cancelled: 0,
        contractsCreated: 0,
        contractsUpdated: 0,
      };

      for (const input of inputs) {
        const now = new Date();
        const clientValues = {
          organizationId,
          externalCode: input.externalCode,
          name: input.name ?? input.externalCode,
          segment: input.segment,
          size: input.size,
          status: input.status,
        };

        const [existing] = await db
          .select({ id: portfolioClients.id })
          .from(portfolioClients)
          .where(
            and(
              eq(portfolioClients.organizationId, organizationId),
              eq(portfolioClients.externalCode, input.externalCode),
            ),
          )
          .limit(1);

        let clientId: string;
        if (existing) {
          await db
            .update(portfolioClients)
            .set({ ...clientValues, updatedAt: now })
            .where(eq(portfolioClients.id, existing.id));
          clientId = existing.id;
          result.updated += 1;
        } else {
          const [created] = await db
            .insert(portfolioClients)
            .values(clientValues)
            .returning({ id: portfolioClients.id });
          if (!created) throw new Error(`Falha ao gravar o cliente ${input.externalCode}.`);
          clientId = created.id;
          result.created += 1;
        }
        if (input.status === 'cancelled') result.cancelled += 1;
        result.clientIdByCode.set(input.externalCode, clientId);

        // Um contrato por cliente: cancelado encerra no último dia do mês da saída (§33).
        const contractValues = {
          organizationId,
          portfolioClientId: clientId,
          planId: planIdByName.get(input.plan) ?? null,
          monthlyValue: input.monthlyValue.toFixed(2),
          currency: 'BRL',
          startDate: input.contractStart,
          endDate: input.contractEnd,
          status: (input.status === 'cancelled' ? 'ended' : 'active') as 'ended' | 'active',
          contractedSlaHours: input.contractedSlaHours,
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
            .set({ ...contractValues, updatedAt: now })
            .where(eq(contracts.id, existingContract.id));
          result.contractsUpdated += 1;
        } else {
          await db.insert(contracts).values(contractValues);
          result.contractsCreated += 1;
        }
      }

      return result;
    },

    async applyStatuses(organizationId, inputs) {
      const db = getDb();
      const missing: string[] = [];
      let updated = 0;
      let cancelled = 0;

      for (const input of inputs) {
        const [client] = await db
          .select({ id: portfolioClients.id })
          .from(portfolioClients)
          .where(
            and(
              eq(portfolioClients.organizationId, organizationId),
              eq(portfolioClients.externalCode, input.externalCode),
            ),
          )
          .limit(1);
        if (!client) {
          missing.push(input.externalCode);
          continue;
        }
        await db
          .update(portfolioClients)
          .set({ status: input.status, updatedAt: new Date() })
          .where(eq(portfolioClients.id, client.id));
        updated += 1;
        if (input.status === 'cancelled') cancelled += 1;

        await db
          .update(contracts)
          .set({
            status: input.status === 'cancelled' ? 'ended' : 'active',
            endDate: input.contractEnd,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(contracts.organizationId, organizationId),
              eq(contracts.portfolioClientId, client.id),
            ),
          );
      }

      return { updated, cancelled, missing };
    },

    async clientIdsByExternalCode(organizationId) {
      const rows = await getDb()
        .select({ id: portfolioClients.id, externalCode: portfolioClients.externalCode })
        .from(portfolioClients)
        .where(eq(portfolioClients.organizationId, organizationId));
      const map = new Map<string, string>();
      for (const row of rows) {
        if (row.externalCode !== null) map.set(row.externalCode, row.id);
      }
      return map;
    },

    async metricIdsBySlug(organizationId) {
      const rows = await getDb()
        .select({ id: metricDefinitions.id, slug: metricDefinitions.slug })
        .from(metricDefinitions)
        .where(eq(metricDefinitions.organizationId, organizationId));
      return new Map(rows.map((row) => [row.slug, row.id]));
    },

    async upsertMetricValues(organizationId, values, sourceReference, source) {
      if (values.length === 0) return 0;
      const db = getDb();
      let written = 0;
      for (let i = 0; i < values.length; i += CHUNK) {
        const chunk = values.slice(i, i + CHUNK).map((value) => ({
          organizationId,
          portfolioClientId: value.portfolioClientId,
          metricDefinitionId: value.metricDefinitionId,
          periodStart: value.periodStart,
          periodEnd: value.periodEnd,
          rawValueNumeric: value.value,
          answered: value.answered === undefined ? null : String(value.answered),
          source,
          sourceReference,
        }));
        await db
          .insert(metricValues)
          .values(chunk)
          // Chave natural (cliente, métrica, início do período): reimportar corrige o valor.
          .onConflictDoUpdate({
            target: [
              metricValues.portfolioClientId,
              metricValues.metricDefinitionId,
              metricValues.periodStart,
            ],
            set: {
              rawValueNumeric: sql`excluded.raw_value_numeric`,
              answered: sql`excluded.answered`,
              periodEnd: sql`excluded.period_end`,
              source: sql`excluded.source`,
              sourceReference: sql`excluded.source_reference`,
              recordedAt: new Date(),
            },
          });
        written += chunk.length;
      }
      return written;
    },
  };
}
