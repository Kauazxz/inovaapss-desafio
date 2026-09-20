import { useState } from 'react';

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

import { type OrganizationMember, useUpdateMemberRole } from './api';
import { memberLabel } from './labels';
import { ROLE_SUMMARY, ROLES } from './roles';

export interface ChangeRoleDialogProps {
  /** null fecha o diálogo. */
  member: OrganizationMember | null;
  onOpenChange: (open: boolean) => void;
  /** Papel de quem está mudando: só o owner oferece (e tira) o papel "owner". */
  currentRole: OrganizationRole;
}

/** Muda o papel de alguém, com confirmação e a mensagem da API quando a regra barra. */
export function ChangeRoleDialog({ member, onOpenChange, currentRole }: ChangeRoleDialogProps) {
  return (
    <Dialog open={member !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {member ? (
          <ChangeRoleBody
            key={member.id}
            member={member}
            currentRole={currentRole}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ChangeRoleBody({
  member,
  currentRole,
  onOpenChange,
}: {
  member: OrganizationMember;
  currentRole: OrganizationRole;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateMemberRole();
  const [role, setRole] = useState<OrganizationRole>(member.role);

  const roleOptions = ROLES.filter(
    (option) => option !== 'owner' || currentRole === 'owner' || member.role === 'owner',
  );

  const confirm = async () => {
    try {
      await update.mutateAsync({ authUserId: member.authUserId, role });
      onOpenChange(false);
    } catch {
      // update.error fica visível abaixo do formulário.
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mudar o papel</DialogTitle>
        <DialogDescription>
          {memberLabel(member)} passa a ter as permissões do papel escolhido assim que você
          confirmar.
        </DialogDescription>
      </DialogHeader>
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
      {update.error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {update.error.message}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => void confirm()}
          disabled={update.isPending || role === member.role}
        >
          {update.isPending ? 'Salvando…' : 'Confirmar papel'}
        </Button>
      </DialogFooter>
    </>
  );
}
