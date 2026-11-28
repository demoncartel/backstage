import type { AuthService, LoggerService } from '@backstage/backend-plugin-api';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import type { RepoHealthReport } from '@internal/backstage-plugin-repo-health-common';
import type { RepoCollector, RepoFiles } from './collectors/types';
import {
  GithubRepoReader,
  RepoLocation,
  repoLocationForEntity,
} from './sources/github';
import type { ReportStore } from './store';

export type ScannerOptions = {
  logger: LoggerService;
  auth: AuthService;
  catalog: CatalogService;
  store: ReportStore;
  reader: GithubRepoReader;
  collectors: RepoCollector[];
  /** Catalog filter for entities to scan. */
  filter: Record<string, string | string[]>;
  maxFilesPerRepo: number;
  concurrency: number;
};

type OpenRepo = RepoFiles & { ref: string };

/** Fetches catalog entities, opens their repos and runs every collector. */
export class RepoHealthScanner {
  private running?: Promise<{ scanned: number; failed: number }>;

  constructor(private readonly options: ScannerOptions) {}

  /** Scans every matching entity. Concurrent calls share one run. */
  scanAll(): Promise<{ scanned: number; failed: number }> {
    if (!this.running) {
      this.running = this.doScanAll().finally(() => {
        this.running = undefined;
      });
    }
    return this.running;
  }

  async scanEntityRef(
    entityRef: string,
  ): Promise<RepoHealthReport | undefined> {
    const credentials = await this.options.auth.getOwnServiceCredentials();
    const entity = await this.options.catalog.getEntityByRef(entityRef, {
      credentials,
    });
    if (!entity) return undefined;
    const report = await this.scanEntity(entity, new Map());
    await this.options.store.upsert(report);
    return report;
  }

  private async doScanAll() {
    const { logger, catalog, auth, store } = this.options;
    const started = Date.now();
    const credentials = await auth.getOwnServiceCredentials();
    const { items } = await catalog.getEntities(
      { filter: this.options.filter },
      { credentials },
    );
    logger.info(`Repo health scan starting for ${items.length} entities`);
    const repos = new Map<string, Promise<OpenRepo>>();
    let scanned = 0;
    let failed = 0;
    const refs: string[] = [];
    const queue = [...items];
    const worker = async () => {
      for (;;) {
        const entity = queue.shift();
        if (!entity) return;
        const report = await this.scanEntity(entity, repos);
        refs.push(report.entityRef);
        if (report.error) failed++;
        else if (report.repo) scanned++;
        await store.upsert(report);
      }
    };
    await Promise.all(
      Array.from({ length: Math.max(1, this.options.concurrency) }, worker),
    );
    const removed = await store.retainOnly(refs);
    logger.info(
      `Repo health scan finished in ${Math.round(
        (Date.now() - started) / 1000,
      )}s: ` + `${scanned} scanned, ${failed} failed, ${removed} stale removed`,
    );
    return { scanned, failed };
  }

  private async scanEntity(
    entity: Entity,
    repos: Map<string, Promise<OpenRepo>>,
  ): Promise<RepoHealthReport> {
    const started = Date.now();
    const entityRef = stringifyEntityRef(entity).toLowerCase();
    const spec = (entity.spec ?? {}) as Record<string, unknown>;
    const report: RepoHealthReport = {
      entityRef,
      title: entity.metadata.title,
      owner: typeof spec.owner === 'string' ? spec.owner : undefined,
      system: typeof spec.system === 'string' ? spec.system : undefined,
      type: typeof spec.type === 'string' ? spec.type : undefined,
      lifecycle:
        typeof spec.lifecycle === 'string' ? spec.lifecycle : undefined,
      repo: '',
      path: '',
      ref: '',
      scannedAt: new Date().toISOString(),
      durationMs: 0,
      warnings: [],
    };
    const loc = repoLocationForEntity(entity);
    if (!loc) {
      report.skipped =
        'No GitHub repository annotation (github.com/project-slug or backstage.io/source-location)';
      return report;
    }
    if (!this.options.reader.hasIntegration(loc.host)) {
      report.skipped = `No GitHub integration configured for ${loc.host}`;
      return report;
    }
    report.repo = `${loc.owner}/${loc.repo}`;
    report.path = loc.path;
    try {
      const files = await this.open(loc, repos);
      report.ref = files.ref;
      if (files.truncated) {
        report.warnings.push(
          'Repository tree was truncated by GitHub; some files were not scanned.',
        );
      }
      const now = new Date();
      for (const collector of this.options.collectors) {
        try {
          await collector.collect({
            entity,
            files,
            report,
            logger: this.options.logger.child({ collector: collector.id }),
            now,
            warn: m => report.warnings.push(m),
          });
        } catch (e) {
          report.warnings.push(`Collector ${collector.id} failed: ${e}`);
        }
      }
    } catch (e) {
      report.error = String(e instanceof Error ? e.message : e);
      this.options.logger.warn(
        `Repo health scan of ${entityRef} failed: ${report.error}`,
      );
    }
    report.warnings = [...new Set(report.warnings)];
    report.durationMs = Date.now() - started;
    return report;
  }

  private open(loc: RepoLocation, repos: Map<string, Promise<OpenRepo>>) {
    const key = `${loc.host}/${loc.owner}/${loc.repo}@${loc.ref ?? ''}:${
      loc.path
    }`.toLowerCase();
    if (!repos.has(key)) {
      repos.set(
        key,
        this.options.reader.open(loc, {
          maxFiles: this.options.maxFilesPerRepo,
        }),
      );
    }
    return repos.get(key)!;
  }
}
