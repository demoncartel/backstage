/** Reads `sdk.version` from global.json (tolerates // and /* *\/ comments). */
export function readGlobalJsonSdk(text: string): string | undefined {
  const withoutComments = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"\\])\/\/.*$/gm, '$1');
  try {
    const parsed = JSON.parse(withoutComments) as {
      sdk?: { version?: unknown };
    };
    const v = parsed.sdk?.version;
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}
