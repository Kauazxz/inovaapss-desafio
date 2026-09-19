import { describe, expect, it } from 'vitest';

import {
  analyzeNpsResponses,
  criticalTicketRate,
  missedMeetingRate,
  missedMeetings,
  npsHealth,
  reopenRate,
  slaCompliancePct,
} from './derived.js';

describe('métricas derivadas (§13–§22, §70)', () => {
  it('critical_ticket_rate = críticos / max(abertos, 1) × 100', () => {
    expect(criticalTicketRate(3, 10)).toBe(30);
    expect(criticalTicketRate(2, 0)).toBe(200);
    expect(criticalTicketRate(0, 0)).toBe(0);
    expect(criticalTicketRate(null, 10)).toBeNull();
    expect(criticalTicketRate(-1, 10)).toBeNull();
  });

  it('reopen_rate = reabertos / max(abertos, 1) × 100', () => {
    expect(reopenRate(1, 4)).toBe(25);
    expect(reopenRate(2, null)).toBeNull();
  });

  it('sla_compliance_pct usa o percentual informado ou deriva', () => {
    expect(slaCompliancePct(8, 10)).toBe(80);
    expect(slaCompliancePct(8, 10, 95)).toBe(95);
    expect(slaCompliancePct(8, 10, 120)).toBe(100);
    expect(slaCompliancePct(null, 10)).toBeNull();
  });

  it('reuniões previstas = 0 → N/A (nem saudável nem crítico)', () => {
    expect(missedMeetingRate(0, 0)).toBeNull();
    expect(missedMeetings(0, 0)).toBeNull();
    expect(missedMeetingRate(4, 2)).toBe(50);
    expect(missedMeetings(4, 2)).toBe(2);
    expect(missedMeetingRate(4, 6)).toBe(0);
    expect(missedMeetingRate(null, 2)).toBeNull();
    expect(missedMeetings(null, 2)).toBeNull();
  });

  it('NPS respondido = clamp(nota × 10); não respondido = N/A, nunca zero', () => {
    expect(npsHealth(true, 9)).toBe(90);
    expect(npsHealth(true, 12)).toBe(100);
    expect(npsHealth(true, -1)).toBe(0);
    expect(npsHealth(false, 9)).toBeNull();
    expect(npsHealth(null, 9)).toBeNull();
    expect(npsHealth(true, null)).toBeNull();
    expect(npsHealth(false, 0)).not.toBe(0);
  });

  it('analisa a sequência sem resposta e a mudança de comportamento', () => {
    const changed = analyzeNpsResponses([
      { answered: true, score: 9 },
      { answered: true, score: 8 },
      { answered: false, score: null },
      { answered: false, score: null },
    ]);
    expect(changed.health).toBeNull();
    expect(changed.answered).toBe(false);
    expect(changed.consecutiveUnanswered).toBe(2);
    expect(changed.responseRate).toBe(0.5);
    expect(changed.lastAnsweredScore).toBe(8);
    expect(changed.periodsSinceLastAnswer).toBe(2);
    expect(changed.behaviorChanged).toBe(true);
    expect(changed.reason).toMatch(/mudança de comportamento/);

    const never = analyzeNpsResponses([
      { answered: false, score: null },
      { answered: false, score: null },
      { answered: false, score: null },
    ]);
    expect(never.behaviorChanged).toBe(false);
    expect(never.consecutiveUnanswered).toBe(3);
    expect(never.lastAnsweredScore).toBeNull();
    expect(never.reason).toMatch(/há 3 período/);

    const answered = analyzeNpsResponses([
      { answered: false, score: null },
      { answered: true, score: 7 },
    ]);
    expect(answered.health).toBe(70);
    expect(answered.consecutiveUnanswered).toBe(0);
    expect(answered.reason).toMatch(/nota 7/);

    expect(analyzeNpsResponses([]).reason).toMatch(/Sem histórico/);
    expect(analyzeNpsResponses([{ answered: true, score: null }]).reason).toMatch(/nota —/);
  });
});
