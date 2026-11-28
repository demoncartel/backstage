import {
  coreServices,
  createBackendPlugin,
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
  SchedulerServiceTaskScheduleDefinition,
} from '@backstage/backend-plugin-api';
import { ScmIntegrations } from '@backstage/integration';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { NugetClient } from './advisories/nuget';
import { OsvClient } from './advisories/osv';
import { createDotnetCollector } from './collectors/dotnet';
import { createNodeCollector } from './collectors/node';
import { createNugetCollector } from './collectors/nuget';
import type { RepoCollector } from './collectors/types';
import { repoHealthCollectorsExtensionPoint } from './extensions';
import { DotnetReleaseIndex } from './lifecycle/dotnet';
import { NodeReleaseSchedule } from './lifecycle/node';
import { createRouter } from './router';
import { RepoHealthScanner } from './scanner';
import { GithubRepoReader } from './sources/github';
import { ReportStore } from './store';

const DEFAULT_SCHEDULE: SchedulerServiceTaskScheduleDefinition = {
  frequency: { hours: 6 },
  timeout: { minutes: 30 },
  initialDelay: { minutes: 1 },
};

/**
 * Repo health backend plugin: scans the repos behind catalog components on a
 * schedule (deterministic parsing plus free public data APIs, no AI) and
 * serves the stored results.
 *
 * @public
 */
export const repoHealthPlugin = createBackendPlugin({
  pluginId: 'repo-health',
  register(env) {
    const extraCollectors: RepoCollector[] = [];
    env.registerExtensionPoint(repoHealthCollectorsExtensionPoint, {
      addCollector(...collectors) {
        extraCollectors.push(...collectors);
      },
    });

    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        database: coreServices.database,
        scheduler: coreServices.scheduler,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        auth: coreServices.auth,
        catalog: catalogServiceRef,
      },
      async init({
        config,
        logger,
        database,
        scheduler,
        httpRouter,
        httpAuth,
        auth,
        catalog,
      }) {
        const cfg = config.getOptionalConfig('repoHealth');
        const eolSoonDays = cfg?.getOptionalNumber('eolSoonDays') ?? 180;
        const checkOutdated =
          cfg?.getOptionalBoolean('nuget.checkOutdated') ?? true;
        const schedule = cfg?.has('schedule')
          ? readSchedulerServiceTaskScheduleDefinitionFromConfig(
              cfg.getConfig('schedule'),
            )
          : DEFAULT_SCHEDULE;
        const kinds = cfg?.getOptionalStringArray('kinds') ?? ['Component'];

        const store = await ReportStore.create(await database.getClient(), {
          skipMigrations: database.migrations?.skip,
        });

        const collectors: RepoCollector[] = [
          createDotnetCollector({
            releases: new DotnetReleaseIndex({ fetch }),
            eolSoonDays,
          }),
          createNugetCollector({
            osv: new OsvClient({ fetch }),
            nuget: checkOutdated ? new NugetClient({ fetch }) : undefined,
          }),
          createNodeCollector({
            schedule: new NodeReleaseSchedule({ fetch }),
            eolSoonDays,
          }),
          ...extraCollectors,
        ];

        const scanner = new RepoHealthScanner({
          logger,
          auth,
          catalog,
          store,
          reader: new GithubRepoReader(ScmIntegrations.fromConfig(config)),
          collectors,
          filter: { kind: kinds },
          maxFilesPerRepo: cfg?.getOptionalNumber('maxFilesPerRepo') ?? 200,
          concurrency: cfg?.getOptionalNumber('concurrency') ?? 3,
        });

        await scheduler.scheduleTask({
          id: 'repo-health-scan',
          ...schedule,
          fn: async () => {
            await scanner.scanAll();
          },
        });

        httpRouter.use(await createRouter({ httpAuth, store, scanner }));
        httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });
        logger.info(
          `Repo health scanner registered with ${
            collectors.length
          } collectors: ${collectors.map(c => c.id).join(', ')}`,
        );
      },
    });
  },
});
