import { Upload } from 'lucide-react';
import { type DragEvent, useId, useRef, useState } from 'react';

import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  resolveUploadType,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from '@inovaapss/validation';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { formatFileSize } from './format';

export interface RejectedFile {
  fileName: string;
  reason: string;
}

interface UploadDropzoneProps {
  /** Arquivos que passaram na validação local (extensão, MIME e tamanho). */
  onAccepted(files: File[]): void;
  /** Arquivos recusados antes de chegar à API, com o motivo. */
  onRejected?(files: RejectedFile[]): void;
  disabled?: boolean;
}

/** Aplica a allowlist (§45) no navegador para dar o erro na hora; a API confere de novo. */
function validateFiles(files: readonly File[]): {
  accepted: File[];
  rejected: RejectedFile[];
} {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  for (const file of files) {
    const resolved = resolveUploadType(file.name, file.type);
    if (!resolved.ok) {
      rejected.push({ fileName: file.name, reason: resolved.reason });
    } else if (file.size > MAX_UPLOAD_BYTES) {
      rejected.push({
        fileName: file.name,
        reason: `Arquivo com ${formatFileSize(file.size)}; o limite é ${formatFileSize(MAX_UPLOAD_BYTES)}.`,
      });
    } else if (file.size === 0) {
      rejected.push({ fileName: file.name, reason: 'O arquivo está vazio.' });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

/** Área de arrastar/soltar com botão, listando os tipos aceitos (§35 + A4). */
export function UploadDropzone({ onAccepted, onRejected, disabled = false }: UploadDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const { accepted, rejected } = validateFiles(Array.from(list));
    if (rejected.length > 0) onRejected?.(rejected);
    if (accepted.length > 0) onAccepted(accepted);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFiles(event.dataTransfer.files);
  };

  return (
    <div
      role="group"
      aria-label="Enviar documentos"
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center transition-colors sm:px-6 sm:py-10',
        dragging ? 'border-primary bg-primary/5' : 'border-border bg-card/40',
        disabled && 'opacity-60',
      )}
    >
      <span
        className={cn(
          'flex size-11 items-center justify-center rounded-full transition-colors',
          dragging ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground',
        )}
      >
        <Upload className="size-5" aria-hidden="true" />
      </span>
      <div className="max-w-md">
        <p className="text-sm font-medium text-balance">
          Arraste os arquivos para cá ou escolha no computador
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Aceitos:{' '}
          {ALLOWED_UPLOAD_EXTENSIONS.map((ext) => ext.replace('.', '').toUpperCase()).join(', ')}
          {' · '}até {formatFileSize(MAX_UPLOAD_BYTES)} por arquivo
        </p>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT_ATTRIBUTE}
        className="sr-only"
        aria-label="Escolher arquivos"
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Escolher arquivos
      </Button>
    </div>
  );
}
