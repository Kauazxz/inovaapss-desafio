/** Controller do Agente IA: valida a entrada, chama o service e responde. Sem regra aqui (§3). */
import { askAssistantSchema } from './schema.js';
import { getTenant } from '../../middleware/tenant.js';

import type { AssistantService } from './service.js';
import type { RequestHandler } from 'express';

export interface AssistantController {
  status: RequestHandler;
  ask: RequestHandler;
}

export function createAssistantController(service: AssistantService): AssistantController {
  return {
    status(_req, res) {
      res.json(service.status());
    },

    async ask(req, res) {
      const tenant = getTenant(req);
      const body = askAssistantSchema.parse(req.body);
      res.json(await service.ask(tenant, body));
    },
  };
}
