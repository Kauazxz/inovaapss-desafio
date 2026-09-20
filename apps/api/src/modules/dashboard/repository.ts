/**
 * Leitura dos snapshots para o dashboard (§39, §62).
 *
 * Só consulta: quem calcula é o módulo scoring. Toda query filtra por organization_id.
 */
import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';

import {
  clientScoreSnapshots,
  metricDefinitions,
  metricScoreSnapshots,
  plans,
  portfolioClients,
} from '../../db/schema/index.js';
import { currentContractSubquery } from '../../shared/current-contract.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo do Drizzle varia com o schema
type Database = any;

export interface SnapshotRow {
  portfolioClientId: string;
  periodEnd: string;
  overallHealth: number | null;
  riskScore: number | null;
  analysisConfidence: number | null;
  commercialImpactScore: number | null;
  priorityScore: number | null;
  priorityFloor: number | null;
  healthClass: string | null;
  priorityClass: string | null;
  evidenceJson: unknown;
}

export interface ClientRow {
  id: string;
  name: string;
  externalCode: string | null;
  segment: string | null;
  size: string | null;
  status: string;
  monthlyValue: string | null;
  currency: string | null;
  planName: string | null;
  /** Status do contrato devolvido: só `active` é receita recorrente de hoje. */
  contractStatus: string | null;
  /** Último dia do contrato encerrado (mês da saída); `null` enquanto vigente. */
  contractEndDate: string | null;
}

/** Saúde de uma métrica de um cliente num período, com a categoria para agrupar por dimensão. */
export interface MetricHealthRow {
  portfolioClientId: string;
  periodEnd: string;
  category: string | null;
  metricHealth: number | null;
}

export interface DashboardRepository {
  listClients(organizationId: string): Promise<ClientRow[]>;
  /** Todos os snapshots da organização, do mais antigo ao mais recente. */
  listSnapshots(organizationId: string, clientIds: string[]): Promise<SnapshotRow[]>;
  /** Saúde por métrica, com a categoria, para a visão por dimensão da aba Geral. */
  listMetricHealth(organizationId: string): Promise<MetricHealthRow[]>;
}

export function createDashboardRepository(getDb: () => Database): DashboardRepository {
  return {
    async listClients(organizationId) {
      // Um contrato por cliente: sem isso quem tem histórico de contratos vira N linhas e é
      // contado — e tem o MRR somado — N vezes nos KPIs, na distribuição e no ranking.
      const contract = currentContractSubquery(getDb(), organizationId);
      return getDb()
        .select({
          id: portfolioClients.id,
          name: portfolioClients.name,
          externalCode: portfolioClients.externalCode,
          segment: portfolioClients.segment,
          size: portfolioClients.size,
          status: portfolioClients.status,
          monthlyValue: contract.monthlyValue,
          currency: contract.currency,
          planName: plans.name,
          contractStatus: contract.status,
          contractEndDate: contract.endDate,
        })
        .from(portfolioClients)
        .leftJoin(contract, eq(contract.portfolioClientId, portfolioClients.id))
        .leftJoin(plans, eq(plans.id, contract.planId))
        .where(eq(portfolioClients.organizationId, organizationId))
        .orderBy(asc(portfolioClients.name));
    },

    async listSnapshots(organizationId, clientIds) {
      if (clientIds.length === 0) return [];
      return getDb()
        .select({
          portfolioClientId: clientScoreSnapshots.portfolioClientId,
          periodEnd: clientScoreSnapshots.periodEnd,
          overallHealth: clientScoreSnapshots.overallHealth,
          riskScore: clientScoreSnapshots.riskScore,
          analysisConfidence: clientScoreSnapshots.analysisConfidence,
          commercialImpactScore: clientScoreSnapshots.commercialImpactScore,
          priorityScore: clientScoreSnapshots.priorityScore,
          priorityFloor: clientScoreSnapshots.priorityFloor,
          healthClass: clientScoreSnapshots.healthClass,
          priorityClass: clientScoreSnapshots.priorityClass,
          evidenceJson: clientScoreSnapshots.evidenceJson,
        })
        .from(clientScoreSnapshots)
        .where(
          and(
            eq(clientScoreSnapshots.organizationId, organizationId),
            inArray(clientScoreSnapshots.portfolioClientId, clientIds),
          ),
        )
        .orderBy(asc(clientScoreSnapshots.periodEnd), desc(clientScoreSnapshots.priorityScore));
    },

    async listMetricHealth(organizationId) {
      // A visão por dimensão é a média dos clientes ATIVOS no período mais recente deles
      // (§39). Filtrar no banco evita trazer o histórico inteiro só para descartar quase tudo.
      const [ultimo] = await getDb()
        .select({ periodEnd: max(metricScoreSnapshots.periodEnd) })
        .from(metricScoreSnapshots)
        .where(eq(metricScoreSnapshots.organizationId, organizationId));
      const periodEnd = ultimo?.periodEnd;
      if (!periodEnd) return [];

      return getDb()
        .select({
          portfolioClientId: metricScoreSnapshots.portfolioClientId,
          periodEnd: metricScoreSnapshots.periodEnd,
          category: metricDefinitions.category,
          metricHealth: metricScoreSnapshots.metricHealth,
        })
        .from(metricScoreSnapshots)
        .innerJoin(
          metricDefinitions,
          eq(metricDefinitions.id, metricScoreSnapshots.metricDefinitionId),
        )
        .innerJoin(
          portfolioClients,
          eq(portfolioClients.id, metricScoreSnapshots.portfolioClientId),
        )
        .where(
          and(
            eq(metricScoreSnapshots.organizationId, organizationId),
            eq(metricScoreSnapshots.periodEnd, periodEnd),
            eq(portfolioClients.status, 'active'),
          ),
        );
    },
  };
}
