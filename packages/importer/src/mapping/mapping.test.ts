import { describe, expect, it } from 'vitest';

import { applyMapping, coerceField, missingRequiredFields } from './apply.js';
import { detectDataset, HIGH_CONFIDENCE, scoreHeaderForField, suggestMapping } from './suggest.js';
import {
  CLIENTS_DATASET,
  DATASETS,
  getDataset,
  getField,
  NPS_DATASET,
} from '../datasets/catalog.js';

describe('catálogo', () => {
  it('expõe os 4 datasets com chave natural e campo obrigatório de código', () => {
    expect(Object.keys(DATASETS)).toEqual(['clients', 'monthly_metrics', 'nps', 'client_status']);
    for (const dataset of Object.values(DATASETS)) {
      expect(getDataset(dataset.key)).toBe(dataset);
      expect(getField(dataset, 'external_code')?.required).toBe(true);
      expect(dataset.naturalKey.every((key) => getField(dataset, key) !== undefined)).toBe(true);
      const keys = dataset.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(getField(CLIENTS_DATASET, 'inexistente')).toBeUndefined();
  });
});

describe('scoreHeaderForField', () => {
  const monthlyValue = getField(CLIENTS_DATASET, 'monthly_value')!;
  const externalCode = getField(CLIENTS_DATASET, 'external_code')!;

  it('nome idêntico = 1, sinônimo = 0,95, parcial e tokens abaixo disso', () => {
    expect(scoreHeaderForField('monthly_value', monthlyValue)).toEqual({
      confidence: 1,
      reason: 'exact',
    });
    expect(scoreHeaderForField('valor_mensal', monthlyValue)).toEqual({
      confidence: 0.95,
      reason: 'synonym',
    });
    const partial = scoreHeaderForField('valor_mensal_do_contrato', monthlyValue);
    expect(partial.reason).toBe('partial');
    expect(partial.confidence).toBeGreaterThanOrEqual(0.5);
    expect(partial.confidence).toBeLessThan(0.95);
    const tokens = scoreHeaderForField('mensal_valor_bruto', monthlyValue);
    expect(tokens.reason).toBe('tokens');
    expect(tokens.confidence).toBeGreaterThan(0.5);
  });

  it('não confunde pedaço de palavra ("id" dentro de "validade") e ignora vazio', () => {
    expect(scoreHeaderForField('validade', externalCode)).toEqual({
      confidence: 0,
      reason: 'none',
    });
    expect(scoreHeaderForField('', externalCode)).toEqual({ confidence: 0, reason: 'none' });
  });
});

describe('suggestMapping', () => {
  it('mapeia os cabeçalhos da planilha do desafio com confiança alta', () => {
    const suggestion = suggestMapping(
      [
        'cliente_id',
        'segmento',
        'porte',
        'plano',
        'valor_mensal',
        'sla_contratado_h',
        'inicio_contrato',
      ],
      'clients',
    );
    expect(suggestion.mapping).toEqual({
      external_code: 'cliente_id',
      name: null,
      segment: 'segmento',
      size: 'porte',
      plan: 'plano',
      monthly_value: 'valor_mensal',
      contracted_sla_hours: 'sla_contratado_h',
      contract_start: 'inicio_contrato',
    });
    expect(suggestion.missingRequired).toEqual([]);
    expect(suggestion.unmappedHeaders).toEqual([]);
    expect(suggestion.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
  });

  it('aceita cabeçalhos humanos com acento, espaço e inglês', () => {
    const suggestion = suggestMapping(
      [
        'Código do cliente',
        'Nome',
        'Segmento',
        'Porte',
        'Plan',
        'Valor Mensal (R$)',
        'SLA (horas)',
        'Início do contrato',
        'Observações',
      ],
      CLIENTS_DATASET,
    );
    expect(suggestion.mapping.external_code).toBe('Código do cliente');
    expect(suggestion.mapping.name).toBe('Nome');
    expect(suggestion.mapping.plan).toBe('Plan');
    expect(suggestion.mapping.monthly_value).toBe('Valor Mensal (R$)');
    expect(suggestion.mapping.contracted_sla_hours).toBe('SLA (horas)');
    expect(suggestion.mapping.contract_start).toBe('Início do contrato');
    expect(suggestion.unmappedHeaders).toEqual(['Observações']);
    expect(suggestion.missingRequired).toEqual([]);
  });

  it('não usa o mesmo cabeçalho para dois campos e lista obrigatórios sem coluna', () => {
    const suggestion = suggestMapping(['cliente_id', 'mes_ref', 'nota'], NPS_DATASET);
    expect(suggestion.mapping.score).toBe('nota');
    expect(suggestion.mapping.answered).toBeNull();
    expect(suggestion.missingRequired).toEqual(['answered']);
    expect(suggestion.confidence).toBe(0);
    const headers = Object.values(suggestion.mapping).filter((h) => h !== null);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it('respeita minConfidence', () => {
    const loose = suggestMapping(['valor mensal do contrato'], 'clients', { minConfidence: 0.5 });
    expect(loose.mapping.monthly_value).toBe('valor mensal do contrato');
    const strict = suggestMapping(['valor mensal do contrato'], 'clients', { minConfidence: 0.9 });
    expect(strict.mapping.monthly_value).toBeNull();
  });

  it('sem cabeçalhos → tudo sem coluna', () => {
    const suggestion = suggestMapping([], 'client_status');
    expect(suggestion.fields.every((f) => f.header === null && f.reason === 'none')).toBe(true);
    expect(suggestion.confidence).toBe(0);
  });
});

describe('detectDataset', () => {
  it('reconhece cada aba da planilha do desafio', () => {
    const headers = {
      clients: [
        'cliente_id',
        'segmento',
        'porte',
        'plano',
        'valor_mensal',
        'sla_contratado_h',
        'inicio_contrato',
      ],
      monthly_metrics: [
        'cliente_id',
        'mes_ref',
        'chamados_abertos',
        'chamados_criticos',
        'pct_sla_cumprido',
        'uso_plataforma_pct',
      ],
      nps: ['cliente_id', 'mes_ref', 'respondeu', 'nota_nps', 'classificacao_nps'],
      client_status: ['cliente_id', 'situacao', 'mes_cancelamento'],
    };
    for (const [expected, list] of Object.entries(headers)) {
      const ranking = detectDataset(list);
      expect(ranking[0]?.dataset).toBe(expected);
      expect(ranking).toHaveLength(4);
    }
    expect(detectDataset([])[0]?.confidence).toBe(0);
  });
});

describe('applyMapping', () => {
  it('coage cada campo, preenche ausentes com null e aponta erros com linha e campo', () => {
    const rows = [
      { 'Cliente ID': 'C001', Valor: '1.234,56', Início: '01/03/2025', SLA: '12' },
      { 'Cliente ID': 'C002', Valor: 'dez mil', Início: '2025-02-30', SLA: '' },
    ];
    const result = applyMapping(
      rows,
      {
        external_code: 'Cliente ID',
        monthly_value: 'Valor',
        contract_start: 'Início',
        contracted_sla_hours: 'SLA',
        segment: null,
      },
      'clients',
    );
    expect(result.rows[0]).toEqual({
      row: 1,
      values: {
        external_code: 'C001',
        name: null,
        segment: null,
        size: null,
        plan: null,
        monthly_value: 1234.56,
        contracted_sla_hours: 12,
        contract_start: '2025-03-01',
      },
    });
    expect(result.rows[1]?.values.monthly_value).toBeNull();
    expect(result.errors).toEqual([
      expect.objectContaining({ row: 2, field: 'monthly_value', code: 'INVALID_NUMBER' }),
      expect.objectContaining({ row: 2, field: 'contract_start', code: 'INVALID_DATE' }),
    ]);
    expect(result.errors[0]?.message).toMatch(/^Valor mensal \(R\$\): /);
    expect(result.missingFields).toEqual(['segment', 'size', 'plan']);
  });

  it('cobre todos os tipos de campo', () => {
    const nps = applyMapping(
      [
        { c: 'C1', p: 'mar/2025', r: 'sim', n: '9', k: 'Promotor' },
        { c: 'C2', p: 'x', r: 'talvez', n: '9,5', k: 'Outro' },
      ],
      { external_code: 'c', period: 'p', answered: 'r', score: 'n', classification: 'k' },
      NPS_DATASET,
    );
    expect(nps.rows[0]?.values).toEqual({
      external_code: 'C1',
      period: '2025-03',
      answered: true,
      score: 9,
      classification: 'promoter',
    });
    expect(nps.errors.map((e) => e.code)).toEqual([
      'INVALID_PERIOD',
      'INVALID_BOOLEAN',
      'INVALID_INTEGER',
      'INVALID_ENUM',
    ]);
    const status = coerceField('Cancelado', getField(NPS_DATASET, 'classification')!);
    expect(status.ok).toBe(false);
    expect(coerceField({}, getField(CLIENTS_DATASET, 'external_code')!)).toEqual({
      ok: false,
      message: 'Valor não é um texto.',
    });
  });

  it('missingRequiredFields considera cabeçalhos inexistentes no arquivo', () => {
    expect(
      missingRequiredFields(NPS_DATASET, { external_code: 'id', period: 'mes', answered: 'resp' }, [
        'id',
        'mes',
      ]),
    ).toEqual(['answered']);
    expect(
      missingRequiredFields(NPS_DATASET, { external_code: 'id', period: 'mes', answered: 'resp' }),
    ).toEqual([]);
  });
});
