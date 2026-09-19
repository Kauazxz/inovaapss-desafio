import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COMPONENT_WEIGHTS,
  DEFAULT_PRIORITY_WEIGHTS,
  classifyHealth,
  classifyPriority,
  riskFromHealth,
} from './scoring.js';

describe('classifyHealth (§7)', () => {
  it('usa as faixas padrão 80/60/40', () => {
    expect(classifyHealth(100)).toBe('NORMAL');
    expect(classifyHealth(80)).toBe('NORMAL');
    expect(classifyHealth(79)).toBe('ATTENTION');
    expect(classifyHealth(60)).toBe('ATTENTION');
    expect(classifyHealth(59)).toBe('RISK');
    expect(classifyHealth(40)).toBe('RISK');
    expect(classifyHealth(39)).toBe('CRITICAL');
    expect(classifyHealth(0)).toBe('CRITICAL');
  });

  it('limita valores fora da escala 0–100', () => {
    expect(classifyHealth(150)).toBe('NORMAL');
    expect(classifyHealth(-10)).toBe('CRITICAL');
    expect(classifyHealth(Number.NaN)).toBe('CRITICAL');
  });

  it('aceita faixas configuradas pela organização, em qualquer ordem', () => {
    const bands = [
      { class: 'CRITICAL', min: 0 },
      { class: 'NORMAL', min: 90 },
      { class: 'RISK', min: 50 },
      { class: 'ATTENTION', min: 70 },
    ] as const;
    expect(classifyHealth(89, bands)).toBe('ATTENTION');
    expect(classifyHealth(90, bands)).toBe('NORMAL');
    expect(classifyHealth(49, bands)).toBe('CRITICAL');
  });

  it('recusa lista de faixas vazia', () => {
    expect(() => classifyHealth(50, [])).toThrow();
  });
});

describe('classifyPriority (§28)', () => {
  it('usa as faixas padrão 85/70/50', () => {
    expect(classifyPriority(85)).toBe('P0');
    expect(classifyPriority(84)).toBe('P1');
    expect(classifyPriority(70)).toBe('P1');
    expect(classifyPriority(69)).toBe('P2');
    expect(classifyPriority(50)).toBe('P2');
    expect(classifyPriority(49)).toBe('P3');
  });
});

describe('constantes padrão', () => {
  it('pesos dos componentes somam 1 (§8)', () => {
    const { current, trend, persistence } = DEFAULT_COMPONENT_WEIGHTS;
    expect(current + trend + persistence).toBeCloseTo(1);
  });

  it('pesos da prioridade somam 1 (§28)', () => {
    expect(DEFAULT_PRIORITY_WEIGHTS.risk + DEFAULT_PRIORITY_WEIGHTS.impact).toBeCloseTo(1);
  });

  it('risco é o complemento da saúde (§26)', () => {
    expect(riskFromHealth(72)).toBe(28);
    expect(riskFromHealth(120)).toBe(0);
  });
});
