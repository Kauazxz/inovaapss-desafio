import type { ClientHealthOverview } from '@inovaapss/shared';

import { DimensionTab, type DimensionChartSpec } from './DimensionTab';

const CHARTS: readonly DimensionChartSpec[] = [
  {
    metricKey: 'payment_delay',
    reference: () => ({ value: 30, label: 'alerta a partir de 30 dias' }),
    annotateWorstStep: true,
  },
];

/** Aba "Financeiro" (§40): dias de atraso de pagamento por período (§20). */
export function FinancialTab({ overview }: { overview: ClientHealthOverview }) {
  return (
    <DimensionTab
      overview={overview}
      charts={CHARTS}
      intro="Atraso de pagamento (peso 6 %): dias de atraso no período, com recorrência e persistência (§20). Zero é pagamento em dia; período sem dado fica sem ponto."
      loadingLabel="Carregando a aba Financeiro"
    />
  );
}
