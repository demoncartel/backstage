import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Entity } from '@backstage/catalog-model';
import type { RepoHealthReport } from '@internal/backstage-plugin-repo-health-common';

/** Read-only view of one repository (or the component's sub-directory of it). */
export interface RepoFiles {
  /** Every file path in scope, repo-relative. */
  paths: string[];
  /** True when the provider's tree listing was truncated (very large repos). */
  truncated: boolean;
  /** File contents, or undefined if it does not exist. */
  read(path: string): Promise<string | undefined>;
}

export interface RepoCollectorContext {
  entity: Entity;
  files: RepoFiles;
  /** The report being built. Collectors fill in their own section. */
  report: RepoHealthReport;
  logger: LoggerService;
  now: Date;
  /** Record a non-fatal problem; it is shown on the entity card. */
  warn(message: string): void;
}

/**
 * A collector reads files and writes facts into the report. Collectors run in
 * registration order, so a later collector may use an earlier one's facts.
 * They must be deterministic and must not call AI/LLM services.
 */
export interface RepoCollector {
  id: string;
  collect(ctx: RepoCollectorContext): Promise<void>;
}

/** Paths we never want to scan (build output, vendored dependencies). */
export function isIgnoredPath(path: string): boolean {
  return /(^|\/)(node_modules|bin|obj|\.git|vendor|dist)\//i.test(path);
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/**
 * MSBuild-style "nearest file above": for src/A/A.csproj and file name
 * Directory.Build.props, returns src/A/Directory.Build.props, then
 * src/Directory.Build.props, then Directory.Build.props, whichever exists.
 */
export function nearestAbove(
  paths: Set<string>,
  fromDir: string,
  fileName: string,
): string | undefined {
  let dir = fromDir;
  for (;;) {
    const candidate = dir ? `${dir}/${fileName}` : fileName;
    for (const p of paths) {
      if (p.toLowerCase() === candidate.toLowerCase()) return p;
    }
    if (!dir) return undefined;
    dir = dirname(dir);
  }
}
