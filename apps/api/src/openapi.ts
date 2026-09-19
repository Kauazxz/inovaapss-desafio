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

const errorResponse = (description: string): OpenAPIV3_1.ResponseObject => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

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
  ],
  paths: {
    '/health': {
      get: {
        tags: ['infra'],
        summary: 'Processo vivo',
        operationId: 'getHealth',
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
        responses: { '200': { description: 'Documento OpenAPI 3.1' } },
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
    },
  },
};
