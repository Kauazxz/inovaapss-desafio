import { describe, expect, it } from 'vitest';

import { computePersistence } from './persistence.js';
import { EngineConfigError } from '../shared/errors.js';

describe('persistência (§11)', () => {
  it('100 × (1 − não saudáveis / avaliados) na janela de 3', () => {
    const result = computePersistence([80, 50, 30]);
    expect(result.window).toBe(3);
    expect(result.evaluatedPeriods).toBe(3);
    expect(result.unhealthyPeriods).toBe(2);
    expect(result.health).toBeCloseTo(33.33, 1);
    expect(result.currentUnhealthyStreak).toBe(2);
  });

  it('tudo saudável → 100; tudo não saudável → 0', () => {
    expect(computePersistence([90, 85, 80]).health).toBe(100);
    expect(computePersistence([30, 20, 10]).health).toBe(0);
    expect(computePersistence([30, 20, 10]).currentUnhealthyStreak).toBe(3);
  });

  it('período sem health não conta como avaliado', () => {
    const result = computePersistence([null, 50, 80]);
    expect(result.evaluatedPeriods).toBe(2);
    expect(result.health).toBe(50);
    expect(result.currentUnhealthyStreak).toBe(0);
  });

  it('a sequência atual para no primeiro período saudável ou sem dado', () => {
    expect(computePersistence([30, null, 30]).currentUnhealthyStreak).toBe(1);
    expect(computePersistence([30, 70, 30]).currentUnhealthyStreak).toBe(1);
  });

  it('histórico insuficiente → null com motivo', () => {
    expect(computePersistence([50]).health).toBeNull();
    expect(computePersistence([50]).reason).toMatch(/insuficiente/);
    expect(computePersistence([]).health).toBeNull();
    expect(computePersistence([50], { minEvaluatedPeriods: 1 }).health).toBe(0);
  });

  it('usa só os últimos N períodos', () => {
    expect(computePersistence([10, 10, 90, 90, 90]).health).toBe(100);
    expect(computePersistence([10, 10, 90, 90, 90], { window: 5 }).health).toBe(60);
  });

  it('limite de "não saudável" é configurável', () => {
    expect(computePersistence([50, 50, 50]).health).toBe(0);
    expect(computePersistence([50, 50, 50], { unhealthyBelow: 40 }).health).toBe(100);
  });

  it('recusa configuração inválida', () => {
    expect(() => computePersistence([1, 2], { window: 0 })).toThrow(EngineConfigError);
    expect(() => computePersistence([1, 2], { unhealthyBelow: 120 })).toThrow(EngineConfigError);
  });
});
