import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/clients/components/dialog';

import { type OrganizationMember, useRemoveMember } from './api';
import { memberLabel } from './labels';

export interface RemoveUserDialogProps {
  /** null fecha o diálogo. */
  member: OrganizationMember | null;
  onOpenChange: (open: boolean) => void;
}

/** Tira o acesso de alguém à organização. A conta continua existindo; some só o vínculo. */
export function RemoveUserDialog({ member, onOpenChange }: RemoveUserDialogProps) {
  return (
    <Dialog open={member !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {member ? (
          <RemoveUserBody key={member.id} member={member} onOpenChange={onOpenChange} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RemoveUserBody({
  member,
  onOpenChange,
}: {
  member: OrganizationMember;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useRemoveMember();

  const confirm = async () => {
    try {
      await remove.mutateAsync({ authUserId: member.authUserId });
      onOpenChange(false);
    } catch {
      // remove.error fica visível abaixo.
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Remover acesso</DialogTitle>
        <DialogDescription>
          {memberLabel(member)} perde o acesso a esta organização. A conta continua existindo e o
          acesso pode ser devolvido com um novo convite.
        </DialogDescription>
      </DialogHeader>
      {remove.error ? (
        <p role="alert" className="text-sm text-destructive">
          {remove.error.message}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => void confirm()}
          disabled={remove.isPending}
        >
          {remove.isPending ? 'Removendo…' : 'Remover acesso'}
        </Button>
      </DialogFooter>
    </>
  );
}
