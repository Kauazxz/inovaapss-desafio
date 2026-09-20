import { CircleAlert, Layers, RefreshCw } from 'lucide-react';

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
import { PlansManager, usePlans } from '@/features/contracts';
import { formatCurrency, formatInteger } from '@/lib/format';

import { usePlanUsage } from './api';

/**
 * Aba "Planos": primeiro quanto cada plano é usado hoje (números vindos da API, somados sobre os
 * contratos), depois o `PlansManager` da feature de contratos, que cria, renomeia e descreve.
 */
export function PlansTab() {
  return (
    <div className="space-y-8">
      <PlanUsageTable />
      <PlansManager />
    </div>
  );
}

function PlanUsageTable() {
  const plans = usePlans();
  const usage = usePlanUsage();

  const loading = plans.isPending || usage.isPending;
  const error = plans.error ?? usage.error;
  const refetch = () => {
    void plans.refetch();
    void usage.refetch();
  };

  return (
    <section aria-labelledby="uso-planos-titulo" className="space-y-4">
      <div>
        <h3 id="uso-planos-titulo" className="text-base font-semibold">
          Uso dos planos na carteira
        </h3>
        <p className="text-sm text-muted-foreground">
          Clientes com contrato em cada plano, o valor mensal médio e o SLA mais contratado.
        </p>
      </div>

      {loading ? (
        <div role="status" aria-label="Carregando o uso dos planos" className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : error ? (
        <EmptyState
          icon={CircleAlert}
          title="Não foi possível carregar o uso dos planos"
          description={error.message}
          action={
            <Button type="button" variant="outline" onClick={refetch}>
              <RefreshCw aria-hidden="true" />
              Tentar de novo
            </Button>
          }
        />
      ) : (plans.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhum plano cadastrado"
          description="Crie os planos abaixo; os números aparecem assim que houver contratos neles."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Plano</TableHead>
              <TableHead scope="col">Descrição</TableHead>
              <TableHead scope="col" className="text-right">
                Clientes
              </TableHead>
              <TableHead scope="col" className="text-right">
                Valor mensal médio
              </TableHead>
              <TableHead scope="col" className="text-right">
                SLA contratado
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(plans.data ?? []).map((plan) => {
              const numbers = usage.data?.[plan.id];
              return (
                <TableRow key={plan.id} data-plan-usage-id={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell className="max-w-md whitespace-normal text-muted-foreground">
                    {plan.description ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInteger(numbers?.clients ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {numbers === undefined ? '—' : formatCurrency(numbers.averageMonthlyValue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {numbers === undefined || numbers.slaHours === null
                      ? '—'
                      : `${formatInteger(numbers.slaHours)} h`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
