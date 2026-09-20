import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import {
  contractFormSchema,
  DEFAULT_CURRENCY,
  type ContractFormValues,
} from '@inovaapss/validation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/clients/components/dialog';
import { FormField, selectClassName } from '@/features/clients/components/form-field';
import { ApiError } from '@/lib/api';

import { type Contract, useCreateContract, usePlans } from './api';
import { todayIso } from './labels';

export interface ContractFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  /** Contrato ativo atual, se houver: o diálogo avisa que ele será encerrado. */
  activeContract?: Contract | null | undefined;
}

/** Campo numérico em branco vira undefined (o schema decide se é obrigatório). */
const asNumber = (value: unknown) => (value === '' || value === null ? undefined : Number(value));

/** Formulário em branco: início = hoje, moeda padrão, valor por preencher. */
const defaults = (): ContractFormValues => ({
  planId: '',
  monthlyValue: undefined as unknown as number,
  currency: DEFAULT_CURRENCY,
  startDate: todayIso(),
  endDate: '',
  contractedSlaHours: undefined,
});

/**
 * Novo contrato de um cliente. Ao salvar como ativo, a API encerra o contrato ativo anterior
 * (regra do contrato único ativo — docs/CLIENTS.md).
 */
export function ContractFormDialog({
  open,
  onOpenChange,
  clientId,
  activeContract,
}: ContractFormDialogProps) {
  const plans = usePlans();
  const create = useCreateContract();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: defaults(),
  });

  // Reabrir o diálogo recomeça o formulário (e a mutação anterior).
  useEffect(() => {
    if (open) {
      reset(defaults());
      create.reset();
    }
    // create.reset é estável (TanStack Query); só `open` importa aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  const onSubmit = async (values: ContractFormValues) => {
    try {
      await create.mutateAsync({
        portfolioClientId: clientId,
        planId: values.planId === '' ? null : values.planId,
        monthlyValue: values.monthlyValue,
        currency: values.currency,
        startDate: values.startDate,
        endDate: values.endDate === '' ? null : values.endDate,
        status: 'active',
        contractedSlaHours: values.contractedSlaHours ?? null,
      });
      onOpenChange(false);
    } catch {
      // create.error fica visível abaixo.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo contrato</DialogTitle>
          <DialogDescription>
            {activeContract
              ? `O contrato ativo atual (${activeContract.planName ?? 'sem plano'}) será encerrado na data de início do novo.`
              : 'O contrato passa a ser o ativo do cliente: plano, valor mensal e SLA contratado.'}
          </DialogDescription>
        </DialogHeader>
        <form
          aria-label="Novo contrato"
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <FormField
            label="Plano"
            hint={
              plans.data?.length === 0
                ? 'Nenhum plano cadastrado: crie em Configurações → Planos.'
                : undefined
            }
            error={errors.planId?.message}
          >
            {(control) => (
              <select {...control} className={selectClassName} {...register('planId')}>
                <option value="">Sem plano</option>
                {plans.data?.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
            <FormField label="Valor mensal" error={errors.monthlyValue?.message}>
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  {...register('monthlyValue', { setValueAs: asNumber })}
                />
              )}
            </FormField>
            <FormField label="Moeda" error={errors.currency?.message}>
              {(control) => <Input {...control} maxLength={3} {...register('currency')} />}
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Início" error={errors.startDate?.message}>
              {(control) => <Input {...control} type="date" {...register('startDate')} />}
            </FormField>
            <FormField label="Término" hint="Opcional." error={errors.endDate?.message}>
              {(control) => <Input {...control} type="date" {...register('endDate')} />}
            </FormField>
          </div>

          <FormField
            label="SLA contratado (horas)"
            hint="Prazo contratual de resolução. Opcional; as políticas por severidade chegam na Etapa 5."
            error={errors.contractedSlaHours?.message}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                inputMode="numeric"
                min="1"
                {...register('contractedSlaHours', { setValueAs: asNumber })}
              />
            )}
          </FormField>

          {create.error ? (
            <p role="alert" className="text-sm text-destructive">
              {create.error instanceof ApiError && create.error.code === 'PLAN_NOT_FOUND'
                ? 'O plano escolhido não existe mais. Recarregue a página.'
                : create.error.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || create.isPending}>
              {create.isPending ? 'Salvando…' : 'Criar contrato'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
