import { CircleAlert, RefreshCw, Trash2, UserPen, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/features/auth/use-auth';

import { type OrganizationMember, useMembers } from './api';
import { ChangeRoleDialog } from './ChangeRoleDialog';
import { InviteUsersDialog } from './InviteUsersDialog';
import { formatDate, memberLabel } from './labels';
import { RemoveUserDialog } from './RemoveUserDialog';
import { isManager } from './roles';
import { RolesReference } from './RolesReference';

/**
 * Quem tem acesso à organização (§4, §5): lista, convite em lote, troca de papel e remoção.
 * Os botões de escrita só aparecem para owner e admin — e a API recusa de novo do lado dela.
 */
export function UsersTab() {
  const { me } = useAuth();
  const currentRole = me?.role ?? null;
  const canManage = isManager(currentRole);
  const myUserId = me?.user.id ?? null;

  const members = useMembers();
  const [inviting, setInviting] = useState(false);
  const [changingRole, setChangingRole] = useState<OrganizationMember | null>(null);
  const [removing, setRemoving] = useState<OrganizationMember | null>(null);

  return (
    <div className="space-y-8">
      <section aria-labelledby="usuarios-titulo" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="usuarios-titulo" className="text-base font-semibold">
              Usuários
            </h3>
            <p className="text-sm text-muted-foreground">
              Quem entra na plataforma pela sua organização e o que cada um pode fazer.
            </p>
          </div>
          {canManage ? (
            <Button type="button" onClick={() => setInviting(true)}>
              <UserPlus aria-hidden="true" />
              Convidar usuários
            </Button>
          ) : null}
        </div>

        {members.isPending ? (
          <div role="status" aria-label="Carregando usuários" className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : members.isError ? (
          <EmptyState
            icon={CircleAlert}
            title="Não foi possível carregar os usuários"
            description={members.error.message}
            action={
              <Button type="button" variant="outline" onClick={() => void members.refetch()}>
                <RefreshCw aria-hidden="true" />
                Tentar de novo
              </Button>
            }
          />
        ) : members.data.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nenhum usuário nesta organização"
            description="Convide as pessoas do time por e-mail e escolha o papel de cada uma."
            action={
              canManage ? (
                <Button type="button" onClick={() => setInviting(true)}>
                  <UserPlus aria-hidden="true" />
                  Convidar usuários
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Pessoa</TableHead>
                <TableHead scope="col">Papel</TableHead>
                <TableHead scope="col">Entrou em</TableHead>
                {canManage ? (
                  <TableHead scope="col" className="text-right">
                    Ações
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((member) => {
                const isMe = member.authUserId === myUserId;
                // Só o owner mexe em outro owner (a API recusa; a tela nem oferece).
                const canActOn = currentRole === 'owner' || member.role !== 'owner';
                return (
                  <TableRow key={member.id} data-member-id={member.authUserId}>
                    <TableCell className="font-medium">
                      {memberLabel(member)}
                      {isMe ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (você)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{member.role}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(member.createdAt)}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        {canActOn ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setChangingRole(member)}
                              aria-label={`Mudar o papel de ${memberLabel(member)}`}
                            >
                              <UserPen aria-hidden="true" />
                            </Button>
                            {/* Ninguém remove o próprio acesso: quem sai é removido por outra
                                pessoa. A API recusa de todo jeito; a tela nem oferece o botão. */}
                            {isMe ? null : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setRemoving(member)}
                                aria-label={`Remover o acesso de ${memberLabel(member)}`}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Só o owner mexe em outro owner
                          </span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <RolesReference />

      {canManage && currentRole !== null ? (
        <>
          <InviteUsersDialog open={inviting} onOpenChange={setInviting} currentRole={currentRole} />
          <ChangeRoleDialog
            member={changingRole}
            onOpenChange={(open) => {
              if (!open) setChangingRole(null);
            }}
            currentRole={currentRole}
          />
          <RemoveUserDialog
            member={removing}
            onOpenChange={(open) => {
              if (!open) setRemoving(null);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
