import {
  ArrowLeft,
  CircleCheckBig,
  CircleAlert,
  Download,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';

import {
  type MetricSuggestion,
  useCreateSuggestion,
  useDocument,
  useExtractMetrics,
  useReviewSuggestion,
  useSuggestions,
} from './api';
import { DocumentOriginBadge, DocumentStatusBadge } from './DocumentStatusBadge';
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_ORIGIN_DESCRIPTIONS,
  formatDateTime,
  formatFileSize,
} from './format';
import { SuggestionForm } from './SuggestionForm';
import { SuggestionsTable } from './SuggestionsTable';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Uma linha de metadado do arquivo (rótulo acima, valor abaixo). */
function MetadataItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

/**
 * /documents/:id — metadados, análise automática, sugestões e revisão humana. Aceitar uma
 * sugestão leva a /metrics com `state.prefill`.
 */
export function DocumentDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const document = useDocument(id);
  const suggestions = useSuggestions(id);
  const extract = useExtractMetrics(id);
  const create = useCreateSuggestion(id);
  const review = useReviewSuggestion(id);
  const [showForm, setShowForm] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  if (document.isPending) {
    return (
      <div role="status" aria-label="Carregando documento" className="space-y-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (document.isError) {
    const notFound = document.error instanceof ApiError && document.error.status === 404;
    return (
      <>
        <PageHeader title="Documento" />
        <EmptyState
          icon={CircleAlert}
          title={notFound ? 'Documento não encontrado' : 'Não foi possível carregar o documento'}
          description={
            notFound
              ? 'Ele pode ter sido removido ou pertencer a outra organização.'
              : errorMessage(document.error, 'Tente de novo em instantes.')
          }
          action={
            <Button asChild variant="outline">
              <Link to="/documents">
                <ArrowLeft aria-hidden="true" />
                Voltar para documentos
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  const doc = document.data;
  const busyId = review.accept.isPending
    ? review.accept.variables
    : review.reject.isPending
      ? review.reject.variables
      : null;

  const onAccept = (suggestion: MetricSuggestion) => {
    setReviewError(null);
    review.accept
      .mutateAsync(suggestion.id)
      .then((result) => {
        navigate('/metrics', { state: { prefill: result.metricPayload } });
      })
      .catch((error: unknown) => {
        setReviewError(errorMessage(error, 'Não foi possível aceitar a sugestão.'));
      });
  };

  const onReject = (suggestion: MetricSuggestion) => {
    setReviewError(null);
    review.reject.mutateAsync(suggestion.id).catch((error: unknown) => {
      setReviewError(errorMessage(error, 'Não foi possível rejeitar a sugestão.'));
    });
  };

  return (
    <>
      <PageHeader
        title={doc.fileName}
        description={`${DOCUMENT_KIND_LABELS[doc.kind]} · ${formatFileSize(doc.sizeBytes)} · enviado em ${formatDateTime(doc.createdAt)}`}
      >
        <Button asChild variant="ghost">
          <Link to="/documents">
            <ArrowLeft aria-hidden="true" />
            Documentos
          </Link>
        </Button>
        <Button asChild variant="outline">
          <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
            <Download aria-hidden="true" />
            Baixar
          </a>
        </Button>
        <Button
          type="button"
          disabled={extract.isPending}
          onClick={() => extract.mutate()}
          aria-label={doc.hasExtractedText ? 'Analisar documento de novo' : 'Analisar documento'}
        >
          <Sparkles aria-hidden="true" />
          {extract.isPending
            ? 'Analisando…'
            : doc.hasExtractedText
              ? 'Analisar de novo'
              : 'Analisar documento'}
        </Button>
      </PageHeader>

      <section aria-labelledby="metadados" className="mb-6">
        <h3 id="metadados" className="sr-only">
          Dados do arquivo
        </h3>
        <dl className="grid grid-cols-2 gap-4 rounded-xl border border-border p-4 sm:grid-cols-3 lg:grid-cols-6">
          <MetadataItem label="Arquivo">{doc.fileName}</MetadataItem>
          <MetadataItem label="Tipo">
            {DOCUMENT_KIND_LABELS[doc.kind]}{' '}
            <span className="font-normal text-muted-foreground">({doc.mimeType})</span>
          </MetadataItem>
          <MetadataItem label="Tamanho">{formatFileSize(doc.sizeBytes)}</MetadataItem>
          <MetadataItem label="Origem">
            <DocumentOriginBadge origin={doc.origin} />
          </MetadataItem>
          <MetadataItem label="Enviado por">
            {doc.uploadedByEmail ?? (doc.origin === 'import' ? 'Importação de dados' : '—')}
          </MetadataItem>
          <MetadataItem label="Guardado em">{formatDateTime(doc.createdAt)}</MetadataItem>
        </dl>
      </section>

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <DocumentStatusBadge status={doc.status} />
        <span className="text-muted-foreground">{DOCUMENT_ORIGIN_DESCRIPTIONS[doc.origin]}</span>
        {doc.importJobId ? (
          <span className="text-xs text-muted-foreground">Job de importação {doc.importJobId}</span>
        ) : null}
        {doc.extractedAt ? (
          <span className="text-muted-foreground">
            Texto extraído em {formatDateTime(doc.extractedAt)}
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">
          Link de download válido por {Math.round(doc.downloadUrlExpiresInSeconds / 60)} min.
        </span>
      </div>

      {extract.isError ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {errorMessage(extract.error, 'Não foi possível analisar o documento.')}
        </p>
      ) : null}
      {extract.isSuccess ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm"
        >
          <CircleCheckBig aria-hidden="true" className="mt-0.5 size-4 text-emerald-600" />
          <span>
            {extract.data.suggestions.length > 0
              ? `${extract.data.suggestions.length} sugestão${extract.data.suggestions.length === 1 ? '' : 'ões'} gerada${extract.data.suggestions.length === 1 ? '' : 's'} pela análise automática.`
              : 'Análise concluída. Nenhuma métrica defensável foi encontrada; você ainda pode registrar uma sugestão manual.'}
          </span>
        </div>
      ) : null}
      {doc.status === 'failed' && doc.extractionError ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Última extração falhou: {doc.extractionError}
        </p>
      ) : null}

      <section aria-labelledby="texto-extraido" className="mb-8">
        <h3 id="texto-extraido" className="mb-2 text-base font-semibold">
          Texto extraído
        </h3>
        {doc.extractedTextPreview ? (
          <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {doc.extractedTextPreview}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ainda não há texto extraído. Clique em “Analisar documento” para ler o conteúdo e gerar
            sugestões de métricas automaticamente.
          </p>
        )}
      </section>

      <section aria-labelledby="sugestoes" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="sugestoes" className="text-base font-semibold">
              Sugestões de métrica
            </h3>
            <p className="text-sm text-muted-foreground">
              A análise automática encontra métricas, limites e evidências no arquivo. Revise antes
              de aceitar; a métrica só é criada depois da sua confirmação no cadastro.
            </p>
          </div>
          {!showForm ? (
            <Button type="button" variant="outline" onClick={() => setShowForm(true)}>
              <Plus aria-hidden="true" />
              Nova sugestão a partir deste documento
            </Button>
          ) : null}
        </div>

        {showForm ? (
          <div className="rounded-xl border border-border p-4">
            <SuggestionForm
              submitting={create.isPending}
              serverError={
                create.isError ? errorMessage(create.error, 'Não foi possível salvar.') : null
              }
              onCancel={() => {
                create.reset();
                setShowForm(false);
              }}
              onSubmit={async (body) => {
                await create.mutateAsync(body);
                setShowForm(false);
              }}
            />
          </div>
        ) : null}

        {reviewError ? (
          <p role="alert" className="text-sm text-destructive">
            {reviewError}
          </p>
        ) : null}

        {suggestions.isPending ? (
          <Skeleton className="h-32 w-full" aria-label="Carregando sugestões" />
        ) : suggestions.isError ? (
          <EmptyState
            icon={CircleAlert}
            title="Não foi possível carregar as sugestões"
            description={errorMessage(suggestions.error, 'Tente de novo em instantes.')}
            action={
              <Button type="button" variant="outline" onClick={() => void suggestions.refetch()}>
                <RefreshCw aria-hidden="true" />
                Tentar de novo
              </Button>
            }
          />
        ) : suggestions.data.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Nenhuma sugestão ainda"
            description="Analise o documento para buscar métricas automaticamente. Se necessário, você também pode registrar uma sugestão manual."
          />
        ) : (
          <SuggestionsTable
            suggestions={suggestions.data}
            onAccept={onAccept}
            onReject={onReject}
            busyId={busyId ?? null}
          />
        )}
      </section>
    </>
  );
}
