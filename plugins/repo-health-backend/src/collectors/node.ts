import type { NodeTarget } from '@internal/backstage-plugin-repo-health-common';
import { worstStatus } from '@internal/backstage-plugin-repo-health-common';
import {
  NodeReleaseSchedule,
  NodeSchedule,
  nodeMajorLifecycle,
} from '../lifecycle/node';
import { readBaseImages, parseNodeImage } from '../parsers/dockerfile';
import { nodeMajorFromSpec, readEnginesNode } from '../parsers/node';
import { DOCKERFILE_RE } from './dotnet';
import { RepoCollector, basename, isIgnoredPath } from './types';

/** Node.js version, from package.json engines, .nvmrc, .node-version and node images. */
export function createNodeCollector(options: {
  schedule: NodeReleaseSchedule;
  eolSoonDays: number;
}): RepoCollector {
  return {
    id: 'node',
    async collect(ctx) {
      const inScope = ctx.files.paths.filter(p => !isIgnoredPath(p));
      const raw: Omit<NodeTarget, 'status'>[] = [];
      for (const file of inScope) {
        const name = basename(file).toLowerCase();
        if (name === 'package.json') {
          const text = await ctx.files.read(file).catch(() => undefined);
          const spec = text ? readEnginesNode(text) : undefined;
          if (spec)
            raw.push({
              source: 'package.json',
              file,
              raw: spec,
              major: nodeMajorFromSpec(spec),
            });
        } else if (name === '.nvmrc' || name === '.node-version') {
          const text = (
            await ctx.files.read(file).catch(() => undefined)
          )?.trim();
          if (text) {
            raw.push({
              source: name as '.nvmrc' | '.node-version',
              file,
              raw: text,
              major: nodeMajorFromSpec(text),
            });
          }
        } else if (DOCKERFILE_RE.test(basename(file))) {
          const text = await ctx.files.read(file).catch(() => undefined);
          for (const { image } of text ? readBaseImages(text) : []) {
            const major = parseNodeImage(image);
            if (major)
              raw.push({ source: 'dockerfile', file, raw: image, major });
          }
        }
      }
      if (!raw.length) return;
      let schedule: NodeSchedule | undefined;
      try {
        schedule = await options.schedule.get();
      } catch (e) {
        ctx.warn(`Could not load Node.js release schedule: ${e}`);
      }
      const targets: NodeTarget[] = raw.map(t => ({
        ...t,
        ...nodeMajorLifecycle(schedule, t.major, ctx.now, options.eolSoonDays),
      }));
      ctx.report.node = {
        targets,
        status: worstStatus(targets.map(t => t.status)) ?? 'unknown',
        versions: [
          ...new Set(targets.map(t => (t.major ? `node${t.major}` : t.raw))),
        ],
      };
    },
  };
}
