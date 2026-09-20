/**
 * Alertas (§27): gatilhos críticos disparados, com o motivo, quanto está em jogo e o que fazer.
 *
 * Peso e gatilho são coisas diferentes: o peso entra no cálculo da saúde, o gatilho pede ação
 * imediata. Por isso esta tela é uma fila de trabalho, não um painel.
 */
import { AlertTriangle, Check, Info, Mail, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import {
  ALERT_SEVERITY_LABELS,
  ALERT_STATUS_LABELS,
  type AlertDto,
  type AlertSeverity,
} from '@inovaapss/shared';

import { Button } from '@/components/ui/button';
import { formatCurrency, formatInteger } from '@/lib/format';
import { cn } from '@/lib/utils';

import { useAlerts, useSendDigest, useUpdateAlertStatus, type DigestSendResult } from './api';

const SEVERITY_STYLE: Readonly<Record<AlertSeverity, { dot: string; icon: typeof Info }>> = {
  CRITICAL: { dot: 'bg-class-critical', icon: TriangleAlert },
  WARNING: { dot: 'bg-class-risk', icon: AlertTriangle },
  INFO: { dot: 'bg-class-attention', icon: Info },
};

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function AlertCard({
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
  const Icon = style.icon;
  const tratado = alert.status !== 'open';

  return (
    <li
      className={cn(
        'rounded-lg border border-border p-4',
        tratado && 'opacity-60',
        alert.severity === 'CRITICAL' && !tratado && 'border-l-4 border-l-class-critical',
      )}
      data-alert-id={alert.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{alert.clientName}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs">
              <span aria-hidden="true" className={cn('size-1.5 rounded-full', style.dot)} />
              {ALERT_SEVERITY_LABELS[alert.severity]}
            </span>
            {tratado ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {ALERT_STATUS_LABELS[alert.status]}
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              saúde {alert.healthScore === null ? '—' : `${formatInteger(alert.healthScore)}/100`}
              {alert.priorityClass ? ` · ${alert.priorityClass}` : ''} · {formatCurrency(alert.mrr)}
              /mês
            </span>
          </div>

          <p className="mt-2 text-sm">{alert.description}</p>
          {alert.suggestedAction ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">O que fazer:</span>{' '}
              {alert.suggestedAction}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {alert.title}
            {alert.metricName ? ` · métrica: ${alert.metricName}` : ''} · período {alert.periodEnd}
            {alert.priorityFloor === null
              ? ''
              : ` · prioridade mínima ${formatInteger(alert.priorityFloor)} por gatilho`}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenClient(alert.clientId)}
          >
            Analisar
          </Button>
          {alert.status === 'open' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => onStatus(alert.id, 'acknowledged')}
            >
              Reconhecer
            </Button>
          ) : null}
          {alert.status !== 'resolved' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => onStatus(alert.id, 'resolved')}
            >
              <Check aria-hidden="true" className="size-3.5" /> Resolver
            </Button>
          ) : null}
        </div>
      </div>
    </li>
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
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Alertas</h1>
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Alertas</h1>
        <p className="text-muted-foreground">Não foi possível carregar os alertas.</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Tentar de novo
        </Button>
      </section>
    );
  }

  const abertos = data.items.filter((a) => a.status === 'open');
  const tratados = data.items.filter((a) => a.status !== 'open');

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Alertas</h1>
          <p className="text-muted-foreground">
            Gatilhos críticos disparados e o que fazer com cada um.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
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
      </header>

      {envio ? (
        <div
          className={cn(
            'rounded-lg border p-4 text-sm',
            envio.sent ? 'border-class-normal/40 bg-class-normal/5' : 'border-border bg-muted/40',
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
                      className="mt-3 h-96 w-full rounded-md border border-border bg-white"
                    />
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-6 border-b border-border pb-6 sm:grid-cols-4">
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
        <p className="rounded-lg border border-border p-8 text-center text-muted-foreground">
          Nenhum alerta aberto. Nenhum gatilho crítico disparou no último período.
        </p>
      ) : (
        <ul className="space-y-3">
          {abertos.map((alerta) => (
            <AlertCard
              key={alerta.id}
              alert={alerta}
              saving={atualizar.isPending}
              onOpenClient={(clientId) => void navigate(`/clients/${clientId}`)}
              onStatus={(id, status) => atualizar.mutate({ id, status })}
            />
          ))}
        </ul>
      )}

      {tratados.length > 0 ? (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {tratados.length} já tratado{tratados.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-3 space-y-3">
            {tratados.map((alerta) => (
              <AlertCard
                key={alerta.id}
                alert={alerta}
                saving={atualizar.isPending}
                onOpenClient={(clientId) => void navigate(`/clients/${clientId}`)}
                onStatus={(id, status) => atualizar.mutate({ id, status })}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
