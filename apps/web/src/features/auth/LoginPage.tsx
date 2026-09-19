import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { type LoginInput, loginSchema } from './schemas';

export function LoginPage() {
  const emailId = useId();
  const passwordId = useId();
  const [status, setStatus] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  // TODO (Etapa 1 — feat(auth)): chamar getSupabaseClient().auth.signInWithPassword(values),
  // tratar erro de credencial e redirecionar para a rota de origem ou /dashboard.
  const onSubmit = (values: LoginInput) => {
    setStatus(`Formulário válido para ${values.email}. A autenticação entra na Etapa 1.`);
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

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            Entrar
          </Button>

          {status ? (
            <p role="status" className="text-sm text-muted-foreground">
              {status}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
