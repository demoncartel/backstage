import type { SupportStatus } from '@internal/backstage-plugin-repo-health-common';

export const NODE_SCHEDULE_URL =
  'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json';

export type NodeSchedule = Record<
  string,
  { start?: string; lts?: string; maintenance?: string; end?: string }
>;

const DAY = 24 * 60 * 60 * 1000;

/** Pure: support status of a Node.js major from the official schedule. */
export function nodeMajorLifecycle(
  schedule: NodeSchedule | undefined,
  major: string | undefined,
  now: Date,
  eolSoonDays: number,
): { status: SupportStatus; eolDate?: string } {
  if (!major || !schedule) return { status: 'unknown' };
  const info = schedule[`v${major}`];
  if (!info?.end) return { status: 'unknown' };
  const end = Date.parse(info.end);
  const start = info.start ? Date.parse(info.start) : NaN;
  if (end <= now.getTime()) return { status: 'eol', eolDate: info.end };
  if (!isNaN(start) && start > now.getTime()) {
    return { status: 'preview', eolDate: info.end };
  }
  if (end - now.getTime() <= eolSoonDays * DAY) {
    return { status: 'eol-soon', eolDate: info.end };
  }
  return { status: 'supported', eolDate: info.end };
}

export class NodeReleaseSchedule {
  private cache?: { at: number; data: NodeSchedule };

  constructor(
    private readonly options: {
      fetch: typeof fetch;
      url?: string;
      ttlMs?: number;
    },
  ) {}

  async get(): Promise<NodeSchedule> {
    const ttl = this.options.ttlMs ?? DAY;
    if (this.cache && Date.now() - this.cache.at < ttl) return this.cache.data;
    try {
      const res = await this.options.fetch(
        this.options.url ?? NODE_SCHEDULE_URL,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as NodeSchedule;
      this.cache = { at: Date.now(), data };
      return data;
    } catch (e) {
      if (this.cache) return this.cache.data;
      throw e;
    }
  }
}
