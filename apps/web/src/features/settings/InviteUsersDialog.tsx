import { Check, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { OrganizationRole } from '@inovaapss/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/clients/components/dialog';
import { FormField, selectClassName } from '@/features/clients/components/form-field';

import { type InviteOutcome, parseEmails, useInviteMembers } from './api';
import { ROLE_SUMMARY, ROLES } from './roles';

export interface InviteUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Papel de quem está convidando: só o owner pode oferecer o papel "owner". */
  currentRole: OrganizationRole;
}

const textareaClassName =
  'min-h-28 w-full rounded-lg border border-input bg-card px-3 py-2 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30';

/**
 * Convida uma ou várias pessoas de uma vez, todas com o mesmo papel. Cada e-mail vira uma
 * requisição e uma linha de resultado: um recusado não impede os outros de entrar.
 */
export function InviteUsersDialog({ open, onOpenChange, currentRole }: InviteUsersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* O corpo só existe com o diálogo aberto: formulário e resultados começam do zero. */}
        {open ? <InviteUsersForm currentRole={currentRole} onOpenChange={onOpenChange} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function InviteUsersForm({
  currentRole,
  onOpenChange,
}: {
  currentRole: OrganizationRole;
  onOpenChange: (open: boolean) => void;
}) {
  const invite = useInviteMembers();
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<OrganizationRole>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<InviteOutcome[] | null>(null);

  const roleOptions = ROLES.filter((option) => option !== 'owner' || currentRole === 'owner');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const list = parseEmails(emails);
    if (list.length === 0) {
      setError('Informe ao menos um e-mail.');
      return;
    }
    setError(null);
    const result = await invite.mutateAsync({ emails: list, role });
    setOutcomes(result);
    // Só o que entrou some da caixa: o que falhou continua ali para corrigir e tentar de novo.
    setEmails(
      result
        .filter((outcome) => !outcome.ok)
        .map((outcome) => outcome.email)
        .join('\n'),
    );
  };

  const invited = outcomes?.filter((outcome) => outcome.ok).length ?? 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Convidar usuários</DialogTitle>
        <DialogDescription>
          Um e-mail por linha (ou separados por vírgula). Quem ainda não tem conta recebe um convite
          e define a própria senha pelo link.
        </DialogDescription>
      </DialogHeader>
      <form
        aria-label="Convidar usuários"
        noValidate
        onSubmit={(event) => void submit(event)}
        className="space-y-4"
      >
        <FormField
          label="E-mails"
          error={error ?? undefined}
          hint="Ex.: ana@empresa.com, bruno@empresa.com"
        >
          {(control) => (
            <textarea
              {...control}
              className={textareaClassName}
              value={emails}
              onChange={(event) => setEmails(event.target.value)}
            />
          )}
        </FormField>

        <FormField label="Papel" hint={ROLE_SUMMARY[role]}>
          {(control) => (
            <select
              {...control}
              className={selectClassName}
              value={role}
              onChange={(event) => setRole(event.target.value as OrganizationRole)}
            >
              {roleOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
        </FormField>

        {outcomes ? (
          <div className="space-y-2 border-t border-border pt-4">
            <p role="status" className="text-sm font-medium">
              {invited} de {outcomes.length} convidados.
            </p>
            <ul aria-label="Resultado dos convites" className="space-y-1.5 text-sm">
              {outcomes.map((outcome) => (
                <li key={outcome.email} className="flex items-start gap-2">
                  {outcome.ok ? (
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <X aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  {/* E-mail longo não tem espaço para quebrar: break-words evita estourar. */}
                  <span className="min-w-0 flex-1 break-words">
                    <span className="font-medium">{outcome.email}</span>{' '}
                    <span className={outcome.ok ? 'text-muted-foreground' : 'text-destructive'}>
                      {outcome.message}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {outcomes ? 'Fechar' : 'Cancelar'}
          </Button>
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? 'Enviando…' : 'Enviar convites'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
