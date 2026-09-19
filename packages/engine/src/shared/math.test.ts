import { describe, expect, it } from 'vitest';

import {
  detectOutliers,
  interpolate,
  isFiniteNumber,
  linearSlope,
  mean,
  median,
  minutesBetween,
  round,
  sumWeights,
  toHealth,
} from './math.js';

describe('math helpers', () => {
  it('isFiniteNumber rejeita NaN, Infinity, null e texto', () => {
    expect(isFiniteNumber(1)).toBe(true);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber(null)).toBe(false);
    expect(isFiniteNumber('1')).toBe(false);
  });

  it('round arredonda a 2 casas por padrão', () => {
    expect(round(1.005)).toBe(1.01);
    expect(round(2.34567, 3)).toBe(2.346);
  });

  it('toHealth limita a 0–100 e passa null adiante', () => {
    expect(toHealth(150)).toBe(100);
    expect(toHealth(-5)).toBe(0);
    expect(toHealth(72.456)).toBe(72.46);
    expect(toHealth(null)).toBeNull();
    expect(toHealth(Number.NaN)).toBeNull();
  });

  it('interpolate é linear e satura nos extremos', () => {
    expect(interpolate(50, 0, 0, 100, 100)).toBe(50);
    expect(interpolate(150, 0, 0, 100, 100)).toBe(100);
    expect(interpolate(-10, 0, 0, 100, 100)).toBe(0);
    expect(interpolate(25, 0, 100, 100, 0)).toBe(75);
    expect(interpolate(5, 10, 100, 10, 0)).toBe(100);
    expect(interpolate(15, 10, 100, 10, 0)).toBe(0);
  });

  it('mean e median devolvem null para lista vazia', () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('detectOutliers marca o valor destoante mesmo com MAD zero', () => {
    expect(detectOutliers([10, 10, 11, 10, 100])).toEqual([false, false, false, false, true]);
    expect(detectOutliers([10, 10])).toEqual([false, false]);
    expect(detectOutliers([5, 5, 5, 5])).toEqual([false, false, false, false]);
    expect(detectOutliers([1, 2, 3, 4, 5])).toEqual([false, false, false, false, false]);
  });

  it('linearSlope é a inclinação por período', () => {
    expect(linearSlope([1, 2, 3])).toBe(1);
    expect(linearSlope([90, 70, 50])).toBe(-20);
    expect(linearSlope([3, 3])).toBe(0);
    expect(linearSlope([5])).toBeNull();
    expect(linearSlope([10, 12])).toBe(2);
  });

  it('sumWeights ignora pesos inválidos ou negativos', () => {
    expect(sumWeights([0.5, -1, Number.NaN, 0.25])).toBe(0.75);
  });

  it('minutesBetween calcula em minutos e recusa datas inválidas', () => {
    expect(minutesBetween('2026-09-19T10:00:00Z', '2026-09-19T11:00:00Z')).toBe(60);
    expect(minutesBetween('data', '2026-09-19T11:00:00Z')).toBeNull();
  });
});
