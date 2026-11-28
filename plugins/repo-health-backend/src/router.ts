import type { HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import type { RepoHealthScanner } from './scanner';
import type { ReportStore } from './store';

export async function createRouter(options: {
  httpAuth: HttpAuthService;
  store: ReportStore;
  scanner: RepoHealthScanner;
}): Promise<express.Router> {
  const { httpAuth, store, scanner } = options;
  const router = Router();
  router.use(express.json());

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /** Summary rows for the estate table. */
  router.get('/reports', async (req, res) => {
    await httpAuth.credentials(req, { allow: ['user', 'service'] });
    res.json({ items: await store.list() });
  });

  /** Full report for one entity: GET /reports/by-entity?entityRef=component:default/foo */
  router.get('/reports/by-entity', async (req, res) => {
    await httpAuth.credentials(req, { allow: ['user', 'service'] });
    const entityRef = req.query.entityRef;
    if (typeof entityRef !== 'string' || !entityRef) {
      throw new InputError('entityRef query parameter is required');
    }
    const report = await store.get(entityRef);
    if (!report) throw new NotFoundError(`No report for ${entityRef} yet`);
    res.json(report);
  });

  /**
   * Re-scan now. With { entityRef } scans that one entity and returns its
   * report; without it starts a full scan in the background (202).
   */
  router.post('/scan', async (req, res) => {
    await httpAuth.credentials(req, { allow: ['user', 'service'] });
    const entityRef = req.body?.entityRef;
    if (entityRef !== undefined) {
      if (typeof entityRef !== 'string')
        throw new InputError('entityRef must be a string');
      const report = await scanner.scanEntityRef(entityRef);
      if (!report) throw new NotFoundError(`Entity ${entityRef} not found`);
      res.json(report);
      return;
    }
    scanner.scanAll().catch(() => {});
    res.status(202).json({ status: 'started' });
  });

  return router;
}
