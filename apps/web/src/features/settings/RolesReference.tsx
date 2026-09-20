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
        <h3 id="papeis-titulo" className="text-base font-medium">
          Os quatro papéis
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Quem pode o quê é conferido pela API a cada requisição, não só por esta tela.
        </p>
      </div>

      <dl className="space-y-3 rounded-2xl bg-card p-5 text-sm shadow-soft ring-1 ring-foreground/5">
        {ROLES.map((role) => (
          <div key={role} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <dt className="font-medium">
              <Badge variant="outline">{role}</Badge>
            </dt>
            {/* No celular a explicação cai numa linha só dela; do sm em diante fica ao lado. */}
            <dd className="min-w-0 basis-full text-muted-foreground sm:flex-1 sm:basis-0">
              {ROLE_SUMMARY[role]}
            </dd>
          </div>
        ))}
      </dl>

      <div className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/5">
        <Table>
          <caption className="caption-bottom px-3 pt-2 pb-3 text-left text-xs text-muted-foreground">
            Quem pode o quê, como a API aplica hoje.
          </caption>
          <TableHeader>
            <TableRow>
              {/* A coluna da ação não pode ser espremida a três letras por linha no celular:
                  com o mínimo garantido, quem rola é a tabela, não a página. */}
              <TableHead scope="col" className="min-w-44">
                Ação
              </TableHead>
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
                <TableCell className="min-w-44 whitespace-normal">
                  <span className="font-medium">{row.action}</span>
                  {/* Onde a API exige isso é detalhe de conferência: só do md em diante. */}
                  <span className="hidden text-xs font-normal text-muted-foreground md:block">
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
      </div>
    </section>
  );
}
