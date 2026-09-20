/**
 * Leitura dos snapshots para o dashboard (§39, §62).
 *
 * Só consulta: quem calcula é o módulo scoring. Toda query filtra por organization_id.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { clientScoreSnapshots, contracts, plans, portfolioClients } from '../../db/schema/index.js';

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
}

export interface DashboardRepository {
  listClients(organizationId: string): Promise<ClientRow[]>;
  /** Todos os snapshots da organização, do mais antigo ao mais recente. */
  listSnapshots(organizationId: string, clientIds: string[]): Promise<SnapshotRow[]>;
}

export function createDashboardRepository(getDb: () => Database): DashboardRepository {
  return {
    async listClients(organizationId) {
      return getDb()
        .select({
          id: portfolioClients.id,
          name: portfolioClients.name,
          externalCode: portfolioClients.externalCode,
          segment: portfolioClients.segment,
          size: portfolioClients.size,
          status: portfolioClients.status,
          monthlyValue: contracts.monthlyValue,
          currency: contracts.currency,
          planName: plans.name,
        })
        .from(portfolioClients)
        .leftJoin(contracts, eq(contracts.portfolioClientId, portfolioClients.id))
        .leftJoin(plans, eq(plans.id, contracts.planId))
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
  };
}
