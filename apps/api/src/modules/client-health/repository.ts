/**
 * Leitura da visão individual do cliente (§40): cadastro, contrato, snapshots e séries.
 * Só consulta; quem calcula é o módulo scoring. Toda query filtra por organization_id.
 */
import { and, asc, eq } from 'drizzle-orm';

import {
  clientScoreSnapshots,
  metricDefinitions,
  metricScoreSnapshots,
  metricValues,
  plans,
  portfolioClients,
} from '../../db/schema/index.js';
import { currentContractSubquery } from '../../shared/current-contract.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo do Drizzle varia com o schema
type Database = any;

export interface ClientRecord {
  id: string;
  name: string;
  externalCode: string | null;
  segment: string | null;
  size: string | null;
  status: string;
  strategicImportance: number;
  contractId: string | null;
  monthlyValue: string | null;
  currency: string | null;
  startDate: string | null;
  endDate: string | null;
  contractStatus: string | null;
  contractedSlaHours: number | null;
  planId: string | null;
  planName: string | null;
}

export interface ClientSnapshot {
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

export interface MetricSnapshot {
  metricDefinitionId: string;
  slug: string;
  name: string;
  category: string | null;
  unit: string | null;
  direction: string;
  metricType: string;
  periodEnd: string;
  currentHealth: number | null;
  trendHealth: number | null;
  persistenceHealth: number | null;
  metricHealth: number | null;
  confidence: number | null;
  explanationJson: unknown;
}

export interface MetricValueRow {
  metricDefinitionId: string;
  periodEnd: string;
  value: number | null;
  answered: string | null;
}

export interface ClientHealthRepository {
  findClient(organizationId: string, clientId: string): Promise<ClientRecord | null>;
  listClientSnapshots(organizationId: string, clientId: string): Promise<ClientSnapshot[]>;
  listMetricSnapshots(organizationId: string, clientId: string): Promise<MetricSnapshot[]>;
  listMetricValues(organizationId: string, clientId: string): Promise<MetricValueRow[]>;
  /** Média da carteira por período, para a linha de comparação. */
  portfolioAverages(
    organizationId: string,
  ): Promise<{ periodEnd: string; health: number | null }[]>;
}

export function createClientHealthRepository(getDb: () => Database): ClientHealthRepository {
  return {
    async findClient(organizationId, clientId) {
      // Um contrato por cliente: com o histórico inteiro a mesma consulta devolveria N linhas e
      // o `[row]` pegaria uma qualquer delas — o contrato mostrado no cabeçalho viraria loteria.
      const contract = currentContractSubquery(getDb(), organizationId);
      const [row] = await getDb()
        .select({
          id: portfolioClients.id,
          name: portfolioClients.name,
          externalCode: portfolioClients.externalCode,
          segment: portfolioClients.segment,
          size: portfolioClients.size,
          status: portfolioClients.status,
          strategicImportance: portfolioClients.strategicImportance,
          contractId: contract.contractId,
          monthlyValue: contract.monthlyValue,
          currency: contract.currency,
          startDate: contract.startDate,
          endDate: contract.endDate,
          contractStatus: contract.status,
          contractedSlaHours: contract.contractedSlaHours,
          planId: plans.id,
          planName: plans.name,
        })
        .from(portfolioClients)
        .leftJoin(contract, eq(contract.portfolioClientId, portfolioClients.id))
        .leftJoin(plans, eq(plans.id, contract.planId))
        .where(
          and(
            eq(portfolioClients.organizationId, organizationId),
            eq(portfolioClients.id, clientId),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async listClientSnapshots(organizationId, clientId) {
      return getDb()
        .select({
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
            eq(clientScoreSnapshots.portfolioClientId, clientId),
          ),
        )
        .orderBy(asc(clientScoreSnapshots.periodEnd));
    },

    async listMetricSnapshots(organizationId, clientId) {
      return getDb()
        .select({
          metricDefinitionId: metricScoreSnapshots.metricDefinitionId,
          slug: metricDefinitions.slug,
          name: metricDefinitions.name,
          category: metricDefinitions.category,
          unit: metricDefinitions.unit,
          direction: metricDefinitions.direction,
          metricType: metricDefinitions.metricType,
          periodEnd: metricScoreSnapshots.periodEnd,
          currentHealth: metricScoreSnapshots.currentHealth,
          trendHealth: metricScoreSnapshots.trendHealth,
          persistenceHealth: metricScoreSnapshots.persistenceHealth,
          metricHealth: metricScoreSnapshots.metricHealth,
          confidence: metricScoreSnapshots.confidence,
          explanationJson: metricScoreSnapshots.explanationJson,
        })
        .from(metricScoreSnapshots)
        .innerJoin(
          metricDefinitions,
          eq(metricDefinitions.id, metricScoreSnapshots.metricDefinitionId),
        )
        .where(
          and(
            eq(metricScoreSnapshots.organizationId, organizationId),
            eq(metricScoreSnapshots.portfolioClientId, clientId),
          ),
        )
        .orderBy(asc(metricScoreSnapshots.periodEnd));
    },

    async listMetricValues(organizationId, clientId) {
      return getDb()
        .select({
          metricDefinitionId: metricValues.metricDefinitionId,
          periodEnd: metricValues.periodEnd,
          value: metricValues.rawValueNumeric,
          answered: metricValues.answered,
        })
        .from(metricValues)
        .where(
          and(
            eq(metricValues.organizationId, organizationId),
            eq(metricValues.portfolioClientId, clientId),
          ),
        )
        .orderBy(asc(metricValues.periodEnd));
    },

    async portfolioAverages(organizationId) {
      return getDb()
        .select({
          periodEnd: clientScoreSnapshots.periodEnd,
          health: clientScoreSnapshots.overallHealth,
        })
        .from(clientScoreSnapshots)
        .where(eq(clientScoreSnapshots.organizationId, organizationId))
        .orderBy(asc(clientScoreSnapshots.periodEnd));
    },
  };
}
