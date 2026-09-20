import { ArrowRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';

import {
  HEALTH_CLASS_LABELS,
  PROJECTION_CONFIDENCE_LABELS,
  type RankingRow,
} from '@inovaapss/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/clients/components/dialog';
import { formatCurrency, formatInteger, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

import { HEALTH_STATUS_LABELS } from './health-labels';
import { HealthPill, PriorityPill } from './HealthPill';

/** Um número do painel, com o rótulo em cima e o contexto embaixo. */
function Figure({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-2xl font-semibold tracking-tight whitespace-nowrap',
          emphasis && 'text-destructive',
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-xs whitespace-normal text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

/**
 * Prévia do caso, aberta pelo "Analisar" do ranking: responde "como está, para onde vai, por quê e
 * o que fazer" sem tirar a pessoa da fila de prioridade. Quem quiser o histórico inteiro abre o
 * cliente pelo botão do rodapé.
 */
export function ClientPreviewDialog({
  row,
  onOpenChange,
  onOpenFullCase,
}: {
  /** Linha do ranking em análise; `null` mantém o painel fechado. */
  row: RankingRow | null;
  onOpenChange: (open: boolean) => void;
  onOpenFullCase: (clientId: string) => void;
}) {
  if (row === null) return null;

  const TrendIcon = row.trend === 'down' ? TrendingDown : row.trend === 'up' ? TrendingUp : Minus;
  const trendText =
    row.trend === 'down'
      ? 'em queda'
      : row.trend === 'up'
        ? 'em melhora'
        : row.trend === 'stable'
          ? 'estável'
          : 'sem tendência definida';

  // A primeira evidência já aparece em destaque no topo; a lista mostra as seguintes.
  const outrasEvidencias = row.evidences.filter((evidencia) => evidencia !== row.topEvidence);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" aria-describedby="previa-resumo">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <PriorityPill priorityClass={row.priorityClass} />
            <HealthPill healthClass={row.currentClass} />
            <span className="text-xs text-muted-foreground">
              {row.position}º na fila · prioridade {formatInteger(row.priorityScore)}/100
            </span>
          </div>
          <DialogTitle className="text-xl">{row.clientName}</DialogTitle>
          <DialogDescription id="previa-resumo">
            {row.plan} · {row.segment} · {row.size} · período {row.periodEnd}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          <Figure
            label="Saúde atual"
            value={`${formatInteger(row.healthCurrent)}/100`}
            hint={`${HEALTH_CLASS_LABELS[row.currentClass]} · ${trendText}`}
          />
          <Figure
            label="Saúde projetada"
            value={row.healthProjected === null ? '—' : `${formatInteger(row.healthProjected)}/100`}
            hint={
              row.healthProjected === null
                ? 'histórico insuficiente'
                : `${HEALTH_STATUS_LABELS[row.projectedClass ?? row.currentClass]} · confiança ${PROJECTION_CONFIDENCE_LABELS[row.projectionConfidence]}`
            }
            emphasis={row.crossesDown}
          />
          <Figure
            label="Risco de cancelamento"
            value={`${formatInteger(row.riskScore)}/100`}
            hint="é a saúde invertida, não uma probabilidade"
          />
          <Figure
            label="Valor mensal"
            value={formatCurrency(row.mrr)}
            hint={`${formatCurrency((row.mrr * row.riskScore) / 100)} ponderados pelo score`}
          />
        </div>

        <div className="flex items-center gap-2 rounded-2xl bg-muted/50 px-4 py-3 text-sm">
          <TrendIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            Confiança dos dados: <strong>{formatPercent(row.confidence)}</strong> — cobertura e
            atualidade das informações que geraram esta nota.
          </span>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Por que está assim</h3>
          <p className="rounded-2xl bg-card px-4 py-3 text-sm ring-1 ring-foreground/5">
            {row.topEvidence}
          </p>
          {outrasEvidencias.length > 0 ? (
            <ul className="space-y-1 pl-1 text-sm text-muted-foreground">
              {outrasEvidencias.map((evidencia) => (
                <li key={evidencia} className="flex gap-2">
                  <span aria-hidden="true">·</span>
                  <span className="min-w-0">{evidencia}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">O que fazer agora</h3>
          <p className="rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground">
            {row.suggestedAction}
          </p>
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button type="button" onClick={() => onOpenFullCase(row.clientId)}>
            Ver o caso completo
            <ArrowRight aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
