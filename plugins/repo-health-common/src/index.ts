/**
 * Types shared by the repo-health backend and frontend plugins.
 *
 * Everything here is plain data: the backend collects it on a schedule and
 * stores it, the frontend only displays it.
 *
 * @packageDocumentation
 */

/**
 * Support status of a runtime / SDK version.
 *
 * - `supported`: in support for longer than the "EOL soon" window.
 * - `eol-soon`: support ends within the configured window (default 180 days).
 * - `eol`: out of support.
 * - `preview`: preview / release candidate.
 * - `unknown`: version not found in the vendor's release metadata.
 * - `n/a`: not a runtime (e.g. netstandard2.0, a class-library contract).
 *
 * @public
 */
export type SupportStatus =
  | 'supported'
  | 'eol-soon'
  | 'eol'
  | 'preview'
  | 'unknown'
  | 'n/a';

/** @public */
export type RuntimeTargetSource = 'csproj' | 'global.json' | 'dockerfile';

/**
 * One .NET runtime or SDK target found in a repository.
 *
 * @public
 */
export type DotnetTarget = {
  /** Where it came from. */
  source: RuntimeTargetSource;
  /** Repo-relative file path. */
  file: string;
  /** Raw value as written, e.g. `net6.0`, `6.0.100`, `mcr.microsoft.com/dotnet/aspnet:8.0-alpine`. */
  raw: string;
  /** Product family. */
  product: '.NET' | '.NET Core' | '.NET Framework' | '.NET Standard';
  /** Normalised channel, e.g. `6.0`, `4.8`. Undefined when not resolvable. */
  channel?: string;
  /** `sdk` for global.json and sdk images, otherwise `runtime`. */
  kind: 'runtime' | 'sdk';
  status: SupportStatus;
  /** ISO date support ends / ended, when known. */
  eolDate?: string;
  /** `lts` or `sts` when known. */
  releaseType?: string;
  /** Latest patch in the channel (runtime or SDK), when known. */
  latestInChannel?: string;
};

/** @public */
export type NodeTarget = {
  source: 'package.json' | '.nvmrc' | '.node-version' | 'dockerfile';
  file: string;
  raw: string;
  /** Major version, e.g. `20`. */
  major?: string;
  status: SupportStatus;
  eolDate?: string;
};

/** @public */
export type PackageSource =
  | 'PackageReference'
  | 'Directory.Packages.props'
  | 'packages.lock.json'
  | 'packages.config';

/**
 * One NuGet package version used by a repository.
 *
 * @public
 */
export type PackageUsage = {
  name: string;
  /** Exact version, or the raw range/expression if it is not an exact version. */
  version: string;
  /** False when `version` is a range, floating or an unresolved property. */
  exact: boolean;
  /** True for packages only reached transitively (packages.lock.json). */
  transitive: boolean;
  source: PackageSource;
  files: string[];
  /** Latest stable version on nuget.org, when checked. */
  latestStable?: string;
  /** How many major versions behind latestStable. */
  majorsBehind?: number;
};

/** @public */
export type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'unknown';

/**
 * A known vulnerability affecting a package version, from OSV.dev.
 *
 * @public
 */
export type VulnerabilityFinding = {
  /** OSV id, usually a GHSA id. */
  id: string;
  aliases: string[];
  summary?: string;
  severity: Severity;
  package: string;
  version: string;
  transitive: boolean;
  /** First fixed version, when known. */
  fixedIn?: string;
  /** Link to the advisory. */
  url: string;
};

/** @public */
export type DotnetFacts = {
  targets: DotnetTarget[];
  /** Worst status across runtime targets and SDKs. */
  status: SupportStatus;
  /** Distinct normalised versions for display, e.g. ['net6.0', 'SDK 6.0']. */
  versions: string[];
  projectFiles: string[];
  centralPackageManagement: boolean;
  hasLockFile: boolean;
};

/** @public */
export type NodeFacts = {
  targets: NodeTarget[];
  status: SupportStatus;
  versions: string[];
};

/** @public */
export type PackageFacts = {
  ecosystem: 'NuGet';
  packages: PackageUsage[];
  vulnerabilities: VulnerabilityFinding[];
  counts: { critical: number; high: number; moderate: number; low: number };
  /** Packages two or more majors behind latest stable. */
  outdatedMajor: number;
  /** Package references that could not be checked (ranges, unresolved props). */
  unchecked: number;
};

/**
 * Everything the scanner knows about one catalog entity's repository.
 *
 * @public
 */
export type RepoHealthReport = {
  entityRef: string;
  /** Catalog data captured at scan time, for display. */
  title?: string;
  owner?: string;
  system?: string;
  type?: string;
  lifecycle?: string;
  /** `owner/repo`. */
  repo: string;
  /** Path inside the repo the scan was limited to ('' = whole repo). */
  path: string;
  ref: string;
  scannedAt: string;
  durationMs: number;
  dotnet?: DotnetFacts;
  node?: NodeFacts;
  packages?: PackageFacts;
  /** Non-fatal problems (rate limits, unreadable files, API errors). */
  warnings: string[];
  /** Set when the scan failed entirely. */
  error?: string;
  /** Set when the entity was not scanned (e.g. no repository annotation). */
  skipped?: string;
};

/**
 * Summary row used by the estate table.
 *
 * @public
 */
export type RepoHealthSummary = {
  entityRef: string;
  title?: string;
  owner?: string;
  system?: string;
  type?: string;
  lifecycle?: string;
  repo: string;
  scannedAt: string;
  dotnetVersions: string[];
  dotnetStatus?: SupportStatus;
  nodeVersions: string[];
  nodeStatus?: SupportStatus;
  vulnCritical: number;
  vulnHigh: number;
  vulnOther: number;
  outdatedMajor: number;
  error?: string;
  skipped?: string;
};

/** Ordering used to pick the "worst" status. @public */
export const SUPPORT_STATUS_RANK: Record<SupportStatus, number> = {
  'n/a': 0,
  supported: 1,
  preview: 2,
  unknown: 3,
  'eol-soon': 4,
  eol: 5,
};

/** @public */
export function worstStatus(
  statuses: SupportStatus[],
): SupportStatus | undefined {
  let worst: SupportStatus | undefined;
  for (const s of statuses) {
    if (!worst || SUPPORT_STATUS_RANK[s] > SUPPORT_STATUS_RANK[worst]) {
      worst = s;
    }
  }
  return worst;
}

/** @public */
export function summarizeReport(report: RepoHealthReport): RepoHealthSummary {
  const c = report.packages?.counts;
  return {
    entityRef: report.entityRef,
    title: report.title,
    owner: report.owner,
    system: report.system,
    type: report.type,
    lifecycle: report.lifecycle,
    repo: report.repo,
    scannedAt: report.scannedAt,
    dotnetVersions: report.dotnet?.versions ?? [],
    dotnetStatus: report.dotnet?.status,
    nodeVersions: report.node?.versions ?? [],
    nodeStatus: report.node?.status,
    vulnCritical: c?.critical ?? 0,
    vulnHigh: c?.high ?? 0,
    vulnOther: (c?.moderate ?? 0) + (c?.low ?? 0),
    outdatedMajor: report.packages?.outdatedMajor ?? 0,
    error: report.error,
    skipped: report.skipped,
  };
}
