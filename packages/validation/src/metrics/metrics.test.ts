import { describe, expect, it } from 'vitest';

import {
  formulaConfigSchema,
  normalizationConfigSchema,
  safeRuleSchema,
  thresholdConfigSchema,
  triggerListSchema,
} from './config.js';
import {
  createMetricDefinitionSchema,
  listMetricDefinitionsQuerySchema,
  metricSlugSchema,
} from './definition.js';
import { metricModelItemInputSchema, previewScoreSchema } from './model.js';
import { modelWeightSchema, proposeRebalancedWeights, validateVersionWeights } from './weights.js';

const DEF_A = '11111111-1111-4111-8111-111111111111';
const DEF_B = '22222222-2222-4222-8222-222222222222';
const DEF_C = '33333333-3333-4333-8333-333333333333';

describe('normalizationConfigSchema (§9)', () => {
  it('aceita cada estratégia com os campos do motor', () => {
    expect(
      normalizationConfigSchema.parse({
        strategy: 'THRESHOLD_BANDS',
        bands: [
          { upTo: 0, health: 100 },
          { upTo: 3, health: 30 },
          { upTo: null, health: 0 },
        ],
      }).strategy,
    ).toBe('THRESHOLD_BANDS');
    expect(
      normalizationConfigSchema.parse({ strategy: 'LINEAR_RANGE', min: 0, max: 100 }).strategy,
    ).toBe('LINEAR_RANGE');
    expect(
      normalizationConfigSchema.parse({ strategy: 'RATIO_TO_TARGET', target: 10 }).strategy,
    ).toBe('RATIO_TO_TARGET');
    expect(
      normalizationConfigSchema.parse({ strategy: 'BASELINE_DEVIATION', window: 6 }).strategy,
    ).toBe('BASELINE_DEVIATION');
    expect(normalizationConfigSchema.parse({ strategy: 'BOOLEAN_MAP' }).strategy).toBe(
      'BOOLEAN_MAP',
    );
    expect(
      normalizationConfigSchema.parse({ strategy: 'SCORE_MAP', map: { promotor: 100 } }).strategy,
    ).toBe('SCORE_MAP');
  });

  it('recusa faixas fora de ordem e sem a última aberta', () => {
    const semUltima = normalizationConfigSchema.safeParse({
      strategy: 'THRESHOLD_BANDS',
      bands: [{ upTo: 10, health: 100 }],
    });
    expect(semUltima.success).toBe(false);
    const foraDeOrdem = normalizationConfigSchema.safeParse({
      strategy: 'THRESHOLD_BANDS',
      bands: [
        { upTo: 10, health: 100 },
        { upTo: 5, health: 50 },
        { upTo: null, health: 0 },
      ],
    });
    expect(foraDeOrdem.success).toBe(false);
  });

  it('recusa LINEAR_RANGE com min ≥ max e meta zero em RATIO_TO_TARGET', () => {
    expect(
      normalizationConfigSchema.safeParse({ strategy: 'LINEAR_RANGE', min: 10, max: 10 }).success,
    ).toBe(false);
    expect(
      normalizationConfigSchema.safeParse({ strategy: 'RATIO_TO_TARGET', target: 0 }).success,
    ).toBe(false);
  });

  it('valida a regra segura com isSafeRule do motor (nunca eval)', () => {
    const ok = normalizationConfigSchema.safeParse({
      strategy: 'CUSTOM_SAFE_RULE',
      rule: { if: [{ '<=': [{ var: 'value' }, { '*': [{ var: 'baseline' }, 1.2] }] }, 100, 40] },
    });
    expect(ok.success).toBe(true);

    const metodo = normalizationConfigSchema.safeParse({
      strategy: 'CUSTOM_SAFE_RULE',
      rule: { method: [{ var: 'value' }, 'constructor'] },
    });
    expect(metodo.success).toBe(false);

    expect(safeRuleSchema.safeParse({ var: 'constructor.prototype' }).success).toBe(false);
  });

  it('exige "then" quando a regra devolve um valor', () => {
    expect(
      normalizationConfigSchema.safeParse({
        strategy: 'CUSTOM_SAFE_RULE',
        output: 'value',
        rule: { '-': [{ var: 'value' }, { var: 'previous' }] },
      }).success,
    ).toBe(false);
    expect(
      normalizationConfigSchema.safeParse({
        strategy: 'CUSTOM_SAFE_RULE',
        output: 'value',
        rule: { '-': [{ var: 'value' }, { var: 'previous' }] },
        then: { strategy: 'LINEAR_RANGE', min: 0, max: 40 },
      }).success,
    ).toBe(true);
  });
});

describe('thresholdConfigSchema, triggerListSchema e formulaConfigSchema', () => {
  it('aceita trend/persistence e recusa janela de tendência < 2', () => {
    expect(
      thresholdConfigSchema.parse({
        trend: { window: 3, method: 'DELTA_PERCENT' },
        persistence: { window: 3, unhealthyBelow: 60 },
      }),
    ).toEqual({
      trend: { window: 3, method: 'DELTA_PERCENT' },
      persistence: { window: 3, unhealthyBelow: 60 },
    });
    expect(thresholdConfigSchema.safeParse({ trend: { window: 1 } }).success).toBe(false);
  });

  it('aceita os três tipos de gatilho e exige ids únicos', () => {
    const list = triggerListSchema.parse([
      {
        id: 'sla-120',
        name: 'Ticket crítico acima de 120 % do SLA',
        kind: 'THRESHOLD',
        field: 'extra.worst_ticket_contract_consumption',
        operator: '>',
        threshold: 120,
        priorityFloor: 85,
      },
      {
        id: 'streak',
        name: '3 tickets críticos reincidentes',
        kind: 'STREAK',
        operator: '>=',
        threshold: 1,
        consecutivePeriods: 3,
      },
      {
        id: 'contrato',
        name: 'Condição contratual',
        kind: 'JSON_LOGIC',
        rule: { '>': [{ var: 'extra.payment_delay_days' }, { var: 'params.max_delay' }] },
      },
    ]);
    expect(list).toHaveLength(3);

    expect(
      triggerListSchema.safeParse([
        { id: 'a', name: 'A', kind: 'THRESHOLD', field: 'value', operator: '>', threshold: 1 },
        { id: 'a', name: 'B', kind: 'THRESHOLD', field: 'value', operator: '<', threshold: 1 },
      ]).success,
    ).toBe(false);

    expect(
      triggerListSchema.safeParse([
        { id: 'x', name: 'X', kind: 'THRESHOLD', field: 'valor', operator: '>', threshold: 1 },
      ]).success,
    ).toBe(false);
  });

  it('recusa fórmula com operador proibido', () => {
    expect(
      formulaConfigSchema.safeParse({ rule: { method: [{ var: 'value' }, 'toString'] } }).success,
    ).toBe(false);
    expect(
      formulaConfigSchema.parse({
        explanationTemplate: '{extra.missed} reuniões previstas não ocorreram',
        params: { max_delay: 30 },
      }),
    ).toMatchObject({ params: { max_delay: 30 } });
  });
});

describe('pesos (§12, §41)', () => {
  it('aceita 0–1 com até 4 casas e recusa o resto', () => {
    expect(modelWeightSchema.safeParse(0.18).success).toBe(true);
    expect(modelWeightSchema.safeParse(0.1234).success).toBe(true);
    expect(modelWeightSchema.safeParse(0.12345).success).toBe(false);
    expect(modelWeightSchema.safeParse(1.5).success).toBe(false);
    expect(modelWeightSchema.safeParse(-0.1).success).toBe(false);
  });

  it('validateVersionWeights exige 1,0000 ± 0,0001 entre as ativas', () => {
    const ok = validateVersionWeights([
      { metricDefinitionId: DEF_A, weight: 0.5, isActive: true },
      { metricDefinitionId: DEF_B, weight: 0.5, isActive: true },
      { metricDefinitionId: DEF_C, weight: 0.3, isActive: false },
    ]);
    expect(ok.ok).toBe(true);
    expect(ok.total).toBe(1);
    expect(ok.activeCount).toBe(2);

    const faltam = validateVersionWeights([
      { metricDefinitionId: DEF_A, weight: 0.5, isActive: true },
      { metricDefinitionId: DEF_B, weight: 0.47, isActive: true },
    ]);
    expect(faltam.ok).toBe(false);
    expect(faltam.difference).toBe(-0.03);
    expect(faltam.message).toBe('Total: 97 % — faltam 3 %.');

    const tolerancia = validateVersionWeights([
      { metricDefinitionId: DEF_A, weight: 0.3333, isActive: true },
      { metricDefinitionId: DEF_B, weight: 0.3333, isActive: true },
      { metricDefinitionId: DEF_C, weight: 0.3333, isActive: true },
    ]);
    expect(tolerancia.ok).toBe(true);

    expect(validateVersionWeights([]).ok).toBe(false);
  });

  it('proposeRebalancedWeights devolve uma proposta proporcional que soma 1 e não altera a entrada', () => {
    const items = [
      { metricDefinitionId: DEF_A, weight: 0.2, isActive: true },
      { metricDefinitionId: DEF_B, weight: 0.2, isActive: true },
      { metricDefinitionId: DEF_C, weight: 0.4, isActive: false },
    ];
    const proposal = proposeRebalancedWeights(items);
    expect(proposal.saved).toBe(false);
    expect(proposal.rows.map((r) => r.proposedWeight)).toEqual([0.5, 0.5, 0.4]);
    expect(proposal.proposedTotal).toBe(1);
    expect(items[0]?.weight).toBe(0.2);

    const terco = proposeRebalancedWeights([
      { metricDefinitionId: DEF_A, weight: 1, isActive: true },
      { metricDefinitionId: DEF_B, weight: 1, isActive: true },
      { metricDefinitionId: DEF_C, weight: 1, isActive: true },
    ]);
    const total = terco.rows.reduce((acc, r) => acc + r.proposedWeight, 0);
    expect(Math.round(total * 10000) / 10000).toBe(1);
  });
});

describe('definições e itens', () => {
  it('aceita a chave do preset com sublinhado e recusa maiúsculas', () => {
    expect(metricSlugSchema.safeParse('sla_compliance').success).toBe(true);
    expect(metricSlugSchema.safeParse('Sla Compliance').success).toBe(false);
  });

  it('preenche os padrões da definição', () => {
    const body = createMetricDefinitionSchema.parse({
      name: 'Cumprimento de SLA',
      slug: 'sla_compliance',
      metricType: 'PERCENTAGE',
      direction: 'HIGHER_IS_BETTER',
    });
    expect(body).toMatchObject({ periodicity: 'MONTHLY', sourceType: 'MANUAL', isActive: true });
  });

  it('lê a query de listagem com filtros e booleanos', () => {
    const query = listMetricDefinitionsQuerySchema.parse({
      type: 'PERCENTAGE',
      is_active: 'false',
      page: '2',
    });
    expect(query).toMatchObject({ type: 'PERCENTAGE', is_active: false, page: 2, sort: 'name' });
  });

  it('item do modelo usa 0,45/0,35/0,20 por padrão e recusa componentes zerados', () => {
    const item = metricModelItemInputSchema.parse({
      metricDefinitionId: DEF_A,
      weight: 0.18,
      normalization: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
    });
    expect(item).toMatchObject({ currentWeight: 0.45, trendWeight: 0.35, persistenceWeight: 0.2 });
    expect(
      metricModelItemInputSchema.safeParse({
        metricDefinitionId: DEF_A,
        weight: 0.18,
        currentWeight: 0,
        trendWeight: 0,
        persistenceWeight: 0,
        normalization: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
      }).success,
    ).toBe(false);
  });

  it('preview-score exige ao menos um período', () => {
    expect(
      previewScoreSchema.safeParse({
        item: { normalization: { strategy: 'LINEAR_RANGE', min: 0, max: 100 } },
        series: [],
      }).success,
    ).toBe(false);
    const body = previewScoreSchema.parse({
      item: { normalization: { strategy: 'LINEAR_RANGE', min: 0, max: 100 } },
      series: [{ periodEnd: '2026-08-31', value: 80 }],
    });
    expect(body.item.weight).toBe(1);
  });
});
