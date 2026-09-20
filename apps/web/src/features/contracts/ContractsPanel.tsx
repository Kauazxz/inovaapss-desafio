import { CircleAlert, FileSignature, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/features/auth/use-auth';
import { cn } from '@/lib/utils';

import { type Contract, useClientContracts } from './api';
import { ContractFormDialog } from './ContractFormDialog';
import { EndContractDialog } from './EndContractDialog';
import { CONTRACT_STATUS_LABELS, formatDate, formatMoney } from './labels';

export interface ContractsPanelProps {
  clientId: string;
}

/**
 * Contratos de um cliente (lista, novo, encerrar). Componente EXPORTADO para a tela do cliente
 * (Etapa 9) embutir: `<ContractsPanel clientId={id} />`. Viewer só lê.
 */
export function ContractsPanel({ clientId }: ContractsPanelProps) {
  const { me } = useAuth();
  const canWrite = me?.role !== undefined && me.role !== null && me.role !== 'viewer';
  const contracts = useClientContracts(clientId);
  const [formOpen, setFormOpen] = useState(false);
  const [ending, setEnding] = useState<Contract | null>(null);

  const active = contracts.data?.find((contract) => contract.status === 'active') ?? null;

  return (
    <section aria-labelledby="contratos-titulo" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="contratos-titulo" className="text-base font-semibold">
            Contratos
          </h3>
          <p className="text-sm text-muted-foreground">
            {active
              ? `Contrato ativo: ${active.planName ?? 'sem plano'} · ${formatMoney(active.monthlyValue, active.currency)}/mês`
              : 'Sem contrato ativo no momento.'}
          </p>
        </div>
        {canWrite ? (
          <Button type="button" onClick={() => setFormOpen(true)}>
            <Plus aria-hidden="true" />
            Novo contrato
          </Button>
        ) : null}
      </div>

      {contracts.isPending ? (
        <div role="status" aria-label="Carregando contratos" className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : contracts.isError ? (
        <EmptyState
          icon={CircleAlert}
          title="Não foi possível carregar os contratos"
          description={contracts.error.message}
          action={
            <Button type="button" variant="outline" onClick={() => void contracts.refetch()}>
              <RefreshCw aria-hidden="true" />
              Tentar de novo
            </Button>
          }
        />
      ) : contracts.data.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="Nenhum contrato"
          description="Cadastre o contrato do cliente com plano, valor mensal e SLA contratado."
          action={
            canWrite ? (
              <Button type="button" onClick={() => setFormOpen(true)}>
                <Plus aria-hidden="true" />
                Novo contrato
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Plano</TableHead>
              <TableHead scope="col" className="text-right">
                Valor mensal
              </TableHead>
              <TableHead scope="col">Início</TableHead>
              <TableHead scope="col">Término</TableHead>
              <TableHead scope="col" className="text-right">
                SLA (h)
              </TableHead>
              <TableHead scope="col">Status</TableHead>
              {canWrite ? (
                <TableHead scope="col" className="text-right">
                  Ações
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.data.map((contract) => (
              <TableRow
                key={contract.id}
                data-contract-id={contract.id}
                className={cn(contract.status !== 'active' && 'text-muted-foreground')}
              >
                <TableCell className={cn(contract.status === 'active' && 'font-medium')}>
                  {contract.planName ?? 'sem plano'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(contract.monthlyValue, contract.currency)}
                </TableCell>
                <TableCell>{formatDate(contract.startDate)}</TableCell>
                <TableCell>{contract.endDate ? formatDate(contract.endDate) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {contract.contractedSlaHours ?? '—'}
                </TableCell>
                <TableCell>
                  <span className="inline-flex h-5 items-center rounded-4xl border border-border px-2 text-xs font-medium whitespace-nowrap">
                    {CONTRACT_STATUS_LABELS[contract.status]}
                  </span>
                </TableCell>
                {canWrite ? (
                  <TableCell className="text-right">
                    {contract.status === 'active' ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEnding(contract)}
                        aria-label={`Encerrar contrato ${contract.planName ?? 'sem plano'}`}
                      >
                        Encerrar
                      </Button>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ContractFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        clientId={clientId}
        activeContract={active}
      />
      <EndContractDialog
        contract={ending}
        onOpenChange={(open) => {
          if (!open) setEnding(null);
        }}
      />
    </section>
  );
}
