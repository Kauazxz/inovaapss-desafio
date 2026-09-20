import type { ClientHealthOverview } from '@inovaapss/shared';

import { DimensionTab, type DimensionChartSpec } from './DimensionTab';

const CHARTS: readonly DimensionChartSpec[] = [
  { metricKey: 'platform_usage', domainMax: 100, annotateWorstStep: true },
];

/** Aba "Uso" (§40): uso da plataforma por período, baseline em cinza e a maior queda anotada (§15). */
export function UsageTab({ overview }: { overview: ClientHealthOverview }) {
  return (
    <DimensionTab
      overview={overview}
      charts={CHARTS}
      intro="Uso da plataforma (peso 14 %): valor atual contra o baseline do próprio cliente; sequência de queda pesa na tendência e na persistência (§15)."
      loadingLabel="Carregando a aba Uso"
    />
  );
}
