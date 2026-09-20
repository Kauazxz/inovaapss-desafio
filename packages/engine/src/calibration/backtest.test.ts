/**
 * Backtest histórico com cancelamentos sintéticos — aqui a verdade é conhecida de antemão.
 *
 * O teste mais importante é o último: provar que alterar o futuro não muda o que o modelo teria
 * dito no passado (§27 e §59). Sem isso, qualquer número de acerto seria fantasia.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ALERT_RISK_THRESHOLD,
  daysBetween,
  resolveBacktestOptions,
  runBacktest,
} from './backtest.js';

import type { CalibrationClientSeries, CalibrationWeight } from './types.js';

const PESOS: CalibrationWeight[] = [
  { metricId: 'sla', metricName: 'Cumprimento de SLA', weight: 0.6 },
  { metricId: 'uso', metricName: 'Uso da plataforma', weight: 0.4 },
];

/** Meses de 2026-01-31 em diante, um por saúde informada. */
const MESES = [
  '2026-01-31',
  '2026-02-28',
  '2026-03-31',
  '2026-04-30',
  '2026-05-31',
  '2026-06-30',
  '2026-07-31',
  '2026-08-31',
];

/**
 * Série com a mesma saúde nas duas métricas — assim a saúde geral é exatamente o número passado,
 * e cada teste fala de risco em vez de falar de ponderação.
 */
function serie(
  clientId: string,
  healths: readonly (number | null)[],
  churnPeriodEnd: string | null = null,
  impacto = 50,
): CalibrationClientSeries {
  return {
    clientId,
    clientName: `Cliente ${clientId}`,
    churnPeriodEnd,
    periods: healths.map((health, index) => ({
      periodEnd: MESES[index] as string,
      metricHealth: { sla: health, uso: health },
      commercialImpactScore: impacto,
    })),
  };
}

describe('resolveBacktestOptions', () => {
  it('converte a janela em períodos: 30 dias = 1 mês, 60 = 2, 90 = 3', () => {
    expect(resolveBacktestOptions({ windowDays: 30 }).windowPeriods).toBe(1);
    expect(resolveBacktestOptions({ windowDays: 60 }).windowPeriods).toBe(2);
    expect(resolveBacktestOptions({ windowDays: 90 }).windowPeriods).toBe(3);
  });

  it('usa os padrões quando recebe lixo', () => {
    const resolved = resolveBacktestOptions({
      windowDays: Number.NaN,
      periodDays: -5,
      alertRiskThreshold: Number.POSITIVE_INFINITY,
      topN: [],
    });
    expect(resolved).toMatchObject({
      windowDays: 90,
      periodDays: 30,
      alertRiskThreshold: DEFAULT_ALERT_RISK_THRESHOLD,
      topN: [5, 10],
    });
  });

  it('limita o limiar de alerta à escala 0–100 e ordena os N', () => {
    expect(resolveBacktestOptions({ alertRiskThreshold: 180 }).alertRiskThreshold).toBe(100);
    expect(resolveBacktestOptions({ alertRiskThreshold: -4 }).alertRiskThreshold).toBe(0);
    expect(resolveBacktestOptions({ topN: [10, 3] }).topN).toEqual([3, 10]);
  });
});

describe('daysBetween', () => {
  it('conta dias de calendário entre dois fins de período', () => {
    expect(daysBetween('2026-03-31', '2026-06-30')).toBe(91);
    expect(daysBetween('2026-05-31', '2026-06-30')).toBe(30);
    expect(daysBetween('nem data', '2026-06-30')).toBeNull();
  });
});

describe('runBacktest', () => {
  it('pega o cancelamento anunciado e mede a antecedência do primeiro alerta', () => {
    // Saúde caindo: alerta (risco ≥ 41, saúde ≤ 59) a partir de março; saída em junho.
    const clientes = [serie('c1', [90, 75, 55, 40, 30], '2026-06-30')];
    const resultado = runBacktest({
      clients: clientes,
      weights: PESOS,
      options: { windowDays: 90 },
    });

    expect(resultado.churnsAnalyzed).toBe(1);
    expect(resultado.churnsCaught).toBe(1);
    expect(resultado.churnDetectionRate).toBe(1);
    expect(resultado.churnOutcomes[0]).toMatchObject({
      clientId: 'c1',
      caught: true,
      firstAlertPeriodEnd: '2026-03-31',
      leadPeriods: 3,
    });
    expect(resultado.leadTime).toMatchObject({ meanPeriods: 3, medianPeriods: 3, meanDays: 90 });
  });

  it('não avalia o período da saída nem o que vem depois dele', () => {
    const clientes = [serie('c1', [90, 75, 55, 40, 30], '2026-04-30')];
    const resultado = runBacktest({ clients: clientes, weights: PESOS });
    expect(resultado.rows.map((r) => r.periodEnd)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('conta alarme falso em quem alertou e ficou', () => {
    const clientes = [serie('saudavel', [95, 95, 95]), serie('ruidoso', [30, 30, 30])];
    const resultado = runBacktest({ clients: clientes, weights: PESOS });

    expect(resultado.truePositives).toBe(0);
    expect(resultado.falsePositives).toBe(3);
    expect(resultado.trueNegatives).toBe(3);
    expect(resultado.precision).toBe(0);
    expect(resultado.falsePositiveRate).toBe(0.5);
    expect(resultado.f1).toBeNull();
  });

  it('a janela muda o que conta como acerto', () => {
    // Um único alerta, três meses antes da saída.
    const clientes = [serie('c1', [95, 30, 95, 95], '2026-05-31')];
    const janela30 = runBacktest({
      clients: clientes,
      weights: PESOS,
      options: { windowDays: 30 },
    });
    const janela90 = runBacktest({
      clients: clientes,
      weights: PESOS,
      options: { windowDays: 90 },
    });

    expect(janela30.churnsCaught).toBe(0);
    expect(janela30.falsePositives).toBe(1);
    expect(janela90.churnsCaught).toBe(1);
    expect(janela90.truePositives).toBe(1);
  });

  it('sem cancelamento algum, devolve zero em vez de inventar acerto', () => {
    const resultado = runBacktest({
      clients: [serie('a', [90, 90]), serie('b', [88, 87])],
      weights: PESOS,
    });
    expect(resultado.churnsAnalyzed).toBe(0);
    expect(resultado.churnDetectionRate).toBeNull();
    expect(resultado.precision).toBeNull();
    expect(resultado.recall).toBeNull();
    expect(resultado.leadTime).toMatchObject({ meanPeriods: null, sampleSize: 0 });
  });

  it('cliente que cancelou no primeiro período não tem passado para avaliar', () => {
    const resultado = runBacktest({
      clients: [serie('c1', [40], '2026-01-31'), serie('c2', [90, 90])],
      weights: PESOS,
    });
    expect(resultado.clientsAnalyzed).toBe(1);
    expect(resultado.churnsAnalyzed).toBe(0);
  });

  it('ignora períodos sem nenhuma métrica avaliável', () => {
    const clientes = [serie('c1', [null, 90, null])];
    const resultado = runBacktest({ clients: clientes, weights: PESOS });
    expect(resultado.rows).toHaveLength(1);
    expect(resultado.rows[0]?.periodEnd).toBe('2026-02-28');
  });

  it('usa a saúde registrada na foto quando nenhum peso casa com as métricas', () => {
    const cliente: CalibrationClientSeries = {
      clientId: 'c1',
      clientName: 'C1',
      churnPeriodEnd: null,
      periods: [
        {
          periodEnd: '2026-01-31',
          metricHealth: {},
          commercialImpactScore: 40,
          recordedHealthScore: 35,
        },
      ],
    };
    const resultado = runBacktest({
      clients: [cliente],
      weights: [{ metricId: 'outra', metricName: 'Outra', weight: 0 }],
    });
    expect(resultado.rows[0]).toMatchObject({ healthScore: 35, riskScore: 65, alerted: true });
  });

  it('precision@N olha só o topo da fila e mostra o teto do período', () => {
    // Quatro clientes no mesmo mês; só um vai cancelar, e é o de pior saúde.
    const clientes = [
      serie('a', [20, 90], '2026-02-28'),
      serie('b', [40, 90]),
      serie('c', [60, 90]),
      serie('d', [80, 90]),
    ];
    const resultado = runBacktest({
      clients: clientes,
      weights: PESOS,
      options: { windowDays: 30, topN: [1, 2] },
    });
    const [top1, top2] = resultado.topN;
    // Dois períodos na grade, mas só o primeiro tem os quatro clientes (a saiu em fevereiro).
    expect(top1).toMatchObject({ n: 1, hits: 1 });
    expect(top1?.precision).toBeCloseTo((top1?.hits ?? 0) / (top1?.slots ?? 1), 5);
    expect(top2?.maxPrecision).not.toBeNull();
    expect(top2?.precision ?? 0).toBeLessThanOrEqual(top2?.maxPrecision ?? 0);
  });

  it('empate de prioridade é desempatado pelo id, então a fila não muda entre execuções', () => {
    const clientes = [serie('zz', [30, 30]), serie('aa', [30, 30])];
    const primeira = runBacktest({ clients: clientes, weights: PESOS, options: { topN: [1] } });
    const segunda = runBacktest({
      clients: [...clientes].reverse(),
      weights: PESOS,
      options: { topN: [1] },
    });
    expect(primeira.topN).toEqual(segunda.topN);
    expect(primeira.rows).toEqual(segunda.rows);
  });

  it('REGRA DE OURO: mudar os dados DEPOIS de t não muda o resultado em t', () => {
    const base = serie('c1', [90, 70, 50, 65, 60], '2026-06-30');
    const futuroCatastrofico: CalibrationClientSeries = {
      ...base,
      periods: base.periods.map((periodo, index) =>
        index >= 3
          ? { ...periodo, metricHealth: { sla: 0, uso: 0 }, commercialImpactScore: 99 }
          : periodo,
      ),
    };
    const ate = (resultado: ReturnType<typeof runBacktest>) =>
      resultado.rows.filter((row) => row.periodEnd <= '2026-03-31');

    expect(ate(runBacktest({ clients: [futuroCatastrofico], weights: PESOS }))).toEqual(
      ate(runBacktest({ clients: [base], weights: PESOS })),
    );
  });

  it('acrescentar períodos futuros não mexe no score já calculado em t', () => {
    const base = serie('c1', [90, 70, 50]);
    const comFuturo: CalibrationClientSeries = {
      ...base,
      periods: [
        ...base.periods,
        { periodEnd: '2026-04-30', metricHealth: { sla: 5, uso: 5 }, commercialImpactScore: 99 },
      ],
    };
    const ate = (resultado: ReturnType<typeof runBacktest>) =>
      resultado.rows.filter((row) => row.periodEnd <= '2026-03-31');

    expect(ate(runBacktest({ clients: [comFuturo], weights: PESOS }))).toEqual(
      ate(runBacktest({ clients: [base], weights: PESOS })),
    );
  });

  it('o status de cancelamento não entra no score: dois clientes idênticos têm o mesmo risco', () => {
    const ficou = serie('a', [60, 45, 30]);
    const saiu = { ...serie('b', [60, 45, 30], '2026-06-30'), clientId: 'b' };
    const resultado = runBacktest({ clients: [ficou, saiu], weights: PESOS });

    const riscoA = resultado.rows.filter((r) => r.clientId === 'a').map((r) => r.riskScore);
    const riscoB = resultado.rows.filter((r) => r.clientId === 'b').map((r) => r.riskScore);
    expect(riscoB).toEqual(riscoA);
  });

  it('sem impacto comercial, a prioridade cai para o risco puro e a fila continua de pé', () => {
    const cliente: CalibrationClientSeries = {
      clientId: 'c1',
      clientName: 'C1',
      churnPeriodEnd: null,
      periods: [
        {
          periodEnd: '2026-01-31',
          metricHealth: { sla: 30, uso: 30 },
          commercialImpactScore: null,
        },
      ],
    };
    const resultado = runBacktest({ clients: [cliente], weights: PESOS, options: { topN: [1] } });
    expect(resultado.rows[0]?.priorityScore).toBe(70);
    expect(resultado.topN[0]?.slots).toBe(1);
  });

  it('data de saída ilegível não vira rótulo: o cliente entra como quem ficou', () => {
    const cliente = { ...serie('c1', [30, 30]), churnPeriodEnd: 'sem data' };
    const resultado = runBacktest({ clients: [cliente], weights: PESOS });
    expect(resultado.rows.every((row) => row.periodsUntilChurn === null)).toBe(true);
    expect(resultado.churnsCaught).toBe(0);
  });

  it('é determinístico: mesma entrada, mesmo resultado', () => {
    const clientes = [serie('a', [90, 60, 30], '2026-05-31'), serie('b', [80, 80, 80])];
    expect(runBacktest({ clients: clientes, weights: PESOS })).toEqual(
      runBacktest({ clients: clientes, weights: PESOS }),
    );
  });
});
