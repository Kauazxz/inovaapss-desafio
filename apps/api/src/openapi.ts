/**
 * Documento OpenAPI 3.1 escrito à mão (objeto tipado, sem gerador).
 * Cada módulo acrescenta os seus `paths` e `components.schemas` aqui quando registra rotas.
 */
import { API_VERSION } from './config/version.js';

import type { OpenAPIV3_1 } from 'openapi-types';

const errorSchema: OpenAPIV3_1.SchemaObject = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string', example: 'NOT_FOUND' },
        message: { type: 'string', example: 'Rota GET /x não encontrada.' },
        requestId: { type: 'string', format: 'uuid' },
        details: { description: 'Detalhes adicionais (ex.: issues de validação).' },
      },
    },
  },
};

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const jsonResponse = (description: string, schema: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } },
});

const jsonBody = (schema: string) => ({
  required: true,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } },
});

const ORGANIZATION_ROLES = ['owner', 'admin', 'analyst', 'viewer'];
const SLUG_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$';

// ---- métricas (Etapa 3, §6, §36, §37) ----
const METRIC_TYPES = [
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
];
const METRIC_DIRECTIONS = ['HIGHER_IS_BETTER', 'HIGHER_IS_WORSE', 'TARGET_RANGE', 'CUSTOM'];
const METRIC_SOURCES = ['MANUAL', 'CSV', 'XLSX', 'JSON', 'API', 'DOCUMENT', 'DERIVED'];
const METRIC_PERIODICITIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];
const NORMALIZATION_STRATEGIES = [
  'THRESHOLD_BANDS',
  'LINEAR_RANGE',
  'RATIO_TO_TARGET',
  'BASELINE_DEVIATION',
  'BOOLEAN_MAP',
  'SCORE_MAP',
  'CUSTOM_SAFE_RULE',
];
const WEIGHT_MODES = ['MANUAL', 'ASSISTED', 'AUTOMATIC'];
const VERSION_STATUSES = ['draft', 'active', 'archived'];
const METRIC_SLUG_PATTERN = '^[a-z0-9]+(?:[-_][a-z0-9]+)*$';

const weightProperty: OpenAPIV3_1.SchemaObject = {
  type: 'number',
  minimum: 0,
  maximum: 1,
  description: 'Fração 0–1 com até 4 casas decimais (0,18 = 18 %).',
  example: 0.18,
};

const idParam = (name: string, description: string): OpenAPIV3_1.ParameterObject => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description,
});

const versionParam: OpenAPIV3_1.ParameterObject = {
  name: 'version',
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
  description: 'Número da versão dentro do modelo (1, 2, 3...).',
};

const paginationParams: OpenAPIV3_1.ParameterObject[] = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'pageSize',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
  { name: 'search', in: 'query', schema: { type: 'string', maxLength: 200 } },
  { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
];

const metricDefinitionSchema: OpenAPIV3_1.SchemaObject = {
  type: 'object',
  required: [
    'id',
    'organizationId',
    'name',
    'slug',
    'description',
    'category',
    'metricType',
    'unit',
    'direction',
    'periodicity',
    'sourceType',
    'isActive',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    organizationId: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Cumprimento de SLA' },
    slug: { type: 'string', pattern: METRIC_SLUG_PATTERN, example: 'sla_compliance' },
    description: { type: ['string', 'null'] },
    category: { type: ['string', 'null'], example: 'Atendimento' },
    metricType: { type: 'string', enum: METRIC_TYPES },
    unit: { type: ['string', 'null'], example: '%' },
    direction: { type: 'string', enum: METRIC_DIRECTIONS },
    periodicity: { type: 'string', enum: METRIC_PERIODICITIES },
    sourceType: { type: 'string', enum: METRIC_SOURCES },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const metricModelItemInputSchema: OpenAPIV3_1.SchemaObject = {
  type: 'object',
  required: ['metricDefinitionId', 'weight', 'normalization'],
  description:
    'Configuração de uma métrica dentro da versão (§36 metric_model_items). Os JSONs seguem os tipos do motor (docs/METRICS_ENGINE.md).',
  properties: {
    metricDefinitionId: { type: 'string', format: 'uuid' },
    weight: weightProperty,
    currentWeight: { ...weightProperty, default: 0.45 },
    trendWeight: { ...weightProperty, default: 0.35 },
    persistenceWeight: { ...weightProperty, default: 0.2 },
    normalization: {
      type: 'object',
      required: ['strategy'],
      description: 'NormalizationConfig do motor: `strategy` + campos da estratégia (§9).',
      properties: { strategy: { type: 'string', enum: NORMALIZATION_STRATEGIES } },
      additionalProperties: true,
      example: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
    },
    thresholds: {
      type: ['object', 'null'],
      description: '`{ trend?: TrendConfig, persistence?: PersistenceConfig }` (§10, §11).',
      additionalProperties: true,
    },
    triggers: {
      type: ['array', 'null'],
      description: 'TriggerConfig[] (§27): THRESHOLD, STREAK ou JSON_LOGIC.',
      items: { type: 'object', additionalProperties: true },
    },
    formula: {
      type: ['object', 'null'],
      description:
        '`{ explanationTemplate?, params?, rule? }` — regra JSON Logic segura, nunca eval.',
      additionalProperties: true,
    },
    sortOrder: { type: 'integer', minimum: 0 },
  },
};

const metricModelItemSchema: OpenAPIV3_1.SchemaObject = {
  type: 'object',
  required: [
    'id',
    'metricModelVersionId',
    'metricDefinitionId',
    'weight',
    'currentWeight',
    'trendWeight',
    'persistenceWeight',
    'normalizationStrategy',
    'normalizationConfig',
    'thresholdConfig',
    'criticalTriggerConfig',
    'formulaConfig',
    'sortOrder',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    metricModelVersionId: { type: 'string', format: 'uuid' },
    metricDefinitionId: { type: 'string', format: 'uuid' },
    weight: weightProperty,
    currentWeight: weightProperty,
    trendWeight: weightProperty,
    persistenceWeight: weightProperty,
    normalizationStrategy: { type: 'string', enum: NORMALIZATION_STRATEGIES },
    normalizationConfig: { type: 'object', additionalProperties: true },
    thresholdConfig: { type: ['object', 'null'], additionalProperties: true },
    criticalTriggerConfig: { type: ['array', 'null'], items: { type: 'object' } },
    formulaConfig: { type: ['object', 'null'], additionalProperties: true },
    sortOrder: { type: 'integer' },
  },
};

const metricModelVersionSchema: OpenAPIV3_1.SchemaObject = {
  type: 'object',
  required: [
    'id',
    'metricModelId',
    'organizationId',
    'version',
    'status',
    'effectiveFrom',
    'createdAt',
    'items',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    metricModelId: { type: 'string', format: 'uuid' },
    organizationId: { type: 'string', format: 'uuid' },
    version: { type: 'integer', minimum: 1 },
    status: { type: 'string', enum: VERSION_STATUSES },
    effectiveFrom: { type: ['string', 'null'], format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    items: { type: 'array', items: { $ref: '#/components/schemas/MetricModelItem' } },
  },
};

const metricModelSchema: OpenAPIV3_1.SchemaObject = {
  type: 'object',
  required: ['id', 'organizationId', 'name', 'mode', 'isActive', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    organizationId: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'GlobalSys v1' },
    mode: { type: 'string', enum: WEIGHT_MODES },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const metricScoreSchema: OpenAPIV3_1.SchemaObject = {
  type: 'object',
  description: 'MetricScore do motor (SCORING.md): componentes, confiança, gatilhos e explicação.',
  required: [
    'metricId',
    'metricName',
    'metricHealth',
    'currentHealth',
    'trendHealth',
    'persistenceHealth',
    'confidence',
    'explanation',
  ],
  properties: {
    metricId: { type: 'string', format: 'uuid' },
    metricKey: { type: ['string', 'null'] },
    metricName: { type: 'string' },
    metricHealth: { type: ['number', 'null'], minimum: 0, maximum: 100 },
    currentHealth: { type: ['number', 'null'], minimum: 0, maximum: 100 },
    trendHealth: { type: ['number', 'null'], minimum: 0, maximum: 100 },
    persistenceHealth: { type: ['number', 'null'], minimum: 0, maximum: 100 },
    confidence: { type: 'number', minimum: 0, maximum: 100 },
    currentValue: { type: ['number', 'null'] },
    previousValue: { type: ['number', 'null'] },
    components: { type: 'object', additionalProperties: true },
    normalization: { type: 'object', additionalProperties: true },
    trend: { type: 'object', additionalProperties: true },
    persistence: { type: 'object', additionalProperties: true },
    triggers: { type: 'object', additionalProperties: true },
    explanation: {
      type: 'object',
      required: ['summary', 'components', 'notes'],
      properties: {
        summary: { type: 'string', example: 'Uso da plataforma caiu 11 % em 3 meses.' },
        components: { type: 'array', items: { type: 'string' } },
        notes: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

const organizationSchema: OpenAPIV3_1.SchemaObject = {
  type: 'object',
  required: ['id', 'name', 'slug', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'GlobalSys' },
    slug: { type: 'string', example: 'globalsys' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const organizationMemberSchema: OpenAPIV3_1.SchemaObject = {
  type: 'object',
  required: ['id', 'organizationId', 'authUserId', 'email', 'role', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    organizationId: { type: 'string', format: 'uuid' },
    authUserId: { type: 'string', format: 'uuid' },
    email: { type: ['string', 'null'], format: 'email' },
    role: { type: 'string', enum: ORGANIZATION_ROLES },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

// ---------- Etapa 2: clientes, planos e contratos (§36, §37) ----------

const PORTFOLIO_CLIENT_STATUSES = ['active', 'inactive', 'cancelled', 'archived'];
const CONTRACT_STATUSES = ['active', 'ended', 'suspended'];
const CLIENT_SORT_FIELDS = [
  'name',
  'externalCode',
  'segment',
  'size',
  'status',
  'strategicImportance',
  'planName',
  'monthlyValue',
  'createdAt',
];

const activeContractSummarySchema: OpenAPIV3_1.SchemaObject = {
  type: 'object',
  required: [
    'id',
    'planId',
    'planName',
    'monthlyValue',
    'currency',
    'startDate',
    'endDate',
    'status',
    'contractedSlaHours',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    planId: { type: ['string', 'null'], format: 'uuid' },
    planName: { type: ['string', 'null'], example: 'Premium' },
    monthlyValue: { type: 'number', example: 1500 },
    currency: { type: 'string', example: 'BRL' },
    startDate: { type: 'string', format: 'date' },
    endDate: { type: ['string', 'null'], format: 'date' },
    status: { type: 'string', enum: CONTRACT_STATUSES },
    contractedSlaHours: { type: ['integer', 'null'], example: 24 },
  },
};

const portfolioClientSchema: OpenAPIV3_1.SchemaObject = {
  type: 'object',
  required: [
    'id',
    'organizationId',
    'externalCode',
    'name',
    'segment',
    'size',
    'status',
    'strategicImportance',
    'createdAt',
    'updatedAt',
    'activeContract',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    organizationId: { type: 'string', format: 'uuid' },
    externalCode: { type: ['string', 'null'], example: 'CLI-001' },
    name: { type: 'string', example: 'Alfa Tech' },
    segment: { type: ['string', 'null'], example: 'Varejo' },
    size: { type: ['string', 'null'], example: 'PME' },
    status: { type: 'string', enum: PORTFOLIO_CLIENT_STATUSES },
    strategicImportance: { type: 'integer', minimum: 1, maximum: 5, example: 3 },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    activeContract: {
      description: 'Contrato ativo do cliente, ou null.',
      oneOf: [{ $ref: '#/components/schemas/ActiveContractSummary' }, { type: 'null' }],
    },
  },
};

const clientWritableProperties: Record<string, OpenAPIV3_1.SchemaObject> = {
  name: { type: 'string', minLength: 2, maxLength: 160, example: 'Alfa Tech' },
  externalCode: {
    type: ['string', 'null'],
    maxLength: 64,
    description: 'Código no sistema de origem; único por organização.',
  },
  segment: { type: ['string', 'null'], maxLength: 80 },
  size: { type: ['string', 'null'], maxLength: 40 },
  status: { type: 'string', enum: PORTFOLIO_CLIENT_STATUSES },
  strategicImportance: { type: 'integer', minimum: 1, maximum: 5 },
};

const planSchema: OpenAPIV3_1.SchemaObject = {
  type: 'object',
  required: ['id', 'organizationId', 'name', 'description', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    organizationId: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Premium' },
    description: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const contractSchema: OpenAPIV3_1.SchemaObject = {
  type: 'object',
  required: [
    'id',
    'organizationId',
    'portfolioClientId',
    'planId',
    'planName',
    'monthlyValue',
    'currency',
    'startDate',
    'endDate',
    'status',
    'contractedSlaHours',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    organizationId: { type: 'string', format: 'uuid' },
    portfolioClientId: { type: 'string', format: 'uuid' },
    ...activeContractSummarySchema.properties,
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const contractWritableProperties: Record<string, OpenAPIV3_1.SchemaObject> = {
  planId: { type: ['string', 'null'], format: 'uuid' },
  monthlyValue: { type: 'number', minimum: 0, description: 'Até 2 casas decimais.' },
  currency: { type: 'string', pattern: '^[A-Z]{3}$', default: 'BRL' },
  startDate: { type: 'string', format: 'date' },
  endDate: { type: ['string', 'null'], format: 'date' },
  status: { type: 'string', enum: CONTRACT_STATUSES },
  contractedSlaHours: { type: ['integer', 'null'], minimum: 1, maximum: 8760 },
};

const queryParam = (
  name: string,
  schema: NonNullable<OpenAPIV3_1.ParameterObject['schema']>,
  description?: string,
): OpenAPIV3_1.ParameterObject => ({
  name,
  in: 'query',
  required: false,
  schema,
  ...(description !== undefined ? { description } : {}),
});

const uuidIdParam: OpenAPIV3_1.ParameterObject = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

const pageParams: OpenAPIV3_1.ParameterObject[] = [
  queryParam('page', { type: 'integer', minimum: 1, default: 1 }),
  queryParam('pageSize', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
  queryParam('order', { type: 'string', enum: ['asc', 'desc'], default: 'asc' }),
];

export const openapiDocument: OpenAPIV3_1.Document = {
  openapi: '3.1.0',
  info: {
    title: 'inovaapss API',
    version: API_VERSION,
    description:
      'Motor configurável de saúde, risco e prioridade de clientes. Rotas de negócio ficam sob /api/v1.',
  },
  servers: [{ url: '/', description: 'Servidor atual' }],
  tags: [
    { name: 'infra', description: 'Saúde do processo e prontidão' },
    { name: 'meta', description: 'Descoberta de rotas e documentação' },
    { name: 'session', description: 'Sessão do usuário autenticado (§37)' },
    { name: 'organizations', description: 'Organização atual e seus usuários (§4, §37)' },
    { name: 'clients', description: 'Clientes da carteira (§36 portfolio_clients, §37 Clients)' },
    { name: 'plans', description: 'Planos / níveis de atendimento (§36 plans)' },
    { name: 'contracts', description: 'Contratos dos clientes (§36 contracts)' },
    { name: 'metrics', description: 'Definições de métrica — "tudo é métrica" (§6, §36, §37)' },
    {
      name: 'metric-models',
      description: 'Modelos de métricas, versões imutáveis e pesos (§31, §32, §41)',
    },
    {
      name: 'documents',
      description: 'Documentos enviados e descoberta de métricas — fluxo manual (§35, §37, A5)',
    },
  ],
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['infra'],
        summary: 'Processo vivo',
        operationId: 'getHealth',
        security: [],
        responses: {
          '200': {
            description: 'API respondendo',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Health' } },
            },
          },
        },
      },
    },
    '/ready': {
      get: {
        tags: ['infra'],
        summary: 'Pronta para receber tráfego',
        operationId: 'getReady',
        security: [],
        description:
          'Com DATABASE_URL configurada faz `select 1` com timeout curto; sem ela responde `db: not_configured`.',
        responses: {
          '200': {
            description: 'Pronta',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Ready' } },
            },
          },
          '503': {
            description: 'Banco configurado mas indisponível',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Ready' } },
            },
          },
        },
      },
    },
    '/api/v1': {
      get: {
        tags: ['meta'],
        summary: 'Lista as rotas disponíveis',
        operationId: 'getApiV1Index',
        security: [],
        responses: {
          '200': {
            description: 'Índice da API',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ApiIndex' } },
            },
          },
        },
      },
    },
    '/api/docs.json': {
      get: {
        tags: ['meta'],
        summary: 'Este documento OpenAPI',
        operationId: 'getOpenApiDocument',
        security: [],
        responses: { '200': { description: 'Documento OpenAPI 3.1' } },
      },
    },
    '/api/v1/me': {
      get: {
        tags: ['session'],
        summary: 'Usuário autenticado, organização atual e papel',
        operationId: 'getMe',
        description:
          'Valida o JWT do Supabase Auth (Authorization: Bearer). `organization` vem null enquanto o usuário não pertence a nenhuma organização — o front leva para /onboarding.',
        responses: {
          '200': jsonResponse('Sessão atual', 'Me'),
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/v1/organizations': {
      post: {
        tags: ['organizations'],
        summary: 'Onboarding: cria a organização e torna o usuário owner',
        operationId: 'createOrganization',
        requestBody: jsonBody('CreateOrganization'),
        responses: {
          '201': jsonResponse('Organização criada', 'OrganizationWithRole'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '409': errorResponse(
            'Slug já em uso (SLUG_TAKEN) ou usuário já tem organização (ALREADY_IN_ORGANIZATION)',
          ),
        },
      },
    },
    '/api/v1/organizations/current': {
      get: {
        tags: ['organizations'],
        summary: 'Organização atual',
        operationId: 'getCurrentOrganization',
        responses: {
          '200': jsonResponse('Organização atual e papel do usuário', 'OrganizationWithRole'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      patch: {
        tags: ['organizations'],
        summary: 'Atualiza nome e/ou slug (owner ou admin)',
        operationId: 'updateCurrentOrganization',
        requestBody: jsonBody('UpdateOrganization'),
        responses: {
          '200': jsonResponse('Organização atualizada', 'OrganizationWithRole'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': errorResponse('Slug já em uso (SLUG_TAKEN)'),
        },
      },
    },
    '/api/v1/organizations/current/users': {
      get: {
        tags: ['organizations'],
        summary: 'Usuários da organização e seus papéis',
        operationId: 'listOrganizationUsers',
        responses: {
          '200': jsonResponse('Membros', 'OrganizationMembers'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['organizations'],
        summary: 'Convida um usuário para a organização (owner ou admin)',
        operationId: 'inviteOrganizationUser',
        description:
          'Registra o vínculo e, quando o e-mail ainda não tem conta, envia o convite pelo Supabase Auth (a pessoa define a senha pelo link). A resposta é a mesma exista ou não a conta: a rota não revela quais e-mails já estão na plataforma. Somente o owner pode atribuir o papel owner.',
        requestBody: jsonBody('InviteMember'),
        responses: {
          '201': jsonResponse('Vínculo criado', 'InviteMemberResult'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': errorResponse('Usuário já é membro (ALREADY_MEMBER) ou o Auth recusou o convite'),
        },
      },
    },
    '/api/v1/metrics': {
      get: {
        tags: ['metrics'],
        summary: 'Lista as definições de métrica da organização',
        operationId: 'listMetricDefinitions',
        description:
          'Paginação e busca (§61) por nome/slug; filtros `type`, `direction`, `source`, `is_active`. Cada linha traz `activePlacement`: posição e peso na versão ativa do modelo ativo (ou null).',
        parameters: [
          ...paginationParams,
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['name', 'slug', 'metricType', 'direction', 'createdAt', 'updatedAt'],
              default: 'name',
            },
          },
          { name: 'type', in: 'query', schema: { type: 'string', enum: METRIC_TYPES } },
          { name: 'direction', in: 'query', schema: { type: 'string', enum: METRIC_DIRECTIONS } },
          { name: 'source', in: 'query', schema: { type: 'string', enum: METRIC_SOURCES } },
          { name: 'is_active', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          '200': jsonResponse('Página de definições', 'MetricDefinitionList'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['metrics'],
        summary: 'Cria uma definição de métrica (owner ou admin)',
        operationId: 'createMetricDefinition',
        requestBody: jsonBody('CreateMetricDefinition'),
        responses: {
          '201': jsonResponse('Definição criada', 'MetricDefinitionEnvelope'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': errorResponse('Chave já usada na organização (SLUG_TAKEN)'),
        },
      },
    },
    '/api/v1/metrics/{id}': {
      parameters: [idParam('id', 'Id da definição de métrica')],
      get: {
        tags: ['metrics'],
        summary: 'Definição, item da versão ativa e modelo correspondente',
        operationId: 'getMetricDefinition',
        responses: {
          '200': jsonResponse('Detalhe da métrica', 'MetricDefinitionDetail'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['metrics'],
        summary: 'Atualiza a definição (owner ou admin)',
        operationId: 'updateMetricDefinition',
        requestBody: jsonBody('UpdateMetricDefinition'),
        responses: {
          '200': jsonResponse('Definição atualizada', 'MetricDefinitionEnvelope'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': errorResponse('Chave já usada na organização (SLUG_TAKEN)'),
        },
      },
      delete: {
        tags: ['metrics'],
        summary: 'Apaga se nunca usada; desativa se já está em alguma versão (owner ou admin)',
        operationId: 'deleteMetricDefinition',
        description:
          'Mudanças de configuração nunca apagam histórico (§31): uma métrica presente em qualquer versão (ativa, arquivada ou rascunho) é apenas desativada (`outcome: deactivated`).',
        responses: {
          '200': jsonResponse('Resultado', 'DeleteMetricDefinitionResult'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/metrics/{id}/preview-score': {
      parameters: [idParam('id', 'Id da definição de métrica')],
      post: {
        tags: ['metrics'],
        summary: 'Simula o score da métrica com o motor sobre valores de exemplo',
        operationId: 'previewMetricScore',
        description:
          'Sem banco de valores: recebe a configuração do item e uma série (mais antigo → mais recente) e devolve current/trend/persistence/metric_health, confiança, gatilhos e explicação em português (SCORING.md). Configuração que o motor não avalia responde 400 INVALID_METRIC_CONFIG.',
        requestBody: jsonBody('PreviewScoreRequest'),
        responses: {
          '200': jsonResponse('Score simulado', 'PreviewScoreResult'),
          '400': errorResponse(
            'Dados inválidos (VALIDATION_ERROR) ou configuração não avaliável (INVALID_METRIC_CONFIG)',
          ),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/metric-models': {
      get: {
        tags: ['metric-models'],
        summary: 'Lista os modelos de métricas',
        operationId: 'listMetricModels',
        parameters: [
          ...paginationParams,
          {
            name: 'sort',
            in: 'query',
            schema: { type: 'string', enum: ['name', 'createdAt', 'updatedAt'], default: 'name' },
          },
          { name: 'is_active', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          '200': jsonResponse('Página de modelos', 'MetricModelList'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['metric-models'],
        summary: 'Cria um modelo de métricas (owner ou admin)',
        operationId: 'createMetricModel',
        requestBody: jsonBody('CreateMetricModel'),
        responses: {
          '201': jsonResponse('Modelo criado (sem versões)', 'MetricModelDetail'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/v1/metric-models/{id}': {
      parameters: [idParam('id', 'Id do modelo')],
      get: {
        tags: ['metric-models'],
        summary: 'Modelo com todas as versões (e itens), da mais nova para a mais antiga',
        operationId: 'getMetricModel',
        responses: {
          '200': jsonResponse('Modelo e versões', 'MetricModelDetail'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/metric-models/{id}/versions': {
      parameters: [idParam('id', 'Id do modelo')],
      post: {
        tags: ['metric-models'],
        summary: 'Cria um rascunho de versão (owner ou admin)',
        operationId: 'createMetricModelVersion',
        description:
          'Sem `items`, o rascunho nasce como cópia da versão ativa (ou vazio). Cada item é validado pelo Zod e pelo motor (400 INVALID_METRIC_CONFIG se não for avaliável).',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateMetricModelVersion' },
            },
          },
        },
        responses: {
          '201': jsonResponse('Rascunho criado', 'MetricModelVersionEnvelope'),
          '400': errorResponse(
            'VALIDATION_ERROR, INVALID_METRIC_CONFIG ou UNKNOWN_METRIC_DEFINITION',
          ),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/metric-models/{id}/versions/{version}': {
      parameters: [idParam('id', 'Id do modelo'), versionParam],
      patch: {
        tags: ['metric-models'],
        summary: 'Edita um rascunho (owner ou admin) — versões ativas e arquivadas são imutáveis',
        operationId: 'updateMetricModelVersion',
        description: '`items` substitui a lista inteira de itens da versão.',
        requestBody: jsonBody('UpdateMetricModelVersion'),
        responses: {
          '200': jsonResponse('Rascunho atualizado', 'MetricModelVersionEnvelope'),
          '400': errorResponse(
            'VALIDATION_ERROR, INVALID_METRIC_CONFIG ou UNKNOWN_METRIC_DEFINITION',
          ),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': errorResponse('A versão não é rascunho (VERSION_NOT_EDITABLE)'),
        },
      },
    },
    '/api/v1/metric-models/{id}/versions/{version}/activate': {
      parameters: [idParam('id', 'Id do modelo'), versionParam],
      post: {
        tags: ['metric-models'],
        summary: 'Ativa a versão (owner ou admin)',
        operationId: 'activateMetricModelVersion',
        description:
          'Exige que os pesos das métricas ATIVAS somem 100 % (1,0000 ± 0,0001) — nunca redistribui em silêncio (§41). Arquiva a versão ativa anterior; nada é apagado (§31).',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ActivateMetricModelVersion' },
            },
          },
        },
        responses: {
          '200': jsonResponse('Versão ativada', 'MetricModelVersionEnvelope'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': errorResponse('Já ativa (VERSION_ALREADY_ACTIVE) ou arquivada (VERSION_ARCHIVED)'),
          '422': errorResponse(
            'Pesos ativos não somam 100 % (WEIGHTS_MUST_SUM_100; `details.total` e `details.difference`)',
          ),
        },
      },
    },
    '/api/v1/metric-models/{id}/rebalance': {
      parameters: [idParam('id', 'Id do modelo')],
      post: {
        tags: ['metric-models'],
        summary: 'Proposta de pesos redistribuídos proporcionalmente — não salva',
        operationId: 'rebalanceMetricModel',
        description:
          'A partir dos `items` do corpo ou de uma `version` (padrão: o rascunho mais recente, senão a ativa). A resposta traz `saved: false`; para aplicar, envie os pesos num PATCH do rascunho.',
        requestBody: {
          required: false,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RebalanceRequest' } },
          },
        },
        responses: {
          '200': jsonResponse('Proposta', 'RebalanceProposal'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/clients': {
      get: {
        tags: ['clients'],
        summary: 'Lista os clientes da carteira',
        operationId: 'listClients',
        description:
          'Busca por nome ou código, ordenação, paginação e filtros §61. Sem `status`, os arquivados ficam de fora. `plan` filtra pelo nome do plano do contrato ativo.',
        parameters: [
          ...pageParams,
          queryParam('search', { type: 'string', maxLength: 200 }, 'Nome ou código'),
          queryParam('sort', { type: 'string', enum: CLIENT_SORT_FIELDS, default: 'name' }),
          queryParam('status', { type: 'string', enum: PORTFOLIO_CLIENT_STATUSES }),
          queryParam('segment', { type: 'string' }),
          queryParam('size', { type: 'string' }),
          queryParam('plan', { type: 'string' }, 'Nome do plano do contrato ativo'),
          queryParam('strategic_importance', { type: 'integer', minimum: 1, maximum: 5 }),
        ],
        responses: {
          '200': jsonResponse('Página de clientes', 'PortfolioClientPage'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['clients'],
        summary: 'Cadastra um cliente (owner, admin ou analyst)',
        operationId: 'createClient',
        requestBody: jsonBody('CreatePortfolioClient'),
        responses: {
          '201': jsonResponse('Cliente criado', 'PortfolioClientEnvelope'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': errorResponse('Código externo já usado na organização (EXTERNAL_CODE_TAKEN)'),
        },
      },
    },
    '/api/v1/clients/filter-options': {
      get: {
        tags: ['clients'],
        summary: 'Valores disponíveis para os filtros de clientes',
        operationId: 'getClientFilterOptions',
        responses: {
          '200': jsonResponse(
            'Segmentos, portes, planos e status da organização',
            'ClientFilterOptions',
          ),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/v1/clients/{id}': {
      get: {
        tags: ['clients'],
        summary: 'Cliente com contrato ativo e plano',
        operationId: 'getClient',
        parameters: [uuidIdParam],
        responses: {
          '200': jsonResponse('Cliente', 'PortfolioClientEnvelope'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['clients'],
        summary: 'Edita um cliente (owner, admin ou analyst)',
        operationId: 'updateClient',
        parameters: [uuidIdParam],
        requestBody: jsonBody('UpdatePortfolioClient'),
        responses: {
          '200': jsonResponse('Cliente atualizado', 'PortfolioClientEnvelope'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': errorResponse('Código externo já usado na organização (EXTERNAL_CODE_TAKEN)'),
        },
      },
      delete: {
        tags: ['clients'],
        summary: 'Arquiva um cliente (owner, admin ou analyst)',
        operationId: 'archiveClient',
        description:
          'Nunca apaga: muda o status para `archived`. O cliente some da lista padrão (volte com `status=archived`) e o histórico fica.',
        parameters: [uuidIdParam],
        responses: {
          '200': jsonResponse('Cliente arquivado', 'PortfolioClientEnvelope'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/plans': {
      get: {
        tags: ['plans'],
        summary: 'Planos da organização',
        operationId: 'listPlans',
        responses: {
          '200': jsonResponse('Planos em ordem alfabética', 'PlanList'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['plans'],
        summary: 'Cria um plano (owner, admin ou analyst)',
        operationId: 'createPlan',
        requestBody: jsonBody('CreatePlan'),
        responses: {
          '201': jsonResponse('Plano criado', 'PlanEnvelope'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': errorResponse('Nome já usado na organização (PLAN_NAME_TAKEN)'),
        },
      },
    },
    '/api/v1/plans/{id}': {
      get: {
        tags: ['plans'],
        summary: 'Um plano',
        operationId: 'getPlan',
        parameters: [uuidIdParam],
        responses: {
          '200': jsonResponse('Plano', 'PlanEnvelope'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['plans'],
        summary: 'Edita um plano (owner, admin ou analyst)',
        operationId: 'updatePlan',
        parameters: [uuidIdParam],
        requestBody: jsonBody('UpdatePlan'),
        responses: {
          '200': jsonResponse('Plano atualizado', 'PlanEnvelope'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': errorResponse('Nome já usado na organização (PLAN_NAME_TAKEN)'),
        },
      },
    },
    '/api/v1/contracts': {
      get: {
        tags: ['contracts'],
        summary: 'Lista contratos (por cliente e/ou status)',
        operationId: 'listContracts',
        parameters: [
          ...pageParams,
          queryParam('sort', {
            type: 'string',
            enum: ['startDate', 'endDate', 'monthlyValue', 'status', 'createdAt'],
            default: 'startDate',
          }),
          queryParam('clientId', { type: 'string', format: 'uuid' }),
          queryParam('status', { type: 'string', enum: CONTRACT_STATUSES }),
        ],
        responses: {
          '200': jsonResponse(
            'Página de contratos (padrão: início mais recente primeiro)',
            'ContractPage',
          ),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['contracts'],
        summary: 'Cria um contrato (owner, admin ou analyst)',
        operationId: 'createContract',
        description:
          'Um cliente tem no máximo um contrato `active`: ao criar outro ativo, o anterior passa a `ended` com data de término = novo início.',
        requestBody: jsonBody('CreateContract'),
        responses: {
          '201': jsonResponse('Contrato criado', 'ContractEnvelope'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': errorResponse(
            'Cliente (NOT_FOUND) ou plano (PLAN_NOT_FOUND) não pertence à organização',
          ),
          '409': errorResponse('Cliente já tem contrato ativo (ACTIVE_CONTRACT_EXISTS)'),
        },
      },
    },
    '/api/v1/contracts/{id}': {
      get: {
        tags: ['contracts'],
        summary: 'Um contrato',
        operationId: 'getContract',
        parameters: [uuidIdParam],
        responses: {
          '200': jsonResponse('Contrato', 'ContractEnvelope'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['contracts'],
        summary: 'Edita ou encerra um contrato (owner, admin ou analyst)',
        operationId: 'updateContract',
        description:
          'Encerrar = `{ "status": "ended", "endDate": "AAAA-MM-DD" }`. Reativar (`status: active`) encerra o contrato ativo atual do cliente.',
        parameters: [uuidIdParam],
        requestBody: jsonBody('UpdateContract'),
        responses: {
          '200': jsonResponse('Contrato atualizado', 'ContractEnvelope'),
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': errorResponse('Cliente já tem contrato ativo (ACTIVE_CONTRACT_EXISTS)'),
        },
      },
    },
    '/api/v1/documents': {
      post: {
        tags: ['documents'],
        summary: 'Upload de documento (owner, admin ou analyst)',
        operationId: 'uploadDocument',
        description:
          'multipart/form-data com o campo `file`. Aceita PDF, DOCX, XLSX, CSV, JSON, MD e TXT (allowlist de MIME + extensão, §45) até 10 MB. O arquivo vai para o bucket privado "documents" do Supabase Storage.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: {
          '201': jsonResponse('Documento registrado (status uploaded)', 'DocumentEnvelope'),
          '400': errorResponse('Sem arquivo (FILE_REQUIRED) ou multipart inválido (UPLOAD_ERROR)'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '413': errorResponse('Arquivo acima de 10 MB (FILE_TOO_LARGE)'),
          '415': errorResponse('Extensão/MIME fora da allowlist (UNSUPPORTED_FILE_TYPE)'),
        },
      },
      get: {
        tags: ['documents'],
        summary: 'Documentos enviados (paginado, §61)',
        operationId: 'listDocuments',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          {
            name: 'sort',
            in: 'query',
            schema: { type: 'string', enum: ['createdAt', 'fileName', 'status', 'sizeBytes'] },
          },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/DocumentStatus' } },
        ],
        responses: {
          '200': jsonResponse('Página de documentos', 'DocumentPage'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/v1/documents/{id}': {
      get: {
        tags: ['documents'],
        summary: 'Documento com URL assinada de download',
        operationId: 'getDocument',
        parameters: [{ $ref: '#/components/parameters/DocumentId' }],
        responses: {
          '200': jsonResponse(
            'Metadados e URL válida por poucos minutos',
            'DocumentDetailEnvelope',
          ),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/documents/{id}/extract-metrics': {
      post: {
        tags: ['documents'],
        summary: 'Extrai o texto e roda o provider de sugestões (owner, admin ou analyst)',
        operationId: 'extractDocumentMetrics',
        description:
          'Extrai o texto conforme o tipo (PDF, DOCX, XLSX, CSV, JSON, MD/TXT), guarda o texto completo no storage e um preview de até 20 kB no banco, marca o documento como `extracted` e chama o MetricExtractionProvider. Nesta fase o provider é o manual (ajuste A5): não gera sugestões; uma pessoa as cria em POST /documents/{id}/suggestions.',
        parameters: [{ $ref: '#/components/parameters/DocumentId' }],
        responses: {
          '200': jsonResponse('Documento atualizado e sugestões geradas', 'ExtractMetricsResult'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '422': errorResponse('Não foi possível ler o arquivo (TEXT_EXTRACTION_FAILED)'),
        },
      },
    },
    '/api/v1/documents/{id}/suggestions': {
      get: {
        tags: ['documents'],
        summary: 'Sugestões de métrica do documento',
        operationId: 'listDocumentSuggestions',
        parameters: [{ $ref: '#/components/parameters/DocumentId' }],
        responses: {
          '200': jsonResponse('Sugestões', 'MetricSuggestionList'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      post: {
        tags: ['documents'],
        summary: 'Cria uma sugestão manual a partir do documento (owner, admin ou analyst)',
        operationId: 'createDocumentSuggestion',
        description:
          'A fórmula (JSON Logic) passa pela allowlist de operadores do engine (`isSafeRule`); regra insegura responde 400 UNSAFE_FORMULA.',
        parameters: [{ $ref: '#/components/parameters/DocumentId' }],
        requestBody: jsonBody('CreateMetricSuggestion'),
        responses: {
          '201': jsonResponse('Sugestão criada (status pending)', 'MetricSuggestionEnvelope'),
          '400': errorResponse(
            'Dados inválidos (VALIDATION_ERROR) ou fórmula insegura (UNSAFE_FORMULA)',
          ),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/metric-suggestions/{id}/accept': {
      post: {
        tags: ['documents'],
        summary: 'Aceita a sugestão e devolve o payload para POST /metrics',
        operationId: 'acceptMetricSuggestion',
        description:
          'Marca `accepted` com quem revisou e quando. A métrica NÃO é criada aqui: o web leva `metricPayload` para /metrics (state.prefill) e a pessoa confirma lá (§35).',
        parameters: [{ $ref: '#/components/parameters/SuggestionId' }],
        responses: {
          '200': jsonResponse('Sugestão aceita e payload da métrica', 'AcceptSuggestionResult'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/metric-suggestions/{id}/reject': {
      post: {
        tags: ['documents'],
        summary: 'Rejeita a sugestão',
        operationId: 'rejectMetricSuggestion',
        parameters: [{ $ref: '#/components/parameters/SuggestionId' }],
        responses: {
          '200': jsonResponse('Sugestão rejeitada', 'MetricSuggestionEnvelope'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },
  components: {
    parameters: {
      DocumentId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      SuggestionId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
    },
    schemas: {
      Error: errorSchema,
      Health: {
        type: 'object',
        required: ['status', 'version', 'uptime'],
        properties: {
          status: { type: 'string', enum: ['ok'] },
          version: { type: 'string', example: '0.1.0' },
          uptime: { type: 'integer', description: 'Segundos desde o início do processo' },
        },
      },
      Ready: {
        type: 'object',
        required: ['status', 'db'],
        properties: {
          status: { type: 'string', enum: ['ready', 'not_ready'] },
          db: { type: 'string', enum: ['ok', 'error', 'not_configured'] },
        },
      },
      Organization: organizationSchema,
      OrganizationMember: organizationMemberSchema,
      Me: {
        type: 'object',
        required: ['user', 'organization', 'role'],
        properties: {
          user: {
            type: 'object',
            required: ['id', 'email'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: ['string', 'null'], format: 'email' },
            },
          },
          organization: {
            oneOf: [{ $ref: '#/components/schemas/Organization' }, { type: 'null' }],
          },
          role: { type: ['string', 'null'], enum: [...ORGANIZATION_ROLES, null] },
        },
      },
      OrganizationWithRole: {
        type: 'object',
        required: ['organization', 'role'],
        properties: {
          organization: { $ref: '#/components/schemas/Organization' },
          role: { type: 'string', enum: ORGANIZATION_ROLES },
        },
      },
      OrganizationMembers: {
        type: 'object',
        required: ['items', 'total'],
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/OrganizationMember' } },
          total: { type: 'integer' },
        },
      },
      CreateOrganization: {
        type: 'object',
        required: ['name', 'slug'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 120, example: 'GlobalSys' },
          slug: {
            type: 'string',
            pattern: SLUG_PATTERN,
            minLength: 2,
            maxLength: 64,
            example: 'globalsys',
          },
        },
      },
      UpdateOrganization: {
        type: 'object',
        description: 'Ao menos um dos campos.',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 120 },
          slug: { type: 'string', pattern: SLUG_PATTERN, minLength: 2, maxLength: 64 },
        },
      },
      InviteMember: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ORGANIZATION_ROLES, default: 'viewer' },
        },
      },
      InviteMemberResult: {
        type: 'object',
        required: ['member'],
        properties: {
          member: { $ref: '#/components/schemas/OrganizationMember' },
        },
      },
      MetricDefinition: metricDefinitionSchema,
      MetricActivePlacement: {
        type: 'object',
        required: [
          'modelId',
          'modelName',
          'version',
          'weight',
          'sortOrder',
          'normalizationStrategy',
        ],
        properties: {
          modelId: { type: 'string', format: 'uuid' },
          modelName: { type: 'string' },
          version: { type: 'integer' },
          weight: weightProperty,
          sortOrder: { type: 'integer' },
          normalizationStrategy: { type: 'string', enum: NORMALIZATION_STRATEGIES },
        },
      },
      MetricDefinitionList: {
        type: 'object',
        required: ['items', 'total', 'page', 'pageSize'],
        properties: {
          items: {
            type: 'array',
            items: {
              allOf: [
                { $ref: '#/components/schemas/MetricDefinition' },
                {
                  type: 'object',
                  required: ['activePlacement'],
                  properties: {
                    activePlacement: {
                      oneOf: [
                        { $ref: '#/components/schemas/MetricActivePlacement' },
                        { type: 'null' },
                      ],
                    },
                  },
                },
              ],
            },
          },
          total: { type: 'integer' },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
        },
      },
      MetricDefinitionEnvelope: {
        type: 'object',
        required: ['definition'],
        properties: { definition: { $ref: '#/components/schemas/MetricDefinition' } },
      },
      MetricDefinitionDetail: {
        type: 'object',
        required: ['definition', 'activeItem', 'activeModel'],
        properties: {
          definition: { $ref: '#/components/schemas/MetricDefinition' },
          activeItem: {
            oneOf: [{ $ref: '#/components/schemas/MetricModelItem' }, { type: 'null' }],
          },
          activeModel: {
            oneOf: [
              {
                type: 'object',
                required: ['id', 'name', 'version'],
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  version: { type: 'integer' },
                },
              },
              { type: 'null' },
            ],
          },
        },
      },
      CreateMetricDefinition: {
        type: 'object',
        required: ['name', 'slug', 'metricType', 'direction'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 120, example: 'Cumprimento de SLA' },
          slug: {
            type: 'string',
            pattern: METRIC_SLUG_PATTERN,
            minLength: 2,
            maxLength: 64,
            example: 'sla_compliance',
          },
          description: { type: ['string', 'null'], maxLength: 1000 },
          category: { type: ['string', 'null'], maxLength: 80 },
          metricType: { type: 'string', enum: METRIC_TYPES },
          unit: { type: ['string', 'null'], maxLength: 20, example: '%' },
          direction: { type: 'string', enum: METRIC_DIRECTIONS },
          periodicity: { type: 'string', enum: METRIC_PERIODICITIES, default: 'MONTHLY' },
          sourceType: { type: 'string', enum: METRIC_SOURCES, default: 'MANUAL' },
          isActive: { type: 'boolean', default: true },
        },
      },
      UpdateMetricDefinition: {
        type: 'object',
        description: 'Ao menos um dos campos.',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 120 },
          slug: { type: 'string', pattern: METRIC_SLUG_PATTERN, minLength: 2, maxLength: 64 },
          description: { type: ['string', 'null'], maxLength: 1000 },
          category: { type: ['string', 'null'], maxLength: 80 },
          metricType: { type: 'string', enum: METRIC_TYPES },
          unit: { type: ['string', 'null'], maxLength: 20 },
          direction: { type: 'string', enum: METRIC_DIRECTIONS },
          periodicity: { type: 'string', enum: METRIC_PERIODICITIES },
          sourceType: { type: 'string', enum: METRIC_SOURCES },
          isActive: { type: 'boolean' },
        },
      },
      DeleteMetricDefinitionResult: {
        type: 'object',
        required: ['outcome', 'definition'],
        properties: {
          outcome: { type: 'string', enum: ['deleted', 'deactivated'] },
          definition: {
            oneOf: [{ $ref: '#/components/schemas/MetricDefinition' }, { type: 'null' }],
          },
        },
      },
      PreviewScoreRequest: {
        type: 'object',
        required: ['item', 'series'],
        properties: {
          item: {
            allOf: [{ $ref: '#/components/schemas/MetricModelItemInput' }],
            description: 'Sem `metricDefinitionId` (vem da rota); `weight` opcional (padrão 1).',
          },
          series: {
            type: 'array',
            minItems: 1,
            maxItems: 120,
            description: 'Do mais antigo para o mais recente; `value: null` = período sem dado.',
            items: {
              type: 'object',
              required: ['periodEnd', 'value'],
              properties: {
                periodEnd: { type: 'string', example: '2026-08-31' },
                value: { type: ['number', 'null'] },
                text: { type: ['string', 'null'] },
              },
            },
          },
          extra: {
            type: 'object',
            description: 'Campos extras para gatilhos (`extra.<campo>`).',
            additionalProperties: true,
          },
          periodLabel: { type: 'string', example: 'mês' },
        },
      },
      PreviewScoreResult: {
        type: 'object',
        required: ['score'],
        properties: { score: { $ref: '#/components/schemas/MetricScore' } },
      },
      MetricScore: metricScoreSchema,
      MetricModel: metricModelSchema,
      MetricModelItemInput: metricModelItemInputSchema,
      MetricModelItem: metricModelItemSchema,
      MetricModelVersion: metricModelVersionSchema,
      MetricModelList: {
        type: 'object',
        required: ['items', 'total', 'page', 'pageSize'],
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/MetricModel' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
        },
      },
      MetricModelDetail: {
        type: 'object',
        required: ['model', 'versions'],
        properties: {
          model: { $ref: '#/components/schemas/MetricModel' },
          versions: { type: 'array', items: { $ref: '#/components/schemas/MetricModelVersion' } },
        },
      },
      MetricModelVersionEnvelope: {
        type: 'object',
        required: ['version'],
        properties: { version: { $ref: '#/components/schemas/MetricModelVersion' } },
      },
      CreateMetricModel: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 120, example: 'GlobalSys v1' },
          mode: { type: 'string', enum: WEIGHT_MODES, default: 'ASSISTED' },
          isActive: { type: 'boolean', default: true },
        },
      },
      CreateMetricModelVersion: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            maxItems: 200,
            items: { $ref: '#/components/schemas/MetricModelItemInput' },
          },
          effectiveFrom: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      UpdateMetricModelVersion: {
        type: 'object',
        description: 'Ao menos um dos campos.',
        properties: {
          items: {
            type: 'array',
            maxItems: 200,
            items: { $ref: '#/components/schemas/MetricModelItemInput' },
          },
          effectiveFrom: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      ActivateMetricModelVersion: {
        type: 'object',
        properties: { effectiveFrom: { type: ['string', 'null'], format: 'date-time' } },
      },
      RebalanceRequest: {
        type: 'object',
        description: '`version` ou `items`, não os dois.',
        properties: {
          version: { type: 'integer', minimum: 1 },
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['metricDefinitionId', 'weight'],
              properties: {
                metricDefinitionId: { type: 'string', format: 'uuid' },
                weight: weightProperty,
              },
            },
          },
        },
      },
      RebalanceProposal: {
        type: 'object',
        required: ['rows', 'currentTotal', 'proposedTotal', 'saved'],
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'object',
              required: ['metricDefinitionId', 'currentWeight', 'proposedWeight', 'difference'],
              properties: {
                metricDefinitionId: { type: 'string', format: 'uuid' },
                currentWeight: weightProperty,
                proposedWeight: weightProperty,
                difference: { type: 'number' },
              },
            },
          },
          currentTotal: { type: 'number' },
          proposedTotal: { type: 'number' },
          saved: { type: 'boolean', enum: [false] },
        },
      },
      ActiveContractSummary: activeContractSummarySchema,
      PortfolioClient: portfolioClientSchema,
      PortfolioClientEnvelope: {
        type: 'object',
        required: ['client'],
        properties: { client: { $ref: '#/components/schemas/PortfolioClient' } },
      },
      PortfolioClientPage: {
        type: 'object',
        required: ['items', 'page', 'pageSize', 'total'],
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/PortfolioClient' } },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          total: { type: 'integer' },
        },
      },
      ClientFilterOptions: {
        type: 'object',
        required: ['segments', 'sizes', 'plans', 'statuses'],
        properties: {
          segments: { type: 'array', items: { type: 'string' } },
          sizes: { type: 'array', items: { type: 'string' } },
          plans: { type: 'array', items: { type: 'string' } },
          statuses: { type: 'array', items: { type: 'string', enum: PORTFOLIO_CLIENT_STATUSES } },
        },
      },
      CreatePortfolioClient: {
        type: 'object',
        required: ['name'],
        properties: clientWritableProperties,
      },
      UpdatePortfolioClient: {
        type: 'object',
        description: 'Ao menos um dos campos.',
        properties: clientWritableProperties,
      },
      Plan: planSchema,
      PlanEnvelope: {
        type: 'object',
        required: ['plan'],
        properties: { plan: { $ref: '#/components/schemas/Plan' } },
      },
      PlanList: {
        type: 'object',
        required: ['items', 'total'],
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/Plan' } },
          total: { type: 'integer' },
        },
      },
      CreatePlan: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 80, example: 'Premium' },
          description: { type: ['string', 'null'], maxLength: 500 },
        },
      },
      UpdatePlan: {
        type: 'object',
        description: 'Ao menos um dos campos.',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 80 },
          description: { type: ['string', 'null'], maxLength: 500 },
        },
      },
      Contract: contractSchema,
      ContractEnvelope: {
        type: 'object',
        required: ['contract'],
        properties: { contract: { $ref: '#/components/schemas/Contract' } },
      },
      ContractPage: {
        type: 'object',
        required: ['items', 'page', 'pageSize', 'total'],
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/Contract' } },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          total: { type: 'integer' },
        },
      },
      CreateContract: {
        type: 'object',
        required: ['portfolioClientId', 'monthlyValue', 'startDate'],
        properties: {
          portfolioClientId: { type: 'string', format: 'uuid' },
          ...contractWritableProperties,
        },
      },
      UpdateContract: {
        type: 'object',
        description: 'Ao menos um dos campos. O cliente do contrato não muda.',
        properties: contractWritableProperties,
      },
      DocumentStatus: { type: 'string', enum: ['uploaded', 'extracted', 'failed'] },
      MetricSuggestionStatus: { type: 'string', enum: ['pending', 'accepted', 'rejected'] },
      UploadedDocument: {
        type: 'object',
        required: [
          'id',
          'organizationId',
          'fileName',
          'mimeType',
          'kind',
          'sizeBytes',
          'status',
          'uploadedBy',
          'hasExtractedText',
          'extractedTextPreview',
          'extractionError',
          'extractedAt',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          organizationId: { type: 'string', format: 'uuid' },
          fileName: { type: 'string', example: 'politica-de-sla.pdf' },
          mimeType: { type: 'string', example: 'application/pdf' },
          kind: {
            type: 'string',
            enum: ['pdf', 'docx', 'xlsx', 'csv', 'json', 'markdown', 'text'],
          },
          sizeBytes: { type: 'integer' },
          status: { $ref: '#/components/schemas/DocumentStatus' },
          uploadedBy: { type: 'string', format: 'uuid' },
          hasExtractedText: { type: 'boolean' },
          extractedTextPreview: {
            type: ['string', 'null'],
            description: 'Primeiros 20 kB do texto extraído.',
          },
          extractionError: { type: ['string', 'null'] },
          extractedAt: { type: ['string', 'null'], format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      DocumentEnvelope: {
        type: 'object',
        required: ['document'],
        properties: { document: { $ref: '#/components/schemas/UploadedDocument' } },
      },
      DocumentDetailEnvelope: {
        type: 'object',
        required: ['document'],
        properties: {
          document: {
            allOf: [
              { $ref: '#/components/schemas/UploadedDocument' },
              {
                type: 'object',
                required: ['downloadUrl', 'downloadUrlExpiresInSeconds'],
                properties: {
                  downloadUrl: { type: 'string', format: 'uri' },
                  downloadUrlExpiresInSeconds: { type: 'integer', example: 300 },
                },
              },
            ],
          },
        },
      },
      DocumentPage: {
        type: 'object',
        required: ['items', 'page', 'pageSize', 'total'],
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/UploadedDocument' } },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          total: { type: 'integer' },
        },
      },
      SuggestedThresholds: {
        type: 'object',
        description:
          'Estratégia de normalização e seus campos (METRICS_ENGINE.md §2). Campos extras são aceitos.',
        properties: {
          strategy: {
            type: 'string',
            enum: [
              'THRESHOLD_BANDS',
              'LINEAR_RANGE',
              'RATIO_TO_TARGET',
              'BASELINE_DEVIATION',
              'BOOLEAN_MAP',
              'SCORE_MAP',
              'CUSTOM_SAFE_RULE',
            ],
          },
          bands: {
            type: 'array',
            items: {
              type: 'object',
              required: ['upTo', 'health'],
              properties: {
                upTo: { type: ['number', 'null'] },
                health: { type: 'number', minimum: 0, maximum: 100 },
              },
            },
          },
          min: { type: 'number' },
          max: { type: 'number' },
          target: { type: 'number' },
        },
        additionalProperties: true,
      },
      MetricSuggestion: {
        type: 'object',
        required: [
          'id',
          'uploadedDocumentId',
          'organizationId',
          'suggestedName',
          'suggestedType',
          'suggestedDirection',
          'status',
          'provider',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          uploadedDocumentId: { type: 'string', format: 'uuid' },
          organizationId: { type: 'string', format: 'uuid' },
          suggestedName: { type: 'string', example: 'Tempo médio de resolução' },
          description: { type: ['string', 'null'] },
          suggestedType: { type: 'string', enum: METRIC_TYPES },
          suggestedDirection: { type: 'string', enum: METRIC_DIRECTIONS },
          unit: { type: ['string', 'null'], example: 'h' },
          suggestedWeight: { type: ['number', 'null'], minimum: 0, maximum: 1 },
          suggestedFormula: { type: ['object', 'null'], description: 'Regra JSON Logic segura.' },
          suggestedThresholds: {
            oneOf: [{ $ref: '#/components/schemas/SuggestedThresholds' }, { type: 'null' }],
          },
          confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
          sourceExcerpt: { type: ['string', 'null'] },
          provider: { type: 'string', example: 'manual' },
          status: { $ref: '#/components/schemas/MetricSuggestionStatus' },
          createdBy: { type: ['string', 'null'], format: 'uuid' },
          reviewedBy: { type: ['string', 'null'], format: 'uuid' },
          reviewedAt: { type: ['string', 'null'], format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      MetricSuggestionEnvelope: {
        type: 'object',
        required: ['suggestion'],
        properties: { suggestion: { $ref: '#/components/schemas/MetricSuggestion' } },
      },
      MetricSuggestionList: {
        type: 'object',
        required: ['items', 'total'],
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/MetricSuggestion' } },
          total: { type: 'integer' },
        },
      },
      CreateMetricSuggestion: {
        type: 'object',
        required: ['suggestedName', 'suggestedType', 'suggestedDirection'],
        properties: {
          suggestedName: { type: 'string', minLength: 2, maxLength: 120 },
          description: { type: 'string', maxLength: 1000 },
          suggestedType: { type: 'string', enum: METRIC_TYPES },
          suggestedDirection: { type: 'string', enum: METRIC_DIRECTIONS },
          unit: { type: 'string', maxLength: 24 },
          suggestedWeight: { type: 'number', minimum: 0, maximum: 1 },
          suggestedFormula: {
            type: 'object',
            description: 'Regra JSON Logic (um operador na raiz).',
          },
          suggestedThresholds: { $ref: '#/components/schemas/SuggestedThresholds' },
          sourceExcerpt: { type: 'string', maxLength: 2000 },
        },
      },
      ExtractMetricsResult: {
        type: 'object',
        required: ['document', 'suggestions', 'extraction'],
        properties: {
          document: { $ref: '#/components/schemas/UploadedDocument' },
          suggestions: { type: 'array', items: { $ref: '#/components/schemas/MetricSuggestion' } },
          extraction: {
            type: 'object',
            required: ['provider', 'chars', 'truncated'],
            properties: {
              provider: { type: 'string', example: 'manual' },
              chars: { type: 'integer' },
              truncated: { type: 'boolean' },
              pages: { type: 'integer' },
              sheets: { type: 'integer' },
              rows: { type: 'integer' },
            },
          },
        },
      },
      MetricPrefill: {
        type: 'object',
        description:
          'Payload pronto para POST /metrics (Etapa 3). O web leva em state.prefill ao navegar para /metrics.',
        required: ['name', 'slug', 'metricType', 'direction', 'sourceType', 'isActive', 'origin'],
        properties: {
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: ['string', 'null'] },
          category: { type: 'string' },
          metricType: { type: 'string', enum: METRIC_TYPES },
          unit: { type: ['string', 'null'] },
          direction: { type: 'string', enum: METRIC_DIRECTIONS },
          sourceType: { type: 'string', enum: ['DOCUMENT'] },
          periodicity: { type: 'string', enum: ['MONTHLY'] },
          weight: { type: ['number', 'null'] },
          normalization: {
            oneOf: [{ $ref: '#/components/schemas/SuggestedThresholds' }, { type: 'null' }],
          },
          formula: { type: ['object', 'null'] },
          isActive: { type: 'boolean', enum: [false] },
          origin: {
            type: 'object',
            required: ['documentId', 'suggestionId', 'fileName'],
            properties: {
              documentId: { type: 'string', format: 'uuid' },
              suggestionId: { type: 'string', format: 'uuid' },
              fileName: { type: ['string', 'null'] },
            },
          },
        },
      },
      AcceptSuggestionResult: {
        type: 'object',
        required: ['suggestion', 'metricPayload'],
        properties: {
          suggestion: { $ref: '#/components/schemas/MetricSuggestion' },
          metricPayload: { $ref: '#/components/schemas/MetricPrefill' },
        },
      },
      ApiIndex: {
        type: 'object',
        required: ['name', 'version', 'routes', 'links'],
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          routes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['method', 'path', 'description'],
              properties: {
                method: { type: 'string' },
                path: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          links: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
    },
    responses: {
      NotFound: errorResponse('Rota ou recurso não encontrado'),
      RateLimited: errorResponse('Limite de requisições excedido'),
      Unauthorized: errorResponse('Sem token ou token inválido/expirado (UNAUTHORIZED)'),
      Forbidden: errorResponse(
        'Usuário sem organização (NO_ORGANIZATION) ou sem o papel exigido (FORBIDDEN)',
      ),
      ValidationError: errorResponse('Dados inválidos (VALIDATION_ERROR, issues em details)'),
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'access_token da sessão do Supabase Auth.',
      },
    },
  },
};
