/**
 * O briefing é o que o Agente sabe. Se um número não entra aqui, o Agente não pode respondê-lo —
 * então estes testes são sobre COBERTURA do relatório, não sobre formatação bonita.
 */
import { describe, expect, it } from 'vitest';

import { makeGeneral, makeRankingRow, makeRisk } from './fixtures.js';
import {
  BRIEFING_RANKING_LIMIT,
  buildBriefing,
  buildDocumentSection,
  DOCUMENT_CONTEXT_CHARS,
} from '../briefing.js';

const build = (risk = makeRisk(), general = makeGeneral()) =>
  buildBriefing({ organizationName: 'GlobalSys', risk, general });

describe('buildBriefing', () => {
  it('abre identificando a organização e o período dos dados', () => {
    const text = build();
    expect(text).toContain('GlobalSys');
    expect(text).toContain('2026-06-30');
  });

  it('traz os KPIs com a variação e o sinal', () => {
    const text = build();
    expect(text).toContain('Clientes ativos: 58');
    expect(text).toContain('-2');
    expect(text).toContain('Em estado Crítico: 2');
    expect(text).toContain('+1');
    expect(text).toContain('MRR ameaçado');
    expect(text).toContain('BRL 154.000');
    expect(text).toContain('BRL 707.998');
  });

  it('traz a distribuição por classe com os rótulos em português', () => {
    const text = build();
    expect(text).toContain('Crítico: 2 clientes');
    expect(text).toContain('Normal: 30 clientes');
    expect(text).toContain('17,2%');
  });

  it('explica as faixas, para o Agente não inventar limite', () => {
    const text = build();
    expect(text).toContain('Normal a partir de 80');
    expect(text).toContain('Risco a partir de 40');
  });

  it('traz as dimensões e a evolução da carteira', () => {
    const text = build();
    expect(text).toContain('SLA: 54,3');
    expect(text).toContain('NPS: 71,2');
    expect(text).toContain('mai/26: 68,1');
    expect(text).toContain('jun/26: 66,4');
  });

  it('descreve cada cliente do ranking com o que sustenta uma resposta', () => {
    const text = build();
    expect(text).toContain('1. Alfa Ltda');
    expect(text).toContain('classe Crítico');
    expect(text).toContain('saúde 38,2');
    expect(text).toContain('prioridade 87,4');
    expect(text).toContain('tendência piorando');
    expect(text).toContain('MRR BRL 12.000');
    expect(text).toContain('plano Enterprise');
    // Os motivos e a ação são o "por quê" e o "o que fazer" (§1).
    expect(text).toContain('Tempo de resolução 3x acima do SLA contratado.');
    expect(text).toContain('Ação sugerida: Agendar call com o patrocinador');
  });

  it('avisa quando a projeção cruza para baixo', () => {
    const risk = makeRisk({
      ranking: [
        makeRankingRow({
          currentClass: 'ATTENTION',
          projectedClass: 'RISK',
          healthProjected: 52.7,
          crossesDown: true,
        }),
      ],
    });
    const text = build(risk);
    expect(text).toContain('ATENÇÃO: a projeção leva de Atenção para Risco');
    expect(text).toContain('52,7');
  });

  it('não inventa projeção quando não há histórico', () => {
    const risk = makeRisk({
      ranking: [makeRankingRow({ crossesDown: true, projectedClass: null, healthProjected: null })],
    });
    expect(build(risk)).not.toContain('a projeção leva');
  });

  it('diz que ninguém precisa de atenção quando o ranking está vazio', () => {
    const text = build(makeRisk({ ranking: [] }));
    expect(text).toContain('Nenhum cliente precisa de atenção neste momento.');
  });

  it('corta o ranking no limite e avisa que cortou', () => {
    const ranking = Array.from({ length: BRIEFING_RANKING_LIMIT + 5 }, (_, index) =>
      makeRankingRow({
        clientId: `c${index}`,
        clientName: `Cliente ${index}`,
        position: index + 1,
      }),
    );
    const text = build(makeRisk({ ranking }));
    expect(text).toContain(`Cliente ${BRIEFING_RANKING_LIMIT - 1}`);
    expect(text).not.toContain(`Cliente ${BRIEFING_RANKING_LIMIT + 1}`);
    expect(text).toContain('A lista completa tem 30 clientes');
  });

  it('diz "sem dado" em vez de zero quando a saúde não foi medida', () => {
    const general = makeGeneral({
      dimensions: [{ key: 'SLA', label: 'SLA', health: null, clientCount: 0 }],
    });
    expect(build(makeRisk(), general)).toContain('SLA: sem dado');
  });
});

describe('buildDocumentSection', () => {
  it('delimita o documento e o identifica pelo nome', () => {
    const section = buildDocumentSection({ fileName: 'sla.pdf', text: 'Resolver em até 8 horas.' });
    expect(section).toContain('Documento anexado: sla.pdf');
    expect(section).toContain('--- início do documento ---');
    expect(section).toContain('Resolver em até 8 horas.');
    expect(section).toContain('--- fim do documento ---');
  });

  it('corta documento longo e avisa que cortou', () => {
    const section = buildDocumentSection({
      fileName: 'manual.pdf',
      text: 'x'.repeat(DOCUMENT_CONTEXT_CHARS + 100),
    });
    expect(section).toContain('texto cortado no limite de contexto');
    expect(section.length).toBeLessThan(DOCUMENT_CONTEXT_CHARS + 500);
  });
});
