import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type { OrganizationRole } from '@inovaapss/shared';

import { createErrorHandler } from '../error-handler.js';
import { MANAGER_ROLES, requireRole } from '../rbac.js';
import { createResolveTenant, type FindMembership, requireTenant } from '../tenant.js';

import type { AuthUser } from '../auth.js';

const USER: AuthUser = { userId: '4b1f2a8e-7c3d-4e5f-8a9b-0c1d2e3f4a5b', email: 'ana@x.com' };
const ORG_ID = '9d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

/** App mínimo: finge que requireAuth já rodou (req.auth) e expõe rotas com cada guarda. */
function buildApp(findMembership: FindMembership, authUser: AuthUser | null = USER) {
  const app = express();
  app.use((req, _res, next) => {
    req.log = { warn: () => {}, error: () => {} } as unknown as typeof req.log;
    if (authUser) req.auth = authUser;
    next();
  });
  const resolveTenant = createResolveTenant(findMembership);
  app.get('/optional', resolveTenant, (req, res) => res.json({ tenant: req.tenant ?? null }));
  app.get('/required', resolveTenant, requireTenant, (req, res) => res.json(req.tenant));
  app.patch('/managers', resolveTenant, requireTenant, requireRole(...MANAGER_ROLES), (_req, res) =>
    res.json({ ok: true }),
  );
  app.get('/owner-only', resolveTenant, requireRole('owner'), (_req, res) =>
    res.json({ ok: true }),
  );
  app.use(createErrorHandler({ exposeDetails: true }));
  return app;
}

const memberAs =
  (role: OrganizationRole): FindMembership =>
  async () => ({ organizationId: ORG_ID, role });
const noMembership: FindMembership = async () => null;

describe('resolveTenant', () => {
  it('define req.tenant com organização, papel e usuário', async () => {
    const find = vi.fn(memberAs('analyst'));
    const res = await request(buildApp(find)).get('/optional');
    expect(res.status).toBe(200);
    expect(res.body.tenant).toEqual({
      organizationId: ORG_ID,
      role: 'analyst',
      userId: USER.userId,
    });
    expect(find).toHaveBeenCalledWith(USER.userId);
  });

  it('segue sem tenant quando o usuário não tem organização (onboarding)', async () => {
    const res = await request(buildApp(noMembership)).get('/optional');
    expect(res.status).toBe(200);
    expect(res.body.tenant).toBeNull();
  });

  it('responde 401 se requireAuth não rodou antes', async () => {
    const res = await request(buildApp(memberAs('owner'), null)).get('/optional');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('requireTenant', () => {
  it('responde 403 NO_ORGANIZATION sem vínculo', async () => {
    const res = await request(buildApp(noMembership)).get('/required');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NO_ORGANIZATION');
  });

  it('deixa passar com vínculo', async () => {
    const res = await request(buildApp(memberAs('viewer'))).get('/required');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('viewer');
  });
});

describe('requireRole (RBAC, §5)', () => {
  it.each(['owner', 'admin'] as const)('libera owner/admin: %s', async (role) => {
    const res = await request(buildApp(memberAs(role))).patch('/managers');
    expect(res.status).toBe(200);
  });

  it.each(['analyst', 'viewer'] as const)(
    'barra analyst/viewer com 403 FORBIDDEN: %s',
    async (role) => {
      const res = await request(buildApp(memberAs(role))).patch('/managers');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain(`"${role}"`);
    },
  );

  it('só o owner passa em requireRole("owner")', async () => {
    expect((await request(buildApp(memberAs('owner'))).get('/owner-only')).status).toBe(200);
    expect((await request(buildApp(memberAs('admin'))).get('/owner-only')).status).toBe(403);
  });

  it('responde NO_ORGANIZATION quando não há tenant', async () => {
    const res = await request(buildApp(noMembership)).get('/owner-only');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NO_ORGANIZATION');
  });
});
