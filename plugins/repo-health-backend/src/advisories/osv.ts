import type {
  Severity,
  VulnerabilityFinding,
} from '@internal/backstage-plugin-repo-health-common';

export const OSV_API_URL = 'https://api.osv.dev';

type OsvVuln = {
  id: string;
  summary?: string;
  aliases?: string[];
  database_specific?: { severity?: string };
  affected?: {
    package?: { name?: string; ecosystem?: string };
    ranges?: { type?: string; events?: Record<string, string>[] }[];
  }[];
};

export type PackageQuery = { name: string; version: string };

const DAY = 24 * 60 * 60 * 1000;

export function severityOf(vuln: OsvVuln): Severity {
  const s = vuln.database_specific?.severity?.toLowerCase();
  if (s === 'critical' || s === 'high' || s === 'low') return s;
  if (s === 'moderate' || s === 'medium') return 'moderate';
  return 'unknown';
}

export function advisoryUrl(id: string): string {
  return id.startsWith('GHSA-')
    ? `https://github.com/advisories/${id}`
    : `https://osv.dev/vulnerability/${encodeURIComponent(id)}`;
}

/** First `fixed` event for this package, if any. */
export function fixedVersionOf(
  vuln: OsvVuln,
  packageName: string,
): string | undefined {
  for (const a of vuln.affected ?? []) {
    if (a.package?.name?.toLowerCase() !== packageName.toLowerCase()) continue;
    for (const r of a.ranges ?? []) {
      for (const e of r.events ?? []) {
        if (e.fixed) return e.fixed;
      }
    }
  }
  return undefined;
}

/**
 * Thin client for the free OSV.dev API (no key needed).
 * querybatch returns only ids, so details are fetched per id and cached.
 */
export class OsvClient {
  private readonly details = new Map<string, { at: number; vuln: OsvVuln }>();

  constructor(
    private readonly options: {
      fetch: typeof fetch;
      baseUrl?: string;
      ecosystem?: string;
    },
  ) {}

  private get base() {
    return this.options.baseUrl ?? OSV_API_URL;
  }

  async findVulnerabilities(
    packages: (PackageQuery & { transitive: boolean })[],
  ): Promise<VulnerabilityFinding[]> {
    if (packages.length === 0) return [];
    const ecosystem = this.options.ecosystem ?? 'NuGet';
    const findings: VulnerabilityFinding[] = [];
    for (let i = 0; i < packages.length; i += 500) {
      const chunk = packages.slice(i, i + 500);
      const res = await this.options.fetch(`${this.base}/v1/querybatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: chunk.map(p => ({
            package: { name: p.name, ecosystem },
            version: p.version,
          })),
        }),
      });
      if (!res.ok) throw new Error(`OSV querybatch failed: HTTP ${res.status}`);
      const body = (await res.json()) as {
        results?: { vulns?: { id: string }[] }[];
      };
      const results = body.results ?? [];
      for (let j = 0; j < chunk.length; j++) {
        const pkg = chunk[j];
        for (const { id } of results[j]?.vulns ?? []) {
          const vuln = await this.getVuln(id);
          findings.push({
            id,
            aliases: vuln?.aliases ?? [],
            summary: vuln?.summary,
            severity: vuln ? severityOf(vuln) : 'unknown',
            package: pkg.name,
            version: pkg.version,
            transitive: pkg.transitive,
            fixedIn: vuln ? fixedVersionOf(vuln, pkg.name) : undefined,
            url: advisoryUrl(id),
          });
        }
      }
    }
    return findings;
  }

  private async getVuln(id: string): Promise<OsvVuln | undefined> {
    const cached = this.details.get(id);
    if (cached && Date.now() - cached.at < DAY) return cached.vuln;
    const res = await this.options.fetch(
      `${this.base}/v1/vulns/${encodeURIComponent(id)}`,
    );
    if (!res.ok) return cached?.vuln;
    const vuln = (await res.json()) as OsvVuln;
    this.details.set(id, { at: Date.now(), vuln });
    return vuln;
  }
}
