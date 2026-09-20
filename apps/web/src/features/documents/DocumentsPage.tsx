import { CircleAlert, FileText, RefreshCw, Search } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';

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
import { DocumentStatusBadge } from './DocumentStatusBadge';
import { DOCUMENT_KIND_LABELS, formatDateTime, formatFileSize } from './format';
import { type RejectedFile, UploadDropzone } from './UploadDropzone';

const PAGE_SIZE = 20;

interface UploadNotice {
  fileName: string;
  kind: 'error' | 'ok';
  message: string;
}

/**
 * /documents (§38): upload por arrastar/soltar ou botão, lista com status e link para o
 * detalhe. Contratos, manuais de KPI e políticas de SLA entram aqui para virar sugestões de
 * métricas (§35, fluxo manual — A5).
 */
export function DocumentsPage() {
  const searchId = useId();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [notices, setNotices] = useState<UploadNotice[]>([]);
  const documents = useDocuments({ page, pageSize: PAGE_SIZE, search: search.trim() || undefined });
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
  const filtered = search.trim() !== '';

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Contratos, manuais de KPI, relatórios e políticas de SLA viram sugestões de métricas para o modelo."
      />

      <section className="mb-8 space-y-3" aria-labelledby="upload-titulo">
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
          <ul aria-label="Resultado do envio" className="space-y-1 text-sm">
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
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setNotices([])}
              >
                Limpar avisos
              </button>
            </li>
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="lista-titulo" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="lista-titulo" className="text-base font-semibold">
            Documentos enviados{data ? ` (${data.total})` : ''}
          </h3>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              aria-label="Buscar por nome do arquivo"
              placeholder="Buscar por nome"
              className="w-64 pl-8"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        {documents.isPending ? (
          <div role="status" aria-label="Carregando documentos" className="space-y-2">
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
            title={filtered ? 'Nenhum documento com esse nome' : 'Nenhum documento enviado'}
            description={
              filtered
                ? 'Ajuste a busca ou limpe o campo para ver todos.'
                : 'Envie um PDF, DOCX, XLSX, CSV, JSON, MD ou TXT acima. Depois, extraia o texto e registre as métricas que ele descreve.'
            }
            action={
              filtered ? (
                <Button type="button" variant="outline" onClick={() => setSearch('')}>
                  Limpar busca
                </Button>
              ) : undefined
            }
          />
        ) : data ? (
          <>
            <Table aria-label="Documentos enviados">
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Tamanho</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enviado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((doc) => (
                  <TableRow key={doc.id} data-document-id={doc.id}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/documents/${doc.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {doc.fileName}
                      </Link>
                    </TableCell>
                    <TableCell>{DOCUMENT_KIND_LABELS[doc.kind]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatFileSize(doc.sizeBytes)}
                    </TableCell>
                    <TableCell>
                      <DocumentStatusBadge status={doc.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(doc.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPages > 1 ? (
              <nav aria-label="Paginação" className="flex items-center justify-end gap-2 text-sm">
                <span className="text-muted-foreground">
                  Página {data.page} de {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </nav>
            ) : null}
          </>
        ) : null}
      </section>
    </>
  );
}
