/**
 * A tradução de linha importada para métrica (§11, §15 e §16 de docs/DEFINICOES_METRICAS.md).
 * São as regras que decidem se um número vira score ou vira "não se aplica" — e é justamente
 * onde um engano silencioso estragaria a saúde do cliente sem ninguém notar.
 */
import { describe, expect, it } from 'vitest';

import type { MonthlyMetricsRow, NpsRow } from '@inovaapss/importer';

import {
  monthBounds,
  monthlyMetricValues,
  MONTHLY_METRIC_SLUGS,
  npsMetricValue,
  rate,
} from '../metric-mapping.js';

const monthlyRow = (overrides: Partial<MonthlyMetricsRow> = {}): MonthlyMetricsRow => ({
  external_code: 'C001',
  period: '2025-03',
  open_tickets: 10,
  critical_tickets: 2,
  reopened_tickets: 1,
  tickets_within_sla: 9,
  sla_compliance_pct: 90,
  avg_resolution_hours: 12,
  formal_complaints: 0,
  platform_usage_pct: 75,
  payment_delay_days: 0,
  meetings_planned: 4,
  meetings_completed: 3,
  ...overrides,
});

const npsRow = (overrides: Partial<NpsRow> = {}): NpsRow => ({
  external_code: 'C001',
  period: '2025-03',
  answered: true,
  score: 9,
  classification: 'promoter',
  ...overrides,
});

describe('rate', () => {
  it('calcula a taxa percentual', () => {
    expect(rate(1, 10)).toBe(10);
    expect(rate(3, 8)).toBe(37.5);
  });

  it('trata divisor zero como "não se aplica", nunca como 0 % (§15)', () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(5, 0)).toBeNull();
  });

  it('propaga o desconhecido: sem numerador ou sem divisor, não há taxa', () => {
    expect(rate(null, 10)).toBeNull();
    expect(rate(1, null)).toBeNull();
  });
});

describe('monthBounds', () => {
  it('devolve o primeiro e o último dia do mês', () => {
    expect(monthBounds('2025-01')).toEqual({ start: '2025-01-01', end: '2025-01-31' });
    expect(monthBounds('2025-04')).toEqual({ start: '2025-04-01', end: '2025-04-30' });
  });

  it('acerta fevereiro em ano bissexto', () => {
    expect(monthBounds('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(monthBounds('2025-02')).toEqual({ start: '2025-02-01', end: '2025-02-28' });
  });

  it('recusa período inválido em vez de inventar uma data', () => {
    expect(() => monthBounds('2025-13')).toThrow(/Período inválido/);
    expect(() => monthBounds('ontem')).toThrow(/Período inválido/);
  });
});

describe('monthlyMetricValues', () => {
  it('devolve um valor por métrica do preset, sempre na mesma ordem', () => {
    const values = monthlyMetricValues(monthlyRow());
    expect(values.map((value) => value.metricSlug)).toEqual(MONTHLY_METRIC_SLUGS);
  });

  it('leva os valores diretos como estão', () => {
    const values = monthlyMetricValues(monthlyRow());
    const bySlug = new Map(values.map((value) => [value.metricSlug, value.value]));
    expect(bySlug.get('open_tickets')).toBe(10);
    expect(bySlug.get('critical_tickets')).toBe(2);
    expect(bySlug.get('sla_compliance')).toBe(90);
    expect(bySlug.get('resolution_vs_sla')).toBe(12);
    expect(bySlug.get('platform_usage')).toBe(75);
    expect(bySlug.get('payment_delay')).toBe(0);
  });

  it('converte reaberturas e reuniões perdidas em TAXA (§11)', () => {
    const values = monthlyMetricValues(monthlyRow());
    const bySlug = new Map(values.map((value) => [value.metricSlug, value.value]));
    // 1 reaberto de 10 abertos.
    expect(bySlug.get('reopened_tickets')).toBe(10);
    // 4 previstas, 3 realizadas → 1 perdida de 4.
    expect(bySlug.get('missed_meetings')).toBe(25);
  });

  it('sem reunião prevista, reuniões perdidas é nulo — não 0 % nem 100 % (§15)', () => {
    const values = monthlyMetricValues(monthlyRow({ meetings_planned: 0, meetings_completed: 0 }));
    const missed = values.find((value) => value.metricSlug === 'missed_meetings');
    expect(missed?.value).toBeNull();
  });

  it('sem chamado no mês, a taxa de reabertura é nula', () => {
    const values = monthlyMetricValues(monthlyRow({ open_tickets: 0, reopened_tickets: 0 }));
    const reopened = values.find((value) => value.metricSlug === 'reopened_tickets');
    expect(reopened?.value).toBeNull();
  });

  it('métrica não medida continua nula: ausência não é saúde (§66)', () => {
    const values = monthlyMetricValues(monthlyRow({ sla_compliance_pct: null }));
    const sla = values.find((value) => value.metricSlug === 'sla_compliance');
    expect(sla?.value).toBeNull();
    // E mesmo assim a métrica aparece na lista, para o motor saber que não foi medida.
    expect(values).toHaveLength(MONTHLY_METRIC_SLUGS.length);
  });
});

describe('npsMetricValue', () => {
  it('leva a nota de quem respondeu', () => {
    expect(npsMetricValue(npsRow())).toEqual({
      metricSlug: 'nps_dissatisfaction',
      value: 9,
      answered: true,
    });
  });

  it('quem não respondeu tem valor nulo e answered false — nunca nota zero (§16)', () => {
    const value = npsMetricValue(
      npsRow({ answered: false, score: null, classification: 'no_answer' }),
    );
    expect(value).toEqual({ metricSlug: 'nps_dissatisfaction', value: null, answered: false });
  });

  it('nota zero de quem respondeu é nota zero, não ausência', () => {
    const value = npsMetricValue(npsRow({ score: 0, classification: 'detractor' }));
    expect(value.value).toBe(0);
    expect(value.answered).toBe(true);
  });
});
