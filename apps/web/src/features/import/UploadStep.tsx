import { CircleAlert, Upload } from 'lucide-react';
import { type DragEvent, useRef, useState } from 'react';

import {
  ALLOWED_IMPORT_EXTENSIONS,
  IMPORT_ACCEPT_ATTRIBUTE,
  MAX_IMPORT_BYTES,
  resolveImportFileType,
} from '@inovaapss/validation';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { formatFileSize } from './format';

interface UploadStepProps {
  onFile(file: File): void;
  uploading: boolean;
  /** Erro vindo da API (formato recusado, arquivo ilegível...). */
  error: string | null;
}

/**
 * Passo 1 (§34): o arquivo. A allowlist (§45) é aplicada aqui para o erro aparecer na hora —
 * a API confere de novo, porque validação no navegador é conveniência, não segurança.
 */
export function UploadStep({ onFile, uploading, error }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const file = list[0];
    if (file === undefined) return;

    const resolved = resolveImportFileType(file.name, file.type);
    if (!resolved.ok) {
      setLocalError(resolved.reason);
      return;
    }
    if (file.size === 0) {
      setLocalError('O arquivo está vazio.');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setLocalError(
        `Arquivo com ${formatFileSize(file.size)}; o limite é ${formatFileSize(MAX_IMPORT_BYTES)}.`,
      );
      return;
    }
    setLocalError(null);
    onFile(file);
  };

  const message = localError ?? error;

  return (
    <section className="space-y-4">
      <div
        role="group"
        aria-label="Enviar planilha"
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragging(false);
          if (!uploading) handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border',
          uploading && 'opacity-60',
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Upload className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium">Arraste a planilha para cá ou escolha no computador</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {ALLOWED_IMPORT_EXTENSIONS.map((extension) =>
              extension.replace('.', '').toUpperCase(),
            ).join(', ')}
            {' · '}até {formatFileSize(MAX_IMPORT_BYTES)}
            {' · '}nada é gravado antes de você conferir e confirmar
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={IMPORT_ACCEPT_ATTRIBUTE}
          className="sr-only"
          aria-label="Escolher planilha"
          disabled={uploading}
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Lendo o arquivo…' : 'Escolher arquivo'}
        </Button>
      </div>

      {message === null ? null : (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {message}
        </p>
      )}
    </section>
  );
}
