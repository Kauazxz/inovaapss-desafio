import type { ClientHealthOverview } from '@inovaapss/shared';

import { DimensionTab, type DimensionChartSpec } from './DimensionTab';

const CHARTS: readonly DimensionChartSpec[] = [
  { metricKey: 'sla_compliance', domainMax: 100, annotateWorstStep: true },
  {
    metricKey: 'resolution_vs_sla',
    reference: (_score, overview) =>
      overview.contract?.contractedSlaHours != null
        ? {
            value: overview.contract.contractedSlaHours,
            label: `SLA contratado ${overview.contract.contractedSlaHours} h`,
          }
        : undefined,
  },
];

/** Aba "SLA" (§40): cumprimento agregado (§16) e tempo de resolução contra o SLA contratado (§14). */
export function SlaTab({ overview }: { overview: ClientHealthOverview }) {
  return (
    <DimensionTab
      overview={overview}
      charts={CHARTS}
      intro="Cumprimento de SLA é a performance agregada do cliente (peso 12 %); tempo de resolução vs. SLA é o prazo por chamado contra o SLA contratado e a meta operacional (peso 16 %) — são métricas diferentes, sem dupla contagem (§23)."
      loadingLabel="Carregando a aba SLA"
    />
  );
}
