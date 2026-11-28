export type DockerBaseImage = {
  /** Image reference after ARG substitution, e.g. mcr.microsoft.com/dotnet/aspnet:8.0-alpine */
  image: string;
  line: number;
};

/** Every FROM image in a Dockerfile, with simple global ARG defaults substituted. */
export function readBaseImages(text: string): DockerBaseImage[] {
  const args: Record<string, string> = {};
  const stageNames = new Set<string>();
  const out: DockerBaseImage[] = [];
  // Join line continuations.
  const lines = text.replace(/\\\r?\n/g, ' ').split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const arg = /^ARG\s+([A-Za-z_][\w]*)(?:=(.*))?$/i.exec(line);
    if (arg) {
      if (arg[2] !== undefined && !(arg[1] in args)) {
        args[arg[1]] = arg[2].trim().replace(/^["']|["']$/g, '');
      }
      return;
    }
    const from = /^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(
      line,
    );
    if (!from) return;
    const image = from[1].replace(
      /\$\{?([A-Za-z_]\w*)(?::-([^}]*))?\}?/g,
      (whole, name: string, fallback?: string) =>
        args[name] ?? fallback ?? whole,
    );
    // FROM <earlier stage> is not a base image.
    if (!stageNames.has(image.toLowerCase())) {
      out.push({ image, line: index + 1 });
    }
    if (from[2]) stageNames.add(from[2].toLowerCase());
  });
  return out;
}

export type DotnetImage = {
  repository: string;
  tag: string;
  channel?: string;
  kind: 'sdk' | 'runtime';
  legacyCore: boolean;
};

/** Parses Microsoft's .NET images (mcr.microsoft.com/dotnet/...). */
export function parseDotnetImage(image: string): DotnetImage | undefined {
  const m =
    /^(?:mcr\.microsoft\.com\/)?dotnet\/(core\/|nightly\/)?(sdk|aspnet|runtime-deps|runtime|monitor|samples)(?=[:@\s]|$)(?::([^@\s]+))?/i.exec(
      image,
    );
  if (!m || m[2].toLowerCase() === 'samples') return undefined;
  const tag = m[3] ?? 'latest';
  const ch = /^(\d+)\.(\d+)/.exec(tag);
  return {
    repository: `dotnet/${m[1] ?? ''}${m[2].toLowerCase()}`,
    tag,
    channel: ch ? `${ch[1]}.${ch[2]}` : undefined,
    kind: m[2].toLowerCase() === 'sdk' ? 'sdk' : 'runtime',
    legacyCore: Boolean(m[1] && m[1].toLowerCase() === 'core/'),
  };
}

/** Parses official node images (node:20-alpine, docker.io/library/node:18). */
export function parseNodeImage(image: string): string | undefined {
  const m = /^(?:docker\.io\/)?(?:library\/)?node:(\d+)/i.exec(image);
  return m ? m[1] : undefined;
}
