import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseClient } from '@/lib/supabase';

import { ResetPasswordForm } from './ResetPasswordForm';
import { type LoginInput, loginSchema } from './schemas';
import { useAuth } from './use-auth';

/** Mensagens amigáveis para os erros mais comuns do Supabase Auth. */
function friendlyAuthError(code: string | undefined, message: string): string {
  switch (code) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.';
    case 'email_not_confirmed':
      return 'Confirme seu e-mail antes de entrar (veja a caixa de entrada).';
    case 'over_request_rate_limit':
      return 'Muitas tentativas. Aguarde um instante e tente de novo.';
    default:
      return message || 'Não foi possível entrar. Tente novamente.';
  }
}

/** Rota de origem guardada pelo RequireAuth (state.from), ou /dashboard. */
function useReturnTo(): string {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return from && from.startsWith('/') ? from : '/dashboard';
}

export function LoginPage() {
  const emailId = useId();
  const passwordId = useId();
  const navigate = useNavigate();
  const returnTo = useReturnTo();
  const { status, configError, passwordRecovery } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  if (status === 'signed_in' && passwordRecovery) {
    return <ResetPasswordForm />;
  }
  if (status === 'signed_in') {
    return <Navigate to={returnTo} replace />;
  }

  const onSubmit = async (values: LoginInput) => {
    setSubmitError(null);
    let client;
    try {
      client = getSupabaseClient();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Supabase não configurado.');
      return;
    }
    const { error } = await client.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setSubmitError(friendlyAuthError(error.code, error.message));
      return;
    }
    navigate(returnTo, { replace: true });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Use o e-mail cadastrado na sua organização.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          aria-label="Entrar"
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor={emailId}>E-mail</Label>
            <Input
              id={emailId}
              type="email"
              autoComplete="email"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? `${emailId}-erro` : undefined}
              {...register('email')}
            />
            {errors.email ? (
              <p id={`${emailId}-erro`} className="text-sm text-destructive">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={passwordId}>Senha</Label>
              <Link
                to="/forgot-password"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Esqueci a senha
              </Link>
            </div>
            <Input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? `${passwordId}-erro` : undefined}
              {...register('password')}
            />
            {errors.password ? (
              <p id={`${passwordId}-erro`} className="text-sm text-destructive">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || status === 'unconfigured'}
          >
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </Button>

          {(submitError ?? configError) ? (
            <p role="alert" className="text-sm text-destructive">
              {submitError ?? configError}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
