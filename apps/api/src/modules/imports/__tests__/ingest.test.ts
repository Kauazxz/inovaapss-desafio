/**
 * As regras que não podem se perder na conversão de linha para valor de métrica.
 *
 * As duas primeiras vêm de docs/DEFINICOES_METRICAS.md §15 e §16 e decidem se o motor vê
 * "desempenho perfeito" ou "não se aplica" quando não havia o que medir. Um zero no lugar de um
 * nulo aqui vira um cliente saudável que na verdade ninguém acompanhou.
 */
import { describe, expect, it } from 'vitest';

import { DATASET_KEYS } from '@inovaapss/importer';
import type { MonthlyMetricsRow, NpsRow } from '@inovaapss/importer';
import { IMPORT_DATASET_KEYS, IMPORT_DATASET_LABELS } from '@inovaapss/shared';

import {
  cancellationEndDate,
  missedMeetings,
  monthBounds,
  monthlyMetricValues,
  npsMetricValues,
  rate,
  toMetricValueInputs,
} from '../ingest.js';

const monthly = (patch: Partial<MonthlyMetricsRow> = {}): MonthlyMetricsRow =>
  ({
    external_code: 'C001',
    period: '2026-07',
    open_tickets: 10,
    critical_tickets: 1,
    reopened_tickets: 2,
    tickets_within_sla: 9,
    sla_compliance_pct: 90,
    avg_resolution_hours: 5,
    formal_complaints: 0,
    platform_usage_pct: 80,
    payment_delay_days: 0,
    meetings_planned: 2,
    meetings_completed: 1,
    ...patch,
  }) as MonthlyMetricsRow;

const nps = (patch: Partial<NpsRow> = {}): NpsRow =>
  ({
    external_code: 'C001',
    period: '2026-07',
    answered: true,
    score: 9,
    classification: 'promoter',
    ...patch,
  }) as NpsRow;

const find = (values: ReturnType<typeof monthlyMetricValues>, slug: string) =>
  values.find((value) => value.metricSlug === slug);

describe('rate', () => {
  it('divide e devolve percentual com quatro casas', () => {
    expect(rate(2, 10)).toBe(20);
    expect(rate(1, 3)).toBe(33.3333);
  });

  it('divisor zero vira null, nunca 0 % (§15)', () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(5, 0)).toBeNull();
  });

  it('numerador ou divisor nulo vira null', () => {
    expect(rate(null, 10)).toBeNull();
    expect(rate(3, null)).toBeNull();
  });
});

describe('reuniões (§15)', () => {
  it('nenhuma reunião prevista → percentual de perdidas NULO, não 0 %', () => {
    const values = monthlyMetricValues([monthly({ meetings_planned: 0, meetings_completed: 0 })]);
    expect(find(values, 'missed_meetings')?.value).toBeNull();
  });

  it('duas previstas e uma realizada → 50 %', () => {
    const values = monthlyMetricValues([monthly({ meetings_planned: 2, meetings_completed: 1 })]);
    expect(find(values, 'missed_meetings')?.value).toBe(50);
  });

  it('todas as previstas realizadas → 0 % de verdade (aqui zero é informação)', () => {
    const values = monthlyMetricValues([monthly({ meetings_planned: 3, meetings_completed: 3 })]);
    expect(find(values, 'missed_meetings')?.value).toBe(0);
  });

  it('número ausente dos dois lados → null', () => {
    expect(missedMeetings(monthly({ meetings_planned: null }))).toBeNull();
    expect(missedMeetings(monthly({ meetings_completed: null }))).toBeNull();
  });
});

describe('NPS (§16)', () => {
  it('não respondeu → valor NULO com answered=false, nunca nota zero', () => {
    const [value] = npsMetricValues([nps({ answered: false, score: null })]);
    expect(value?.value).toBeNull();
    expect(value?.answered).toBe(false);
  });

  it('respondeu nota zero → valor zero de verdade, com answered=true', () => {
    const [value] = npsMetricValues([nps({ answered: true, score: 0 })]);
    expect(value?.value).toBe(0);
    expect(value?.answered).toBe(true);
  });

  it('não respondeu com nota preenchida por engano → a nota é descartada', () => {
    const [value] = npsMetricValues([nps({ answered: false, score: 10 })]);
    expect(value?.value).toBeNull();
  });
});

describe('monthlyMetricValues', () => {
  it('métrica em branco chega como null (ausência não é saúde)', () => {
    const values = monthlyMetricValues([monthly({ sla_compliance_pct: null })]);
    expect(find(values, 'sla_compliance')?.value).toBeNull();
  });

  it('taxa de reabertura sai de reabertos ÷ abertos', () => {
    const values = monthlyMetricValues([monthly({ reopened_tickets: 2, open_tickets: 8 })]);
    expect(find(values, 'reopened_tickets')?.value).toBe(25);
  });

  it('sem nenhum chamado no mês, a taxa de reabertura é null', () => {
    const values = monthlyMetricValues([monthly({ reopened_tickets: 0, open_tickets: 0 })]);
    expect(find(values, 'reopened_tickets')?.value).toBeNull();
  });

  it('gera nove valores por linha mensal', () => {
    expect(monthlyMetricValues([monthly()])).toHaveLength(9);
  });
});

describe('toMetricValueInputs', () => {
  it('junta atendimento mensal e NPS na mesma lista', () => {
    const values = toMetricValueInputs([monthly()], [nps()]);
    expect(values).toHaveLength(10);
    expect(values.at(-1)?.metricSlug).toBe('nps_dissatisfaction');
  });
});

describe('monthBounds e cancelamento', () => {
  it('recorta o mês inteiro, inclusive fevereiro bissexto', () => {
    expect(monthBounds('2026-07')).toEqual({ start: '2026-07-01', end: '2026-07-31' });
    expect(monthBounds('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
  });

  it('cancelado encerra no último dia do mês da saída', () => {
    expect(
      cancellationEndDate({
        external_code: 'C001',
        status: 'cancelled',
        cancellation_period: '2026-03',
      } as never),
    ).toBe('2026-03-31');
  });

  it('ativo não tem data de fim', () => {
    expect(
      cancellationEndDate({
        external_code: 'C001',
        status: 'active',
        cancellation_period: null,
      } as never),
    ).toBeNull();
    expect(cancellationEndDate(undefined)).toBeNull();
  });
});

describe('vocabulário compartilhado', () => {
  it('IMPORT_DATASET_KEYS do shared continua igual ao DATASET_KEYS do importador', () => {
    // O shared não pode importar o importador (o importador depende dele), então a lista é
    // espelhada lá. Este teste é a trava: acrescentou dataset num lado, acrescente no outro.
    expect([...IMPORT_DATASET_KEYS]).toEqual([...DATASET_KEYS]);
  });

  it('todo dataset tem rótulo em português para a tela de mapeamento', () => {
    for (const key of IMPORT_DATASET_KEYS) {
      expect(IMPORT_DATASET_LABELS[key]).toBeTruthy();
    }
  });
});
