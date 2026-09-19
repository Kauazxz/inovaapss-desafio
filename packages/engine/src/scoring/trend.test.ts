import { describe, expect, it } from 'vitest';

import { computeTrend, type TrendInput } from './trend.js';
import { EngineConfigError } from '../shared/errors.js';

import type { TrendMethod } from './types.js';

const better = (series: (number | null)[], currentHealth: number | null = 50): TrendInput => ({
  series,
  direction: 'HIGHER_IS_BETTER',
  currentHealth,
});
const worse = (series: (number | null)[], currentHealth: number | null = 50): TrendInput => ({
  series,
  direction: 'HIGHER_IS_WORSE',
  currentHealth,
});

describe('tendência (§10)', () => {
  it('histórico insuficiente → null com motivo', () => {
    expect(computeTrend(better([50])).health).toBeNull();
    expect(computeTrend(better([null, 50])).reason).toMatch(/insuficiente/);
    expect(computeTrend(better([])).periodsUsed).toBe(0);
  });

  it('sem current_health não há âncora → null', () => {
    const result = computeTrend(better([80, 70, 60], null));
    expect(result.health).toBeNull();
    expect(result.reason).toMatch(/ancorável/);
  });

  it('DELTA_PERCENT (padrão): queda de 25 % tira 25 pontos do health atual', () => {
    const result = computeTrend(better([80, 70, 60], 60));
    expect(result.method).toBe('DELTA_PERCENT');
    expect(result.window).toBe(3);
    expect(result.periodsUsed).toBe(3);
    expect(result.change).toBe(-20);
    expect(result.changePercent).toBe(-25);
    expect(result.improvement).toBe(-0.25);
    expect(result.health).toBe(35);
    expect(result.slope).toBe(-10);
    expect(result.movingAverage).toBe(70);
  });

  it('estável → trend_health igual ao current_health', () => {
    expect(computeTrend(better([50, 50, 50], 90)).health).toBe(90);
    expect(computeTrend(better([50, 50, 50], 20)).health).toBe(20);
  });

  it('HIGHER_IS_WORSE inverte a leitura da mesma série', () => {
    const rising = [10, 15, 20];
    expect(computeTrend(better(rising, 50)).health).toBe(100); // subir é bom → melhora
    expect(computeTrend(worse(rising, 50)).health).toBe(0); // subir 100 % é ruim → −100 pontos
    const falling = [20, 15, 10];
    expect(computeTrend(worse(falling, 50)).health).toBe(100);
    expect(computeTrend(better(falling, 50)).health).toBe(0);
    expect(computeTrend(worse(rising, 50)).improvement).toBe(-1);
  });

  it('melhora é limitada a 100', () => {
    expect(computeTrend(better([50, 60, 70], 95)).health).toBe(100);
  });

  it('respeita a janela e ignora períodos sem dado', () => {
    const result = computeTrend(better([10, 20, 80, null, 60], 60), { window: 3 });
    expect(result.periodsUsed).toBe(2);
    expect(result.firstValue).toBe(80);
    expect(result.lastValue).toBe(60);
    const wide = computeTrend(better([10, 20, 80, null, 60], 60), { window: 5 });
    expect(wide.firstValue).toBe(10);
  });

  it('DELTA_ABSOLUTE exige escala sobre valores brutos', () => {
    expect(() => computeTrend(better([90, 80, 70], 70), { method: 'DELTA_ABSOLUTE' })).toThrow(
      EngineConfigError,
    );
    const result = computeTrend(better([90, 80, 70], 70), {
      method: 'DELTA_ABSOLUTE',
      fullDeteriorationChange: 20,
    });
    expect(result.change).toBe(-20);
    expect(result.changePercent).toBeCloseTo(-22.22, 1);
    expect(result.health).toBe(0);
    const half = computeTrend(better([90, 80, 70], 70), {
      method: 'DELTA_ABSOLUTE',
      fullDeteriorationChange: 40,
    });
    expect(half.health).toBe(20);
  });

  it('MOVING_AVERAGE compara o atual com a média da janela', () => {
    const result = computeTrend(worse([60, 60, 90], 40), { method: 'MOVING_AVERAGE' });
    expect(result.movingAverage).toBe(70);
    expect(result.change).toBe(20);
    expect(result.changePercent).toBeCloseTo(28.57, 1);
    expect(result.health).toBeCloseTo(11.43, 1);
  });

  it('SLOPE sobre o health (regressão linear) usa 50 pontos/período como escala padrão', () => {
    const result = computeTrend(
      {
        series: [1, 2, 3],
        healthSeries: [90, 70, 50],
        direction: 'HIGHER_IS_BETTER',
        currentHealth: 50,
      },
      { method: 'SLOPE', basis: 'HEALTH' },
    );
    expect(result.basis).toBe('HEALTH');
    expect(result.slope).toBe(-20);
    expect(result.health).toBe(10);
  });

  it('SLOPE sobre valores brutos exige escala', () => {
    expect(() => computeTrend(better([1, 2, 3]), { method: 'SLOPE' })).toThrow(EngineConfigError);
    expect(
      computeTrend(worse([1, 2, 3], 80), { method: 'SLOPE', fullDeteriorationChange: 4 }).health,
    ).toBe(55);
  });

  it('BASELINE_COMPARISON usa os períodos anteriores à janela', () => {
    const result = computeTrend(better([100, 100, 100, 100, 80, 70, 60], 60), {
      method: 'BASELINE_COMPARISON',
    });
    expect(result.baseline).toBe(100);
    expect(result.change).toBe(-40);
    expect(result.changePercent).toBe(-40);
    expect(result.health).toBe(20);
  });

  it('BASELINE_COMPARISON sem baseline → null; com baseline externo → usa', () => {
    const none = computeTrend(better([80, 70, 60], 60), { method: 'BASELINE_COMPARISON' });
    expect(none.health).toBeNull();
    expect(none.reason).toMatch(/Sem baseline/);
    expect(none.firstValue).toBe(80);
    const external = computeTrend(
      { ...better([80, 70, 60], 60), baseline: 120 },
      { method: 'BASELINE_COMPARISON' },
    );
    expect(external.baseline).toBe(120);
    expect(external.health).toBe(10);
    const limited = computeTrend(better([200, 100, 100, 80, 70, 60], 60), {
      method: 'BASELINE_COMPARISON',
      baselineWindow: 2,
    });
    expect(limited.baseline).toBe(100);
  });

  it('TARGET_RANGE sobre valores brutos mede a distância até a meta', () => {
    const result = computeTrend(
      { series: [50, 60, 70], direction: 'TARGET_RANGE', currentHealth: 60 },
      { target: 50 },
    );
    expect(result.basis).toBe('RAW');
    expect(result.improvement).toBe(-0.4);
    expect(result.health).toBe(20);
    const closer = computeTrend(
      { series: [70, 60, 50], direction: 'TARGET_RANGE', currentHealth: 60 },
      { target: 50 },
    );
    expect(closer.health).toBe(100);
    const absolute = computeTrend(
      { series: [50, 60, 70], direction: 'TARGET_RANGE', currentHealth: 60 },
      { target: 50, method: 'DELTA_ABSOLUTE', fullDeteriorationChange: 40 },
    );
    expect(absolute.health).toBe(10);
  });

  it('TARGET_RANGE sem alvo e CUSTOM caem para a base HEALTH', () => {
    const custom = computeTrend({
      series: [1, 2, 3],
      healthSeries: [80, 70, 60],
      direction: 'CUSTOM',
      currentHealth: 60,
    });
    expect(custom.basis).toBe('HEALTH');
    expect(custom.health).toBe(35);
    const target = computeTrend({
      series: [1, 2, 3],
      healthSeries: [80, 70, 60],
      direction: 'TARGET_RANGE',
      currentHealth: 60,
    });
    expect(target.basis).toBe('HEALTH');
    const noHealth = computeTrend({ series: [1, 2, 3], direction: 'CUSTOM', currentHealth: 60 });
    expect(noHealth.health).toBeNull();
  });

  it('referência zero: mudança relativa indefinida, decidida pelo sentido', () => {
    const up = computeTrend(worse([0, 0, 5], 50));
    expect(up.changePercent).toBeNull();
    expect(up.health).toBe(0);
    expect(up.reason).toMatch(/Referência zero/);
    expect(computeTrend(better([0, 0, 5], 50)).health).toBe(100);
    expect(computeTrend(worse([0, 0, 0], 50)).health).toBe(50);
  });

  it('recusa configuração inválida', () => {
    expect(() => computeTrend(better([1, 2]), { window: 1 })).toThrow(EngineConfigError);
    expect(() => computeTrend(better([1, 2]), { fullDeteriorationChange: -1 })).toThrow(
      EngineConfigError,
    );
    expect(() => computeTrend(better([1, 2]), { method: 'MAGIC' as TrendMethod })).toThrow(
      EngineConfigError,
    );
  });
});
