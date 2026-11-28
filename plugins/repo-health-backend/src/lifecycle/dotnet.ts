import type { SupportStatus } from '@internal/backstage-plugin-repo-health-common';

export const DOTNET_RELEASES_INDEX_URL =
  'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json';

/** One entry of Microsoft's releases-index.json. */
export type DotnetChannelInfo = {
  'channel-version': string;
  'latest-release'?: string;
  'latest-runtime'?: string;
  'latest-sdk'?: string;
  product?: string;
  'support-phase'?: string;
  'release-type'?: string;
  'eol-date'?: string | null;
};

export type Lifecycle = {
  status: SupportStatus;
  eolDate?: string;
  releaseType?: string;
  latestRuntime?: string;
  latestSdk?: string;
};

const DAY = 24 * 60 * 60 * 1000;

/** Pure: support status of a .NET / .NET Core channel. */
export function dotnetChannelLifecycle(
  index: DotnetChannelInfo[] | undefined,
  channel: string | undefined,
  now: Date,
  eolSoonDays: number,
): Lifecycle {
  if (!channel || !index) return { status: 'unknown' };
  const info = index.find(i => i['channel-version'] === channel);
  if (!info) return { status: 'unknown' };
  const eolDate = info['eol-date'] || undefined;
  const base = {
    eolDate,
    releaseType: info['release-type'],
    latestRuntime: info['latest-runtime'] ?? info['latest-release'],
    latestSdk: info['latest-sdk'],
  };
  const phase = (info['support-phase'] ?? '').toLowerCase();
  const eolTime = eolDate ? Date.parse(eolDate) : NaN;
  if (phase === 'eol' || (!isNaN(eolTime) && eolTime <= now.getTime())) {
    return { status: 'eol', ...base };
  }
  if (phase === 'preview' || phase === 'go-live' || phase === 'rc') {
    return { status: 'preview', ...base };
  }
  if (!isNaN(eolTime) && eolTime - now.getTime() <= eolSoonDays * DAY) {
    return { status: 'eol-soon', ...base };
  }
  return { status: 'supported', ...base };
}

/**
 * .NET Framework is not in releases-index.json; its lifecycle follows the
 * Windows lifecycle. Source: https://learn.microsoft.com/lifecycle/products/microsoft-net-framework
 * - 4.5.2, 4.6, 4.6.1 ended 26 Apr 2022; older 4.x ended 12 Jan 2016.
 * - 4.6.2 and later are supported (tied to the OS they ship on).
 * - 3.5 SP1 is supported until 9 Jan 2029.
 */
export function dotnetFrameworkLifecycle(
  channel: string | undefined,
  now: Date,
  eolSoonDays: number,
): Lifecycle {
  if (!channel) return { status: 'unknown' };
  const parts = channel.split('.').map(Number);
  const [maj, min, patch = 0] = parts;
  const value = maj * 100 + min * 10 + patch;
  if (maj === 3 && min === 5) {
    const eolDate = '2029-01-09';
    const soon = Date.parse(eolDate) - now.getTime() <= eolSoonDays * DAY;
    return { status: soon ? 'eol-soon' : 'supported', eolDate };
  }
  if (maj < 4) return { status: 'eol' };
  if (value < 452) return { status: 'eol', eolDate: '2016-01-12' };
  if (value < 462) return { status: 'eol', eolDate: '2022-04-26' };
  return { status: 'supported' };
}

/** Fetches and caches Microsoft's releases index. */
export class DotnetReleaseIndex {
  private cache?: { at: number; data: DotnetChannelInfo[] };

  constructor(
    private readonly options: {
      fetch: typeof fetch;
      url?: string;
      ttlMs?: number;
    },
  ) {}

  async get(): Promise<DotnetChannelInfo[]> {
    const ttl = this.options.ttlMs ?? DAY;
    if (this.cache && Date.now() - this.cache.at < ttl) return this.cache.data;
    try {
      const res = await this.options.fetch(
        this.options.url ?? DOTNET_RELEASES_INDEX_URL,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        'releases-index'?: DotnetChannelInfo[];
      };
      const data = body['releases-index'] ?? [];
      this.cache = { at: Date.now(), data };
      return data;
    } catch (e) {
      // Serve stale data rather than nothing.
      if (this.cache) return this.cache.data;
      throw e;
    }
  }
}
