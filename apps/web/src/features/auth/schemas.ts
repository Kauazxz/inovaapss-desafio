import { z } from 'zod';

/** Formulário de /login. A autenticação em si entra na Etapa 1. */
export const loginSchema = z.object({
  email: z.email('Informe um e-mail válido.'),
  password: z.string().min(6, 'A senha tem pelo menos 6 caracteres.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Formulário de /forgot-password. */
export const forgotPasswordSchema = z.object({
  email: z.email('Informe um e-mail válido.'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
