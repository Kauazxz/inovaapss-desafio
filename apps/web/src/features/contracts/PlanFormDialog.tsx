import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { planFormSchema, type PlanFormValues } from '@inovaapss/validation';

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
import { FormField } from '@/features/clients/components/form-field';
import { ApiError } from '@/lib/api';

import { type Plan, useCreatePlan, useUpdatePlan } from './api';

export interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Com plano = edição; sem = novo. */
  plan?: Plan | null | undefined;
}

const EMPTY: PlanFormValues = { name: '', description: '' };

const textareaClassName =
  'min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30';

/** Diálogo de criar/editar plano (nome único por organização). */
export function PlanFormDialog({ open, onOpenChange, plan }: PlanFormDialogProps) {
  const editing = plan != null;
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const mutation = editing ? update : create;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: plan ? { name: plan.name, description: plan.description ?? '' } : EMPTY,
  });

  useEffect(() => {
    if (open) reset(plan ? { name: plan.name, description: plan.description ?? '' } : EMPTY);
  }, [open, plan, reset]);

  const onSubmit = async (values: PlanFormValues) => {
    const input = {
      name: values.name,
      description: values.description === '' ? null : values.description,
    };
    try {
      if (editing) await update.mutateAsync({ planId: plan.id, input });
      else await create.mutateAsync(input);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PLAN_NAME_TAKEN') {
        setError('name', { message: 'Já existe um plano com este nome.' });
      }
    }
  };

  const genericError =
    mutation.error &&
    !(mutation.error instanceof ApiError && mutation.error.code === 'PLAN_NAME_TAKEN')
      ? mutation.error.message
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar plano' : 'Novo plano'}</DialogTitle>
          <DialogDescription>
            Nível de atendimento contratado (ex.: Básico, Premium). As políticas de SLA são ligadas
            ao plano.
          </DialogDescription>
        </DialogHeader>
        <form
          aria-label={editing ? 'Editar plano' : 'Novo plano'}
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <FormField label="Nome" error={errors.name?.message}>
            {(control) => <Input {...control} {...register('name')} />}
          </FormField>
          <FormField label="Descrição" error={errors.description?.message}>
            {(control) => (
              <textarea {...control} className={textareaClassName} {...register('description')} />
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
              {mutation.isPending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar plano'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
