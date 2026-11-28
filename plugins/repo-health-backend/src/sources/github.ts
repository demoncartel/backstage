import {
  DefaultGithubCredentialsProvider,
  GithubIntegration,
  ScmIntegrations,
} from '@backstage/integration';
import type { Entity } from '@backstage/catalog-model';
import type { RepoFiles } from '../collectors/types';

export const PROJECT_SLUG_ANNOTATION = 'github.com/project-slug';
export const SOURCE_LOCATION_ANNOTATION = 'backstage.io/source-location';
export const MANAGED_BY_LOCATION_ANNOTATION =
  'backstage.io/managed-by-location';

export type RepoLocation = {
  host: string;
  owner: string;
  repo: string;
  /** Branch/ref from the annotation, if it named one. */
  ref?: string;
  /** Sub-directory the component lives in ('' = whole repo). */
  path: string;
};

function stripPrefix(location: string): string {
  return location.replace(/^(url|github):/, '');
}

/** Parses https://host/owner/repo[/tree|blob/ref/path]. */
export function parseRepoUrl(
  url: string,
  { pathIsFile }: { pathIsFile: boolean },
): RepoLocation | undefined {
  let u: URL;
  try {
    u = new URL(stripPrefix(url));
  } catch {
    return undefined;
  }
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return undefined;
  const [owner, rawRepo, kind, ref, ...rest] = parts;
  const repo = rawRepo.replace(/\.git$/, '');
  let path = '';
  if ((kind === 'tree' || kind === 'blob') && rest.length) {
    const segs = pathIsFile || kind === 'blob' ? rest.slice(0, -1) : rest;
    path = segs.join('/');
  }
  return {
    host: u.host,
    owner,
    repo,
    ref: kind === 'tree' || kind === 'blob' ? ref : undefined,
    path,
  };
}

/**
 * Works out which GitHub repo (and sub-directory) a catalog entity lives in.
 * Order: github.com/project-slug, backstage.io/source-location,
 * backstage.io/managed-by-location.
 */
export function repoLocationForEntity(
  entity: Entity,
  defaultHost = 'github.com',
): RepoLocation | undefined {
  const a = entity.metadata.annotations ?? {};
  const source = a[SOURCE_LOCATION_ANNOTATION]
    ? parseRepoUrl(a[SOURCE_LOCATION_ANNOTATION], { pathIsFile: false })
    : undefined;
  const slug = a[PROJECT_SLUG_ANNOTATION];
  if (slug && /^[^/\s]+\/[^/\s]+$/.test(slug)) {
    const [owner, repo] = slug.split('/');
    const sameRepo =
      source &&
      source.owner.toLowerCase() === owner.toLowerCase() &&
      source.repo.toLowerCase() === repo.toLowerCase();
    return {
      host: sameRepo ? source.host : defaultHost,
      owner,
      repo,
      ref: sameRepo ? source.ref : undefined,
      path: sameRepo ? source.path : '',
    };
  }
  if (source) return source;
  const managed = a[MANAGED_BY_LOCATION_ANNOTATION];
  if (managed && /^url:/.test(managed)) {
    return parseRepoUrl(managed, { pathIsFile: true });
  }
  return undefined;
}

type TreeEntry = { path: string; type: string; size?: number };

/**
 * Read-only access to one repo through the GitHub REST API, using the
 * credentials from `integrations.github` (token or GitHub App).
 */
export class GithubRepoReader {
  private readonly credentials: DefaultGithubCredentialsProvider;

  constructor(
    private readonly integrations: ScmIntegrations,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.credentials =
      DefaultGithubCredentialsProvider.fromIntegrations(integrations);
  }

  hasIntegration(host: string): boolean {
    return Boolean(this.integrations.github.byHost(host));
  }

  async open(
    loc: RepoLocation,
    options: { maxFiles: number },
  ): Promise<RepoFiles & { ref: string }> {
    const integration = this.integrations.github.byHost(loc.host) as
      | GithubIntegration
      | undefined;
    if (!integration) {
      throw new Error(`No GitHub integration configured for ${loc.host}`);
    }
    const api = integration.config.apiBaseUrl ?? 'https://api.github.com';
    const repoUrl = `https://${loc.host}/${loc.owner}/${loc.repo}`;
    const { headers } = await this.credentials.getCredentials({ url: repoUrl });
    const baseHeaders = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'backstage-repo-health',
      ...headers,
    };
    const get = async (path: string, accept?: string) => {
      const res = await this.fetchFn(`${api}${path}`, {
        headers: accept ? { ...baseHeaders, Accept: accept } : baseHeaders,
      });
      return res;
    };
    const repoPath = `/repos/${encodeURIComponent(
      loc.owner,
    )}/${encodeURIComponent(loc.repo)}`;

    let ref = loc.ref;
    if (!ref) {
      const res = await get(repoPath);
      if (!res.ok) {
        throw new Error(`GitHub ${repoPath}: HTTP ${res.status}`);
      }
      ref = ((await res.json()) as { default_branch: string }).default_branch;
    }
    const treeRes = await get(
      `${repoPath}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    );
    if (treeRes.status === 409) {
      // Empty repository.
      return { ref, paths: [], truncated: false, read: async () => undefined };
    }
    if (!treeRes.ok) {
      throw new Error(
        `GitHub tree ${loc.owner}/${loc.repo}@${ref}: HTTP ${treeRes.status}`,
      );
    }
    const tree = (await treeRes.json()) as {
      tree: TreeEntry[];
      truncated?: boolean;
    };
    const prefix = loc.path ? `${loc.path.replace(/\/$/, '')}/` : '';
    const paths = tree.tree
      .filter(e => e.type === 'blob' && e.path.startsWith(prefix))
      .map(e => e.path);
    let reads = 0;
    const cache = new Map<string, Promise<string | undefined>>();
    const resolvedRef = ref;
    const read = (path: string) => {
      if (!cache.has(path)) {
        if (reads >= options.maxFiles) {
          return Promise.reject(
            new Error(`File read limit (${options.maxFiles}) reached`),
          );
        }
        reads++;
        cache.set(
          path,
          (async () => {
            const res = await get(
              `${repoPath}/contents/${path
                .split('/')
                .map(encodeURIComponent)
                .join('/')}?ref=${encodeURIComponent(resolvedRef)}`,
              'application/vnd.github.raw',
            );
            if (res.status === 404) return undefined;
            if (!res.ok)
              throw new Error(`GitHub read ${path}: HTTP ${res.status}`);
            return res.text();
          })(),
        );
      }
      return cache.get(path)!;
    };
    return { ref, paths, truncated: Boolean(tree.truncated), read };
  }
}
