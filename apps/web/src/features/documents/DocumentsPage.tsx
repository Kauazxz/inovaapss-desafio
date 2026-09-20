import { CircleAlert, FileText, RefreshCw, Search } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';

import {
  DOCUMENT_KINDS,
  DOCUMENT_ORIGINS,
  type DocumentKind,
  type DocumentOrigin,
} from '@inovaapss/validation';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useDocuments, useUploadDocument } from './api';
import { DocumentOriginBadge, DocumentStatusBadge } from './DocumentStatusBadge';
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_ORIGIN_LABELS,
  formatDateTime,
  formatFileSize,
} from './format';
import { type RejectedFile, UploadDropzone } from './UploadDropzone';

const PAGE_SIZE = 20;

// Largura total no celular; a partir de sm o filtro volta a caber pelo conteúdo, lado a lado.
const SELECT_CLASS =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto dark:bg-input/30';

interface UploadNotice {
  fileName: string;
  kind: 'error' | 'ok';
  message: string;
}

/**
 * /documents (§35, §38) — o arquivo da organização: tudo o que a empresa guarda num lugar só.
 * Entram os arquivos enviados aqui (contratos, manuais de KPI, políticas de SLA, relatórios) e
 * as planilhas que a importação de dados gravou (campo `origin`). Filtro por tipo, por origem e
 * busca pelo nome; o detalhe abre o texto extraído e as sugestões de métrica.
 */
export function DocumentsPage() {
  const searchId = useId();
  const kindId = useId();
  const originId = useId();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<DocumentKind | ''>('');
  const [origin, setOrigin] = useState<DocumentOrigin | ''>('');
  const [page, setPage] = useState(1);
  const [notices, setNotices] = useState<UploadNotice[]>([]);
  const documents = useDocuments({
    page,
    pageSize: PAGE_SIZE,
    search: search.trim() || undefined,
    kind: kind === '' ? undefined : kind,
    origin: origin === '' ? undefined : origin,
  });
  const upload = useUploadDocument();

  const onAccepted = async (files: File[]) => {
    for (const file of files) {
      try {
        await upload.mutateAsync(file);
        setNotices((current) => [
          ...current.filter((n) => n.fileName !== file.name),
          { fileName: file.name, kind: 'ok', message: 'enviado.' },
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'falha no envio.';
        setNotices((current) => [
          ...current.filter((n) => n.fileName !== file.name),
          { fileName: file.name, kind: 'error', message },
        ]);
      }
    }
  };

  const onRejected = (rejected: RejectedFile[]) => {
    setNotices((current) => [
      ...current,
      ...rejected.map((r): UploadNotice => ({
        fileName: r.fileName,
        kind: 'error',
        message: r.reason,
      })),
    ]);
  };

  const data = documents.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = search.trim() !== '' || kind !== '' || origin !== '';
  const clearFilters = () => {
    setSearch('');
    setKind('');
    setOrigin('');
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Arquivo da organização"
        description="Tudo o que a empresa guarda: contratos, manuais de KPI, políticas de SLA, relatórios e as planilhas enviadas na importação de dados. Do arquivo saem as sugestões de métrica."
      />

      <section className="mb-6 space-y-3" aria-labelledby="upload-titulo">
        <h3 id="upload-titulo" className="sr-only">
          Enviar documentos
        </h3>
        <UploadDropzone
          onAccepted={(files) => void onAccepted(files)}
          onRejected={onRejected}
          disabled={upload.isPending}
        />
        {upload.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Enviando…
          </p>
        ) : null}
        {notices.length > 0 ? (
          <ul aria-label="Resultado do envio" className="space-y-1 text-sm break-words">
            {notices.map((notice) => (
              <li
                key={`${notice.fileName}-${notice.kind}-${notice.message}`}
                role={notice.kind === 'error' ? 'alert' : undefined}
                className={notice.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}
              >
                <span className="font-medium">{notice.fileName}</span>: {notice.message}
              </li>
            ))}
            <li>
              <button
                type="button"
                className="py-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setNotices([])}
              >
                Limpar avisos
              </button>
            </li>
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="lista-titulo" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <h3 id="lista-titulo" className="text-base font-medium">
            Documentos guardados{data ? ` (${data.total})` : ''}
          </h3>
          {/* No celular cada filtro pega a linha inteira; de sm em diante voltam a caber juntos. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
              <label htmlFor={kindId} className="shrink-0 text-sm text-muted-foreground">
                Tipo
              </label>
              <select
                id={kindId}
                className={SELECT_CLASS}
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as DocumentKind | '');
                  setPage(1);
                }}
              >
                <option value="">Todos os tipos</option>
                {DOCUMENT_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {DOCUMENT_KIND_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
              <label htmlFor={originId} className="shrink-0 text-sm text-muted-foreground">
                Origem
              </label>
              <select
                id={originId}
                className={SELECT_CLASS}
                value={origin}
                onChange={(event) => {
                  setOrigin(event.target.value as DocumentOrigin | '');
                  setPage(1);
                }}
              >
                <option value="">Todas as origens</option>
                {DOCUMENT_ORIGINS.map((option) => (
                  <option key={option} value={option}>
                    {DOCUMENT_ORIGIN_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative w-full min-w-0 sm:w-56">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={searchId}
                type="search"
                aria-label="Buscar por nome do arquivo"
                placeholder="Buscar por nome"
                className="pl-8"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>

        {documents.isPending ? (
          <div
            role="status"
            aria-label="Carregando documentos"
            className="space-y-2 rounded-2xl bg-card p-5 shadow-soft ring-1 ring-foreground/5"
          >
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : documents.isError ? (
          <EmptyState
            icon={CircleAlert}
            title="Não foi possível carregar os documentos"
            description={
              documents.error instanceof Error
                ? documents.error.message
                : 'Tente de novo em instantes.'
            }
            action={
              <Button type="button" variant="outline" onClick={() => void documents.refetch()}>
                <RefreshCw aria-hidden="true" />
                Tentar de novo
              </Button>
            }
          />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={filtered ? 'Nenhum documento com esses filtros' : 'O arquivo ainda está vazio'}
            description={
              filtered
                ? 'Ajuste a busca, o tipo ou a origem para ver o resto do arquivo.'
                : 'Envie um PDF, DOCX, XLSX, CSV, JSON, MD ou TXT acima. As planilhas da importação de dados aparecem aqui sozinhas. Depois, extraia o texto e registre as métricas que o documento descreve.'
            }
            action={
              filtered ? (
                <Button type="button" variant="outline" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : undefined
            }
          />
        ) : data ? (
          // No celular sobram as duas colunas que contam a história: qual arquivo e em que pé
          // está a extração. Tamanho, data, tipo e origem voltam conforme a tela cresce.
          <div className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/5">
            <Table aria-label="Documentos guardados">
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="hidden md:table-cell">Tipo</TableHead>
                  <TableHead className="hidden lg:table-cell">Origem</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Tamanho</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Guardado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((doc) => (
                  <TableRow key={doc.id} data-document-id={doc.id}>
                    <TableCell className="font-medium">
                      {/* Nome comprido corta em vez de empurrar o status para fora da tela. */}
                      <Link
                        to={`/documents/${doc.id}`}
                        className="block max-w-44 truncate underline-offset-4 hover:underline sm:max-w-none"
                      >
                        {doc.fileName}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {DOCUMENT_KIND_LABELS[doc.kind]}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <DocumentOriginBadge origin={doc.origin} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatFileSize(doc.sizeBytes)}
                    </TableCell>
                    <TableCell>
                      <DocumentStatusBadge status={doc.status} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                      {formatDateTime(doc.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {/* A paginação fecha a mesma superfície da tabela, separada por uma linha fina. */}
            {totalPages > 1 ? (
              <nav
                aria-label="Paginação"
                className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-3 py-3 text-sm"
              >
                <span className="mr-auto tabular-nums whitespace-nowrap text-muted-foreground">
                  Página {data.page} de {totalPages}
                </span>
                {/* Alvo de toque de 36 px no celular; de sm em diante o botão fica compacto. */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 sm:h-7"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 sm:h-7"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </nav>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
