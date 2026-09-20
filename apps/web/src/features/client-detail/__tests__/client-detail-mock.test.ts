import { describe, expect, it } from 'vitest';

import {
  buildMockClientEvidence,
  buildMockClientHistory,
  buildMockClientOverview,
  buildMockClientRecommendations,
  buildMockClientScores,
  MOCK_METRIC_PRESET,
  MOCK_NPS_QUARTERS,
} from '@/lib/mock/client-detail';
import { buildRankingRow, MOCK_CLIENTS, MOCK_PERIODS } from '@/lib/mock/dashboard';

describe('mock da visão do cliente — coerência com o dashboard', () => {
  it('o preset tem as 10 métricas de §71 com pesos que somam 100 %', () => {
    expect(MOCK_METRIC_PRESET).toHaveLength(10);
    const total = MOCK_METRIC_PRESET.reduce((sum, metric) => sum + metric.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('cabeçalho, risco, prioridade e confiança são os mesmos da linha do ranking', () => {
    for (const client of MOCK_CLIENTS) {
      const overview = buildMockClientOverview(client.id);
      const row = buildRankingRow(client);
      expect(overview).not.toBeNull();
      expect(overview!.client.name).toBe(client.name);
      expect(overview!.mrr).toBe(client.mrr);
      expect(overview!.plan?.name).toBe(client.plan);
      expect(overview!.score?.overallHealth).toBe(row.healthCurrent);
      expect(overview!.score?.healthClass).toBe(row.currentClass);
      expect(overview!.score?.riskScore).toBe(row.riskScore);
      expect(overview!.score?.priorityScore).toBe(row.priorityScore);
      expect(overview!.score?.priorityClass).toBe(row.priorityClass);
      expect(overview!.score?.analysisConfidence).toBe(row.confidence);
      expect(overview!.healthHistory).toHaveLength(MOCK_PERIODS.length);
    }
  });

  it('a média ponderada dos 10 scores bate com o health geral (±1,5) e há 6 períodos', () => {
    for (const client of MOCK_CLIENTS) {
      const scores = buildMockClientScores(client.id)!;
      expect(scores.items).toHaveLength(10);
      const available = scores.items.filter((item) => item.metricHealth !== null);
      const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
      const overall = available.reduce(
        (sum, item) => sum + (item.metricHealth ?? 0) * (item.weight / totalWeight),
        0,
      );
      const expected = client.history[client.history.length - 1]!;
      expect(Math.abs(overall - expected)).toBeLessThanOrEqual(1.5);
      for (const item of scores.items) {
        const length =
          item.metricKey === 'nps_dissatisfaction' ? MOCK_NPS_QUARTERS.length : MOCK_PERIODS.length;
        expect(item.series).toHaveLength(length);
      }
    }
  });

  it('a principal evidência é a mesma topEvidence do dashboard e a 1ª recomendação é a ação sugerida', () => {
    for (const id of [
      'mock-alfa',
      'mock-beta',
      'mock-gama',
      'mock-vertice',
      'mock-litoral',
      'mock-serra',
      'mock-mangue',
    ]) {
      const client = MOCK_CLIENTS.find((item) => item.id === id)!;
      const evidence = buildMockClientEvidence(id)!;
      const overview = buildMockClientOverview(id)!;
      const top = client.evidences[0]!;
      const expected = top.endsWith('.') ? top : `${top}.`;
      expect(evidence.items[0]!.humanExplanation).toBe(expected);
      expect(overview.topDrivers[0]!.humanExplanation).toBe(expected);
      // Ordenada por contribuição decrescente, com posição 1..n.
      evidence.items.forEach((item, index) => {
        expect(item.rank).toBe(index + 1);
        if (index > 0)
          expect(item.contribution).toBeLessThanOrEqual(evidence.items[index - 1]!.contribution);
      });
      const recommendations = buildMockClientRecommendations(id)!;
      expect(recommendations.items[0]!.title).toBe(client.suggestedAction);
      expect(recommendations.items[0]!.status).toBe('PENDING');
    }
  });

  it('toda evidência do dashboard aparece na métrica que ela descreve, em todos os clientes', () => {
    const patterns: [RegExp, string][] = [
      [/crítico/i, 'critical_tickets'],
      [/tempo de resolução/i, 'resolution_vs_sla'],
      [/\buso\b/i, 'platform_usage'],
      [/\bsla\b/i, 'sla_compliance'],
      [/reabert/i, 'reopened_tickets'],
      [/reclama/i, 'formal_complaints'],
      [/abertos/i, 'open_tickets'],
      [/pagamento/i, 'payment_delay'],
      [/reuni/i, 'missed_meetings'],
      [/\bnps\b/i, 'nps_dissatisfaction'],
    ];
    for (const client of MOCK_CLIENTS) {
      const scores = buildMockClientScores(client.id)!;
      for (const text of client.evidences) {
        const key = patterns.find(([pattern]) => pattern.test(text))?.[1];
        if (!key) continue;
        const score = scores.items.find((item) => item.metricKey === key)!;
        if (score.metricHealth === null) continue;
        expect(score.explanation.summary.startsWith(text.replace(/[.]$/, ''))).toBe(true);
      }
    }
  });

  it('NPS sem resposta é N/A com o motivo "não respondeu", nunca zero (§22)', () => {
    const scores = buildMockClientScores('mock-mangue')!;
    const nps = scores.items.find((item) => item.metricKey === 'nps_dissatisfaction')!;
    expect(nps.metricHealth).toBeNull();
    expect(nps.naReason).toBe('não respondeu');
    for (const point of nps.series) {
      expect(point.value).toBeNull();
      expect(point.health).toBeNull();
      expect(point.naReason).toBe('não respondeu');
      expect(point.extra?.['answered']).toBe(false);
    }
    // Quem respondeu tem nota 0–10 e classificação.
    const alfa = buildMockClientScores('mock-alfa')!.items.find(
      (item) => item.metricKey === 'nps_dissatisfaction',
    )!;
    const last = alfa.series[alfa.series.length - 1]!;
    expect(last.value).not.toBeNull();
    expect(last.value!).toBeGreaterThanOrEqual(0);
    expect(last.value!).toBeLessThanOrEqual(10);
    expect(['Promotor', 'Neutro', 'Detrator']).toContain(last.extra?.['classification']);
  });

  it('reuniões previstas = 0 é N/A e a métrica sai do cálculo (§21)', () => {
    const scores = buildMockClientScores('mock-gama')!;
    const meetings = scores.items.find((item) => item.metricKey === 'missed_meetings')!;
    expect(meetings.metricHealth).toBeNull();
    expect(meetings.naReason).toBe('sem reunião prevista no período');
    expect(meetings.normalizedWeight).toBe(0);
    for (const point of meetings.series) {
      expect(point.value).toBeNull();
      expect(point.extra?.['planned']).toBe(0);
    }
    const overview = buildMockClientOverview('mock-gama')!;
    expect(overview.score?.metricsAvailable).toBe(9);
    expect(overview.score?.metricsTotal).toBe(10);
  });

  it('a timeline tem eventos do mais recente ao mais antigo, com mudança de classe e importações', () => {
    const history = buildMockClientHistory('mock-alfa')!;
    expect(history.health).toHaveLength(MOCK_PERIODS.length);
    expect(history.events.length).toBeGreaterThan(5);
    history.events.forEach((event, index) => {
      if (index > 0) {
        expect(Date.parse(event.occurredAt)).toBeLessThanOrEqual(
          Date.parse(history.events[index - 1]!.occurredAt),
        );
      }
    });
    const types = new Set(history.events.map((event) => event.type));
    expect(types.has('CLASS_CHANGE')).toBe(true);
    expect(types.has('IMPORT')).toBe(true);
    expect(types.has('MODEL_VERSION')).toBe(true);
    const change = history.events.find((event) => event.type === 'CLASS_CHANGE')!;
    expect(change.fromClass).not.toBeNull();
    expect(change.toClass).not.toBeNull();
    expect(change.title).toMatch(/^Passou de /);

    const cancelled = buildMockClientHistory('mock-mare')!;
    expect(cancelled.events.some((event) => event.type === 'CANCELLATION')).toBe(true);
  });

  it('cliente inexistente devolve null (404 na API)', () => {
    expect(buildMockClientOverview('nao-existe')).toBeNull();
    expect(buildMockClientScores('nao-existe')).toBeNull();
    expect(buildMockClientEvidence('nao-existe')).toBeNull();
    expect(buildMockClientRecommendations('nao-existe')).toBeNull();
    expect(buildMockClientHistory('nao-existe')).toBeNull();
  });

  it('é determinístico: duas chamadas devolvem o mesmo resultado', () => {
    expect(buildMockClientScores('mock-beta')).toEqual(buildMockClientScores('mock-beta'));
    expect(buildMockClientHistory('mock-beta')).toEqual(buildMockClientHistory('mock-beta'));
  });
});
