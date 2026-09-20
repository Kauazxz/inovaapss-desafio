import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { PERMISSION_MATRIX, roleAllows, ROLE_SUMMARY, ROLES } from './roles';

/**
 * O que cada papel é (§4) e quem pode o quê. Fica na própria tela de usuários para ninguém
 * precisar sair dela para decidir qual papel dar a alguém.
 */
export function RolesReference() {
  return (
    <section aria-labelledby="papeis-titulo" className="space-y-4">
      <div>
        <h3 id="papeis-titulo" className="text-base font-semibold">
          Os quatro papéis
        </h3>
        <p className="text-sm text-muted-foreground">
          Quem pode o quê é conferido pela API a cada requisição, não só por esta tela.
        </p>
      </div>

      <dl className="space-y-2">
        {ROLES.map((role) => (
          <div key={role} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <dt className="font-medium">
              <Badge variant="outline">{role}</Badge>
            </dt>
            <dd className="min-w-0 flex-1 text-muted-foreground">{ROLE_SUMMARY[role]}</dd>
          </div>
        ))}
      </dl>

      <Table>
        <caption className="caption-bottom pt-2 text-left text-xs text-muted-foreground">
          Quem pode o quê, como a API aplica hoje.
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Ação</TableHead>
            {ROLES.map((role) => (
              <TableHead key={role} scope="col" className="text-center">
                {role}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {PERMISSION_MATRIX.map((row) => (
            <TableRow key={row.action}>
              <TableCell className="whitespace-normal">
                <span className="font-medium">{row.action}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {row.enforcedBy}
                </span>
              </TableCell>
              {ROLES.map((role) => (
                <TableCell key={role} className="text-center">
                  <span
                    className={
                      roleAllows(row, role)
                        ? 'font-medium text-foreground'
                        : 'text-muted-foreground'
                    }
                  >
                    {roleAllows(row, role) ? 'sim' : 'não'}
                  </span>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
