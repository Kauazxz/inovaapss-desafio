/**
 * Alertas (§27): gatilhos críticos disparados, com o motivo, quanto está em jogo e o que fazer.
 *
 * Peso e gatilho são coisas diferentes: o peso entra no cálculo da saúde, o gatilho pede ação
 * imediata. Por isso esta tela é uma fila de trabalho, não um painel.
 */
import { AlertTriangle, BellOff, Check, Eye, Info, Mail, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import {
  ALERT_SEVERITY_LABELS,
  ALERT_STATUS_LABELS,
  type AlertDto,
  type AlertSeverity,
} from '@inovaapss/shared';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatInteger } from '@/lib/format';
import { cn } from '@/lib/utils';

import { useAlerts, useSendDigest, useUpdateAlertStatus, type DigestSendResult } from './api';

import type React from 'react';

const SEVERITY_STYLE: Readonly<Record<AlertSeverity, { dot: string; icon: typeof Info }>> = {
  CRITICAL: { dot: 'bg-class-critical', icon: TriangleAlert },
  WARNING: { dot: 'bg-class-risk', icon: AlertTriangle },
  INFO: { dot: 'bg-class-attention', icon: Info },
};

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      {/* Igual ao KpiRow: figuras proporcionais (DATAVIZ.md §2.2) e sem quebra no meio. */}
      <div className="mt-0.5 text-2xl font-semibold tracking-tight whitespace-nowrap">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function AlertRow({
  alert,
  onOpenClient,
  onStatus,
  saving,
}: {
  alert: AlertDto;
  onOpenClient: (clientId: string) => void;
  onStatus: (id: string, status: 'acknowledged' | 'resolved') => void;
  saving: boolean;
}) {
  const style = SEVERITY_STYLE[alert.severity];
  const tratado = alert.status !== 'open';

  return (
    <li
      className={cn('flex items-start gap-3 px-4 py-3 sm:px-5', tratado && 'opacity-55')}
      data-alert-id={alert.id}
    >
      {/* A cor diz a severidade; o nome dela vem escrito ao lado, nunca só a cor. */}
      <span aria-hidden="true" className={cn('mt-1.5 size-2 shrink-0 rounded-full', style.dot)} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate font-medium">{alert.clientName}</span>
          <span className="text-xs text-muted-foreground">
            {ALERT_SEVERITY_LABELS[alert.severity]}
            {tratado ? ` · ${ALERT_STATUS_LABELS[alert.status]}` : ''}
          </span>
        </div>
        <p className="truncate text-sm text-muted-foreground" title={alert.description}>
          {alert.description}
        </p>
        {alert.suggestedAction ? (
          <p className="truncate text-xs text-muted-foreground" title={alert.suggestedAction}>
            <span className="text-foreground">O que fazer:</span> {alert.suggestedAction}
          </p>
        ) : null}
        {/* No celular o valor não cabe na coluna da direita: ele vem aqui embaixo. */}
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums md:hidden">
          {formatCurrency(alert.mrr)}/mês · saúde{' '}
          {alert.healthScore === null ? '—' : formatInteger(alert.healthScore)}
        </p>
      </div>

      <div className="hidden shrink-0 text-right md:block">
        <div className="text-sm tabular-nums">{formatCurrency(alert.mrr)}/mês</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          saúde {alert.healthScore === null ? '—' : `${formatInteger(alert.healthScore)}/100`}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onOpenClient(alert.clientId)}
        >
          Analisar
        </Button>
        {alert.status === 'open' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={saving}
            title="Reconhecer"
            aria-label={`Reconhecer o alerta de ${alert.clientName}`}
            onClick={() => onStatus(alert.id, 'acknowledged')}
          >
            <Eye aria-hidden="true" />
          </Button>
        ) : null}
        {alert.status !== 'resolved' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={saving}
            title="Resolver"
            aria-label={`Resolver o alerta de ${alert.clientName}`}
            onClick={() => onStatus(alert.id, 'resolved')}
          >
            <Check aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** A fila inteira numa superfície só, com um fio separando as linhas. */
function AlertQueue({ children }: { children: React.ReactNode }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-soft ring-1 ring-foreground/5">
      {children}
    </ul>
  );
}

export function AlertsPage() {
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useAlerts();
  const atualizar = useUpdateAlertStatus();
  const enviar = useSendDigest();
  const [envio, setEnvio] = useState<DigestSendResult | null>(null);
  const [mostrarPrevia, setMostrarPrevia] = useState(false);

  if (isPending) {
    return (
      <>
        <PageHeader title="Alertas" />
        {/* Esqueleto no formato do que vem: a linha de números e a fila de alertas. */}
        <div className="space-y-6" role="status" aria-label="Carregando os alertas">
          <div className="grid grid-cols-2 gap-x-5 gap-y-5 border-b border-border pb-6 sm:gap-x-8 lg:grid-cols-4">
            {['abertos', 'críticos', 'atenção', 'valor'].map((bloco) => (
              <div key={bloco} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <PageHeader title="Alertas" />
        <div className="rounded-xl bg-destructive/10 p-5 ring-1 ring-destructive/20">
          <p className="text-sm font-medium text-destructive">
            Não foi possível carregar os alertas.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full sm:w-auto"
            onClick={() => void refetch()}
          >
            Tentar de novo
          </Button>
        </div>
      </>
    );
  }

  const abertos = data.items.filter((a) => a.status === 'open');
  const tratados = data.items.filter((a) => a.status !== 'open');

  return (
    <>
      <PageHeader
        title="Alertas"
        description="Gatilhos críticos disparados e o que fazer com cada um."
      >
        <div className="flex flex-col gap-1 sm:items-end">
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={enviar.isPending || abertos.length === 0}
            onClick={() => {
              enviar.mutate(undefined, {
                onSuccess: (resultado) => {
                  setEnvio(resultado);
                  setMostrarPrevia(!resultado.sent);
                },
              });
            }}
          >
            <Mail aria-hidden="true" className="size-4" />
            {enviar.isPending ? 'Enviando…' : 'Enviar resumo por e-mail'}
          </Button>
          <span className="text-xs text-muted-foreground">
            vai para o e-mail da conta que está logada
          </span>
        </div>
      </PageHeader>

      {/* O PageHeader já traz a margem de baixo; o resto da tela é que respira em space-y-6. */}
      <section className="space-y-6">
        {envio ? (
          <div
            className={cn(
              'rounded-xl p-4 text-sm shadow-soft ring-1 sm:p-5',
              envio.sent ? 'bg-primary/5 ring-primary/20' : 'bg-card ring-foreground/5',
            )}
            role="status"
          >
            {envio.sent ? (
              <p>
                Resumo enviado para <strong>{envio.to}</strong>. Confira a caixa de entrada.
              </p>
            ) : (
              <>
                <p className="font-medium">Não enviei o e-mail — e não vou dizer que enviei.</p>
                <p className="mt-1 text-muted-foreground">{envio.reason}</p>
                {envio.html ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setMostrarPrevia((v) => !v)}
                    >
                      {mostrarPrevia ? 'Esconder a prévia' : 'Ver a prévia do e-mail'}
                    </Button>
                    {mostrarPrevia ? (
                      <iframe
                        title="Prévia do resumo de alertas"
                        srcDoc={envio.html}
                        className="mt-3 h-64 w-full rounded-lg border border-border bg-card sm:h-96"
                      />
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {/* Duas colunas no celular (quatro ficariam ilegíveis), quatro a partir de lg. */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-5 border-b border-border pb-6 sm:gap-x-8 lg:grid-cols-4">
          <Kpi label="Alertas abertos" value={formatInteger(abertos.length)} />
          <Kpi
            label="Críticos"
            value={formatInteger(data.openBySeverity.CRITICAL)}
            hint="exigem contato agora"
          />
          <Kpi label="Atenção" value={formatInteger(data.openBySeverity.WARNING)} />
          <Kpi
            label="Valor mensal envolvido"
            value={formatCurrency(data.mrrAtRisk)}
            hint="soma dos clientes com alerta aberto"
          />
        </div>

        {abertos.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="Nenhum alerta aberto"
            description="Nenhum gatilho crítico disparou no último período."
          />
        ) : (
          <AlertQueue>
            {abertos.map((alerta) => (
              <AlertRow
                key={alerta.id}
                alert={alerta}
                saving={atualizar.isPending}
                onOpenClient={(clientId) => void navigate(`/clients/${clientId}`)}
                onStatus={(id, status) => atualizar.mutate({ id, status })}
              />
            ))}
          </AlertQueue>
        )}

        {/* Agrupamento semântico: sem caixa em volta, senão ficaria card dentro de card. */}
        {tratados.length > 0 ? (
          <details>
            <summary className="cursor-pointer rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              {tratados.length} já tratado{tratados.length === 1 ? '' : 's'}
            </summary>
            <AlertQueue>
              {tratados.map((alerta) => (
                <AlertRow
                  key={alerta.id}
                  alert={alerta}
                  saving={atualizar.isPending}
                  onOpenClient={(clientId) => void navigate(`/clients/${clientId}`)}
                  onStatus={(id, status) => atualizar.mutate({ id, status })}
                />
              ))}
            </AlertQueue>
          </details>
        ) : null}
      </section>
    </>
  );
}
