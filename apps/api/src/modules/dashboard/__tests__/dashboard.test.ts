/**
 * Regras de DADOS do dashboard, com um repositório em memória.
 *
 * O que está travado aqui são as perguntas que as duas abas precisam responder igual:
 * quanto é o MRR, quantos clientes estão ativos e como a carteira se distribui hoje. Cada teste
 * corresponde a uma divergência que a carteira da planilha do desafio expunha (80 clientes,
 * 58 ativos e 22 cancelados, R$ 982.964 contratados e R$ 707.998 recorrendo).
 */
import { describe, expect, it } from 'vitest';

import { createDashboardService } from '../service.js';

import type {
  ClientRow,
  DashboardRepository,
  MetricHealthRow,
  SnapshotRow,
} from '../repository.js';

const ORG = 'org-1';
const ULTIMO_PERIODO = '2026-06-30';
const PERIODO_ANTERIOR = '2026-05-31';

function client(over: Partial<ClientRow> & Pick<ClientRow, 'id'>): ClientRow {
  return {
    name: over.id,
    externalCode: over.id,
    segment: 'Logistica',
    size: 'Medio',
    status: 'active',
    monthlyValue: '1000.00',
    currency: 'BRL',
    planName: 'Essencial',
    contractStatus: 'active',
    contractEndDate: null,
    ...over,
  };
}

function snapshot(
  over: Partial<SnapshotRow> & Pick<SnapshotRow, 'portfolioClientId'>,
): SnapshotRow {
  return {
    periodEnd: ULTIMO_PERIODO,
    overallHealth: 90,
    riskScore: 10,
    analysisConfidence: 100,
    commercialImpactScore: 10,
    priorityScore: 20,
    priorityFloor: null,
    healthClass: 'NORMAL',
    priorityClass: 'P3',
    evidenceJson: { evidence: [] },
    ...over,
  };
}

function repository(
  clients: ClientRow[],
  snapshots: SnapshotRow[],
  metricHealth: MetricHealthRow[] = [],
): DashboardRepository {
  return {
    listClients: () => Promise.resolve(clients),
    listSnapshots: () =>
      Promise.resolve([...snapshots].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))),
    listMetricHealth: () => Promise.resolve(metricHealth),
  };
}

/**
 * Carteira mínima com a mesma forma da planilha: um ativo saudável, um ativo crítico e um
 * cancelado no último período — cujo último snapshot ficou parado em "crítico".
 */
function carteira() {
  const clients = [
    client({ id: 'ativo-normal', monthlyValue: '10000.00' }),
    client({ id: 'ativo-critico', monthlyValue: '5000.00' }),
    client({
      id: 'saiu-agora',
      status: 'cancelled',
      contractStatus: 'ended',
      contractEndDate: ULTIMO_PERIODO,
      monthlyValue: '7000.00',
    }),
  ];
  const snapshots = [
    snapshot({ portfolioClientId: 'ativo-normal', periodEnd: PERIODO_ANTERIOR }),
    snapshot({ portfolioClientId: 'ativo-normal' }),
    snapshot({
      portfolioClientId: 'ativo-critico',
      periodEnd: PERIODO_ANTERIOR,
      overallHealth: 30,
      healthClass: 'CRITICAL',
      priorityScore: 90,
      priorityClass: 'P0',
    }),
    snapshot({
      portfolioClientId: 'ativo-critico',
      overallHealth: 25,
      healthClass: 'CRITICAL',
      priorityScore: 92,
      priorityClass: 'P0',
    }),
    // O cancelado parou de ser medido no mês da saída.
    snapshot({
      portfolioClientId: 'saiu-agora',
      overallHealth: 20,
      healthClass: 'CRITICAL',
      priorityScore: 95,
      priorityClass: 'P0',
    }),
  ];
  return { clients, snapshots };
}

describe('aba Geral — o que entra em cada número', () => {
  it('MRR é receita recorrente: contrato encerrado não soma', async () => {
    const { clients, snapshots } = carteira();
    const service = createDashboardService(repository(clients, snapshots));

    const geral = await service.general(ORG);

    // 10.000 + 5.000 dos ativos. Os 7.000 de quem saiu não recorrem mais.
    expect(geral.kpis.mrr.value).toBe(15_000);
    expect(geral.kpis.mrr.delta).toBe(-7_000);
  });

  it('a distribuição é a foto de hoje: o snapshot parado do cancelado não entra', async () => {
    const { clients, snapshots } = carteira();
    const service = createDashboardService(repository(clients, snapshots));

    const geral = await service.general(ORG);
    const porClasse = Object.fromEntries(
      geral.distribution.map((item) => [item.healthClass, item.count]),
    );

    expect(porClasse).toEqual({ CRITICAL: 1, RISK: 0, ATTENTION: 0, NORMAL: 1 });
    expect(geral.distribution.reduce((total, item) => total + item.count, 0)).toBe(2);
    // O MRR por classe segue a mesma regra do KPI.
    expect(geral.distribution.find((item) => item.healthClass === 'CRITICAL')?.mrr).toBe(5_000);
  });

  it('ativos e cancelados variam com quem saiu no último período', async () => {
    const { clients, snapshots } = carteira();
    const service = createDashboardService(repository(clients, snapshots));

    const geral = await service.general(ORG);

    expect(geral.kpis.activeClients).toEqual({ value: 2, delta: -1 });
    expect(geral.kpis.cancelledClients).toEqual({ value: 1, delta: 1 });
  });
});

describe('aba Em risco — mesmo vocabulário da aba Geral', () => {
  it('"clientes ativos" dá o mesmo número nas duas abas', async () => {
    const { clients, snapshots } = carteira();
    const service = createDashboardService(repository(clients, snapshots));

    const [risco, geral] = await Promise.all([service.risk(ORG), service.general(ORG)]);

    expect(risco.kpis.activeClients.value).toBe(geral.kpis.activeClients.value);
    expect(risco.kpis.activeClients).toEqual({ value: 2, delta: -1 });
  });

  it('conta o ativo sem snapshot na carteira, mas não o coloca no ranking', async () => {
    const { clients, snapshots } = carteira();
    clients.push(client({ id: 'ativo-novo', monthlyValue: '2000.00' }));
    const service = createDashboardService(repository(clients, snapshots));

    const risco = await service.risk(ORG);

    expect(risco.kpis.activeClients.value).toBe(3);
    expect(risco.ranking.map((row) => row.clientId)).not.toContain('ativo-novo');
  });

  it('quem já cancelou não aparece no ranking nem no MRR em risco', async () => {
    const { clients, snapshots } = carteira();
    const service = createDashboardService(repository(clients, snapshots));

    const risco = await service.risk(ORG);

    expect(risco.ranking.map((row) => row.clientId)).toEqual(['ativo-critico']);
    expect(risco.kpis.mrrAtRisk.value).toBe(5_000);
  });
});
