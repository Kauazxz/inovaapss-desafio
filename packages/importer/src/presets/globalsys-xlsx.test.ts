/**
 * Preset da planilha do desafio. A suíte "planilha real" lê `data/INOVAAPPS_base_de_dados.xlsx`
 * pelo caminho relativo ao repositório e confere os totais conhecidos (data/README.md). Se o
 * arquivo não estiver no checkout, fica skipped com aviso (§44: não inventar resultados).
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findSheet, GLOBALSYS_SHEET_PRESETS, importGlobalSysWorkbook } from './globalsys-xlsx.js';
import { DATASETS } from '../datasets/catalog.js';
import { HIGH_CONFIDENCE, suggestMapping } from '../mapping/suggest.js';
import { readWorkbook, writeWorkbook } from '../readers/xlsx.js';
import { ImportReadError } from '../shared/errors.js';

const DATASET_PATH = fileURLToPath(
  new URL('../../../../data/INOVAAPPS_base_de_dados.xlsx', import.meta.url),
);
const hasDataset = existsSync(DATASET_PATH);
if (!hasDataset) {
  console.warn(
    `[importer] data/INOVAAPPS_base_de_dados.xlsx não encontrada em ${DATASET_PATH}; testes da planilha real pulados.`,
  );
}

function miniWorkbook(): Buffer {
  return writeWorkbook([
    { name: 'Leia-me', matrix: [['Dados fictícios.']] },
    {
      name: 'clientes',
      matrix: [
        [
          'cliente_id',
          'segmento',
          'porte',
          'plano',
          'valor_mensal',
          'sla_contratado_h',
          'inicio_contrato',
        ],
        ['C001', 'Logistica', 'Pequeno', 'Essencial', 3848, 24, '2020-09-01'],
        // Data local: é assim que o SheetJS grava e lê células de data.
        ['C002', 'Saude', 'Medio', 'Avancado', 10742, 12, new Date(2020, 1, 1)],
      ],
    },
    {
      name: 'atendimento_mensal',
      matrix: [
        [
          'cliente_id',
          'mes_ref',
          'chamados_abertos',
          'chamados_criticos',
          'chamados_reabertos',
          'chamados_dentro_sla',
          'pct_sla_cumprido',
          'tempo_medio_resolucao_h',
          'reclamacoes_formais',
          'uso_plataforma_pct',
          'dias_atraso_pagamento',
          'reunioes_previstas',
          'reunioes_realizadas',
        ],
        ['C001', '2025-01', 1, 0, 0, 1, 100, 27.3, 0, 83, 5, 0, 0],
        ['C001', '2025-02', 0, 0, 0, 0, null, 0, 0, 84.6, 0, 1, 1],
        ['C002', '2025-01', 8, 2, 1, 7, 87.5, 32.7, 1, 68.3, 9, 1, 0],
      ],
    },
    {
      name: 'pesquisas_nps',
      matrix: [
        ['cliente_id', 'mes_ref', 'respondeu', 'nota_nps', 'classificacao_nps'],
        ['C001', '2025-03', 1, 10, 'Promotor'],
        ['C002', '2025-03', 0, '', 'Sem resposta'],
      ],
    },
    {
      name: 'situacao_clientes',
      matrix: [
        ['cliente_id', 'situacao', 'mes_cancelamento'],
        ['C001', 'Ativo', ''],
        ['C002', 'Cancelado', '2026-05'],
      ],
    },
  ]);
}

describe('importGlobalSysWorkbook — planilha pequena gerada no teste', () => {
  it('converte as 4 abas nos 4 datasets sem erros', () => {
    const result = importGlobalSysWorkbook(miniWorkbook());
    expect(result.report.hasErrors).toBe(false);
    expect(result.report.summary).toMatchObject({ total: 9, valid: 9, invalid: 0, duplicates: 0 });
    expect(result.clients).toEqual([
      {
        external_code: 'C001',
        name: null,
        segment: 'Logistica',
        size: 'Pequeno',
        plan: 'Essencial',
        monthly_value: 3848,
        contracted_sla_hours: 24,
        contract_start: '2020-09-01',
      },
      {
        external_code: 'C002',
        name: null,
        segment: 'Saude',
        size: 'Medio',
        plan: 'Avancado',
        monthly_value: 10742,
        contracted_sla_hours: 12,
        contract_start: '2020-02-01',
      },
    ]);
    expect(result.monthlyMetrics[1]).toMatchObject({
      period: '2025-02',
      sla_compliance_pct: null,
      meetings_planned: 1,
    });
    expect(result.nps).toEqual([
      {
        external_code: 'C001',
        period: '2025-03',
        answered: true,
        score: 10,
        classification: 'promoter',
      },
      {
        external_code: 'C002',
        period: '2025-03',
        answered: false,
        score: null,
        classification: 'no_answer',
      },
    ]);
    expect(result.clientStatus).toEqual([
      { external_code: 'C001', status: 'active', cancellation_period: null },
      { external_code: 'C002', status: 'cancelled', cancellation_period: '2026-05' },
    ]);
  });

  it('aba faltando é erro de leitura com o nome da aba', () => {
    const buffer = writeWorkbook([{ name: 'clientes', matrix: [['cliente_id'], ['C001']] }]);
    expect(() => importGlobalSysWorkbook(buffer)).toThrow(ImportReadError);
    expect(() => importGlobalSysWorkbook(buffer)).toThrow(/atendimento_mensal/);
  });

  it('cabeçalho renomeado aparece em missingFields, sem exceção', () => {
    const buffer = writeWorkbook([
      {
        name: 'Clientes ',
        matrix: [
          [
            'id_do_cliente',
            'segmento',
            'porte',
            'plano',
            'valor_mensal',
            'sla_contratado_h',
            'inicio_contrato',
          ],
          ['C001', 'a', 'b', 'c', 1, 1, '2020-01-01'],
        ],
      },
      {
        name: 'atendimento_mensal',
        matrix: [
          ['cliente_id', 'mes_ref'],
          ['C001', '2025-01'],
        ],
      },
      {
        name: 'pesquisas_nps',
        matrix: [['cliente_id', 'mes_ref', 'respondeu', 'nota_nps', 'classificacao_nps']],
      },
      {
        name: 'situacao_clientes',
        matrix: [
          ['cliente_id', 'situacao', 'mes_cancelamento'],
          ['C001', 'Ativo', null],
        ],
      },
    ]);
    const result = importGlobalSysWorkbook(buffer);
    expect(result.report.hasErrors).toBe(true);
    expect(result.report.clients.missingFields).toEqual(['external_code']);
    expect(result.report.summary.missingFields).toEqual(['external_code']);
    expect(result.monthlyMetrics).toHaveLength(1);
    expect(result.nps).toEqual([]);
  });

  it('findSheet ignora caixa, acento e espaços', () => {
    const { sheets } = readWorkbook(miniWorkbook());
    expect(findSheet(sheets, 'CLIENTES')?.name).toBe('clientes');
    expect(findSheet(sheets, 'inexistente')).toBeUndefined();
  });

  it('o preset cobre todos os campos de cada dataset', () => {
    for (const preset of GLOBALSYS_SHEET_PRESETS) {
      const fields = DATASETS[preset.dataset].fields.map((f) => f.key).sort();
      expect(Object.keys(preset.mapping).sort()).toEqual(fields);
    }
  });
});

describe.skipIf(!hasDataset)('importGlobalSysWorkbook — data/INOVAAPPS_base_de_dados.xlsx', () => {
  const result = hasDataset ? importGlobalSysWorkbook(DATASET_PATH) : undefined;

  it('80 clientes somando R$ 982.964 por mês', () => {
    expect(result!.clients).toHaveLength(80);
    expect(result!.clients.reduce((sum, c) => sum + c.monthly_value, 0)).toBe(982964);
    expect(new Set(result!.clients.map((c) => c.contracted_sla_hours))).toEqual(
      new Set([6, 12, 24]),
    );
    expect(result!.clients.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.contract_start))).toBe(true);
  });

  it('1295 linhas mensais em 18 períodos, de 2025-01 a 2026-06', () => {
    expect(result!.monthlyMetrics).toHaveLength(1295);
    const periods = Array.from(new Set(result!.monthlyMetrics.map((m) => m.period))).sort();
    expect(periods).toHaveLength(18);
    expect(periods[0]).toBe('2025-01');
    expect(periods[17]).toBe('2026-06');
    expect(result!.monthlyMetrics.filter((m) => m.sla_compliance_pct === null)).toHaveLength(23);
  });

  it('422 pesquisas NPS, 338 respondidas; não respondidas são válidas', () => {
    expect(result!.nps).toHaveLength(422);
    expect(result!.nps.filter((n) => n.answered)).toHaveLength(338);
    const unanswered = result!.nps.filter((n) => !n.answered);
    expect(unanswered).toHaveLength(84);
    expect(unanswered.every((n) => n.score === null && n.classification === 'no_answer')).toBe(
      true,
    );
    expect(result!.nps.filter((n) => n.answered).every((n) => n.score !== null)).toBe(true);
  });

  it('80 situações, 22 canceladas com mês do cancelamento', () => {
    expect(result!.clientStatus).toHaveLength(80);
    const cancelled = result!.clientStatus.filter((s) => s.status === 'cancelled');
    expect(cancelled).toHaveLength(22);
    expect(cancelled.every((s) => s.cancellation_period !== null)).toBe(true);
  });

  it('relatório sem erros, sem duplicidades e sem campos ausentes', () => {
    const { report } = result!;
    expect(report.hasErrors).toBe(false);
    expect(report.summary).toEqual({
      total: 80 + 1295 + 422 + 80,
      valid: 80 + 1295 + 422 + 80,
      invalid: 0,
      duplicates: 0,
      missingFields: [],
      errors: [],
    });
  });

  it('suggestMapping reconhece os cabeçalhos da planilha com confiança alta', () => {
    const { sheets } = readWorkbook(DATASET_PATH);
    for (const preset of GLOBALSYS_SHEET_PRESETS) {
      const sheet = findSheet(sheets, preset.sheet)!;
      const suggestion = suggestMapping(sheet.headers, preset.dataset);
      expect(suggestion.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
      expect(suggestion.missingRequired).toEqual([]);
      const expected = Object.fromEntries(
        Object.entries(preset.mapping).filter(([, header]) => header !== null),
      );
      expect(suggestion.mapping).toMatchObject(expected);
    }
  });
});

/**
 * Coerência ENTRE as abas — é o que o "Leia-me" da planilha promete e nada mais conferia.
 * Cada uma destas regras é uma pergunta que o dashboard responde com dinheiro ou com contagem
 * de cliente: se a planilha mudar e quebrar uma delas, é melhor o teste falhar aqui do que a
 * tela mostrar um número errado com cara de certo.
 */
describe.skipIf(!hasDataset)('coerência entre as abas da planilha do desafio', () => {
  const result = hasDataset ? importGlobalSysWorkbook(DATASET_PATH) : undefined;
  const statusByCode = new Map(
    (result?.clientStatus ?? []).map((status) => [status.external_code, status]),
  );

  it('todas as abas falam dos mesmos 80 clientes', () => {
    const codes = new Set(result!.clients.map((c) => c.external_code));
    expect(codes.size).toBe(80);
    expect(result!.monthlyMetrics.every((m) => codes.has(m.external_code))).toBe(true);
    expect(result!.nps.every((n) => codes.has(n.external_code))).toBe(true);
    expect(result!.clientStatus.every((s) => codes.has(s.external_code))).toBe(true);
    // Nenhum cliente sem histórico: todo mundo tem pelo menos um mês de atendimento.
    const comHistorico = new Set(result!.monthlyMetrics.map((m) => m.external_code));
    expect(comHistorico.size).toBe(80);
  });

  it('uma linha por cliente por mês, sem repetir', () => {
    const chaves = result!.monthlyMetrics.map((m) => `${m.external_code}|${m.period}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('quem cancelou não tem atendimento nem pesquisa depois do mês da saída', () => {
    const depois = (code: string, period: string): boolean => {
      const saida = statusByCode.get(code)?.cancellation_period;
      return saida !== null && saida !== undefined && period > saida;
    };
    expect(result!.monthlyMetrics.filter((m) => depois(m.external_code, m.period))).toEqual([]);
    expect(result!.nps.filter((n) => depois(n.external_code, n.period))).toEqual([]);
  });

  it('MRR: R$ 707.998 seguem recorrendo e R$ 274.966 saíram com os 22 cancelamentos', () => {
    const soma = (ativo: boolean): number =>
      result!.clients
        .filter((c) => (statusByCode.get(c.external_code)?.status === 'cancelled') !== ativo)
        .reduce((total, c) => total + c.monthly_value, 0);
    expect(soma(true)).toBe(707_998);
    expect(soma(false)).toBe(274_966);
    expect(soma(true) + soma(false)).toBe(982_964);
  });

  it('nenhuma contagem vem vazia: só pct_sla_cumprido é N/A, e só sem chamado', () => {
    const vazias = result!.monthlyMetrics.filter(
      (linha) =>
        linha.open_tickets === null ||
        linha.critical_tickets === null ||
        linha.reopened_tickets === null ||
        linha.tickets_within_sla === null ||
        linha.meetings_planned === null ||
        linha.meetings_completed === null,
    );
    expect(vazias).toEqual([]);

    const semPercentual = result!.monthlyMetrics.filter((l) => l.sla_compliance_pct === null);
    expect(semPercentual).toHaveLength(23);
    expect(semPercentual.every((l) => l.open_tickets === 0)).toBe(true);
    // E o contrário também: mês com chamado sempre tem percentual.
    expect(
      result!.monthlyMetrics.filter((l) => l.open_tickets !== 0 && l.sla_compliance_pct === null),
    ).toEqual([]);
  });

  it('pct_sla_cumprido bate com chamados_dentro_sla / chamados_abertos', () => {
    for (const linha of result!.monthlyMetrics) {
      const abertos = linha.open_tickets ?? 0;
      if (abertos === 0) continue;
      const calculado = ((linha.tickets_within_sla ?? 0) / abertos) * 100;
      expect(Math.abs(calculado - (linha.sla_compliance_pct ?? -1))).toBeLessThan(0.15);
    }
  });

  it('contagens de chamados e reuniões nunca passam do total do mês', () => {
    for (const linha of result!.monthlyMetrics) {
      const abertos = linha.open_tickets ?? 0;
      expect(linha.tickets_within_sla ?? 0).toBeLessThanOrEqual(abertos);
      expect(linha.reopened_tickets ?? 0).toBeLessThanOrEqual(abertos);
      expect(linha.critical_tickets ?? 0).toBeLessThanOrEqual(abertos);
      expect(linha.meetings_completed ?? 0).toBeLessThanOrEqual(linha.meetings_planned ?? 0);
    }
  });

  it('NPS: nota só existe com resposta, e a classificação segue a nota', () => {
    for (const pesquisa of result!.nps) {
      if (!pesquisa.answered) {
        expect(pesquisa.score).toBeNull();
        continue;
      }
      const nota = pesquisa.score!;
      expect(nota).toBeGreaterThanOrEqual(0);
      expect(nota).toBeLessThanOrEqual(10);
      const esperada = nota >= 9 ? 'promoter' : nota >= 7 ? 'neutral' : 'detractor';
      expect(pesquisa.classification).toBe(esperada);
    }
  });
});
