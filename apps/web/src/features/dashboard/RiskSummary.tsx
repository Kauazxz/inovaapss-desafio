import { formatCompactCurrency, formatInteger } from '@/lib/format';

import type { MOCK_RISK_SUMMARY } from '@/lib/mock/dashboard';

interface RiskSummaryProps {
  summary: typeof MOCK_RISK_SUMMARY;
}

/**
 * Os 4 números da aba "Em risco" em texto simples, numa linha (DATAVIZ.md §4.1).
 * São 4 números — um gráfico esconderia o valor. A classe vai escrita, não só em cor.
 */
export function RiskSummary({ summary }: RiskSummaryProps) {
  const items = [
    { label: 'Clientes ativos', value: formatInteger(summary.activeClients) },
    { label: 'Em Crítico', value: formatInteger(summary.criticalClients) },
    { label: 'Em Risco', value: formatInteger(summary.riskClients) },
    { label: 'MRR em risco', value: formatCompactCurrency(summary.mrrAtRisk) },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-border pb-6 md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-3xl font-semibold tracking-tight">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
