/**
 * Contratos da descoberta de métricas em documentos (§35 + ajuste A5).
 *
 * O fluxo é: documento → texto (TextExtractor) → sugestões (MetricExtractionProvider) → revisão
 * humana → ativação. O provider pode ser o analisador local ou a integração com IA; ambos usam a
 * mesma interface e nenhuma sugestão é ativada sem revisão.
 */
import type { MetricDirection, MetricType } from '@inovaapss/shared';
import type { DocumentKind, SuggestedThresholds } from '@inovaapss/validation';

/** Texto extraído de um documento, já resumido para os formatos tabulares. */
export interface ExtractedText {
  kind: DocumentKind;
  text: string;
  /** Contagens que ajudam a tela (páginas, abas, linhas). */
  meta: {
    pages?: number;
    sheets?: number;
    rows?: number;
    /** true quando o texto foi cortado no limite (MAX_EXTRACTED_TEXT_CHARS). */
    truncated: boolean;
  };
}

/** O que o provider recebe sobre o documento (sem o binário: só o texto já extraído). */
export interface ExtractionDocument {
  id: string;
  organizationId: string;
  fileName: string;
  mimeType: string;
  kind: DocumentKind;
}

/** Sugestão produzida por um provider, antes de ser gravada. */
export interface MetricSuggestionDraft {
  suggestedName: string;
  description?: string | undefined;
  suggestedType: MetricType;
  suggestedDirection: MetricDirection;
  unit?: string | undefined;
  /** Fração 0–1. */
  suggestedWeight?: number | undefined;
  suggestedFormula?: Record<string, unknown> | undefined;
  suggestedThresholds?: SuggestedThresholds | undefined;
  /** 0–1: quão certo o provider está. */
  confidence?: number | undefined;
  sourceExcerpt?: string | undefined;
}

export interface MetricExtractionProvider {
  /** Identificador gravado em metric_extraction_suggestions.provider. */
  readonly name: string;
  /** Devolve sugestões a partir do texto; nunca ativa métrica (§35). */
  extract(document: ExtractionDocument, text: ExtractedText): Promise<MetricSuggestionDraft[]>;
}
