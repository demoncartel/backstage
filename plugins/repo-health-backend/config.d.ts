import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

export interface Config {
  /** Configuration for the repo-health scanner. */
  repoHealth?: {
    /**
     * When to scan. Defaults to every 6 hours, first run 1 minute after start.
     */
    schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
    /** Days before end of support that count as "EOL soon". Default 180. */
    eolSoonDays?: number;
    /** Catalog kinds to scan. Default ['Component']. */
    kinds?: string[];
    /** Max files read per repo per scan (GitHub API calls). Default 200. */
    maxFilesPerRepo?: number;
    /** Repos scanned in parallel. Default 3. */
    concurrency?: number;
    nuget?: {
      /** Look up latest stable versions on nuget.org. Default true. */
      checkOutdated?: boolean;
    };
  };
}
