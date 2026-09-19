import { describe, expect, it } from 'vitest';

import {
  crossesDownTo,
  dashboardFiltersToSearchParams,
  healthClassSeverity,
  isEmptyDashboardFilters,
  isWorseHealthClass,
} from './index.js';

describe('classes do forecast (DATAVIZ.md §5.1)', () => {
  it('ordena a gravidade Normal < Atenção < Risco < Crítico', () => {
    expect(healthClassSeverity('NORMAL')).toBeLessThan(healthClassSeverity('ATTENTION'));
    expect(healthClassSeverity('ATTENTION')).toBeLessThan(healthClassSeverity('RISK'));
    expect(healthClassSeverity('RISK')).toBeLessThan(healthClassSeverity('CRITICAL'));
    expect(isWorseHealthClass('CRITICAL', 'RISK')).toBe(true);
    expect(isWorseHealthClass('RISK', 'RISK')).toBe(false);
    expect(isWorseHealthClass('NORMAL', 'RISK')).toBe(false);
  });

  it('só destaca quem cruza para Risco ou Crítico vindo de uma classe melhor', () => {
    expect(crossesDownTo('ATTENTION', 'RISK')).toBe(true);
    expect(crossesDownTo('NORMAL', 'CRITICAL')).toBe(true);
    expect(crossesDownTo('RISK', 'CRITICAL')).toBe(true);
    // Já está em Crítico e continua caindo: a posição conta a história, sem cor.
    expect(crossesDownTo('CRITICAL', 'CRITICAL')).toBe(false);
    // Melhora ou fica na mesma: cinza.
    expect(crossesDownTo('RISK', 'ATTENTION')).toBe(false);
    expect(crossesDownTo('NORMAL', 'ATTENTION')).toBe(false);
    // Sem projeção: nada a destacar.
    expect(crossesDownTo('ATTENTION', null)).toBe(false);
  });
});

describe('filtros do dashboard (§61)', () => {
  it('monta a query string com os nomes da spec', () => {
    const params = dashboardFiltersToSearchParams({
      healthClass: 'RISK',
      priorityClass: 'P1',
      plan: 'Enterprise',
      segment: '',
    });
    expect(params.toString()).toBe('health_class=RISK&priority_class=P1&plan=Enterprise');
  });

  it('reconhece filtros vazios', () => {
    expect(isEmptyDashboardFilters({})).toBe(true);
    expect(isEmptyDashboardFilters({ plan: '' })).toBe(true);
    expect(isEmptyDashboardFilters({ size: 'Grande' })).toBe(false);
  });
});
