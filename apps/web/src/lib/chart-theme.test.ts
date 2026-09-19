import { describe, expect, it } from 'vitest';

import { bandFill, CHART_MARKS, CHART_PALETTES, withOpacity } from './chart-theme';

describe('chart-theme', () => {
  it('materializa os tokens de DATAVIZ.md §2.1 nos dois modos', () => {
    expect(CHART_PALETTES.light.accent).toBe('#2a78d6');
    expect(CHART_PALETTES.dark.accent).toBe('#3987e5');
    expect(CHART_PALETTES.light.neutral).toBe('#c3c2b7');
    expect(CHART_PALETTES.dark.neutral).toBe('#52514e');
    // As cores de classe são as mesmas nos dois modos.
    expect(CHART_PALETTES.light.classes).toEqual(CHART_PALETTES.dark.classes);
  });

  it('converte hex em rgba para as faixas de fundo', () => {
    expect(withOpacity('#2a78d6', 0.5)).toBe('rgba(42, 120, 214, 0.5)');
    expect(bandFill(CHART_PALETTES.light, 'CRITICAL')).toBe(
      `rgba(208, 59, 59, ${CHART_MARKS.bandFillOpacity})`,
    );
  });

  it('respeita os tamanhos mínimos do guia', () => {
    expect(CHART_MARKS.barMaxThickness).toBeLessThanOrEqual(24);
    expect(CHART_MARKS.minHeight).toBe(160);
  });
});
