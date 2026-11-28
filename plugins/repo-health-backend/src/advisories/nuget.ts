export const NUGET_FLAT_CONTAINER_URL =
  'https://api.nuget.org/v3-flatcontainer';

const DAY = 24 * 60 * 60 * 1000;

/** Latest stable (non-prerelease) version from a flat-container version list. */
export function latestStable(versions: string[]): string | undefined {
  const stable = versions.filter(v => !v.includes('-'));
  return stable.length ? stable[stable.length - 1] : undefined;
}

export function majorOf(version: string): number | undefined {
  const m = /^(\d+)/.exec(version.trim());
  return m ? Number(m[1]) : undefined;
}

/** Reads package version lists from nuget.org's free flat-container API. */
export class NugetClient {
  private readonly cache = new Map<string, { at: number; latest?: string }>();

  constructor(
    private readonly options: { fetch: typeof fetch; baseUrl?: string },
  ) {}

  async latestStable(packageId: string): Promise<string | undefined> {
    const key = packageId.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < DAY) return cached.latest;
    const res = await this.options.fetch(
      `${this.options.baseUrl ?? NUGET_FLAT_CONTAINER_URL}/${encodeURIComponent(
        key,
      )}/index.json`,
    );
    if (res.status === 404) {
      this.cache.set(key, { at: Date.now() });
      return undefined;
    }
    if (!res.ok) throw new Error(`nuget.org HTTP ${res.status}`);
    const body = (await res.json()) as { versions?: string[] };
    const latest = latestStable(body.versions ?? []);
    this.cache.set(key, { at: Date.now(), latest });
    return latest;
  }
}
