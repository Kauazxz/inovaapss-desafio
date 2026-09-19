import { describe, expect, it } from 'vitest';

import {
  computeBaseline,
  deviationFromBaseline,
  normalize,
  parseBoolean,
  type NormalizationInput,
} from './normalization.js';
import { EngineConfigError, UnsafeRuleError } from '../shared/errors.js';

import type { NormalizationConfig, ThresholdBandsConfig } from './types.js';

const better = (value: number | null, history?: (number | null)[]): NormalizationInput => ({
  value,
  direction: 'HIGHER_IS_BETTER',
  ...(history ? { history } : {}),
});
const worse = (value: number | null, history?: (number | null)[]): NormalizationInput => ({
  value,
  direction: 'HIGHER_IS_WORSE',
  ...(history ? { history } : {}),
});

const bands: ThresholdBandsConfig = {
  strategy: 'THRESHOLD_BANDS',
  bands: [
    { upTo: 10, health: 100 },
    { upTo: 20, health: 60 },
    { upTo: null, health: 0 },
  ],
};

describe('dado ausente (§25, §66)', () => {
  const strategies: NormalizationConfig[] = [
    bands,
    { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
    { strategy: 'RATIO_TO_TARGET', target: 10 },
    { strategy: 'BASELINE_DEVIATION' },
    { strategy: 'BOOLEAN_MAP' },
    { strategy: 'SCORE_MAP', map: { A: 100 } },
    { strategy: 'CUSTOM_SAFE_RULE', rule: 100 },
  ];
  it.each(strategies)('$strategy devolve N/A (null), nunca zero', (config) => {
    const result = normalize(better(null), config);
    expect(result.health).toBeNull();
    expect(result.reason).toMatch(/Sem dado/);
  });

  it('NaN é tratado como ausente', () => {
    expect(normalize(better(Number.NaN), bands).health).toBeNull();
  });
});

describe('THRESHOLD_BANDS', () => {
  it('escolhe a primeira faixa que o valor não ultrapassa', () => {
    expect(normalize(worse(5), bands).health).toBe(100);
    expect(normalize(worse(10), bands).health).toBe(100);
    expect(normalize(worse(15), bands).health).toBe(60);
    expect(normalize(worse(50), bands).health).toBe(0);
  });

  it('aceita faixas fora de ordem', () => {
    const shuffled: ThresholdBandsConfig = {
      strategy: 'THRESHOLD_BANDS',
      bands: [
        { upTo: null, health: 0 },
        { upTo: 20, health: 60 },
        { upTo: 10, health: 100 },
      ],
    };
    expect(normalize(worse(15), shuffled).health).toBe(60);
  });

  it('sem faixa final e valor além delas → N/A com motivo', () => {
    const open: ThresholdBandsConfig = {
      strategy: 'THRESHOLD_BANDS',
      bands: [{ upTo: 10, health: 100 }],
    };
    const result = normalize(worse(50), open);
    expect(result.health).toBeNull();
    expect(result.reason).toMatch(/fora de todas as faixas/);
  });

  it('recusa configuração sem faixas', () => {
    expect(() => normalize(worse(1), { strategy: 'THRESHOLD_BANDS', bands: [] })).toThrow(
      EngineConfigError,
    );
  });
});

describe('LINEAR_RANGE', () => {
  const range: NormalizationConfig = { strategy: 'LINEAR_RANGE', min: 0, max: 100 };

  it('HIGHER_IS_BETTER: min → 0, max → 100, satura fora', () => {
    expect(normalize(better(75), range).health).toBe(75);
    expect(normalize(better(150), range).health).toBe(100);
    expect(normalize(better(-5), range).health).toBe(0);
  });

  it('HIGHER_IS_WORSE inverte', () => {
    expect(normalize(worse(75), range).health).toBe(25);
    expect(normalize(worse(0), range).health).toBe(100);
  });

  it('TARGET_RANGE: 100 dentro do alvo e cai linearmente até os extremos', () => {
    const config: NormalizationConfig = {
      strategy: 'LINEAR_RANGE',
      min: 0,
      max: 100,
      target: { min: 40, max: 60 },
    };
    const at = (value: number) => normalize({ value, direction: 'TARGET_RANGE' }, config).health;
    expect(at(50)).toBe(100);
    expect(at(40)).toBe(100);
    expect(at(20)).toBe(50);
    expect(at(80)).toBe(50);
    expect(at(0)).toBe(0);
  });

  it('CUSTOM usa a configuração ao pé da letra', () => {
    expect(normalize({ value: 25, direction: 'CUSTOM' }, range).health).toBe(25);
  });

  it('recusa configurações inválidas', () => {
    expect(() => normalize(better(1), { strategy: 'LINEAR_RANGE', min: 10, max: 5 })).toThrow(
      EngineConfigError,
    );
    expect(() => normalize({ value: 1, direction: 'TARGET_RANGE' }, range)).toThrow(
      EngineConfigError,
    );
  });
});

describe('RATIO_TO_TARGET', () => {
  it('HIGHER_IS_BETTER: razão × 100', () => {
    const result = normalize(better(80), { strategy: 'RATIO_TO_TARGET', target: 100 });
    expect(result.health).toBe(80);
    expect(result.baseline).toBe(100);
    expect(result.deviationPct).toBe(-20);
    expect(normalize(better(120), { strategy: 'RATIO_TO_TARGET', target: 100 }).health).toBe(100);
  });

  it('HIGHER_IS_WORSE: 100 até a meta, 0 no dobro (padrão)', () => {
    const config: NormalizationConfig = { strategy: 'RATIO_TO_TARGET', target: 10 };
    expect(normalize(worse(5), config).health).toBe(100);
    expect(normalize(worse(10), config).health).toBe(100);
    expect(normalize(worse(15), config).health).toBe(50);
    expect(normalize(worse(20), config).health).toBe(0);
    expect(normalize(worse(13), { ...config, zeroAtRatio: 1.5 }).health).toBe(40);
  });

  it('TARGET_RANGE: tolerância e desvio que zera', () => {
    const config: NormalizationConfig = {
      strategy: 'RATIO_TO_TARGET',
      target: 100,
      tolerance: 0.1,
    };
    const at = (value: number) => normalize({ value, direction: 'TARGET_RANGE' }, config).health;
    expect(at(105)).toBe(100);
    expect(at(95)).toBe(100);
    expect(at(150)).toBeCloseTo(55.56, 1);
    expect(at(0)).toBe(0);
  });

  it('recusa meta zero e escalas inconsistentes', () => {
    expect(() => normalize(better(1), { strategy: 'RATIO_TO_TARGET', target: 0 })).toThrow(
      EngineConfigError,
    );
    expect(() =>
      normalize(worse(1), { strategy: 'RATIO_TO_TARGET', target: 10, zeroAtRatio: 1 }),
    ).toThrow(EngineConfigError);
    expect(() =>
      normalize(
        { value: 1, direction: 'TARGET_RANGE' },
        { strategy: 'RATIO_TO_TARGET', target: 10, tolerance: 1, zeroAtDeviation: 0.5 },
      ),
    ).toThrow(EngineConfigError);
  });
});

describe('BASELINE_DEVIATION (§9, §13, §15, §19)', () => {
  const config: NormalizationConfig = { strategy: 'BASELINE_DEVIATION' };

  it('compara com a média do histórico do próprio cliente', () => {
    const result = normalize(better(80, [100, 100, 100]), config);
    expect(result.baseline).toBe(100);
    expect(result.baselineMethod).toBe('mean');
    expect(result.hasOutliers).toBe(false);
    expect(result.deviationPct).toBe(-20);
    expect(result.health).toBe(60); // 20 % adverso em escala de 50 %
  });

  it('respeita a direção: piora é o que penaliza', () => {
    expect(normalize(worse(12, [10, 10, 10]), config).health).toBe(60);
    expect(normalize(better(120, [100, 100, 100]), config).health).toBe(100);
    expect(normalize(worse(8, [10, 10, 10]), config).health).toBe(100);
    expect(normalize(better(50, [100, 100, 100]), config).health).toBe(0);
  });

  it('TARGET_RANGE penaliza desvio para os dois lados', () => {
    const at = (value: number) =>
      normalize({ value, direction: 'TARGET_RANGE', history: [100, 100, 100] }, config).health;
    expect(at(125)).toBe(50);
    expect(at(75)).toBe(50);
  });

  it('usa a mediana quando há outliers (o outlier não esconde a piora)', () => {
    const history = [10, 10, 11, 10, 100];
    const auto = normalize(worse(15, history), config);
    expect(auto.hasOutliers).toBe(true);
    expect(auto.baselineMethod).toBe('median');
    expect(auto.baseline).toBe(10);
    expect(auto.health).toBe(0); // +50 % sobre a mediana

    const forcedMean = normalize(worse(15, history), { ...config, method: 'mean' });
    expect(forcedMean.baselineMethod).toBe('mean');
    expect(forcedMean.baseline).toBeCloseTo(28.2);
    expect(forcedMean.health).toBe(100); // a média "engolida" pelo outlier esconderia o problema
  });

  it('respeita a janela e o mínimo de histórico', () => {
    const long = [1, 1, 1, 1, 1, 1, 1, 1, 50, 50, 50];
    expect(computeBaseline(long, { window: 3 }).baseline).toBe(50);
    expect(computeBaseline(long).periodsUsed).toBe(6);
    expect(computeBaseline([5], { minHistory: 2 }).baseline).toBeNull();
    expect(computeBaseline([5], { minHistory: 1 }).baseline).toBe(5);
    expect(computeBaseline(undefined).baseline).toBeNull();
    expect(computeBaseline([null, 4, null, 6]).baseline).toBe(5);
  });

  it('sem histórico suficiente → N/A com motivo, ou só as faixas absolutas', () => {
    const none = normalize(worse(5), config);
    expect(none.health).toBeNull();
    expect(none.reason).toMatch(/Sem histórico/);

    const few = normalize(worse(5, [5]), config);
    expect(few.health).toBeNull();
    expect(few.reason).toMatch(/insuficiente/);

    const withAbsolute = normalize(worse(15, [5]), { ...config, absolute: bands });
    expect(withAbsolute.health).toBe(60);
    expect(withAbsolute.reason).toMatch(/faixas absolutas/);
  });

  it('combina desvio e faixas absolutas pelo pior caso ou pela média', () => {
    const history = [10, 10, 10];
    const worst = normalize(worse(15, history), { ...config, absolute: bands });
    expect(worst.health).toBe(0); // desvio +50 % → 0; faixa → 60; pior = 0
    const average = normalize(worse(15, history), {
      ...config,
      absolute: bands,
      combine: 'average',
    });
    expect(average.health).toBe(30);
  });

  it('tolerância e desvio máximo configuráveis', () => {
    const custom: NormalizationConfig = {
      strategy: 'BASELINE_DEVIATION',
      tolerancePct: 10,
      maxDeviationPct: 30,
    };
    expect(normalize(worse(12, [10, 10, 10]), custom).health).toBe(50);
    expect(normalize(worse(11, [10, 10, 10]), custom).health).toBe(100);
    expect(() =>
      normalize(worse(1, [1, 1]), { ...custom, tolerancePct: 30, maxDeviationPct: 10 }),
    ).toThrow(EngineConfigError);
  });

  it('baseline zero: decide pela direção da mudança', () => {
    expect(deviationFromBaseline(3, 0)).toBeNull();
    const up = normalize(worse(3, [0, 0, 0]), config);
    expect(up.health).toBe(0);
    expect(up.deviationPct).toBeNull();
    expect(up.reason).toMatch(/Baseline zero/);
    expect(normalize(worse(0, [0, 0, 0]), config).health).toBe(100);
    expect(normalize(better(3, [0, 0, 0]), config).health).toBe(100);
    expect(normalize(better(-3, [0, 0, 0]), config).health).toBe(0);
    expect(
      normalize({ value: 3, direction: 'TARGET_RANGE', history: [0, 0, 0] }, config).health,
    ).toBe(0);
  });
});

describe('BOOLEAN_MAP', () => {
  it('padrão pela direção', () => {
    expect(normalize(better(1), { strategy: 'BOOLEAN_MAP' }).health).toBe(100);
    expect(normalize(better(0), { strategy: 'BOOLEAN_MAP' }).health).toBe(0);
    expect(normalize(worse(1), { strategy: 'BOOLEAN_MAP' }).health).toBe(0);
    expect(normalize(worse(0), { strategy: 'BOOLEAN_MAP' }).health).toBe(100);
  });

  it('entende texto em português e inglês; texto desconhecido é N/A', () => {
    expect(
      normalize(
        { value: null, text: 'sim', direction: 'HIGHER_IS_BETTER' },
        { strategy: 'BOOLEAN_MAP' },
      ).health,
    ).toBe(100);
    expect(
      normalize(
        { value: null, text: 'não', direction: 'HIGHER_IS_BETTER' },
        { strategy: 'BOOLEAN_MAP' },
      ).health,
    ).toBe(0);
    expect(
      normalize(
        { value: null, text: 'talvez', direction: 'HIGHER_IS_BETTER' },
        { strategy: 'BOOLEAN_MAP' },
      ).health,
    ).toBeNull();
    expect(parseBoolean(null, 'YES')).toBe(true);
    expect(parseBoolean(2, '')).toBe(true);
  });

  it('mapa explícito e exigência para TARGET_RANGE/CUSTOM', () => {
    expect(
      normalize(worse(1), { strategy: 'BOOLEAN_MAP', trueHealth: 30, falseHealth: 90 }).health,
    ).toBe(30);
    expect(() => normalize({ value: 1, direction: 'CUSTOM' }, { strategy: 'BOOLEAN_MAP' })).toThrow(
      EngineConfigError,
    );
    expect(
      normalize(
        { value: 1, direction: 'CUSTOM' },
        { strategy: 'BOOLEAN_MAP', trueHealth: 50, falseHealth: 50 },
      ).health,
    ).toBe(50);
  });
});

describe('SCORE_MAP', () => {
  const config: NormalizationConfig = { strategy: 'SCORE_MAP', map: { A: 100, B: 50, '3': 30 } };

  it('mapeia texto (sem diferenciar maiúsculas) e número', () => {
    expect(normalize({ value: null, text: 'A', direction: 'CUSTOM' }, config).health).toBe(100);
    expect(normalize({ value: null, text: 'b', direction: 'CUSTOM' }, config).health).toBe(50);
    expect(normalize({ value: 3, direction: 'CUSTOM' }, config).health).toBe(30);
  });

  it('chave não mapeada é N/A, salvo defaultHealth', () => {
    const missing = normalize({ value: null, text: 'Z', direction: 'CUSTOM' }, config);
    expect(missing.health).toBeNull();
    expect(missing.reason).toMatch(/não mapeado/);
    expect(
      normalize({ value: null, text: 'Z', direction: 'CUSTOM' }, { ...config, defaultHealth: 10 })
        .health,
    ).toBe(10);
  });

  it('recusa mapa vazio', () => {
    expect(() =>
      normalize({ value: 1, direction: 'CUSTOM' }, { strategy: 'SCORE_MAP', map: {} }),
    ).toThrow(EngineConfigError);
  });
});

describe('CUSTOM_SAFE_RULE', () => {
  it('a regra devolve o health diretamente', () => {
    const result = normalize(better(7, [4, 5, 6]), {
      strategy: 'CUSTOM_SAFE_RULE',
      rule: { '*': [{ var: 'value' }, { var: 'params.factor' }] },
      params: { factor: 10 },
    });
    expect(result.health).toBe(70);
    expect(result.baseline).toBe(5);
  });

  it('pode devolver um valor derivado que passa por outra estratégia (com a direção)', () => {
    const result = normalize(worse(30, [10, 10]), {
      strategy: 'CUSTOM_SAFE_RULE',
      output: 'value',
      rule: { '-': [{ var: 'value' }, { var: 'previous' }] },
      then: { strategy: 'LINEAR_RANGE', min: 0, max: 40 },
    });
    expect(result.strategy).toBe('CUSTOM_SAFE_RULE');
    expect(result.health).toBe(50); // derivado 20 em 0–40, HIGHER_IS_WORSE → 50
  });

  it('resultado não numérico é N/A; output value sem then é erro de configuração', () => {
    const text = normalize(better(1), { strategy: 'CUSTOM_SAFE_RULE', rule: { cat: ['a'] } });
    expect(text.health).toBeNull();
    expect(text.reason).toMatch(/não devolveu um número/);
    expect(() =>
      normalize(better(1), { strategy: 'CUSTOM_SAFE_RULE', output: 'value', rule: 1 }),
    ).toThrow(EngineConfigError);
  });

  it('recusa código arbitrário', () => {
    expect(() =>
      normalize(better(1), {
        strategy: 'CUSTOM_SAFE_RULE',
        rule: { method: [{ var: 'value' }, 'toString'] },
      }),
    ).toThrow(UnsafeRuleError);
  });
});

describe('estratégia desconhecida', () => {
  it('lança erro de configuração', () => {
    expect(() =>
      normalize(better(1), { strategy: 'MAGIC' } as unknown as NormalizationConfig),
    ).toThrow(EngineConfigError);
  });
});
