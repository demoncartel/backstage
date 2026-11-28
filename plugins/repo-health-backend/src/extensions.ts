import { createExtensionPoint } from '@backstage/backend-plugin-api';
import type { RepoCollector } from './collectors/types';

/**
 * Lets backend modules add collectors without touching this plugin:
 *
 * ```ts
 * createBackendModule({
 *   pluginId: 'repo-health',
 *   moduleId: 'my-collector',
 *   register(env) {
 *     env.registerInit({
 *       deps: { collectors: repoHealthCollectorsExtensionPoint },
 *       async init({ collectors }) {
 *         collectors.addCollector({ id: 'my-collector', async collect(ctx) {} });
 *       },
 *     });
 *   },
 * });
 * ```
 *
 * @public
 */
export interface RepoHealthCollectorsExtensionPoint {
  addCollector(...collectors: RepoCollector[]): void;
}

/** @public */
export const repoHealthCollectorsExtensionPoint =
  createExtensionPoint<RepoHealthCollectorsExtensionPoint>({
    id: 'repo-health.collectors',
  });
