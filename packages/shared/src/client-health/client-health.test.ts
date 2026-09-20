import { describe, expect, it } from 'vitest';

import {
  buildHealthSummaryLines,
  CLIENT_HEALTH_DIMENSION_LABELS,
  CLIENT_HEALTH_DIMENSIONS,
  MAX_SUMMARY_DRIVERS,
} from './index.js';

describe('resumo §58 (buildHealthSummaryLines)', () => {
  it('monta as linhas com score, classe e confiança, nunca só o número', () => {
    const lines = buildHealthSummaryLines(
      {
        overallHealth: 28,
        healthClass: 'CRITICAL',
        riskScore: 72,
        analysisConfidence: 94,
        priorityScore: 88,
        priorityClass: 'P0',
      },
      [
        { humanExplanation: 'Chamados críticos aumentaram 180 % em 3 meses.', isNegative: true },
        { humanExplanation: 'Cumprimento de SLA caiu 21 p.p.', isNegative: true },
        { humanExplanation: 'Atraso de pagamento está estável em 0 dias.', isNegative: false },
        { humanExplanation: 'Uso está 24 % abaixo do baseline.', isNegative: true },
        { humanExplanation: 'Duas reuniões previstas não ocorreram.', isNegative: true },
        { humanExplanation: 'Taxa de reabertura dobrou.', isNegative: true },
      ],
    );
    expect(lines.health).toBe('Health: 28/100 — Crítico');
    expect(lines.risk).toBe('Risk: 72/100');
    expect(lines.priority).toBe('Prioridade: 88/100 — P0 — Imediata');
    expect(lines.confidence).toBe('Confiança: 94 %');
    // Só drivers negativos, no máximo 4, numerados.
    expect(lines.drivers).toHaveLength(MAX_SUMMARY_DRIVERS);
    expect(lines.drivers[0]).toBe('1. Chamados críticos aumentaram 180 % em 3 meses.');
    expect(lines.drivers[2]).toBe('3. Uso está 24 % abaixo do baseline.');
    expect(lines.drivers.join(' ')).not.toContain('Atraso de pagamento');
  });

  it('diz que não há cálculo em vez de inventar zero', () => {
    const lines = buildHealthSummaryLines(null, []);
    expect(lines.health).toBe('Health: sem cálculo ainda');
    expect(lines.confidence).toBe('Confiança: 0 %');
    expect(lines.drivers).toEqual([]);
  });

  it('arredonda e aceita classe ausente', () => {
    const lines = buildHealthSummaryLines(
      {
        overallHealth: 47.6,
        healthClass: null,
        riskScore: 52.4,
        analysisConfidence: 90.4,
        priorityScore: null,
        priorityClass: null,
      },
      [],
    );
    expect(lines.health).toBe('Health: 48/100');
    expect(lines.risk).toBe('Risk: 52/100');
    expect(lines.priority).toBe('Prioridade: sem cálculo');
    expect(lines.confidence).toBe('Confiança: 90 %');
  });
});

describe('dimensões da visão do cliente (§40)', () => {
  it('tem as seis abas de série temporal, com rótulo em português', () => {
    expect(CLIENT_HEALTH_DIMENSIONS).toEqual([
      'support',
      'sla',
      'usage',
      'nps',
      'financial',
      'meetings',
    ]);
    for (const dimension of CLIENT_HEALTH_DIMENSIONS) {
      expect(CLIENT_HEALTH_DIMENSION_LABELS[dimension]).toBeTruthy();
    }
  });
});
