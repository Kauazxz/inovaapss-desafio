/**
 * Alertas (§27, §36): a fila de "olhe isto agora" e o resumo que vira e-mail.
 *
 * Cada alerta traz o cliente, o que disparou, quanto está em jogo e a ação sugerida — a mesma
 * do playbook da métrica (§30). Reconhecer e resolver são ações de quem opera a carteira.
 */
import { and, desc, eq } from 'drizzle-orm';

import {
  type AlertDigest,
  type AlertDto,
  type AlertSeverity,
  type AlertsResponse,
  type AlertStatus,
  type HealthClass,
  type PriorityClass,
} from '@inovaapss/shared';

import {
  alerts,
  contracts,
  metricDefinitions,
  organizations,
  portfolioClients,
} from '../../db/schema/index.js';
import { GLOBALSYS_V1_METRICS } from '../../db/seed/presets/globalsys-v1.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo do Drizzle varia com o schema
type Database = any;

const PLAYBOOK_BY_SLUG = new Map(GLOBALSYS_V1_METRICS.map((m) => [m.slug as string, m.playbook]));
const ORDEM_SEVERIDADE: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

interface Metadata {
  healthScore?: number | null;
  healthClass?: string | null;
  priorityScore?: number | null;
  priorityClass?: string | null;
  topEvidence?: string | null;
}

function readMetadata(json: unknown): Metadata {
  return json !== null && typeof json === 'object' ? (json as Metadata) : {};
}

export interface AlertsService {
  list(organizationId: string, status?: AlertStatus): Promise<AlertsResponse>;
  updateStatus(
    organizationId: string,
    alertId: string,
    status: AlertStatus,
  ): Promise<AlertDto | null>;
  /** Resumo dos alertas abertos, pronto para o e-mail. */
  digest(organizationId: string, baseUrl: string): Promise<AlertDigest>;
}

export function createAlertsService(getDb: () => Database): AlertsService {
  async function carregar(organizationId: string, status?: AlertStatus): Promise<AlertDto[]> {
    const condicoes = [eq(alerts.organizationId, organizationId)];
    if (status) condicoes.push(eq(alerts.status, status));

    const rows = await getDb()
      .select({
        id: alerts.id,
        triggerId: alerts.triggerId,
        severity: alerts.severity,
        status: alerts.status,
        title: alerts.title,
        description: alerts.description,
        priorityFloor: alerts.priorityFloor,
        periodEnd: alerts.periodEnd,
        metadataJson: alerts.metadataJson,
        triggeredAt: alerts.triggeredAt,
        resolvedAt: alerts.resolvedAt,
        clientId: portfolioClients.id,
        clientName: portfolioClients.name,
        clientExternalCode: portfolioClients.externalCode,
        clientStatus: portfolioClients.status,
        monthlyValue: contracts.monthlyValue,
        currency: contracts.currency,
        metricId: metricDefinitions.id,
        metricName: metricDefinitions.name,
        metricSlug: metricDefinitions.slug,
      })
      .from(alerts)
      .innerJoin(portfolioClients, eq(portfolioClients.id, alerts.portfolioClientId))
      .leftJoin(contracts, eq(contracts.portfolioClientId, portfolioClients.id))
      .leftJoin(metricDefinitions, eq(metricDefinitions.id, alerts.metricDefinitionId))
      .where(and(...condicoes))
      .orderBy(desc(alerts.periodEnd), desc(alerts.triggeredAt));

    return (
      rows
        // Cliente que já cancelou não é fila de ação (mesma regra da aba "Em risco").
        .filter((row: { clientStatus: string }) => row.clientStatus === 'active')
        .map((row: Record<string, unknown>): AlertDto => {
          const meta = readMetadata(row.metadataJson);
          const slug = row.metricSlug as string | null;
          return {
            id: row.id as string,
            triggerId: row.triggerId as string,
            severity: row.severity as AlertSeverity,
            status: row.status as AlertStatus,
            title: row.title as string,
            description: row.description as string,
            clientId: row.clientId as string,
            clientName: row.clientName as string,
            clientExternalCode: (row.clientExternalCode as string | null) ?? null,
            mrr: Number(row.monthlyValue ?? 0),
            currency: (row.currency as string | null) ?? 'BRL',
            metricId: (row.metricId as string | null) ?? null,
            metricName: (row.metricName as string | null) ?? null,
            healthScore: meta.healthScore ?? null,
            healthClass: (meta.healthClass as HealthClass | null) ?? null,
            priorityScore: meta.priorityScore ?? null,
            priorityClass: (meta.priorityClass as PriorityClass | null) ?? null,
            priorityFloor: (row.priorityFloor as number | null) ?? null,
            suggestedAction: slug ? (PLAYBOOK_BY_SLUG.get(slug) ?? null) : null,
            periodEnd: row.periodEnd as string,
            triggeredAt: String(row.triggeredAt),
            resolvedAt: row.resolvedAt ? String(row.resolvedAt) : null,
          };
        })
        .sort(
          (a: AlertDto, b: AlertDto) =>
            (ORDEM_SEVERIDADE[a.severity] ?? 9) - (ORDEM_SEVERIDADE[b.severity] ?? 9) ||
            (b.priorityScore ?? 0) - (a.priorityScore ?? 0),
        )
    );
  }

  return {
    async list(organizationId, status) {
      const items = await carregar(organizationId, status);
      const abertos = items.filter((a) => a.status === 'open');
      const openBySeverity: Record<AlertSeverity, number> = { INFO: 0, WARNING: 0, CRITICAL: 0 };
      const clientesComAlerta = new Map<string, number>();
      for (const alerta of abertos) {
        openBySeverity[alerta.severity] += 1;
        clientesComAlerta.set(alerta.clientId, alerta.mrr);
      }
      return {
        items,
        openBySeverity,
        mrrAtRisk: Math.round([...clientesComAlerta.values()].reduce((t, v) => t + v, 0)),
        currency: items[0]?.currency ?? 'BRL',
        generatedAt: items[0]?.periodEnd ?? '',
      };
    },

    async updateStatus(organizationId, alertId, status) {
      await getDb()
        .update(alerts)
        .set({ status, resolvedAt: status === 'resolved' ? new Date() : null })
        .where(and(eq(alerts.organizationId, organizationId), eq(alerts.id, alertId)));
      const todos = await carregar(organizationId);
      return todos.find((a) => a.id === alertId) ?? null;
    },

    async digest(organizationId, baseUrl) {
      const [organizacao] = await getDb()
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      const abertos = (await carregar(organizationId, 'open')).filter((a) => a.status === 'open');
      const porCliente = new Map<string, AlertDto>();
      for (const alerta of abertos) {
        const atual = porCliente.get(alerta.clientId);
        if (!atual || (alerta.priorityScore ?? 0) > (atual.priorityScore ?? 0)) {
          porCliente.set(alerta.clientId, alerta);
        }
      }
      const destaques = [...porCliente.values()].sort(
        (a, b) =>
          (ORDEM_SEVERIDADE[a.severity] ?? 9) - (ORDEM_SEVERIDADE[b.severity] ?? 9) ||
          (b.priorityScore ?? 0) - (a.priorityScore ?? 0),
      );

      return {
        organizationName: organizacao?.name ?? 'sua organização',
        periodEnd: abertos[0]?.periodEnd ?? '',
        totalOpen: abertos.length,
        criticalCount: abertos.filter((a) => a.severity === 'CRITICAL').length,
        mrrAtRisk: Math.round([...porCliente.values()].reduce((t, a) => t + a.mrr, 0)),
        currency: abertos[0]?.currency ?? 'BRL',
        highlights: destaques.slice(0, 8).map((a) => ({
          clientName: a.clientName,
          healthScore: a.healthScore,
          healthClass: a.healthClass,
          priorityClass: a.priorityClass,
          mrr: a.mrr,
          reason: a.description,
          action: a.suggestedAction,
          clientUrl: `${baseUrl}/clients/${a.clientId}`,
        })),
        dashboardUrl: `${baseUrl}/dashboard`,
      };
    },
  };
}
