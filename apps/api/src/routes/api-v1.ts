/**
 * Router base /api/v1 (§37). Cada módulo registra o seu sub-router aqui, numa linha:
 *   router.use('/clients', createClientsRouter(...));
 * e acrescenta a entrada correspondente em ROUTES para aparecer no GET /api/v1.
 *
 * Os middlewares de auth/tenant nascem aqui uma vez e são passados aos módulos, para todos
 * compartilharem o mesmo cache de tokens e a mesma resolução de organização.
 */
import { Router } from 'express';

import { API_VERSION } from '../config/version.js';
import { createOpenAiClient, type OpenAiClient } from '../infrastructure/ai/openai-client.js';
import {
  createManualMetricExtractionProvider,
  createOpenAiMetricExtractionProvider,
  createTextExtractor,
  createUnstructuredTextExtractor,
  type MetricExtractionProvider,
  type TextExtractor,
} from '../infrastructure/extraction/index.js';
import { createMailer } from '../infrastructure/mailer.js';
import { createSupabaseDocumentStorage } from '../infrastructure/storage/supabase-storage.js';
import { createRequireAuth, type GetUserByToken, supabaseGetUser } from '../middleware/auth.js';
import { createResolveTenant } from '../middleware/tenant.js';
import { createAlertsRouter } from '../modules/alerts/routes.js';
import { createAlertsService } from '../modules/alerts/service.js';
import { createAssistantController } from '../modules/assistant/controller.js';
import { createAssistantDocumentLoader } from '../modules/assistant/document-loader.js';
import { createAssistantRouter } from '../modules/assistant/routes.js';
import { createAssistantService } from '../modules/assistant/service.js';
import { createAuthController } from '../modules/auth/controller.js';
import { createAuthRouter } from '../modules/auth/routes.js';
import { createAuthService } from '../modules/auth/service.js';
import { createClientHealthRepository } from '../modules/client-health/repository.js';
import { createClientHealthRouter } from '../modules/client-health/routes.js';
import { createClientHealthService } from '../modules/client-health/service.js';
import {
  createContractsController,
  createPlansController,
} from '../modules/contracts/controller.js';
import {
  type ContractsRepository,
  createContractsRepository,
  createPlansRepository,
  type PlansRepository,
} from '../modules/contracts/repository.js';
import { createContractsRouter, createPlansRouter } from '../modules/contracts/routes.js';
import { createContractsService, createPlansService } from '../modules/contracts/service.js';
import {
  createDashboardRepository,
  type DashboardRepository,
} from '../modules/dashboard/repository.js';
import { createDashboardRouter } from '../modules/dashboard/routes.js';
import { createDashboardService } from '../modules/dashboard/service.js';
import { createDocumentsController } from '../modules/documents/controller.js';
import {
  createDocumentsRepository,
  type DocumentsRepository,
} from '../modules/documents/repository.js';
import { createDocumentsRouter } from '../modules/documents/routes.js';
import { createDocumentsService } from '../modules/documents/service.js';
import { createImportsController } from '../modules/imports/controller.js';
import { createImportsRepository, type ImportsRepository } from '../modules/imports/repository.js';
import { createImportsRouter } from '../modules/imports/routes.js';
import { createImportsService, type RecalculatePortfolio } from '../modules/imports/service.js';
import { IMPORTS_BUCKET } from '../modules/imports/storage.js';
import { createMetricsController } from '../modules/metrics/controller.js';
import { createMetricsRepository, type MetricsRepository } from '../modules/metrics/repository.js';
import {
  createMetricDefinitionsRouter,
  createMetricModelsRouter,
} from '../modules/metrics/routes.js';
import { createMetricsService } from '../modules/metrics/service.js';
import { createOrganizationsController } from '../modules/organizations/controller.js';
import {
  createOrganizationsRepository,
  type OrganizationsRepository,
} from '../modules/organizations/repository.js';
import { createOrganizationsRouter } from '../modules/organizations/routes.js';
import { createOrganizationsService } from '../modules/organizations/service.js';
import { createPortfolioClientsController } from '../modules/portfolio-clients/controller.js';
import {
  createPortfolioClientsRepository,
  type PortfolioClientsRepository,
} from '../modules/portfolio-clients/repository.js';
import { createPortfolioClientsRouter } from '../modules/portfolio-clients/routes.js';
import { createPortfolioClientsService } from '../modules/portfolio-clients/service.js';
import { recalculateOrganization } from '../modules/scoring/recalculate.js';

import type { ApiEnv } from '../config/env.js';
import type { DbClient } from '../infrastructure/db/index.js';
import type { Mailer } from '../infrastructure/mailer.js';
import type { DocumentStorage } from '../infrastructure/storage/document-storage.js';
import type { SupabaseClients } from '../infrastructure/supabase.js';

export const API_V1_PREFIX = '/api/v1';

export interface RouteDescriptor {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  description: string;
}

export const ROUTES: readonly RouteDescriptor[] = [
  { method: 'GET', path: `${API_V1_PREFIX}`, description: 'Lista as rotas disponíveis' },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/me`,
    description: 'Usuário autenticado, organização atual e papel',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/organizations`,
    description: 'Onboarding: cria a organização e torna o usuário owner',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/organizations/current`,
    description: 'Organização atual',
  },
  {
    method: 'PATCH',
    path: `${API_V1_PREFIX}/organizations/current`,
    description: 'Atualiza nome/slug da organização (owner ou admin)',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/organizations/current/users`,
    description: 'Usuários da organização e seus papéis',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/organizations/current/users`,
    description: 'Convida ou cria um usuário na organização (owner ou admin)',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/dashboard/risk`,
    description: 'Aba Em risco: KPIs, forecast priorizado e ranking com evidências',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/dashboard/general`,
    description: 'Aba Geral: distribuição por classe, MRR, saúde por dimensão e evolução',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/alerts`,
    description: 'Gatilhos críticos disparados, com o cliente, o motivo e a ação',
  },
  {
    method: 'PATCH',
    path: `${API_V1_PREFIX}/alerts/:id`,
    description: 'Reconhece ou resolve um alerta (owner, admin ou analyst)',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/alerts/digest/send`,
    description: 'Envia por e-mail o resumo dos alertas abertos',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/clients/:id/scores`,
    description: 'Métricas do cliente com saúde, peso e quanto cada uma tira do total',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/clients/:id/evidence`,
    description: 'Motivos da classificação, ordenados pelo impacto',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/clients/:id/recommendations`,
    description: 'O que fazer: playbook de cada métrica que puxa a saúde para baixo',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/clients/:id/history`,
    description: 'Evolução da saúde e mudanças de classe',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/metrics`,
    description: 'Lista as definições de métrica',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metrics`,
    description: 'Cria uma definição (owner ou admin)',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/metrics/:id`,
    description: 'Definição e configuração ativa',
  },
  {
    method: 'PATCH',
    path: `${API_V1_PREFIX}/metrics/:id`,
    description: 'Atualiza a definição (owner ou admin)',
  },
  {
    method: 'DELETE',
    path: `${API_V1_PREFIX}/metrics/:id`,
    description: 'Apaga se nunca usada, senão desativa (owner ou admin)',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metrics/:id/preview-score`,
    description: 'Simula o score da métrica com o motor sobre valores de exemplo',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/metric-models`,
    description: 'Lista os modelos de métricas',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metric-models`,
    description: 'Cria um modelo (owner ou admin)',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/metric-models/:id`,
    description: 'Modelo com as versões e itens',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metric-models/:id/versions`,
    description: 'Cria um rascunho de versão (owner ou admin)',
  },
  {
    method: 'PATCH',
    path: `${API_V1_PREFIX}/metric-models/:id/versions/:version`,
    description: 'Edita um rascunho (owner ou admin)',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metric-models/:id/versions/:version/activate`,
    description: 'Ativa a versão: pesos somam 100 %, a anterior é arquivada (owner ou admin)',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metric-models/:id/rebalance`,
    description: 'Proposta de pesos redistribuídos proporcionalmente (não salva)',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/clients`,
    description: 'Clientes da carteira (busca, ordenação, filtros e paginação)',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/clients`,
    description: 'Cadastra um cliente (owner, admin ou analyst)',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/clients/filter-options`,
    description: 'Valores disponíveis para os filtros de clientes',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/clients/:id`,
    description: 'Cliente com contrato ativo e plano',
  },
  {
    method: 'PATCH',
    path: `${API_V1_PREFIX}/clients/:id`,
    description: 'Edita um cliente (owner, admin ou analyst)',
  },
  {
    method: 'DELETE',
    path: `${API_V1_PREFIX}/clients/:id`,
    description: 'Arquiva um cliente (owner, admin ou analyst)',
  },
  { method: 'GET', path: `${API_V1_PREFIX}/plans`, description: 'Planos da organização' },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/plans`,
    description: 'Cria um plano (owner, admin ou analyst)',
  },
  { method: 'GET', path: `${API_V1_PREFIX}/plans/:id`, description: 'Um plano' },
  {
    method: 'PATCH',
    path: `${API_V1_PREFIX}/plans/:id`,
    description: 'Edita um plano (owner, admin ou analyst)',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/contracts`,
    description: 'Contratos (por cliente e/ou status, paginados)',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/contracts`,
    description: 'Cria um contrato; ativar um encerra o ativo anterior do cliente',
  },
  { method: 'GET', path: `${API_V1_PREFIX}/contracts/:id`, description: 'Um contrato' },
  {
    method: 'PATCH',
    path: `${API_V1_PREFIX}/contracts/:id`,
    description: 'Edita ou encerra um contrato (owner, admin ou analyst)',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/documents`,
    description: 'Upload de documento (PDF, DOCX, XLSX, CSV, JSON, MD, TXT; até 10 MB)',
  },
  { method: 'GET', path: `${API_V1_PREFIX}/documents`, description: 'Documentos enviados' },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/documents/{id}`,
    description: 'Documento com URL assinada de download',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/documents/{id}/extract-metrics`,
    description: 'Extrai o texto do documento e roda o provider de sugestões',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/documents/{id}/suggestions`,
    description: 'Sugestões de métrica do documento',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/documents/{id}/suggestions`,
    description: 'Cria uma sugestão de métrica manual a partir do documento',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metric-suggestions/{id}/accept`,
    description: 'Aceita a sugestão e devolve o payload para POST /metrics',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/metric-suggestions/{id}/reject`,
    description: 'Rejeita a sugestão',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/imports`,
    description: 'Upload de planilha para importação (XLSX, CSV ou JSON; até 10 MB)',
  },
  { method: 'GET', path: `${API_V1_PREFIX}/imports`, description: 'Importações da organização' },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/imports/datasets`,
    description: 'Datasets e campos que o importador entende',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/imports/{id}`,
    description: 'Importação com as tabelas do arquivo e o mapeamento sugerido',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/imports/{id}/preview`,
    description: 'Prévia: aplica o mapeamento, valida e devolve o relatório sem gravar',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/imports/{id}/confirm`,
    description: 'Confirma: revalida, grava por upsert e dispara o recálculo',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/imports/{id}/errors`,
    description: 'Linhas recusadas da importação, com o motivo',
  },
  {
    method: 'GET',
    path: `${API_V1_PREFIX}/assistant/status`,
    description: 'Se o Agente IA está configurado nesta instância e com que modelo',
  },
  {
    method: 'POST',
    path: `${API_V1_PREFIX}/assistant/ask`,
    description: 'Pergunta ao Agente IA sobre o relatório da carteira',
  },
];

export interface ApiV1Dependencies {
  db: DbClient;
  supabase: SupabaseClients;
  /** Testes: substitui a validação do token no Supabase. */
  getUser?: GetUserByToken;
  /** Testes: substitui a persistência de organizações. */
  organizationsRepository?: OrganizationsRepository;
  /** Testes: substitui a persistência de documentos e sugestões. */
  documentsRepository?: DocumentsRepository;
  /** Testes/dev: substitui o Supabase Storage (ex.: createInMemoryDocumentStorage). */
  documentStorage?: DocumentStorage;
  /** Substitui o provider de sugestões (padrão: manual — ajuste A5). */
  metricExtractionProvider?: MetricExtractionProvider;
  /** Testes: substitui a extração de texto. */
  textExtractor?: TextExtractor;
  /** Testes: substitui a persistência de clientes, planos e contratos (Etapa 2). */
  portfolioClientsRepository?: PortfolioClientsRepository;
  plansRepository?: PlansRepository;
  contractsRepository?: ContractsRepository;
  /** Testes: substitui a persistência de métricas e modelos. */
  metricsRepository?: MetricsRepository;
  /** Testes: substitui a persistência de importações e a gravação dos dados importados. */
  importsRepository?: ImportsRepository;
  /** Testes/dev: substitui o Supabase Storage do bucket "imports". */
  importStorage?: DocumentStorage;
  /** Testes: substitui o recálculo disparado ao confirmar uma importação (§62). */
  recalculate?: RecalculatePortfolio;
  /** Testes: substitui a leitura dos snapshots do dashboard (base do Agente IA). */
  dashboardRepository?: DashboardRepository;
  /** Testes: substitui o cliente da OpenAI. `null` simula a instância sem chave configurada. */
  openAiClient?: OpenAiClient | null;
  /** Testes: desliga o rate limit próprio do Agente IA. */
  assistantRateLimit?: boolean;
  /** Variáveis para os serviços que dependem de configuração (e-mail, URL do painel). */
  env?: Pick<
    ApiEnv,
    | 'RESEND_API_KEY'
    | 'EMAIL_FROM'
    | 'WEB_BASE_URL'
    | 'OPENAI_API_KEY'
    | 'OPENAI_MODEL'
    | 'UNSTRUCTURED_API_URL'
    | 'UNSTRUCTURED_API_KEY'
  >;
  /** Testes: substitui o envio de e-mail. */
  mailer?: Mailer;
}

export function createApiV1Router(deps: ApiV1Dependencies): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      name: 'inovaapss-api',
      version: API_VERSION,
      routes: ROUTES,
      links: {
        health: '/health',
        ready: '/ready',
        docs: '/api/docs',
        openapi: '/api/docs.json',
      },
    });
  });

  const organizationsRepository =
    deps.organizationsRepository ?? createOrganizationsRepository(() => deps.db.getDb());
  const requireAuth = createRequireAuth({
    getUser: deps.getUser ?? supabaseGetUser(deps.supabase),
  });
  const resolveTenant = createResolveTenant((authUserId) =>
    organizationsRepository.findMembershipByUser(authUserId),
  );

  const authService = createAuthService(organizationsRepository);
  router.use(
    createAuthRouter({
      requireAuth,
      resolveTenant,
      controller: createAuthController(authService),
    }),
  );

  const organizationsService = createOrganizationsService({
    repository: organizationsRepository,
    supabase: deps.supabase,
  });
  router.use(
    '/organizations',
    createOrganizationsRouter({
      requireAuth,
      resolveTenant,
      controller: createOrganizationsController(organizationsService),
    }),
  );

  const metricsRepository =
    deps.metricsRepository ?? createMetricsRepository(() => deps.db.getDb());
  const metricsController = createMetricsController(createMetricsService(metricsRepository));
  router.use(
    '/metrics',
    createMetricDefinitionsRouter({ requireAuth, resolveTenant, controller: metricsController }),
  );
  router.use(
    '/metric-models',
    createMetricModelsRouter({ requireAuth, resolveTenant, controller: metricsController }),
  );

  // Etapa 2 — clientes, planos e contratos.
  const getDb = () => deps.db.getDb();
  const portfolioClientsRepository =
    deps.portfolioClientsRepository ?? createPortfolioClientsRepository(getDb);
  const plansRepository = deps.plansRepository ?? createPlansRepository(getDb);
  const contractsRepository = deps.contractsRepository ?? createContractsRepository(getDb);
  router.use(
    '/clients',
    createClientHealthRouter({
      requireAuth,
      resolveTenant,
      service: createClientHealthService(createClientHealthRepository(getDb)),
    }),
  );
  router.use(
    '/clients',
    createPortfolioClientsRouter({
      requireAuth,
      resolveTenant,
      controller: createPortfolioClientsController(
        createPortfolioClientsService(portfolioClientsRepository),
      ),
    }),
  );
  router.use(
    '/plans',
    createPlansRouter({
      requireAuth,
      resolveTenant,
      controller: createPlansController(createPlansService(plansRepository)),
    }),
  );
  router.use(
    '/contracts',
    createContractsRouter({
      requireAuth,
      resolveTenant,
      controller: createContractsController(
        createContractsService({
          repository: contractsRepository,
          plans: plansRepository,
          clients: portfolioClientsRepository,
        }),
      ),
    }),
  );

  router.use(
    '/alerts',
    createAlertsRouter({
      requireAuth,
      resolveTenant,
      service: createAlertsService(getDb),
      mailer:
        deps.mailer ??
        createMailer({ apiKey: deps.env?.RESEND_API_KEY, from: deps.env?.EMAIL_FROM }),
      webBaseUrl: deps.env?.WEB_BASE_URL ?? 'https://inovaapss-desafio.vercel.app',
    }),
  );

  // Dashboard — leitura dos snapshots calculados pelo scoring.
  const dashboardService = createDashboardService(
    deps.dashboardRepository ?? createDashboardRepository(getDb),
  );
  router.use(
    '/dashboard',
    createDashboardRouter({ requireAuth, resolveTenant, service: dashboardService }),
  );

  // ---------------------------------------------------------------------- IA
  // A chave só existe no backend. Sem ela, nada quebra: a leitura de documentos continua nos
  // extratores locais, a descoberta de métricas fica no fluxo manual (§35) e o Agente IA
  // responde 503 explicando o que configurar.
  const openAiClient: OpenAiClient | null =
    deps.openAiClient !== undefined
      ? deps.openAiClient
      : deps.env?.OPENAI_API_KEY
        ? createOpenAiClient({
            apiKey: deps.env.OPENAI_API_KEY,
            model: deps.env.OPENAI_MODEL,
          })
        : null;

  const localTextExtractor = createTextExtractor();
  const textExtractor: TextExtractor =
    deps.textExtractor ??
    (deps.env?.UNSTRUCTURED_API_URL
      ? createUnstructuredTextExtractor({
          apiUrl: deps.env.UNSTRUCTURED_API_URL,
          apiKey: deps.env.UNSTRUCTURED_API_KEY,
          fallback: localTextExtractor,
        })
      : localTextExtractor);

  const documentsRepository =
    deps.documentsRepository ?? createDocumentsRepository(() => deps.db.getDb());
  const documentStorage =
    deps.documentStorage ??
    createSupabaseDocumentStorage({ getClient: () => deps.supabase.getAdmin() });

  const documentsService = createDocumentsService({
    repository: documentsRepository,
    storage: documentStorage,
    textExtractor,
    provider:
      deps.metricExtractionProvider ??
      (openAiClient === null
        ? createManualMetricExtractionProvider()
        : createOpenAiMetricExtractionProvider({ client: openAiClient })),
  });
  router.use(
    createDocumentsRouter({
      requireAuth,
      resolveTenant,
      controller: createDocumentsController(documentsService),
    }),
  );

  // Etapa 7 — importação de planilhas. O arquivo vai para o bucket privado "imports", separado
  // do de documentos: aqui ele existe para ser relido na prévia e na confirmação.
  const importsService = createImportsService({
    repository: deps.importsRepository ?? createImportsRepository(getDb),
    storage:
      deps.importStorage ??
      createSupabaseDocumentStorage({
        getClient: () => deps.supabase.getAdmin(),
        bucket: IMPORTS_BUCKET,
      }),
    recalculate:
      deps.recalculate ??
      (async (organizationId: string) => {
        const result = await recalculateOrganization(getDb(), { organizationId });
        return { clients: result.clients };
      }),
  });
  router.use(
    '/imports',
    createImportsRouter({
      requireAuth,
      resolveTenant,
      controller: createImportsController(importsService),
    }),
  );

  // Agente IA — pergunta e resposta sobre o relatório que o dashboard já mostra.
  router.use(
    '/assistant',
    createAssistantRouter({
      requireAuth,
      resolveTenant,
      rateLimitEnabled: deps.assistantRateLimit ?? true,
      controller: createAssistantController(
        createAssistantService({
          dashboard: dashboardService,
          client: openAiClient,
          documents: createAssistantDocumentLoader({
            repository: documentsRepository,
            storage: documentStorage,
          }),
          organizationName: async (tenant) =>
            (await organizationsRepository.findById(tenant.organizationId))?.name ??
            'sua organização',
        }),
      ),
    }),
  );

  return router;
}
