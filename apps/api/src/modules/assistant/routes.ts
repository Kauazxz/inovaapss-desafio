/**
 * Rotas do Agente IA (§37), montadas em /api/v1/assistant:
 *   GET  /assistant/status   a IA está configurada nesta instância? (a tela decide o que mostrar)
 *   POST /assistant/ask      pergunta sobre o relatório da organização
 *
 * Qualquer membro pode perguntar: é leitura do que a pessoa já vê no dashboard. Quem não tem
 * organização não passa de requireTenant, então ninguém consulta carteira alheia (§5).
 *
 * Rate limit próprio: uma pergunta custa uma chamada paga à OpenAI, então o limite global da
 * API (300/15 min) é frouxo demais aqui.
 */
import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

import { requireTenant } from '../../middleware/tenant.js';
import { getRequestId } from '../../shared/request.js';

import type { AssistantController } from './controller.js';
import type { RequestHandler } from 'express';

/** Perguntas por usuário na janela. Generoso para uso normal, curto para abuso. */
export const ASSISTANT_RATE_LIMIT = 30;
export const ASSISTANT_RATE_WINDOW_MS = 5 * 60 * 1000;

export interface AssistantRouterOptions {
  requireAuth: RequestHandler;
  resolveTenant: RequestHandler;
  controller: AssistantController;
  /** Testes desligam o limite para não depender de contagem entre casos. */
  rateLimitEnabled?: boolean;
}

export function createAssistantRouter({
  requireAuth,
  resolveTenant,
  controller,
  rateLimitEnabled = true,
}: AssistantRouterOptions): Router {
  const router = Router();
  router.use(requireAuth, resolveTenant, requireTenant);

  router.get('/status', controller.status);

  const limiter = rateLimit({
    windowMs: ASSISTANT_RATE_WINDOW_MS,
    limit: ASSISTANT_RATE_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Por usuário, não por IP: um escritório inteiro sai pelo mesmo IP. Sem usuário (o que não
    // deveria acontecer depois de requireTenant), cai no IP normalizado pelo helper da lib, que
    // agrupa a faixa /56 do IPv6 em vez de tratar cada endereço como um cliente novo.
    keyGenerator: (req) => req.tenant?.userId ?? ipKeyGenerator(req.ip ?? ''),
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Muitas perguntas seguidas. Aguarde alguns minutos.',
          requestId: getRequestId(req),
        },
      });
    },
  });

  router.post('/ask', ...(rateLimitEnabled ? [limiter] : []), controller.ask);

  return router;
}
