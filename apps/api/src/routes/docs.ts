/**
 * Documentação da API: o JSON OpenAPI em /api/docs.json (sempre) e o Swagger UI em /api/docs
 * (só fora de produção — a interface não é necessária lá e aumenta a superfície exposta).
 */
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { openapiDocument } from '../openapi.js';

export function createDocsRouter({ enableUi }: { enableUi: boolean }): Router {
  const router = Router();

  router.get('/docs.json', (_req, res) => {
    res.json(openapiDocument);
  });

  if (enableUi) {
    router.use(
      '/docs',
      swaggerUi.serve,
      swaggerUi.setup(openapiDocument, { customSiteTitle: 'inovaapss API' }),
    );
  }

  return router;
}
