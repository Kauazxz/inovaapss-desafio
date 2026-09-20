import { CircleAlert, Layers, Pencil, Plus, RefreshCw } from 'lucide-react';
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

import { type Plan, usePlans } from './api';
import { PlanFormDialog } from './PlanFormDialog';

/**
 * Lista, cria e edita os planos da organização (§36 plans). Exibido na aba "Planos" de
 * /settings. Viewer só lê.
 */
export function PlansManager() {
  const { me } = useAuth();
  const canWrite = me?.role !== undefined && me.role !== null && me.role !== 'viewer';
  const plans = usePlans();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setFormOpen(true);
  };

  return (
    <section aria-labelledby="planos-titulo" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="planos-titulo" className="text-base font-semibold">
            Planos
          </h3>
          <p className="text-sm text-muted-foreground">
            Níveis de atendimento que os contratos usam. O nome é único na organização.
          </p>
        </div>
        {canWrite ? (
          <Button type="button" onClick={openCreate}>
            <Plus aria-hidden="true" />
            Novo plano
          </Button>
        ) : null}
      </div>

      {plans.isPending ? (
        <div role="status" aria-label="Carregando planos" className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : plans.isError ? (
        <EmptyState
          icon={CircleAlert}
          title="Não foi possível carregar os planos"
          description={plans.error.message}
          action={
            <Button type="button" variant="outline" onClick={() => void plans.refetch()}>
              <RefreshCw aria-hidden="true" />
              Tentar de novo
            </Button>
          }
        />
      ) : plans.data.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhum plano cadastrado"
          description="Crie os planos que aparecem nos contratos (ex.: Básico, Intermediário, Premium)."
          action={
            canWrite ? (
              <Button type="button" onClick={openCreate}>
                <Plus aria-hidden="true" />
                Novo plano
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Nome</TableHead>
              <TableHead scope="col">Descrição</TableHead>
              {canWrite ? (
                <TableHead scope="col" className="text-right">
                  Ações
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.data.map((plan) => (
              <TableRow key={plan.id} data-plan-id={plan.id}>
                <TableCell className="font-medium">{plan.name}</TableCell>
                <TableCell className="max-w-md whitespace-normal text-muted-foreground">
                  {plan.description ?? '—'}
                </TableCell>
                {canWrite ? (
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(plan)}
                      aria-label={`Editar ${plan.name}`}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <PlanFormDialog open={formOpen} onOpenChange={setFormOpen} plan={editing} />
    </section>
  );
}
