import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';

import { createOrganization, ME_QUERY_KEY } from './api';
import { type OnboardingInput, onboardingSchema, slugify } from './schemas';
import { useAuth } from './use-auth';

/**
 * Primeiro acesso (§4): o usuário logado ainda não pertence a nenhuma organização
 * (GET /me → organization null) e cria a sua aqui, virando owner.
 */
export function OnboardingPage() {
  const nameId = useId();
  const slugId = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me, meStatus, user, signOut } = useAuth();
  const [slugTouched, setSlugTouched] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingInput>({ resolver: zodResolver(onboardingSchema) });

  const mutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      navigate('/dashboard', { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'SLUG_TAKEN') {
        setError('slug', { message: 'Esse identificador já está em uso. Escolha outro.' });
      }
    },
  });

  if (meStatus === 'idle' || meStatus === 'loading') {
    return <Skeleton className="h-64 w-full" aria-label="Carregando" />;
  }
  if (me?.organization) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = (values: OnboardingInput) => mutation.mutateAsync(values).catch(() => {});

  const genericError =
    mutation.error && !(mutation.error instanceof ApiError && mutation.error.code === 'SLUG_TAKEN')
      ? mutation.error.message
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar sua organização</CardTitle>
        <CardDescription>
          {user?.email ? `Você entrou como ${user.email}. ` : ''}
          Cadastre a empresa que vai gerenciar a carteira de clientes. Você será o owner.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          aria-label="Criar organização"
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor={nameId}>Nome da organização</Label>
            <Input
              id={nameId}
              autoComplete="organization"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${nameId}-erro` : undefined}
              {...register('name', {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  if (!slugTouched) setValue('slug', slugify(event.target.value));
                },
              })}
            />
            {errors.name ? (
              <p id={`${nameId}-erro`} className="text-sm text-destructive">
                {errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={slugId}>Identificador (slug)</Label>
            <Input
              id={slugId}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={errors.slug ? true : undefined}
              aria-describedby={`${slugId}-ajuda${errors.slug ? ` ${slugId}-erro` : ''}`}
              {...register('slug', { onChange: () => setSlugTouched(true) })}
            />
            <p id={`${slugId}-ajuda`} className="text-xs text-muted-foreground">
              Só letras minúsculas, números e hífens. Ex.: globalsys
            </p>
            {errors.slug ? (
              <p id={`${slugId}-erro`} className="text-sm text-destructive">
                {errors.slug.message}
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitting || mutation.isPending}
          >
            {mutation.isPending ? 'Criando…' : 'Criar organização'}
          </Button>

          {genericError ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {genericError}
            </p>
          ) : null}

          <p className="text-center text-sm text-muted-foreground">
            Entrou com a conta errada?{' '}
            <button
              type="button"
              className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              onClick={() => void signOut()}
            >
              Sair
            </button>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
