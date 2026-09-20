import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseClient } from '@/lib/supabase';

import { type ResetPasswordInput, resetPasswordSchema } from './schemas';
import { useAuth } from './use-auth';

/**
 * Última etapa da recuperação de senha: o link do e-mail traz o usuário a /login com uma sessão
 * de recuperação (evento PASSWORD_RECOVERY) e aqui ele define a nova senha.
 */
export function ResetPasswordForm() {
  const passwordId = useId();
  const confirmId = useId();
  const navigate = useNavigate();
  const { finishPasswordRecovery } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = async (values: ResetPasswordInput) => {
    setSubmitError(null);
    const { error } = await getSupabaseClient().auth.updateUser({ password: values.password });
    if (error) {
      setSubmitError(error.message || 'Não foi possível salvar a nova senha.');
      return;
    }
    finishPasswordRecovery();
    navigate('/dashboard', { replace: true });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Definir nova senha</CardTitle>
        <CardDescription>Escolha a senha que você vai usar daqui em diante.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          aria-label="Definir nova senha"
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor={passwordId}>Nova senha</Label>
            <Input
              id={passwordId}
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              {...register('password')}
            />
            {errors.password ? (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={confirmId}>Confirmar senha</Label>
            <Input
              id={confirmId}
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.confirm ? true : undefined}
              {...register('confirm')}
            />
            {errors.confirm ? (
              <p className="text-sm text-destructive">{errors.confirm.message}</p>
            ) : null}
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Salvando…' : 'Salvar nova senha'}
          </Button>
          {submitError ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
