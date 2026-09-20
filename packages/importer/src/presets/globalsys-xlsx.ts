/**
 * Preset da planilha do desafio (`data/INOVAAPPS_base_de_dados.xlsx`, §44): as quatro abas de
 * dados viram os quatro datasets do catálogo com mapeamento fixo. As abas `Leia-me` e
 * `dicionario` são ignoradas. O mapeamento é explícito (não sugerido) para o resultado ser o
 * mesmo em qualquer ambiente; se um cabeçalho da planilha mudar, o relatório acusa em
 * `missingFields`.
 *
 * Conversões que a planilha exige:
 *   - `sla_contratado_h` (horas) → `contracted_sla_hours` (horas; a API converte para minutos ao
 *     montar a política de SLA do engine);
 *   - `situacao` Ativo/Cancelado → `active`/`cancelled`, `mes_cancelamento` → `cancellation_period`;
 *   - `respondeu = 0` com `nota_nps` vazia → `answered: false`, `score: null` (válido, §22).
 */

import {
  type ClientRow,
  type ClientStatusRow,
  type MonthlyMetricsRow,
  type NpsRow,
} from '../datasets/schemas.js';
import { readWorkbook, type WorkbookInput } from '../readers/xlsx.js';
import { ImportReadError } from '../shared/errors.js';
import { normalizeHeader } from '../shared/headers.js';
import { type DatasetKey, type ImportReport, type Mapping, type TabularSheet } from '../types.js';
import { importDataset, mergeReports } from '../validation/validate.js';

export interface GlobalSysSheetPreset {
  /** Nome da aba na planilha (comparado depois de `normalizeHeader`). */
  sheet: string;
  dataset: DatasetKey;
  mapping: Mapping;
}

export const GLOBALSYS_SHEET_PRESETS: readonly GlobalSysSheetPreset[] = [
  {
    sheet: 'clientes',
    dataset: 'clients',
    mapping: {
      external_code: 'cliente_id',
      name: null,
      segment: 'segmento',
      size: 'porte',
      plan: 'plano',
      monthly_value: 'valor_mensal',
      contracted_sla_hours: 'sla_contratado_h',
      contract_start: 'inicio_contrato',
    },
  },
  {
    sheet: 'atendimento_mensal',
    dataset: 'monthly_metrics',
    mapping: {
      external_code: 'cliente_id',
      period: 'mes_ref',
      open_tickets: 'chamados_abertos',
      critical_tickets: 'chamados_criticos',
      reopened_tickets: 'chamados_reabertos',
      tickets_within_sla: 'chamados_dentro_sla',
      sla_compliance_pct: 'pct_sla_cumprido',
      avg_resolution_hours: 'tempo_medio_resolucao_h',
      formal_complaints: 'reclamacoes_formais',
      platform_usage_pct: 'uso_plataforma_pct',
      payment_delay_days: 'dias_atraso_pagamento',
      meetings_planned: 'reunioes_previstas',
      meetings_completed: 'reunioes_realizadas',
    },
  },
  {
    sheet: 'pesquisas_nps',
    dataset: 'nps',
    mapping: {
      external_code: 'cliente_id',
      period: 'mes_ref',
      answered: 'respondeu',
      score: 'nota_nps',
      classification: 'classificacao_nps',
    },
  },
  {
    sheet: 'situacao_clientes',
    dataset: 'client_status',
    mapping: {
      external_code: 'cliente_id',
      status: 'situacao',
      cancellation_period: 'mes_cancelamento',
    },
  },
];

export interface GlobalSysImportReport {
  clients: ImportReport;
  monthlyMetrics: ImportReport;
  nps: ImportReport;
  clientStatus: ImportReport;
  /** Soma das quatro tabelas. */
  summary: ImportReport;
  hasErrors: boolean;
}

export interface GlobalSysImportResult {
  clients: ClientRow[];
  monthlyMetrics: MonthlyMetricsRow[];
  nps: NpsRow[];
  clientStatus: ClientStatusRow[];
  report: GlobalSysImportReport;
}

/** Localiza a aba pelo nome normalizado (aceita "Clientes", "clientes ", etc.). */
export function findSheet(sheets: readonly TabularSheet[], name: string): TabularSheet | undefined {
  const wanted = normalizeHeader(name);
  return sheets.find((sheet) => normalizeHeader(sheet.name) === wanted);
}

/** Traduz o mapeamento fixo (cabeçalhos normalizados) para os cabeçalhos originais da aba. */
function resolveMapping(sheet: TabularSheet, mapping: Mapping): Mapping {
  const resolved: Mapping = {};
  for (const [field, header] of Object.entries(mapping)) {
    if (header === null) {
      resolved[field] = null;
      continue;
    }
    const index = sheet.normalizedHeaders.indexOf(normalizeHeader(header));
    resolved[field] = index >= 0 ? (sheet.headers[index] ?? null) : null;
  }
  return resolved;
}

/** Lê a planilha do desafio inteira e devolve os quatro datasets validados mais o relatório. */
export function importGlobalSysWorkbook(input: WorkbookInput): GlobalSysImportResult {
  const { sheets } = readWorkbook(input);
  const bySheet = new Map<DatasetKey, TabularSheet>();
  for (const preset of GLOBALSYS_SHEET_PRESETS) {
    const sheet = findSheet(sheets, preset.sheet);
    if (!sheet) {
      throw new ImportReadError(
        `A planilha não tem a aba "${preset.sheet}" (abas encontradas: ${sheets.map((s) => s.name).join(', ')}).`,
      );
    }
    bySheet.set(preset.dataset, sheet);
  }
  const run = <K extends DatasetKey>(key: K) => {
    const preset = GLOBALSYS_SHEET_PRESETS.find((p) => p.dataset === key)!;
    const sheet = bySheet.get(key)!;
    return importDataset(key, sheet.rows, resolveMapping(sheet, preset.mapping), sheet.headers);
  };

  const clients = run('clients');
  const monthlyMetrics = run('monthly_metrics');
  const nps = run('nps');
  const clientStatus = run('client_status');
  const summary = mergeReports([
    clients.report,
    monthlyMetrics.report,
    nps.report,
    clientStatus.report,
  ]);

  return {
    clients: clients.rows,
    monthlyMetrics: monthlyMetrics.rows,
    nps: nps.rows,
    clientStatus: clientStatus.rows,
    report: {
      clients: clients.report,
      monthlyMetrics: monthlyMetrics.report,
      nps: nps.report,
      clientStatus: clientStatus.report,
      summary,
      hasErrors: summary.errors.length > 0 || summary.missingFields.length > 0,
    },
  };
}
