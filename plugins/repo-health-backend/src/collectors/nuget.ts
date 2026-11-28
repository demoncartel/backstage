import type {
  PackageSource,
  PackageUsage,
  VulnerabilityFinding,
} from '@internal/backstage-plugin-repo-health-common';
import { NugetClient, majorOf } from '../advisories/nuget';
import { OsvClient } from '../advisories/osv';
import {
  MsbuildProperties,
  exactVersion,
  expandProperties,
  readItems,
  readPackagesConfig,
  readPackagesLock,
  readProperties,
} from '../parsers/msbuild';
import { PROJECT_FILE_RE } from './dotnet';
import {
  RepoCollector,
  basename,
  dirname,
  isIgnoredPath,
  nearestAbove,
} from './types';

export type RawPackageRef = {
  name: string;
  version?: string;
  source: PackageSource;
  file: string;
  transitive?: boolean;
};

/**
 * Pure: resolves the package references of one project, applying central
 * package management (Directory.Packages.props) when it is enabled.
 */
export function resolveProjectPackages(input: {
  projectFile: string;
  projectXml: string;
  buildProps?: MsbuildProperties;
  centralFile?: string;
  centralXml?: string;
}): RawPackageRef[] {
  const projectProps = {
    ...(input.buildProps ?? {}),
    ...readProperties(input.projectXml),
  };
  const centralProps = input.centralXml ? readProperties(input.centralXml) : {};
  const props = { ...centralProps, ...projectProps };
  const cpmFlag =
    props.ManagePackageVersionsCentrally ??
    centralProps.ManagePackageVersionsCentrally;
  const cpm = Boolean(input.centralXml) && cpmFlag?.toLowerCase() === 'true';

  const central = new Map<string, string>();
  const out: RawPackageRef[] = [];
  if (cpm && input.centralXml) {
    for (const item of readItems(input.centralXml)) {
      const name = item.include ?? item.update;
      if (!name) continue;
      if (item.type === 'PackageVersion' && item.version) {
        central.set(
          name.toLowerCase(),
          expandProperties(item.version, props).value,
        );
      }
      if (item.type === 'GlobalPackageReference') {
        out.push({
          name,
          version: item.version
            ? expandProperties(item.version, props).value
            : undefined,
          source: 'Directory.Packages.props',
          file: input.centralFile!,
        });
      }
    }
  }
  for (const item of readItems(input.projectXml)) {
    if (item.type !== 'PackageReference' || !item.include) continue;
    const own = item.versionOverride ?? item.version;
    let version: string | undefined;
    if (own) version = expandProperties(own, props).value;
    else if (cpm) version = central.get(item.include.toLowerCase());
    out.push({
      name: item.include,
      version,
      source: !own && cpm ? 'Directory.Packages.props' : 'PackageReference',
      file: !own && cpm ? input.centralFile! : input.projectFile,
    });
  }
  return out;
}

/** Pure: merges raw references into unique package@version usages. */
export function mergePackages(refs: RawPackageRef[]): PackageUsage[] {
  const map = new Map<string, PackageUsage>();
  for (const r of refs) {
    const raw = r.version ?? '(no version)';
    const exact = r.version ? exactVersion(r.version) : undefined;
    const version = exact ?? raw;
    const key = `${r.name.toLowerCase()}@${version.toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.files.includes(r.file)) existing.files.push(r.file);
      if (!r.transitive) existing.transitive = false;
      continue;
    }
    map.set(key, {
      name: r.name,
      version,
      exact: Boolean(exact),
      transitive: Boolean(r.transitive),
      source: r.source,
      files: [r.file],
    });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const SEVERITY_ORDER = ['critical', 'high', 'moderate', 'low', 'unknown'];

export function createNugetCollector(options: {
  osv: OsvClient;
  nuget?: NugetClient;
}): RepoCollector {
  return {
    id: 'nuget',
    async collect(ctx) {
      const { files } = ctx;
      const all = new Set(files.paths);
      const inScope = files.paths.filter(p => !isIgnoredPath(p));
      const projects = inScope.filter(p => PROJECT_FILE_RE.test(p));
      const locks = inScope.filter(
        p => basename(p).toLowerCase() === 'packages.lock.json',
      );
      const configs = inScope.filter(
        p => basename(p).toLowerCase() === 'packages.config',
      );
      if (!projects.length && !locks.length && !configs.length) return;

      const refs: RawPackageRef[] = [];
      for (const project of projects) {
        const projectXml = await files.read(project).catch(() => undefined);
        if (!projectXml) continue;
        const dir = dirname(project);
        const buildPropsFile = nearestAbove(all, dir, 'Directory.Build.props');
        const centralFile = nearestAbove(all, dir, 'Directory.Packages.props');
        const buildXml = buildPropsFile
          ? await files.read(buildPropsFile).catch(() => undefined)
          : undefined;
        const centralXml = centralFile
          ? await files.read(centralFile).catch(() => undefined)
          : undefined;
        refs.push(
          ...resolveProjectPackages({
            projectFile: project,
            projectXml,
            buildProps: buildXml ? readProperties(buildXml) : undefined,
            centralFile,
            centralXml,
          }),
        );
      }
      for (const file of locks) {
        const text = await files.read(file).catch(() => undefined);
        if (!text) continue;
        try {
          for (const p of readPackagesLock(text)) {
            refs.push({
              name: p.name,
              version: p.version,
              source: 'packages.lock.json',
              file,
              transitive: p.transitive,
            });
          }
        } catch (e) {
          ctx.warn(`${file}: could not parse lock file (${e})`);
        }
      }
      for (const file of configs) {
        const text = await files.read(file).catch(() => undefined);
        if (!text) continue;
        for (const p of readPackagesConfig(text)) {
          refs.push({
            name: p.name,
            version: p.version,
            source: 'packages.config',
            file,
          });
        }
      }

      const packages = mergePackages(refs);
      const exact = packages.filter(p => p.exact);

      let vulnerabilities: VulnerabilityFinding[] = [];
      try {
        vulnerabilities = await options.osv.findVulnerabilities(
          exact.map(p => ({
            name: p.name,
            version: p.version,
            transitive: p.transitive,
          })),
        );
      } catch (e) {
        ctx.warn(`Vulnerability lookup (OSV.dev) failed: ${e}`);
      }
      vulnerabilities.sort(
        (a, b) =>
          SEVERITY_ORDER.indexOf(a.severity) -
            SEVERITY_ORDER.indexOf(b.severity) ||
          a.package.localeCompare(b.package),
      );

      if (options.nuget) {
        const direct = exact.filter(p => !p.transitive);
        const names = [...new Set(direct.map(p => p.name))];
        const latest = new Map<string, string | undefined>();
        const nuget = options.nuget;
        const lookup = async (n: string) => {
          try {
            latest.set(n, await nuget.latestStable(n));
            return true;
          } catch {
            return false;
          }
        };
        let failed = 0;
        for (let i = 0; i < names.length; i += 4) {
          const ok = await Promise.all(names.slice(i, i + 4).map(lookup));
          failed += ok.filter(x => !x).length;
        }
        if (failed)
          ctx.warn(
            `nuget.org latest-version lookup failed for ${failed} package(s)`,
          );
        for (const p of direct) {
          const l = latest.get(p.name);
          if (!l) continue;
          p.latestStable = l;
          const a = majorOf(p.version);
          const b = majorOf(l);
          if (a !== undefined && b !== undefined)
            p.majorsBehind = Math.max(0, b - a);
        }
      }

      const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
      for (const v of vulnerabilities) {
        if (v.severity === 'unknown') counts.moderate++;
        else counts[v.severity]++;
      }
      ctx.report.packages = {
        ecosystem: 'NuGet',
        packages,
        vulnerabilities,
        counts,
        outdatedMajor: packages.filter(p => (p.majorsBehind ?? 0) >= 2).length,
        unchecked: packages.length - exact.length,
      };
      if (!locks.length) {
        ctx.warn(
          'No packages.lock.json: only direct package references were checked; transitive packages are not.',
        );
      }
    },
  };
}
