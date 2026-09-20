import type { ClientHealthOverview } from '@inovaapss/shared';

import { DimensionTab, type DimensionChartSpec } from './DimensionTab';

const CHARTS: readonly DimensionChartSpec[] = [
  { metricKey: 'critical_tickets', annotateWorstStep: true },
  { metricKey: 'open_tickets' },
  { metricKey: 'reopened_tickets' },
  { metricKey: 'formal_complaints' },
];

/** Aba "Atendimento" (§40): chamados críticos, abertos, reabertos e reclamações formais por período. */
export function SupportTab({ overview }: { overview: ClientHealthOverview }) {
  return (
    <DimensionTab
      overview={overview}
      charts={CHARTS}
      intro="Chamados críticos (peso 18 %), abertos (7 %), reabertos (10 %) e reclamações formais (9 %), sempre comparados com o baseline do próprio cliente (§13, §17–§19)."
      loadingLabel="Carregando a aba Atendimento"
    />
  );
}
