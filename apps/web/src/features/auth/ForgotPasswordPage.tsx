import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { type ForgotPasswordInput, forgotPasswordSchema } from './schemas';

export function ForgotPasswordPage() {
  const emailId = useId();
  const [status, setStatus] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  // TODO (Etapa 1 — feat(auth)): chamar getSupabaseClient().auth.resetPasswordForEmail(email,
  // { redirectTo }) e mostrar a mesma mensagem neutra exista o e-mail ou não.
  const onSubmit = (values: ForgotPasswordInput) => {
    setStatus(
      `Se ${values.email} estiver cadastrado, você receberá um link para redefinir a senha. (Envio entra na Etapa 1.)`,
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

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            Enviar link
          </Button>

          {status ? (
            <p role="status" className="text-sm text-muted-foreground">
              {status}
            </p>
          ) : null}

          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="underline-offset-4 hover:underline">
              Voltar para o login
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
