import { describe, expect, it } from 'vitest';

import { emptyReport, importDataset, mergeReports, validateDataset } from './validate.js';
import { classifyNps } from '../datasets/schemas.js';
import { applyMapping } from '../mapping/apply.js';

const identity = (fields: string[]) => Object.fromEntries(fields.map((f) => [f, f]));

describe('validateDataset — clients', () => {
  const mapping = identity([
    'external_code',
    'name',
    'segment',
    'size',
    'plan',
    'monthly_value',
    'contracted_sla_hours',
    'contract_start',
  ]);
  const base = {
    external_code: 'C001',
    name: null,
    segment: 'Saúde',
    size: 'Médio',
    plan: 'Avançado',
    monthly_value: '10742',
    contracted_sla_hours: 12,
    contract_start: '2020-02-01',
  };

  it('aceita linhas válidas e conta total = válidas + inválidas + duplicadas', () => {
    const rows = [
      base,
      { ...base, external_code: 'C002', monthly_value: '' },
      { ...base, external_code: 'C001' },
      { ...base, external_code: 'C003', contracted_sla_hours: 0, monthly_value: -1 },
    ];
    const { rows: valid, report } = validateDataset(
      'clients',
      applyMapping(rows, mapping, 'clients'),
    );
    expect(valid.map((r) => r.external_code)).toEqual(['C001']);
    expect(valid[0]).toEqual({ ...base, monthly_value: 10742 });
    expect(report).toMatchObject({
      total: 4,
      valid: 1,
      invalid: 2,
      duplicates: 1,
      missingFields: [],
    });
    expect(report.errors).toEqual([
      expect.objectContaining({ row: 2, field: 'monthly_value', code: 'MISSING_REQUIRED' }),
      expect.objectContaining({ row: 3, field: null, code: 'DUPLICATE' }),
      expect.objectContaining({ row: 4, field: 'contracted_sla_hours', code: 'OUT_OF_RANGE' }),
      expect.objectContaining({ row: 4, field: 'monthly_value', code: 'OUT_OF_RANGE' }),
    ]);
    expect(report.errors[0]?.message).toBe('Valor mensal é obrigatório.');
    expect(report.errors[1]?.message).toContain('C001');
  });

  it('linha com erro de coerção é inválida mesmo quando o schema passa (campo opcional)', () => {
    const rows = [{ ...base, name: {} }];
    const { rows: valid, report } = validateDataset(
      'clients',
      applyMapping(rows, mapping, 'clients'),
    );
    expect(valid).toHaveLength(0);
    expect(report).toMatchObject({ total: 1, valid: 0, invalid: 1 });
    expect(report.errors[0]?.code).toBe('INVALID_TEXT');
  });

  it('campo obrigatório sem coluna entra em missingFields e invalida as linhas', () => {
    const { external_code: _drop, ...partial } = mapping;
    const result = importDataset('clients', [base], partial);
    expect(result.report.missingFields).toEqual(['external_code']);
    expect(result.report.valid).toBe(0);
    expect(result.report.errors[0]).toMatchObject({
      row: 1,
      field: 'external_code',
      code: 'MISSING_REQUIRED',
      message: 'Código do cliente é obrigatório.',
    });
  });
});

describe('validateDataset — monthly_metrics', () => {
  const row = {
    external_code: 'C001',
    period: '2025-01',
    open_tickets: 4,
    critical_tickets: 1,
    reopened_tickets: 0,
    tickets_within_sla: 3,
    sla_compliance_pct: '75',
    avg_resolution_hours: '22,4',
    formal_complaints: 0,
    platform_usage_pct: 83,
    payment_delay_days: 5,
    meetings_planned: 1,
    meetings_completed: 1,
  };

  it('aceita campos vazios (N/A) e valida faixas e consistência', () => {
    const rows = [
      row,
      {
        ...row,
        period: '2025-02',
        sla_compliance_pct: '',
        avg_resolution_hours: null,
        open_tickets: '',
      },
      {
        ...row,
        period: '2025-03',
        critical_tickets: 9,
        tickets_within_sla: 7,
        meetings_completed: 2,
      },
      {
        ...row,
        period: '2025-04',
        sla_compliance_pct: 120,
        payment_delay_days: -1,
        platform_usage_pct: '101',
      },
    ];
    const result = importDataset('monthly_metrics', rows);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ sla_compliance_pct: 75, avg_resolution_hours: 22.4 });
    expect(result.rows[1]).toMatchObject({
      sla_compliance_pct: null,
      avg_resolution_hours: null,
      open_tickets: null,
    });
    const codes = result.report.errors.map((e) => `${e.row}:${e.field}:${e.code}`);
    expect(codes).toEqual([
      '3:critical_tickets:INCONSISTENT',
      '3:meetings_completed:INCONSISTENT',
      '3:tickets_within_sla:INCONSISTENT',
      '4:payment_delay_days:OUT_OF_RANGE',
      '4:platform_usage_pct:OUT_OF_RANGE',
      '4:sla_compliance_pct:OUT_OF_RANGE',
    ]);
  });

  it('duplicidade usa cliente + período', () => {
    const result = importDataset('monthly_metrics', [
      row,
      { ...row, period: '2025-02' },
      { ...row },
    ]);
    expect(result.report).toMatchObject({ total: 3, valid: 2, duplicates: 1 });
    expect(result.report.errors[0]?.message).toContain('C001 / 2025-01');
  });
});

describe('validateDataset — nps (§22)', () => {
  it('"respondeu = 0" com nota vazia é VÁLIDA: answered=false, score=null, no_answer', () => {
    const result = importDataset('nps', [
      {
        cliente_id: 'C001',
        mes_ref: '2025-12',
        respondeu: 0,
        nota_nps: '',
        classificacao_nps: 'Sem resposta',
      },
      {
        cliente_id: 'C002',
        mes_ref: '2025-12',
        respondeu: 0,
        nota_nps: null,
        classificacao_nps: null,
      },
      {
        cliente_id: 'C003',
        mes_ref: '2025-12',
        respondeu: 'não',
        nota_nps: 7,
        classificacao_nps: 'Neutro',
      },
    ]);
    expect(result.report).toMatchObject({ total: 3, valid: 3, invalid: 0, errors: [] });
    expect(result.rows[0]).toEqual({
      external_code: 'C001',
      period: '2025-12',
      answered: false,
      score: null,
      classification: 'no_answer',
    });
    expect(result.rows[1]?.classification).toBe('no_answer');
    // Não respondeu → a nota informada é ignorada (não é resposta).
    expect(result.rows[2]).toMatchObject({
      answered: false,
      score: null,
      classification: 'no_answer',
    });
  });

  it('respondeu sem nota é erro; nota fora de 0–10 é erro; classificação derivada da nota', () => {
    const result = importDataset('nps', [
      { cliente_id: 'C001', mes_ref: '2025-03', respondeu: 1, nota_nps: '' },
      { cliente_id: 'C002', mes_ref: '2025-03', respondeu: 1, nota_nps: 11 },
      { cliente_id: 'C003', mes_ref: '2025-03', respondeu: 1, nota_nps: 10 },
      { cliente_id: 'C004', mes_ref: '2025-03', respondeu: 1, nota_nps: 8 },
      { cliente_id: 'C005', mes_ref: '2025-03', respondeu: 1, nota_nps: 0 },
      { cliente_id: 'C006', mes_ref: '2025-03', respondeu: '', nota_nps: 5 },
    ]);
    expect(result.report.errors).toEqual([
      expect.objectContaining({ row: 1, field: 'score', code: 'MISSING_REQUIRED' }),
      expect.objectContaining({ row: 2, field: 'score', code: 'OUT_OF_RANGE' }),
      expect.objectContaining({ row: 6, field: 'answered', code: 'MISSING_REQUIRED' }),
    ]);
    expect(result.rows.map((r) => [r.external_code, r.classification])).toEqual([
      ['C003', 'promoter'],
      ['C004', 'neutral'],
      ['C005', 'detractor'],
    ]);
    expect(classifyNps(null)).toBe('no_answer');
    expect(classifyNps(9)).toBe('promoter');
    expect(classifyNps(7)).toBe('neutral');
    expect(classifyNps(6)).toBe('detractor');
  });
});

describe('validateDataset — client_status', () => {
  it('traduz Ativo/Cancelado e exige o mês quando cancelado', () => {
    const result = importDataset('client_status', [
      { cliente_id: 'C001', situacao: 'Ativo', mes_cancelamento: '' },
      { cliente_id: 'C004', situacao: 'Cancelado', mes_cancelamento: '2026-05' },
      { cliente_id: 'C005', situacao: 'cancelled', mes_cancelamento: null },
      { cliente_id: 'C006', situacao: 'Suspenso', mes_cancelamento: null },
      { cliente_id: 'C007', situacao: 'Ativo', mes_cancelamento: 'ontem' },
    ]);
    expect(result.rows).toEqual([
      { external_code: 'C001', status: 'active', cancellation_period: null },
      { external_code: 'C004', status: 'cancelled', cancellation_period: '2026-05' },
    ]);
    expect(result.report.errors).toEqual([
      expect.objectContaining({ row: 3, field: 'cancellation_period', code: 'MISSING_REQUIRED' }),
      expect.objectContaining({ row: 4, field: 'status', code: 'INVALID_ENUM' }),
      expect.objectContaining({ row: 5, field: 'cancellation_period', code: 'INVALID_PERIOD' }),
    ]);
    // Coerção falhou em `status` → o schema não repete o erro no mesmo campo nem conta a linha duas vezes.
    expect(result.report).toMatchObject({ total: 5, valid: 2, invalid: 3, duplicates: 0 });
    expect(result.report.errors[1]?.message).toBe(
      'Situação: "Suspenso" não é um valor aceito (active, cancelled).',
    );
    expect(result.report.errors[2]?.message).toBe(
      'Mês do cancelamento: "ontem" não é um período reconhecido (AAAA-MM).',
    );
  });
});

describe('importDataset sem mapeamento', () => {
  it('sugere o mapeamento pelos cabeçalhos informados ou pelas chaves da primeira linha', () => {
    const rows = [{ Código: 'C001', Situação: 'Ativo' }];
    expect(importDataset('client_status', rows).rows).toEqual([
      { external_code: 'C001', status: 'active', cancellation_period: null },
    ]);
    expect(
      importDataset('client_status', rows, undefined, ['Código', 'Situação']).report.valid,
    ).toBe(1);
    expect(importDataset('client_status', [], undefined, ['Código', 'Situação']).report).toEqual(
      emptyReport(),
    );
    // Sem linhas nem cabeçalhos não há como mapear: os obrigatórios aparecem como ausentes.
    expect(importDataset('client_status', []).report.missingFields).toEqual([
      'external_code',
      'status',
    ]);
  });
});

describe('mergeReports', () => {
  it('soma contagens e une campos ausentes sem repetir', () => {
    const a = {
      ...emptyReport(),
      total: 2,
      valid: 1,
      invalid: 1,
      missingFields: ['x'],
      errors: [{ row: 1, field: 'x', code: 'MISSING_REQUIRED' as const, message: 'm' }],
    };
    const b = { ...emptyReport(), total: 3, valid: 2, duplicates: 1, missingFields: ['x', 'y'] };
    expect(mergeReports([a, b])).toEqual({
      total: 5,
      valid: 3,
      invalid: 1,
      duplicates: 1,
      missingFields: ['x', 'y'],
      errors: a.errors,
    });
    expect(mergeReports([])).toEqual(emptyReport());
  });
});
