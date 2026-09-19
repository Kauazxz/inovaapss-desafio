import { z } from 'zod';

import { slugSchema } from '@inovaapss/validation';

/** Formulário de /login (Supabase Auth: e-mail + senha). */
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

/** Nova senha depois do link de recuperação. */
export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'A nova senha precisa ter pelo menos 8 caracteres.'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'As senhas não conferem.',
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Formulário de /onboarding: mesmas regras do POST /api/v1/organizations. */
export const onboardingSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
    .max(120, 'O nome pode ter no máximo 120 caracteres.'),
  slug: slugSchema,
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** "GlobalSys Ltda." → "globalsys-ltda" (sugestão de slug a partir do nome). */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
