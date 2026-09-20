import { describe, expect, it } from 'vitest';

import { headerTokens, normalizeHeader, stripAccents, uniqueHeaders } from './headers.js';

describe('normalização de cabeçalhos', () => {
  it('remove acentos, espaços, caixa e símbolos e gera snake_case', () => {
    expect(normalizeHeader('  Valor Mensal (R$) ')).toBe('valor_mensal_r');
    expect(normalizeHeader('Início do Contrato')).toBe('inicio_do_contrato');
    expect(normalizeHeader('Tempo médio de resolução (h)')).toBe('tempo_medio_de_resolucao_h');
    expect(normalizeHeader('cliente_id')).toBe('cliente_id');
    expect(normalizeHeader('% SLA cumprido')).toBe('sla_cumprido');
    expect(normalizeHeader('---')).toBe('');
  });

  it('stripAccents mantém o resto do texto', () => {
    expect(stripAccents('Reclamações formais')).toBe('Reclamacoes formais');
  });

  it('headerTokens separa por _ e ignora vazios', () => {
    expect(headerTokens('valor_mensal_r')).toEqual(['valor', 'mensal', 'r']);
    expect(headerTokens('')).toEqual([]);
  });

  it('uniqueHeaders preenche vazios e desempata repetidos', () => {
    expect(uniqueHeaders(['a', null, 'a', '', 'b', 'a'])).toEqual([
      'a',
      'coluna_2',
      'a_2',
      'coluna_4',
      'b',
      'a_3',
    ]);
    expect(uniqueHeaders([1, ' x '])).toEqual(['1', 'x']);
  });
});
