// ---------- §4 Papéis do usuário dentro da organização ----------
export const ORGANIZATION_ROLES = ['owner', 'admin', 'analyst', 'viewer'] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export const OrganizationRole = {
  OWNER: 'owner',
  ADMIN: 'admin',
  ANALYST: 'analyst',
  VIEWER: 'viewer',
} as const satisfies Record<string, OrganizationRole>;

// ---------- §6 Tipos de métrica ----------
export const METRIC_TYPES = [
  'TIME',
  'PERCENTAGE',
  'QUANTITY',
  'FREQUENCY',
  'FINANCIAL',
  'VARIATION',
  'SCORE',
  'BOOLEAN',
  'CATEGORY',
  'DATE_DEADLINE',
] as const;
export type MetricType = (typeof METRIC_TYPES)[number];
export const MetricType = {
  TIME: 'TIME',
  PERCENTAGE: 'PERCENTAGE',
  QUANTITY: 'QUANTITY',
  FREQUENCY: 'FREQUENCY',
  FINANCIAL: 'FINANCIAL',
  VARIATION: 'VARIATION',
  SCORE: 'SCORE',
  BOOLEAN: 'BOOLEAN',
  CATEGORY: 'CATEGORY',
  DATE_DEADLINE: 'DATE_DEADLINE',
} as const satisfies Record<string, MetricType>;

// ---------- §6 Direção: o que significa "melhor" para a métrica ----------
export const METRIC_DIRECTIONS = [
  'HIGHER_IS_BETTER',
  'HIGHER_IS_WORSE',
  'TARGET_RANGE',
  'CUSTOM',
] as const;
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number];
export const MetricDirection = {
  HIGHER_IS_BETTER: 'HIGHER_IS_BETTER',
  HIGHER_IS_WORSE: 'HIGHER_IS_WORSE',
  TARGET_RANGE: 'TARGET_RANGE',
  CUSTOM: 'CUSTOM',
} as const satisfies Record<string, MetricDirection>;

// ---------- §6 Fonte do dado (JSON incluído pelo ajuste A4) ----------
export const METRIC_SOURCES = [
  'MANUAL',
  'CSV',
  'XLSX',
  'JSON',
  'API',
  'DOCUMENT',
  'DERIVED',
] as const;
export type MetricSource = (typeof METRIC_SOURCES)[number];
export const MetricSource = {
  MANUAL: 'MANUAL',
  CSV: 'CSV',
  XLSX: 'XLSX',
  JSON: 'JSON',
  API: 'API',
  DOCUMENT: 'DOCUMENT',
  DERIVED: 'DERIVED',
} as const satisfies Record<string, MetricSource>;

// ---------- §9 Estratégias de normalização (valor bruto -> health 0–100) ----------
export const NORMALIZATION_STRATEGIES = [
  'THRESHOLD_BANDS',
  'LINEAR_RANGE',
  'RATIO_TO_TARGET',
  'BASELINE_DEVIATION',
  'BOOLEAN_MAP',
  'SCORE_MAP',
  'CUSTOM_SAFE_RULE',
] as const;
export type NormalizationStrategy = (typeof NORMALIZATION_STRATEGIES)[number];
export const NormalizationStrategy = {
  THRESHOLD_BANDS: 'THRESHOLD_BANDS',
  LINEAR_RANGE: 'LINEAR_RANGE',
  RATIO_TO_TARGET: 'RATIO_TO_TARGET',
  BASELINE_DEVIATION: 'BASELINE_DEVIATION',
  BOOLEAN_MAP: 'BOOLEAN_MAP',
  SCORE_MAP: 'SCORE_MAP',
  CUSTOM_SAFE_RULE: 'CUSTOM_SAFE_RULE',
} as const satisfies Record<string, NormalizationStrategy>;

// ---------- §14 Status mínimos de chamado ----------
export const TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'WAITING_INTERNAL',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TicketStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_CUSTOMER: 'WAITING_CUSTOMER',
  WAITING_INTERNAL: 'WAITING_INTERNAL',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const satisfies Record<string, TicketStatus>;

/** §14 — chamado ainda em andamento: o tempo decorrido é `now - opened_at`. */
export const OPEN_TICKET_STATUSES: readonly TicketStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'WAITING_INTERNAL',
];

// ---------- §14 Tipo da meta operacional sugerida ----------
export const OPERATIONAL_TARGET_TYPES = ['PERCENT_OF_SLA', 'ABSOLUTE_MINUTES'] as const;
export type OperationalTargetType = (typeof OPERATIONAL_TARGET_TYPES)[number];
export const OperationalTargetType = {
  PERCENT_OF_SLA: 'PERCENT_OF_SLA',
  ABSOLUTE_MINUTES: 'ABSOLUTE_MINUTES',
} as const satisfies Record<string, OperationalTargetType>;

// ---------- §32 Modo de definição dos pesos ----------
export const WEIGHT_MODES = ['MANUAL', 'ASSISTED', 'AUTOMATIC'] as const;
export type WeightMode = (typeof WEIGHT_MODES)[number];
export const WeightMode = {
  MANUAL: 'MANUAL',
  ASSISTED: 'ASSISTED',
  AUTOMATIC: 'AUTOMATIC',
} as const satisfies Record<string, WeightMode>;

// ---------- §34, §35, §45 + A4 — arquivos aceitos em importação e documentos ----------
export const ALLOWED_UPLOAD_MIME_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'text/markdown',
  'text/plain',
] as const;
export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

/** §34 + A4 — formatos que entram no importador de dados tabulares. */
export const IMPORT_FILE_TYPES = ['XLSX', 'CSV', 'JSON'] as const;
export type ImportFileType = (typeof IMPORT_FILE_TYPES)[number];
