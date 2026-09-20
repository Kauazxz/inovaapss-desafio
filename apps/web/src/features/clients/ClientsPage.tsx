import { CircleAlert, Inbox, Plus, RefreshCw, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ClientSortField, SortOrder } from '@inovaapss/validation';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/use-auth';
import { cn } from '@/lib/utils';

import {
  type ClientFilters,
  isEmptyClientFilters,
  type PortfolioClient,
  useClientFilterOptions,
  useClients,
} from './api';
import { ArchiveClientDialog } from './ArchiveClientDialog';
import { ClientFormDialog } from './ClientFormDialog';
import { ClientsFilterBar } from './ClientsFilterBar';
import { ClientsTable } from './ClientsTable';
import { Pagination } from './Pagination';

const SEARCH_DEBOUNCE_MS = 250;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * §38 /clients — a carteira da organização: tabela com busca, filtros §61, ordenação e
 * paginação (tudo feito pela API), cadastro/edição em diálogo e arquivamento com confirmação.
 * Estados vazio / carregando / erro conforme §57.
 */
export function ClientsPage() {
  const { me } = useAuth();
  const canWrite = me?.role !== undefined && me.role !== null && me.role !== 'viewer';

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ClientFilters>({});
  const [sort, setSort] = useState<ClientSortField>('name');
  const [order, setOrder] = useState<SortOrder>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PortfolioClient | null>(null);
  const [archiving, setArchiving] = useState<PortfolioClient | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = { page, pageSize, search: debouncedSearch, sort, order, filters };
  const clients = useClients(query);
  const options = useClientFilterOptions();
  const filtered = !isEmptyClientFilters(filters) || debouncedSearch !== '';

  const resetPage = () => setPage(1);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (client: PortfolioClient) => {
    setEditing(client);
    setFormOpen(true);
  };

  const data = clients.data;

  return (
    <>
      <PageHeader
        title="Clientes"
        description="A carteira da organização: plano, contrato e valor mensal de cada cliente."
      >
        {canWrite ? (
          <Button type="button" onClick={openCreate}>
            <Plus aria-hidden="true" />
            Novo cliente
          </Button>
        ) : null}
      </PageHeader>

      <div className="space-y-6">
        <ClientsFilterBar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            resetPage();
          }}
          filters={filters}
          onFiltersChange={(next) => {
            setFilters(next);
            resetPage();
          }}
          options={options.data}
        />

        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}

        {clients.isPending ? (
          <div
            role="status"
            aria-label="Carregando clientes"
            className="space-y-3 rounded-xl bg-card p-5 shadow-soft ring-1 ring-foreground/5"
          >
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : clients.isError ? (
          <EmptyState
            icon={CircleAlert}
            title="Não foi possível carregar os clientes"
            description={clients.error.message}
            action={
              <Button type="button" variant="outline" onClick={() => void clients.refetch()}>
                <RefreshCw aria-hidden="true" />
                Tentar de novo
              </Button>
            }
          />
        ) : data !== undefined && data.total === 0 ? (
          filtered ? (
            <EmptyState
              icon={Inbox}
              title="Nenhum cliente corresponde à busca"
              description="Ajuste os filtros ou limpe todos para ver a carteira inteira."
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFilters({});
                    setSearch('');
                    resetPage();
                  }}
                >
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              title="Nenhum cliente ainda"
              description={
                canWrite
                  ? 'Cadastre o primeiro cliente da carteira ou importe uma planilha (XLSX, CSV ou JSON) em Importar dados.'
                  : 'A carteira ainda está vazia. Peça a um analista ou administrador para cadastrar ou importar os clientes.'
              }
              action={
                canWrite ? (
                  <Button type="button" onClick={openCreate}>
                    <Plus aria-hidden="true" />
                    Novo cliente
                  </Button>
                ) : undefined
              }
            />
          )
        ) : data !== undefined ? (
          <div
            className={cn(
              'overflow-hidden rounded-xl bg-card shadow-soft ring-1 ring-foreground/5',
              clients.isFetching && 'opacity-60 transition-opacity',
            )}
          >
            <ClientsTable
              items={data.items}
              sort={sort}
              order={order}
              onSortChange={(nextSort, nextOrder) => {
                setSort(nextSort);
                setOrder(nextOrder);
                resetPage();
              }}
              canWrite={canWrite}
              onEdit={openEdit}
              onArchive={setArchiving}
            />
            {/* A paginação fecha a mesma superfície da tabela, separada por uma linha fina. */}
            <div className="border-t border-border px-3 py-3">
              <Pagination
                page={data.page}
                pageSize={pageSize}
                total={data.total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  resetPage();
                }}
                noun="clientes"
              />
            </div>
          </div>
        ) : null}
      </div>

      <ClientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        client={editing}
        onSaved={(client) =>
          setNotice(editing ? `${client.name} atualizado.` : `${client.name} cadastrado.`)
        }
      />
      <ArchiveClientDialog
        client={archiving}
        onOpenChange={(open) => {
          if (!open) setArchiving(null);
        }}
        onArchived={(client) => setNotice(`${client.name} arquivado.`)}
      />
    </>
  );
}
