import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseClient } from '@/lib/supabase';

import { type ForgotPasswordInput, forgotPasswordSchema } from './schemas';

export function ForgotPasswordPage() {
  const emailId = useId();
  const [status, setStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (values: ForgotPasswordInput) => {
    setStatus(null);
    setSubmitError(null);
    try {
      // O link do e-mail volta para /login; lá o evento PASSWORD_RECOVERY abre o formulário
      // de nova senha. A URL precisa estar na lista de Redirect URLs do Supabase (docs/AUTH.md).
      const { error } = await getSupabaseClient().auth.resetPasswordForEmail(values.email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) {
        setSubmitError(error.message || 'Não foi possível enviar o e-mail. Tente de novo.');
        return;
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Supabase não configurado.');
      return;
    }
    // Mesma mensagem exista o e-mail ou não, para não revelar quem está cadastrado.
    setStatus(
      `Se ${values.email} estiver cadastrado, você receberá um link para redefinir a senha.`,
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar senha</CardTitle>
        <CardDescription>Enviamos um link de redefinição para o seu e-mail.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          aria-label="Recuperar senha"
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

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Enviando…' : 'Enviar link'}
          </Button>

          {status ? (
            <p
              role="status"
              className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
            >
              {status}
            </p>
          ) : null}
          {submitError ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          ) : null}

          <p className="text-center text-sm text-muted-foreground">
            <Link
              to="/login"
              className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Voltar para o login
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
