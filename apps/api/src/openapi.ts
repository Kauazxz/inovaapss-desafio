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
        summary: 'Convida ou cria um usuário na organização (owner ou admin)',
        operationId: 'inviteOrganizationUser',
        description:
          'Sem `password`, envia convite por e-mail (Supabase Auth). Com `password`, cria o usuário já confirmado. Se o e-mail já existir no Auth, apenas registra o vínculo. Somente o owner pode atribuir o papel owner.',
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
  },
  components: {
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
          password: {
            type: 'string',
            minLength: 8,
            maxLength: 72,
            description: 'Opcional: cria o usuário já confirmado com esta senha temporária.',
          },
        },
      },
      InviteMemberResult: {
        type: 'object',
        required: ['member', 'outcome'],
        properties: {
          member: { $ref: '#/components/schemas/OrganizationMember' },
          outcome: { type: 'string', enum: ['invited', 'created', 'linked'] },
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
