/** Lowest Node major mentioned by an engines.node range, .nvmrc or .node-version. */
export function nodeMajorFromSpec(spec: string): string | undefined {
  const s = spec.trim().replace(/^v/i, '');
  if (!s || /^(lts|node|latest|current)/i.test(s) || s.startsWith('lts/')) {
    return undefined;
  }
  const m = /(\d+)/.exec(s);
  return m ? String(Number(m[1])) : undefined;
}

export function readEnginesNode(packageJson: string): string | undefined {
  try {
    const parsed = JSON.parse(packageJson) as { engines?: { node?: unknown } };
    const v = parsed.engines?.node;
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
}
