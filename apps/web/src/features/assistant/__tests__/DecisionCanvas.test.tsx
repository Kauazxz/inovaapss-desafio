import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import type { AssistantCanvas } from '@inovaapss/shared';

import { DecisionCanvas } from '../DecisionCanvas';

const CANVAS: AssistantCanvas = {
  preset: 'risk',
  title: 'Radar de risco e ação',
  summary: 'Duas contas exigem atenção imediata.',
  generatedAt: '2026-06-30',
  widgets: [
    {
      type: 'metrics',
      title: 'Sinais de risco agora',
      items: [
        {
          label: 'Clientes críticos',
          value: 2,
          delta: 1,
          format: 'integer',
          tone: 'critical',
        },
      ],
    },
    {
      type: 'priorities',
      title: 'Quem acionar primeiro',
      rows: [
        {
          position: 1,
          clientId: 'client-1',
          clientName: 'Alfa Ltda',
          mrr: 12_000,
          currency: 'BRL',
          priorityScore: 94,
          priorityClass: 'P0',
          healthCurrent: 38.2,
          healthProjected: 32.1,
          currentClass: 'CRITICAL',
          projectedClass: 'CRITICAL',
          slopePerPeriod: -3.1,
          trendWindow: 3,
          periodsAvailable: 6,
          confidence: 82,
          projectionConfidence: 'high',
          crossesDown: false,
          periodEnd: '2026-06-30',
          riskScore: 91,
          trend: 'down',
          topEvidence: 'SLA e uso deterioraram no período.',
          suggestedAction: 'Agendar reunião executiva hoje.',
          evidences: ['SLA e uso deterioraram no período.'],
          plan: 'Enterprise',
          segment: 'Indústria',
          size: 'Grande',
          status: 'active',
        },
      ],
    },
  ],
};

describe('DecisionCanvas', () => {
  it('mostra os dados verificados e leva da prioridade ao cliente', () => {
    render(
      <MemoryRouter>
        <DecisionCanvas canvas={CANVAS} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Radar de risco e ação')).toBeInTheDocument();
    expect(screen.getByText('Dados verificados pelo motor')).toBeInTheDocument();
    expect(screen.getByText('Clientes críticos')).toBeInTheDocument();
    expect(screen.getByText('Alfa Ltda')).toBeInTheDocument();
    expect(screen.getByText(/Agendar reunião executiva hoje/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analisar Alfa Ltda' })).toHaveAttribute(
      'href',
      '/clients/client-1',
    );
  });
});
