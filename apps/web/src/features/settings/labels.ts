/** Textos e formatos das configurações. */
import type { OrganizationMember } from './api';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** `20/09/2026` a partir do ISO que a API devolve. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

/**
 * Como chamar um membro na tela. Quem entrou por convite pode ainda não ter e-mail visível
 * (a consulta a auth.users só devolve depois de a conta existir), então cai no identificador.
 */
export function memberLabel(member: OrganizationMember): string {
  return member.email ?? `Usuário ${member.authUserId.slice(0, 8)}`;
}
