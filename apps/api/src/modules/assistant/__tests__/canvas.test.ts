import { describe, expect, it } from 'vitest';

import { makeGeneral, makeRankingRow, makeRisk } from './fixtures.js';
import { buildAssistantCanvas, inferCanvasPreset } from '../canvas.js';

describe('Canvas de Decisão', () => {
  it('deixa a IA escolher só o preset e preenche os widgets com dados do dashboard', () => {
    const risk = makeRisk({ ranking: [makeRankingRow({ clientName: 'Alfa Ltda' })] });
    const general = makeGeneral();

    const canvas = buildAssistantCanvas('risk', risk, general);

    expect(canvas).toMatchObject({ preset: 'risk', title: 'Radar de risco e ação' });
    expect(canvas.summary).toContain(String(risk.kpis.criticalClients.value));
    expect(canvas.widgets.map((widget) => widget.type)).toEqual([
      'metrics',
      'forecast',
      'priorities',
    ]);
    const priorities = canvas.widgets.find((widget) => widget.type === 'priorities');
    expect(priorities?.rows[0]?.clientName).toBe('Alfa Ltda');
  });

  it('escolhe fallback previsível a partir da pergunta', () => {
    expect(inferCanvasPreset('Quanto MRR está ameaçado?')).toBe('revenue');
    expect(inferCanvasPreset('Qual dimensão está pior: SLA ou NPS?')).toBe('dimensions');
    expect(inferCanvasPreset('Quem pode cancelar no próximo mês?')).toBe('forecast');
    expect(inferCanvasPreset('Com quem falar primeiro?')).toBe('risk');
    expect(inferCanvasPreset('Como está a carteira?')).toBe('portfolio');
  });
});
