import type { DotnetTarget } from '@internal/backstage-plugin-repo-health-common';

export type NormalisedTfm = Pick<DotnetTarget, 'product' | 'channel'> & {
  /** True for netstandard, which is an API contract rather than a runtime. */
  contractOnly: boolean;
};

/**
 * Normalises a target framework moniker.
 *
 * net6.0, net8.0-windows10.0.19041 → .NET 6.0 / 8.0
 * netcoreapp3.1                    → .NET Core 3.1
 * netstandard2.0                   → .NET Standard 2.0 (n/a)
 * net48, net472, net4.6.2          → .NET Framework 4.8 / 4.7.2 / 4.6.2
 */
export function normaliseTfm(tfm: string): NormalisedTfm | undefined {
  const t = tfm.trim().toLowerCase();
  let m = /^net(\d+)\.(\d+)(?:-.+)?$/.exec(t);
  if (m && Number(m[1]) >= 5) {
    return { product: '.NET', channel: `${m[1]}.${m[2]}`, contractOnly: false };
  }
  if (m && Number(m[1]) === 4) {
    // net4.6.2 style is unusual but seen in the wild
    return {
      product: '.NET Framework',
      channel: `${m[1]}.${m[2]}`,
      contractOnly: false,
    };
  }
  m = /^netcoreapp(\d+)\.(\d+)$/.exec(t);
  if (m) {
    return {
      product: '.NET Core',
      channel: `${m[1]}.${m[2]}`,
      contractOnly: false,
    };
  }
  m = /^netstandard(\d+)\.(\d+)$/.exec(t);
  if (m) {
    return {
      product: '.NET Standard',
      channel: `${m[1]}.${m[2]}`,
      contractOnly: true,
    };
  }
  m = /^net(\d)(\d)(\d)?$/.exec(t);
  if (m) {
    return {
      product: '.NET Framework',
      channel: m[3] ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}`,
      contractOnly: false,
    };
  }
  m = /^net4\.(\d+)\.(\d+)$/.exec(t);
  if (m) {
    return {
      product: '.NET Framework',
      channel: `4.${m[1]}.${m[2]}`,
      contractOnly: false,
    };
  }
  return undefined;
}

/** "6.0.100" → "6.0" */
export function channelOf(version: string): string | undefined {
  const m = /^(\d+)\.(\d+)/.exec(version.trim());
  return m ? `${m[1]}.${m[2]}` : undefined;
}
