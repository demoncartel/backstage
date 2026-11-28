/**
 * Minimal, dependency-free MSBuild reader.
 *
 * It does not evaluate MSBuild. It reads static <PropertyGroup> values and
 * <PackageReference>/<PackageVersion> items, expands simple $(Property)
 * references and ignores everything else. That covers the vast majority of
 * SDK-style projects and is deterministic and safe (no code execution).
 */

export type MsbuildProperties = Record<string, string>;

export type MsbuildItem = {
  type: string;
  include?: string;
  update?: string;
  version?: string;
  versionOverride?: string;
};

function stripComments(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseAttributes(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const m of attrs.matchAll(re)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? '');
  }
  return out;
}

/**
 * Reads static properties. Unconditional values win over conditional ones;
 * later unconditional values override earlier ones (as MSBuild would).
 */
export function readProperties(xml: string): MsbuildProperties {
  const clean = stripComments(xml);
  const unconditional: MsbuildProperties = {};
  const conditional: MsbuildProperties = {};
  const groupRe = /<PropertyGroup\b([^>]*)>([\s\S]*?)<\/PropertyGroup>/gi;
  for (const g of clean.matchAll(groupRe)) {
    const groupConditional = /\bCondition\s*=/i.test(g[1]);
    const propRe = /<([A-Za-z_][\w.-]*)(\s[^>]*)?>([^<]*)<\/\1\s*>/g;
    for (const p of g[2].matchAll(propRe)) {
      const isConditional =
        groupConditional || /\bCondition\s*=/i.test(p[2] ?? '');
      const value = decodeEntities(p[3].trim());
      if (isConditional) {
        if (!(p[1] in conditional)) conditional[p[1]] = value;
      } else {
        unconditional[p[1]] = value;
      }
    }
  }
  return { ...conditional, ...unconditional };
}

/** Expands $(Name) references (case-insensitive), up to a few levels deep. */
export function expandProperties(
  value: string,
  props: MsbuildProperties,
): { value: string; resolved: boolean } {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) lower[k.toLowerCase()] = v;
  let current = value;
  for (let i = 0; i < 5 && current.includes('$('); i++) {
    current = current.replace(/\$\(([\w.-]+)\)/g, (whole, name: string) =>
      name.toLowerCase() in lower ? lower[name.toLowerCase()] : whole,
    );
  }
  return { value: current, resolved: !/\$\(/.test(current) };
}

/** Reads PackageReference / PackageVersion / GlobalPackageReference items. */
export function readItems(xml: string): MsbuildItem[] {
  const clean = stripComments(xml);
  const items: MsbuildItem[] = [];
  const re =
    /<(PackageReference|PackageVersion|GlobalPackageReference)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/gi;
  for (const m of clean.matchAll(re)) {
    const attrs = parseAttributes(m[2]);
    const body = m[3] ?? '';
    const child = (name: string) => {
      const c = new RegExp(`<${name}\\b[^>]*>([^<]*)</${name}\\s*>`, 'i').exec(
        body,
      );
      return c ? decodeEntities(c[1].trim()) : undefined;
    };
    items.push({
      type: m[1],
      include: attrs.include,
      update: attrs.update,
      version: attrs.version ?? child('Version'),
      versionOverride: attrs.versionoverride ?? child('VersionOverride'),
    });
  }
  return items;
}

/** Old-style projects: <TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion> → net472. */
export function legacyFrameworkToTfm(version: string): string | undefined {
  const m = /^v?(\d)\.(\d)(?:\.(\d))?$/.exec(version.trim());
  if (!m) return undefined;
  return `net${m[1]}${m[2]}${m[3] ?? ''}`;
}

/**
 * Target frameworks for a project, given its own properties merged on top of
 * any Directory.Build.props properties.
 */
export function readTargetFrameworks(props: MsbuildProperties): {
  frameworks: string[];
  unresolved: string[];
} {
  const raw =
    props.TargetFrameworks ??
    props.TargetFramework ??
    (props.TargetFrameworkVersion
      ? legacyFrameworkToTfm(props.TargetFrameworkVersion)
      : undefined);
  if (!raw) return { frameworks: [], unresolved: [] };
  const { value } = expandProperties(raw, props);
  const frameworks: string[] = [];
  const unresolved: string[] = [];
  for (const part of value
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)) {
    if (part.includes('$(')) unresolved.push(part);
    else frameworks.push(part.toLowerCase());
  }
  return { frameworks, unresolved };
}

/** True when NuGet would treat this as an exact version (e.g. 1.2.3, [1.2.3]). */
export function exactVersion(version: string): string | undefined {
  const v = version.trim();
  const pinned = /^\[\s*([^,\]\s]+)\s*\]$/.exec(v);
  if (pinned) return pinned[1];
  if (/^\d+(\.\d+){0,3}(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(v))
    return v;
  return undefined;
}

export type PackagesLock = {
  name: string;
  version: string;
  transitive: boolean;
}[];

/** packages.lock.json (NuGet lock file v1/v2). */
export function readPackagesLock(json: string): PackagesLock {
  const parsed = JSON.parse(json) as {
    dependencies?: Record<
      string,
      Record<string, { type?: string; resolved?: string }>
    >;
  };
  const out = new Map<string, PackagesLock[number]>();
  for (const deps of Object.values(parsed.dependencies ?? {})) {
    for (const [name, info] of Object.entries(deps)) {
      if (!info?.resolved) continue;
      const type = (info.type ?? '').toLowerCase();
      if (type === 'project') continue;
      const key = `${name.toLowerCase()}@${info.resolved}`;
      const transitive = type === 'transitive';
      const existing = out.get(key);
      if (!existing || (existing.transitive && !transitive)) {
        out.set(key, { name, version: info.resolved, transitive });
      }
    }
  }
  return [...out.values()];
}

/** Legacy packages.config. */
export function readPackagesConfig(
  xml: string,
): { name: string; version: string }[] {
  const out: { name: string; version: string }[] = [];
  const re = /<package\b([^>]*)\/?>/gi;
  for (const m of stripComments(xml).matchAll(re)) {
    const a = parseAttributes(m[1]);
    if (a.id && a.version) out.push({ name: a.id, version: a.version });
  }
  return out;
}
