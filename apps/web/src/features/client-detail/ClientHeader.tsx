import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import {
  DEFAULT_PRIORITY_WEIGHTS,
  HEALTH_CLASS_LABELS,
  type ClientHealthOverview,
} from '@inovaapss/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HealthPill, PriorityPill } from '@/features/dashboard/HealthPill';
import { formatCurrency, formatInteger, formatPercent } from '@/lib/format';

import { CLIENT_DETAIL_DATA_SOURCE } from './api';
import {
  formatDecimal,
  formatHealthChange,
  formatProjection,
  formatShortDate,
  HEALTH_TREND_TEXT,
} from './format';

export interface ClientHeaderProps {
  overview: ClientHealthOverview;
}

/** Um item do cabeçalho: rótulo, valor grande e o contexto em uma linha (DATAVIZ.md §4.3). */
function HeaderItem({
  label,
  value,
  context,
  children,
}: {
  label: string;
  value: string;
  context?: string | undefined;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold tracking-tight tabular-nums">{value}</span>
          {children}
        </span>
        {context ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{context}</span>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * Cabeçalho §40: nome, plano, contrato, MRR, Health, Risk, Priority e Confiança — cada número
 * com classe, variação ou fórmula ao lado (§57/§58: nunca um score sozinho). Breadcrumb e botão
 * de voltar para quem chegou pelo dashboard (linha do forecast ou "Analisar").
 */
export function ClientHeader({ overview }: ClientHeaderProps) {
  const navigate = useNavigate();
  const { client, plan, contract, score, thresholds } = overview;
  const previousLabel = overview.healthHistory[overview.healthHistory.length - 2]?.label;

  const goBack = () => {
    // Veio de outra tela do app: volta para ela; abriu o link direto: vai para o dashboard.
    if (window.history.length > 1 && window.history.state?.idx > 0) navigate(-1);
    else navigate('/dashboard');
  };

  const contractContext = contract
    ? `${contract.status} desde ${formatShortDate(contract.startDate)}${
        contract.endDate ? ` até ${formatShortDate(contract.endDate)}` : ''
      }${contract.contractedSlaHours !== null ? ` · SLA contratado ${contract.contractedSlaHours} h` : ''}`
    : 'nenhum contrato cadastrado';

  return (
    <header className="mb-6 space-y-5">
      <nav
        aria-label="Você está em"
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <Link
          to="/dashboard"
          className="rounded-sm hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Dashboard
        </Link>
        <ChevronRight aria-hidden="true" className="size-3.5" />
        <Link
          to="/clients"
          className="rounded-sm hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Clientes
        </Link>
        <ChevronRight aria-hidden="true" className="size-3.5" />
        <span aria-current="page" className="truncate text-foreground">
          {client.name}
        </span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{client.name}</h2>
            <Badge variant={client.status === 'Cancelado' ? 'destructive' : 'secondary'}>
              {client.status}
            </Badge>
            {CLIENT_DETAIL_DATA_SOURCE === 'mock' ? (
              <Badge variant="outline">Dados de exemplo (mock)</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[
              client.segment,
              client.size ? `porte ${client.size.toLowerCase()}` : null,
              client.externalCode ? `código ${client.externalCode}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {score
              ? ` · snapshot de ${formatShortDate(score.periodEnd)} · ${score.modelVersion}`
              : ''}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={goBack}>
          <ArrowLeft aria-hidden="true" />
          Voltar
        </Button>
      </div>

      <dl
        aria-label="Resumo do cliente"
        className="grid grid-cols-2 gap-x-8 gap-y-5 border-b border-border pb-6 md:grid-cols-4"
      >
        <HeaderItem
          label="Plano"
          value={plan?.name ?? '—'}
          context={plan ? undefined : 'sem plano cadastrado'}
        />
        <HeaderItem label="Contrato" value={contract?.code ?? '—'} context={contractContext} />
        <HeaderItem
          label="MRR"
          value={formatCurrency(overview.mrr)}
          context={`por mês · impacto comercial ${score?.commercialImpactScore !== null && score?.commercialImpactScore !== undefined ? `${formatInteger(score.commercialImpactScore)}/100` : 'desconhecido'}`}
        />
        <HeaderItem
          label="Confiança"
          value={score ? formatPercent(score.analysisConfidence) : '—'}
          context={
            score
              ? `${score.metricsAvailable} de ${score.metricsTotal} métricas avaliadas · dado ausente reduz a confiança, não a saúde`
              : 'sem cálculo ainda'
          }
        />

        {score ? (
          <>
            <HeaderItem
              label="Health"
              value={
                score.overallHealth === null ? '—' : `${formatInteger(score.overallHealth)}/100`
              }
              context={`${formatHealthChange(score, previousLabel)} · ${HEALTH_TREND_TEXT[score.trend]} · ${formatProjection(score)}`}
            >
              {score.healthClass ? <HealthPill healthClass={score.healthClass} /> : null}
            </HeaderItem>
            <HeaderItem
              label="Risk"
              value={score.riskScore === null ? '—' : `${formatInteger(score.riskScore)}/100`}
              context={`= 100 − health (§26) · classes: Crítico abaixo de ${thresholds.critical}, Risco abaixo de ${thresholds.risk}, Atenção abaixo de ${thresholds.attention}`}
            />
            <HeaderItem
              label="Prioridade"
              value={
                score.priorityScore === null ? '—' : `${formatInteger(score.priorityScore)}/100`
              }
              context={`risco × ${formatDecimal(DEFAULT_PRIORITY_WEIGHTS.risk, 1)} + impacto comercial × ${formatDecimal(DEFAULT_PRIORITY_WEIGHTS.impact, 1)}${score.priorityFloor !== null ? ` · piso ${formatInteger(score.priorityFloor)} por gatilho` : ''}`}
            >
              {score.priorityClass ? <PriorityPill priorityClass={score.priorityClass} /> : null}
            </HeaderItem>
            <HeaderItem
              label="Classe atual"
              value={score.healthClass ? HEALTH_CLASS_LABELS[score.healthClass] : '—'}
              context={
                score.projectedClass &&
                score.healthClass &&
                score.projectedClass !== score.healthClass
                  ? `deve ir para ${HEALTH_CLASS_LABELS[score.projectedClass]} no próximo ${overview.periodLabel}`
                  : `deve continuar em ${score.healthClass ? HEALTH_CLASS_LABELS[score.healthClass] : '—'} no próximo ${overview.periodLabel}`
              }
            />
          </>
        ) : (
          <HeaderItem
            label="Health"
            value="—"
            context="ainda sem snapshot: importe os dados do cliente para calcular"
          />
        )}
      </dl>
    </header>
  );
}
