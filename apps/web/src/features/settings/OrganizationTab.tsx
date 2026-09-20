import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { slugSchema } from '@inovaapss/validation';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/use-auth';
import { FormField } from '@/features/clients/components/form-field';
import { ApiError } from '@/lib/api';

import { useCurrentOrganization, useUpdateOrganization } from './api';
import { isManager } from './roles';

/** Mesmas regras do PATCH /organizations/current (§36 organizations). */
const organizationFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
    .max(120, 'O nome pode ter no máximo 120 caracteres.'),
  slug: slugSchema,
});
type OrganizationFormValues = z.infer<typeof organizationFormSchema>;

/** Nome e identificador da organização. Owner e admin editam; os demais só leem. */
export function OrganizationTab() {
  const { me } = useAuth();
  const canEdit = isManager(me?.role);
  const organization = useCurrentOrganization();

  if (organization.isPending) {
    return (
      <div
        role="status"
        aria-label="Carregando a organização"
        className="w-full max-w-md space-y-4 rounded-2xl bg-card p-5 shadow-soft ring-1 ring-foreground/5"
      >
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (organization.isError) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Não foi possível carregar a organização"
        description={organization.error.message}
        action={
          <Button type="button" variant="outline" onClick={() => void organization.refetch()}>
            <RefreshCw aria-hidden="true" />
            Tentar de novo
          </Button>
        }
      />
    );
  }

  return (
    <OrganizationForm
      key={organization.data.organization.id}
      defaultValues={{
        name: organization.data.organization.name,
        slug: organization.data.organization.slug,
      }}
      canEdit={canEdit}
    />
  );
}

function OrganizationForm({
  defaultValues,
  canEdit,
}: {
  defaultValues: OrganizationFormValues;
  canEdit: boolean;
}) {
  const update = useUpdateOrganization();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationFormSchema),
    defaultValues,
  });

  // Depois de salvar, o formulário passa a ter os valores salvos como base (deixa de estar sujo).
  useEffect(() => {
    if (update.isSuccess) {
      reset({ name: update.data.organization.name, slug: update.data.organization.slug });
    }
  }, [update.isSuccess, update.data, reset]);

  const onSubmit = async (values: OrganizationFormValues) => {
    try {
      await update.mutateAsync(values);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SLUG_TAKEN') {
        setError('slug', { message: 'Esse identificador já está em uso. Escolha outro.' });
      }
    }
  };

  const genericError =
    update.error && !(update.error instanceof ApiError && update.error.code === 'SLUG_TAKEN')
      ? update.error.message
      : null;

  return (
    <section aria-labelledby="organizacao-titulo" className="space-y-4">
      <div>
        <h3 id="organizacao-titulo" className="text-base font-medium">
          Organização
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          O nome aparece para o time; o identificador é usado nos endereços e não muda sozinho.
        </p>
      </div>

      <form
        aria-label="Dados da organização"
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-md space-y-4 rounded-2xl bg-card p-5 shadow-soft ring-1 ring-foreground/5"
      >
        <FormField label="Nome" error={errors.name?.message}>
          {(control) => <Input {...control} {...register('name')} disabled={!canEdit} />}
        </FormField>
        <FormField
          label="Identificador"
          error={errors.slug?.message}
          hint="Letras minúsculas, números e hífens."
        >
          {(control) => <Input {...control} {...register('slug')} disabled={!canEdit} />}
        </FormField>

        {genericError ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {genericError}
          </p>
        ) : null}
        {update.isSuccess && !isDirty ? (
          <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Dados da organização salvos.
          </p>
        ) : null}

        {canEdit ? (
          <Button
            type="submit"
            disabled={isSubmitting || update.isPending || !isDirty}
            className="w-full sm:w-auto"
          >
            {update.isPending ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Só owner e admin alteram os dados da organização.
          </p>
        )}
      </form>
    </section>
  );
}
