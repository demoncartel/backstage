import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/frontend-plugin-api';
import type {
  RepoHealthReport,
  RepoHealthSummary,
} from '@internal/backstage-plugin-repo-health-common';

/** Read-only client for the repo-health backend. @public */
export interface RepoHealthApi {
  listReports(): Promise<RepoHealthSummary[]>;
  /** Undefined when the entity has not been scanned yet. */
  getReport(entityRef: string): Promise<RepoHealthReport | undefined>;
  rescan(entityRef: string): Promise<RepoHealthReport>;
}

/** @public */
export const repoHealthApiRef = createApiRef<RepoHealthApi>().with({
  id: 'plugin.repo-health.api',
  pluginId: 'repo-health',
});

export class RepoHealthClient implements RepoHealthApi {
  constructor(
    private readonly deps: { discoveryApi: DiscoveryApi; fetchApi: FetchApi },
  ) {}

  private async url(path: string) {
    return `${await this.deps.discoveryApi.getBaseUrl('repo-health')}${path}`;
  }

  private async check(res: Response) {
    if (!res.ok) {
      throw new Error(
        `Repo health request failed: ${res.status} ${res.statusText}`,
      );
    }
    return res.json();
  }

  async listReports() {
    const res = await this.deps.fetchApi.fetch(await this.url('/reports'));
    return ((await this.check(res)) as { items: RepoHealthSummary[] }).items;
  }

  async getReport(entityRef: string) {
    const res = await this.deps.fetchApi.fetch(
      await this.url(
        `/reports/by-entity?entityRef=${encodeURIComponent(entityRef)}`,
      ),
    );
    if (res.status === 404) return undefined;
    return (await this.check(res)) as RepoHealthReport;
  }

  async rescan(entityRef: string) {
    const res = await this.deps.fetchApi.fetch(await this.url('/scan'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityRef }),
    });
    return (await this.check(res)) as RepoHealthReport;
  }
}
