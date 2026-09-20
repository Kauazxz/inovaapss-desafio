import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import {
  PORTFOLIO_CLIENT_STATUSES,
  portfolioClientFormSchema,
  STRATEGIC_IMPORTANCE_DEFAULT,
  type PortfolioClientFormValues,
} from '@inovaapss/validation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';

import { type PortfolioClient, useCreateClient, useUpdateClient } from './api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/dialog';
import { FormField, selectClassName } from './components/form-field';
import { CLIENT_STATUS_LABELS, STRATEGIC_IMPORTANCE_LABELS } from './labels';

export interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Com cliente = edição; sem = cadastro. */
  client?: PortfolioClient | null | undefined;
  onSaved?: ((client: PortfolioClient) => void) | undefined;
}

const EMPTY: PortfolioClientFormValues = {
  name: '',
  externalCode: '',
  segment: '',
  size: '',
  status: 'active',
  strategicImportance: STRATEGIC_IMPORTANCE_DEFAULT,
};

function toFormValues(client: PortfolioClient): PortfolioClientFormValues {
  return {
    name: client.name,
    externalCode: client.externalCode ?? '',
    segment: client.segment ?? '',
    size: client.size ?? '',
    status: client.status,
    strategicImportance: client.strategicImportance,
  };
}

/** Diálogo de cadastro/edição de cliente: React Hook Form + o schema Zod compartilhado com a API. */
export function ClientFormDialog({ open, onOpenChange, client, onSaved }: ClientFormDialogProps) {
  const editing = client != null;
  const create = useCreateClient();
  const update = useUpdateClient();
  const mutation = editing ? update : create;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PortfolioClientFormValues>({
    resolver: zodResolver(portfolioClientFormSchema),
    defaultValues: client ? toFormValues(client) : EMPTY,
  });

  // Reabrir o diálogo com outro cliente (ou vazio) recomeça o formulário.
  useEffect(() => {
    if (open) reset(client ? toFormValues(client) : EMPTY);
  }, [open, client, reset]);

  const onSubmit = async (values: PortfolioClientFormValues) => {
    const input = {
      name: values.name,
      externalCode: values.externalCode === '' ? null : values.externalCode,
      segment: values.segment === '' ? null : values.segment,
      size: values.size === '' ? null : values.size,
      status: values.status,
      strategicImportance: values.strategicImportance,
    };
    try {
      const result = editing
        ? await update.mutateAsync({ clientId: client.id, input })
        : await create.mutateAsync(input);
      onSaved?.(result.client);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EXTERNAL_CODE_TAKEN') {
        setError('externalCode', { message: 'Já existe um cliente com este código.' });
      }
    }
  };

  const genericError =
    mutation.error &&
    !(mutation.error instanceof ApiError && mutation.error.code === 'EXTERNAL_CODE_TAKEN')
      ? mutation.error.message
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Altere os dados cadastrais. Plano e valor mensal ficam no contrato.'
              : 'Cadastre a empresa monitorada. O contrato (plano e valor) é adicionado depois, na tela do cliente.'}
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label={editing ? 'Editar cliente' : 'Novo cliente'}
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <FormField label="Nome" error={errors.name?.message}>
            {(control) => <Input {...control} autoComplete="organization" {...register('name')} />}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Código"
              hint="Identificador no seu sistema (ex.: C001). Único por organização."
              error={errors.externalCode?.message}
            >
              {(control) => <Input {...control} spellCheck={false} {...register('externalCode')} />}
            </FormField>
            <FormField label="Status" error={errors.status?.message}>
              {(control) => (
                <select {...control} className={selectClassName} {...register('status')}>
                  {PORTFOLIO_CLIENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {CLIENT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Segmento" error={errors.segment?.message}>
              {(control) => (
                <Input {...control} placeholder="Varejo, Saúde…" {...register('segment')} />
              )}
            </FormField>
            <FormField label="Porte" error={errors.size?.message}>
              {(control) => <Input {...control} placeholder="PME, Grande…" {...register('size')} />}
            </FormField>
          </div>

          <FormField
            label="Importância estratégica"
            hint="Pesa no impacto comercial da prioridade (§28)."
            error={errors.strategicImportance?.message}
          >
            {(control) => (
              <select
                {...control}
                className={selectClassName}
                {...register('strategicImportance', { setValueAs: Number })}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {STRATEGIC_IMPORTANCE_LABELS[value]}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          {genericError ? (
            <p role="alert" className="text-sm text-destructive">
              {genericError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {mutation.isPending
                ? 'Salvando…'
                : editing
                  ? 'Salvar alterações'
                  : 'Cadastrar cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
