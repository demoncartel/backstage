import { mockServices } from '@backstage/backend-test-utils';
import type { RepoHealthReport } from '@internal/backstage-plugin-repo-health-common';
import { NugetClient } from '../advisories/nuget';
import { OsvClient } from '../advisories/osv';
import { DotnetReleaseIndex } from '../lifecycle/dotnet';
import { createDotnetCollector } from './dotnet';
import {
  createNugetCollector,
  mergePackages,
  resolveProjectPackages,
} from './nuget';
import type { RepoCollector, RepoFiles } from './types';

function memoryRepo(files: Record<string, string>): RepoFiles {
  return {
    paths: Object.keys(files),
    truncated: false,
    read: async p => files[p],
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A fake fetch serving canned .NET metadata, OSV and nuget.org answers. */
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.includes('releases-index.json')) {
    return json({
      'releases-index': [
        {
          'channel-version': '10.0',
          'support-phase': 'active',
          'eol-date': '2028-11-14',
          'release-type': 'lts',
        },
        {
          'channel-version': '6.0',
          'support-phase': 'eol',
          'eol-date': '2024-11-12',
          'release-type': 'lts',
          'latest-sdk': '6.0.428',
          'latest-runtime': '6.0.36',
        },
      ],
    });
  }
  if (url.endsWith('/v1/querybatch')) {
    const { queries } = JSON.parse(String(init?.body));
    return json({
      results: queries.map((q: any) => {
        if (q.package.name === 'Newtonsoft.Json' && q.version === '12.0.1') {
          return { vulns: [{ id: 'GHSA-5crp-9r3c-p9vr' }] };
        }
        if (q.package.name === 'System.Text.Encodings.Web') {
          return { vulns: [{ id: 'GHSA-ghhp-997w-qr28' }] };
        }
        return {};
      }),
    });
  }
  if (url.includes('/v1/vulns/GHSA-5crp-9r3c-p9vr')) {
    return json({
      id: 'GHSA-5crp-9r3c-p9vr',
      summary: 'Improper Handling of Exceptional Conditions in Newtonsoft.Json',
      aliases: ['CVE-2024-21907'],
      database_specific: { severity: 'HIGH' },
      affected: [
        {
          package: { name: 'Newtonsoft.Json', ecosystem: 'NuGet' },
          ranges: [{ events: [{ introduced: '0' }, { fixed: '13.0.1' }] }],
        },
      ],
    });
  }
  if (url.includes('/v1/vulns/GHSA-ghhp-997w-qr28')) {
    return json({
      id: 'GHSA-ghhp-997w-qr28',
      aliases: ['CVE-2021-26701'],
      database_specific: { severity: 'CRITICAL' },
    });
  }
  if (url.includes('api.nuget.org')) {
    if (url.includes('/newtonsoft.json/'))
      return json({ versions: ['12.0.1', '13.0.4', '14.0.0-beta1'] });
    if (url.includes('/system.text.encodings.web/'))
      return json({ versions: ['4.5.0', '11.0.0'] });
    return json({}, 404);
  }
  return json({}, 404);
};

async function run(collectors: RepoCollector[], files: Record<string, string>) {
  const report: RepoHealthReport = {
    entityRef: 'component:default/x',
    repo: 'o/r',
    path: '',
    ref: 'main',
    scannedAt: '',
    durationMs: 0,
    warnings: [],
  };
  for (const c of collectors) {
    await c.collect({
      entity: { apiVersion: 'v1', kind: 'Component', metadata: { name: 'x' } },
      files: memoryRepo(files),
      report,
      logger: mockServices.logger.mock(),
      now: new Date('2026-11-28T00:00:00Z'),
      warn: m => report.warnings.push(m),
    });
  }
  return report;
}

const collectors = () => [
  createDotnetCollector({
    releases: new DotnetReleaseIndex({ fetch: fakeFetch }),
    eolSoonDays: 180,
  }),
  createNugetCollector({
    osv: new OsvClient({ fetch: fakeFetch }),
    nuget: new NugetClient({ fetch: fakeFetch }),
  }),
];

describe('collectors', () => {
  it('flags a bad-app-sample style repo: net6.0 EOL, old SDK, vulnerable packages', async () => {
    const report = await run(collectors(), {
      'global.json':
        '{ "sdk": { "version": "6.0.100", "rollForward": "latestFeature" } }',
      'src/Api/Api.csproj': `<Project Sdk="Microsoft.NET.Sdk.Web">
        <PropertyGroup><TargetFramework>net6.0</TargetFramework></PropertyGroup>
        <ItemGroup>
          <PackageReference Include="Newtonsoft.Json" Version="12.0.1" />
          <PackageReference Include="System.Text.Encodings.Web" Version="4.5.0" />
          <PackageReference Include="Floating" Version="1.*" />
        </ItemGroup></Project>`,
      'src/Api/node_modules/x/x.csproj': '<Project/>',
    });
    expect(report.dotnet).toMatchObject({
      status: 'eol',
      versions: ['net6.0', 'SDK 6.0.100'],
      projectFiles: ['src/Api/Api.csproj'],
      hasLockFile: false,
    });
    expect(
      report.dotnet!.targets.find(t => t.source === 'global.json'),
    ).toMatchObject({
      kind: 'sdk',
      latestInChannel: '6.0.428',
    });
    expect(report.packages!.counts).toEqual({
      critical: 1,
      high: 1,
      moderate: 0,
      low: 0,
    });
    expect(report.packages!.vulnerabilities[0]).toMatchObject({
      id: 'GHSA-ghhp-997w-qr28',
      severity: 'critical',
      url: 'https://github.com/advisories/GHSA-ghhp-997w-qr28',
    });
    expect(report.packages!.vulnerabilities[1]).toMatchObject({
      fixedIn: '13.0.1',
      aliases: ['CVE-2024-21907'],
    });
    expect(report.packages!.unchecked).toBe(1);
    expect(report.packages!.outdatedMajor).toBe(1); // Encodings.Web 4 → 11
    expect(
      report.packages!.packages.find(p => p.name === 'Newtonsoft.Json'),
    ).toMatchObject({
      latestStable: '13.0.4',
      majorsBehind: 1,
    });
    expect(report.warnings).toContain(
      'No packages.lock.json: only direct package references were checked; transitive packages are not.',
    );
  });

  it('reports nothing for a repo without .NET', async () => {
    const report = await run(collectors(), {
      'README.md': '# hi',
      'package.json': '{}',
    });
    expect(report.dotnet).toBeUndefined();
    expect(report.packages).toBeUndefined();
  });

  it('reads Dockerfile images and Directory.Build.props', async () => {
    const report = await run(collectors(), {
      'Directory.Build.props':
        '<Project><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>',
      'src/A/A.csproj': '<Project Sdk="Microsoft.NET.Sdk"></Project>',
      'src/A/Dockerfile': 'FROM mcr.microsoft.com/dotnet/aspnet:6.0\n',
    });
    expect(report.dotnet!.versions).toEqual(['net10.0', 'aspnet:6.0']);
    expect(report.dotnet!.status).toBe('eol');
  });
});

describe('central package management', () => {
  const central = `<Project>
    <PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup>
    <ItemGroup>
      <PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />
      <PackageVersion Include="Serilog" Version="$(SerilogVersion)" />
      <GlobalPackageReference Include="Nerdbank.GitVersioning" Version="3.6.133" />
    </ItemGroup></Project>`;
  it('takes versions from Directory.Packages.props and honours VersionOverride', () => {
    const refs = resolveProjectPackages({
      projectFile: 'src/A/A.csproj',
      projectXml: `<Project><ItemGroup>
        <PackageReference Include="Newtonsoft.Json" />
        <PackageReference Include="Serilog" />
        <PackageReference Include="Polly" VersionOverride="8.4.0" />
      </ItemGroup></Project>`,
      buildProps: { SerilogVersion: '4.0.0' },
      centralFile: 'Directory.Packages.props',
      centralXml: central,
    });
    expect(refs).toEqual([
      {
        name: 'Nerdbank.GitVersioning',
        version: '3.6.133',
        source: 'Directory.Packages.props',
        file: 'Directory.Packages.props',
      },
      {
        name: 'Newtonsoft.Json',
        version: '13.0.3',
        source: 'Directory.Packages.props',
        file: 'Directory.Packages.props',
      },
      {
        name: 'Serilog',
        version: '4.0.0',
        source: 'Directory.Packages.props',
        file: 'Directory.Packages.props',
      },
      {
        name: 'Polly',
        version: '8.4.0',
        source: 'PackageReference',
        file: 'src/A/A.csproj',
      },
    ]);
  });

  it('ignores Directory.Packages.props when CPM is not enabled', () => {
    const refs = resolveProjectPackages({
      projectFile: 'A.csproj',
      projectXml:
        '<Project><ItemGroup><PackageReference Include="Serilog" Version="3.0.0" /></ItemGroup></Project>',
      centralFile: 'Directory.Packages.props',
      centralXml:
        '<Project><ItemGroup><PackageVersion Include="Serilog" Version="9.9.9" /></ItemGroup></Project>',
    });
    expect(refs).toEqual([
      {
        name: 'Serilog',
        version: '3.0.0',
        source: 'PackageReference',
        file: 'A.csproj',
      },
    ]);
  });

  it('merges duplicate usages across projects', () => {
    const merged = mergePackages([
      {
        name: 'Serilog',
        version: '3.0.0',
        source: 'PackageReference',
        file: 'A.csproj',
      },
      {
        name: 'serilog',
        version: '3.0.0',
        source: 'PackageReference',
        file: 'B.csproj',
      },
      { name: 'X', source: 'PackageReference', file: 'B.csproj' },
    ]);
    expect(merged).toEqual([
      expect.objectContaining({
        name: 'Serilog',
        files: ['A.csproj', 'B.csproj'],
        exact: true,
      }),
      expect.objectContaining({
        name: 'X',
        version: '(no version)',
        exact: false,
      }),
    ]);
  });
});
