import { describe, expect, it } from 'vitest';

import {
  coerceBoolean,
  coerceDate,
  coerceEnum,
  coerceInteger,
  coerceNumber,
  coercePeriod,
  coerceText,
  dateToYmd,
  excelSerialToDate,
  isBlank,
  toIsoDate,
} from './coerce.js';

const ok = <T>(value: T | null) => ({ ok: true, value });

describe('isBlank', () => {
  it('reconhece vazio', () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank('')).toBe(true);
    expect(isBlank('   ')).toBe(true);
    expect(isBlank(Number.NaN)).toBe(true);
    expect(isBlank(0)).toBe(false);
    expect(isBlank('0')).toBe(false);
    expect(isBlank(false)).toBe(false);
  });
});

describe('coerceText', () => {
  it('apara espaços, converte números e datas, rejeita objetos', () => {
    expect(coerceText('  C001 ')).toEqual(ok('C001'));
    expect(coerceText(12)).toEqual(ok('12'));
    expect(coerceText('')).toEqual(ok(null));
    expect(coerceText(new Date(Date.UTC(2025, 0, 15)))).toEqual(ok('2025-01-15'));
    expect(coerceText({ a: 1 }).ok).toBe(false);
  });
});

describe('coerceNumber', () => {
  it('aceita número, vírgula decimal, milhar, R$ e %', () => {
    expect(coerceNumber(9800)).toEqual(ok(9800));
    expect(coerceNumber('1234.56')).toEqual(ok(1234.56));
    expect(coerceNumber('1.234,56')).toEqual(ok(1234.56));
    expect(coerceNumber('1,234.56')).toEqual(ok(1234.56));
    expect(coerceNumber('64,3%')).toEqual(ok(64.3));
    expect(coerceNumber('R$ 9.800,00')).toEqual(ok(9800));
    expect(coerceNumber(' -12,5 ')).toEqual(ok(-12.5));
    expect(coerceNumber('+7')).toEqual(ok(7));
    expect(coerceNumber('−3')).toEqual(ok(-3));
    expect(coerceNumber(true)).toEqual(ok(1));
    expect(coerceNumber('')).toEqual(ok(null));
  });

  it('rejeita texto, infinito e objetos', () => {
    expect(coerceNumber('abc').ok).toBe(false);
    expect(coerceNumber('1.2.3').ok).toBe(false);
    expect(coerceNumber(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(coerceNumber({}).ok).toBe(false);
    const result = coerceNumber('doze');
    expect(result.ok === false && result.message).toContain('"doze"');
  });
});

describe('coerceInteger', () => {
  it('aceita inteiros e rejeita decimais', () => {
    expect(coerceInteger('14')).toEqual(ok(14));
    expect(coerceInteger('14.0')).toEqual(ok(14));
    expect(coerceInteger(null)).toEqual(ok(null));
    expect(coerceInteger('14,5').ok).toBe(false);
    expect(coerceInteger('x').ok).toBe(false);
  });
});

describe('coerceBoolean', () => {
  it('aceita 0/1, sim/não, true/false, s/n', () => {
    expect(coerceBoolean(1)).toEqual(ok(true));
    expect(coerceBoolean(0)).toEqual(ok(false));
    expect(coerceBoolean('1')).toEqual(ok(true));
    expect(coerceBoolean('Sim')).toEqual(ok(true));
    expect(coerceBoolean('NÃO')).toEqual(ok(false));
    expect(coerceBoolean('não')).toEqual(ok(false));
    expect(coerceBoolean('true')).toEqual(ok(true));
    expect(coerceBoolean('n')).toEqual(ok(false));
    expect(coerceBoolean(false)).toEqual(ok(false));
    expect(coerceBoolean('')).toEqual(ok(null));
  });

  it('rejeita outros valores', () => {
    expect(coerceBoolean(2).ok).toBe(false);
    expect(coerceBoolean('talvez').ok).toBe(false);
    expect(coerceBoolean({}).ok).toBe(false);
  });
});

describe('coercePeriod', () => {
  it('normaliza vários formatos para AAAA-MM', () => {
    expect(coercePeriod('2025-03')).toEqual(ok('2025-03'));
    expect(coercePeriod('2025-3')).toEqual(ok('2025-03'));
    expect(coercePeriod('2025/03')).toEqual(ok('2025-03'));
    expect(coercePeriod('2025-03-15')).toEqual(ok('2025-03'));
    expect(coercePeriod('2025-03-15T00:00:00.000Z')).toEqual(ok('2025-03'));
    expect(coercePeriod('03/2025')).toEqual(ok('2025-03'));
    expect(coercePeriod('15/03/2025')).toEqual(ok('2025-03'));
    expect(coercePeriod('202503')).toEqual(ok('2025-03'));
    expect(coercePeriod('mar/2025')).toEqual(ok('2025-03'));
    expect(coercePeriod('Março 2025')).toEqual(ok('2025-03'));
    expect(coercePeriod('dez-25')).toEqual(ok('2025-12'));
    expect(coercePeriod(new Date(Date.UTC(2026, 5, 1)))).toEqual(ok('2026-06'));
    expect(coercePeriod(45658)).toEqual(ok('2025-01')); // serial do Excel: 2025-01-01
    expect(coercePeriod(null)).toEqual(ok(null));
  });

  it('rejeita o que não é período', () => {
    expect(coercePeriod('2025-13').ok).toBe(false);
    expect(coercePeriod('xyz/2025').ok).toBe(false);
    expect(coercePeriod('abc').ok).toBe(false);
    expect(coercePeriod(12).ok).toBe(false);
    expect(coercePeriod(new Date('nada')).ok).toBe(false);
    expect(coercePeriod({}).ok).toBe(false);
  });
});

describe('coerceDate', () => {
  it('normaliza para AAAA-MM-DD', () => {
    expect(coerceDate('2020-09-01')).toEqual(ok('2020-09-01'));
    expect(coerceDate('01/09/2020')).toEqual(ok('2020-09-01'));
    expect(coerceDate('2020-09')).toEqual(ok('2020-09-01'));
    expect(coerceDate(new Date(Date.UTC(2020, 8, 1)))).toEqual(ok('2020-09-01'));
    expect(coerceDate(44075)).toEqual(ok('2020-09-01'));
    expect(coerceDate('')).toEqual(ok(null));
  });

  it('rejeita dias inválidos', () => {
    expect(coerceDate('31/02/2025').ok).toBe(false);
    expect(coerceDate('2025-02-30').ok).toBe(false);
  });
});

describe('coerceEnum', () => {
  const values = { ativo: 'active', cancelado: 'cancelled' };

  it('normaliza e traduz para o canônico', () => {
    expect(coerceEnum('Ativo', values)).toEqual(ok('active'));
    expect(coerceEnum(' CANCELADO ', values)).toEqual(ok('cancelled'));
    expect(coerceEnum(null, values)).toEqual(ok(null));
  });

  it('rejeita valor fora da lista com a lista aceita na mensagem', () => {
    const result = coerceEnum('Suspenso', values);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('active, cancelled');
    expect(coerceEnum({}, values).ok).toBe(false);
  });
});

describe('datas do Excel e calendário de um Date', () => {
  it('converte serial em Date UTC e de volta', () => {
    expect(toIsoDate(excelSerialToDate(45658))).toBe('2025-01-01');
    expect(toIsoDate(excelSerialToDate(25569))).toBe('1970-01-01');
  });

  it('meia-noite local (SheetJS, com desvio de segundos) e meia-noite UTC (JSON) dão o mesmo dia', () => {
    expect(dateToYmd(new Date(2020, 1, 1, 0, 0, 28))).toEqual({ year: 2020, month: 2, day: 1 });
    expect(dateToYmd(new Date(2020, 1, 1, 23, 59, 59, 999))).toEqual({
      year: 2020,
      month: 2,
      day: 2,
    });
    expect(dateToYmd(new Date('2020-02-01T00:00:00.000Z'))).toEqual({
      year: 2020,
      month: 2,
      day: 1,
    });
    // Meio do dia: vale o calendário local.
    const noon = new Date(2020, 1, 1, 12, 30);
    expect(dateToYmd(noon)).toEqual({ year: 2020, month: 2, day: 1 });
  });
});
