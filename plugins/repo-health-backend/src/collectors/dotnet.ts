import type {
  DotnetTarget,
  SupportStatus,
} from '@internal/backstage-plugin-repo-health-common';
import { worstStatus } from '@internal/backstage-plugin-repo-health-common';
import {
  DotnetChannelInfo,
  DotnetReleaseIndex,
  dotnetChannelLifecycle,
  dotnetFrameworkLifecycle,
} from '../lifecycle/dotnet';
import { readBaseImages, parseDotnetImage } from '../parsers/dockerfile';
import { readGlobalJsonSdk } from '../parsers/globalJson';
import { readProperties, readTargetFrameworks } from '../parsers/msbuild';
import { channelOf, normaliseTfm } from '../parsers/tfm';
import {
  RepoCollector,
  RepoCollectorContext,
  basename,
  dirname,
  isIgnoredPath,
  nearestAbove,
} from './types';

export const PROJECT_FILE_RE = /\.(cs|fs|vb)proj$/i;
export const DOCKERFILE_RE =
  /^(Dockerfile(\..+)?|.+\.Dockerfile|Containerfile)$/i;

/** Pure: attaches lifecycle info to a target. */
export function withLifecycle(
  target: Omit<DotnetTarget, 'status'>,
  index: DotnetChannelInfo[] | undefined,
  now: Date,
  eolSoonDays: number,
): DotnetTarget {
  if (target.product === '.NET Standard') return { ...target, status: 'n/a' };
  const lc =
    target.product === '.NET Framework'
      ? dotnetFrameworkLifecycle(target.channel, now, eolSoonDays)
      : dotnetChannelLifecycle(index, target.channel, now, eolSoonDays);
  return {
    ...target,
    status: lc.status,
    eolDate: lc.eolDate,
    releaseType: lc.releaseType,
    latestInChannel: target.kind === 'sdk' ? lc.latestSdk : lc.latestRuntime,
  };
}

/** Display label, e.g. net6.0, netcoreapp3.1, SDK 6.0.100, image aspnet:8.0. */
function label(t: DotnetTarget): string {
  if (t.source === 'global.json') return `SDK ${t.raw}`;
  if (t.source === 'dockerfile') {
    const img = parseDotnetImage(t.raw);
    return img
      ? `${img.repository.replace(/^dotnet\//, '')}:${img.tag}`
      : t.raw;
  }
  return t.raw;
}

export function createDotnetCollector(options: {
  releases: DotnetReleaseIndex;
  eolSoonDays: number;
}): RepoCollector {
  return {
    id: 'dotnet',
    async collect(ctx: RepoCollectorContext) {
      const { files } = ctx;
      const all = new Set(files.paths);
      const inScope = files.paths.filter(p => !isIgnoredPath(p));
      const projects = inScope.filter(p => PROJECT_FILE_RE.test(p));
      const globalJsons = inScope.filter(
        p => basename(p).toLowerCase() === 'global.json',
      );
      const dockerfiles = inScope.filter(p => DOCKERFILE_RE.test(basename(p)));

      const raw: Omit<DotnetTarget, 'status'>[] = [];

      for (const project of projects) {
        const text = await files.read(project).catch(e => {
          ctx.warn(`Could not read ${project}: ${e}`);
          return undefined;
        });
        if (!text) continue;
        let props = readProperties(text);
        const buildProps = nearestAbove(
          all,
          dirname(project),
          'Directory.Build.props',
        );
        if (buildProps) {
          const shared = await files.read(buildProps).catch(() => undefined);
          if (shared) props = { ...readProperties(shared), ...props };
        }
        const { frameworks, unresolved } = readTargetFrameworks(props);
        for (const u of unresolved) {
          ctx.warn(`${project}: could not resolve target framework "${u}"`);
        }
        for (const tfm of frameworks) {
          const n = normaliseTfm(tfm);
          if (!n) {
            ctx.warn(`${project}: unrecognised target framework "${tfm}"`);
            continue;
          }
          raw.push({
            source: 'csproj',
            file: project,
            raw: tfm,
            product: n.product,
            channel: n.channel,
            kind: 'runtime',
          });
        }
      }

      for (const file of globalJsons) {
        const text = await files.read(file).catch(() => undefined);
        const sdk = text ? readGlobalJsonSdk(text) : undefined;
        if (!sdk) continue;
        const ch = channelOf(sdk);
        raw.push({
          source: 'global.json',
          file,
          raw: sdk,
          product: ch && Number(ch.split('.')[0]) < 5 ? '.NET Core' : '.NET',
          channel: ch,
          kind: 'sdk',
        });
      }

      for (const file of dockerfiles) {
        const text = await files.read(file).catch(() => undefined);
        if (!text) continue;
        for (const { image } of readBaseImages(text)) {
          const img = parseDotnetImage(image);
          if (!img) continue;
          const major = img.channel ? Number(img.channel.split('.')[0]) : NaN;
          raw.push({
            source: 'dockerfile',
            file,
            raw: image,
            product: img.legacyCore || major < 5 ? '.NET Core' : '.NET',
            channel: img.channel,
            kind: img.kind,
          });
          if (!img.channel) {
            ctx.warn(`${file}: .NET image "${image}" has no version tag`);
          }
        }
      }

      if (raw.length === 0 && projects.length === 0) return;

      let index: DotnetChannelInfo[] | undefined;
      try {
        index = await options.releases.get();
      } catch (e) {
        ctx.warn(`Could not load .NET release metadata: ${e}`);
      }
      const targets = raw.map(t =>
        withLifecycle(t, index, ctx.now, options.eolSoonDays),
      );
      const statuses: SupportStatus[] = targets.map(t => t.status);
      ctx.report.dotnet = {
        targets,
        status: worstStatus(statuses) ?? 'unknown',
        versions: [...new Set(targets.map(label))],
        projectFiles: projects,
        centralPackageManagement: inScope.some(
          p => basename(p).toLowerCase() === 'directory.packages.props',
        ),
        hasLockFile: inScope.some(
          p => basename(p).toLowerCase() === 'packages.lock.json',
        ),
      };
    },
  };
}
