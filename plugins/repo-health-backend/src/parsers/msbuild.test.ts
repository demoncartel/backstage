import {
  exactVersion,
  expandProperties,
  readItems,
  readPackagesConfig,
  readPackagesLock,
  readProperties,
  readTargetFrameworks,
} from './msbuild';

describe('msbuild parser', () => {
  it('reads a single TargetFramework', () => {
    const props = readProperties(`<Project Sdk="Microsoft.NET.Sdk.Web">
      <PropertyGroup><TargetFramework>net6.0</TargetFramework></PropertyGroup>
    </Project>`);
    expect(readTargetFrameworks(props)).toEqual({
      frameworks: ['net6.0'],
      unresolved: [],
    });
  });

  it('reads plural TargetFrameworks', () => {
    const props = readProperties(`<Project><PropertyGroup>
      <TargetFrameworks>net8.0;netstandard2.0; net48 </TargetFrameworks>
    </PropertyGroup></Project>`);
    expect(readTargetFrameworks(props).frameworks).toEqual([
      'net8.0',
      'netstandard2.0',
      'net48',
    ]);
  });

  it('expands properties, including from Directory.Build.props', () => {
    const shared = readProperties(`<Project><PropertyGroup>
      <NetVersion>net10.0</NetVersion></PropertyGroup></Project>`);
    const own = readProperties(`<Project><PropertyGroup>
      <TargetFramework>$(NetVersion)</TargetFramework></PropertyGroup></Project>`);
    expect(readTargetFrameworks({ ...shared, ...own }).frameworks).toEqual([
      'net10.0',
    ]);
  });

  it('reports unresolved properties', () => {
    const props = readProperties(
      `<Project><PropertyGroup><TargetFramework>$(Missing)</TargetFramework></PropertyGroup></Project>`,
    );
    expect(readTargetFrameworks(props)).toEqual({
      frameworks: [],
      unresolved: ['$(Missing)'],
    });
  });

  it('prefers unconditional properties and ignores comments', () => {
    const props = readProperties(`<Project>
      <!-- <PropertyGroup><TargetFramework>net5.0</TargetFramework></PropertyGroup> -->
      <PropertyGroup Condition="'$(Configuration)'=='Debug'"><TargetFramework>net7.0</TargetFramework></PropertyGroup>
      <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
    </Project>`);
    expect(props.TargetFramework).toBe('net8.0');
  });

  it('reads TargetFramework from Directory.Build.props when the project has none', () => {
    const shared = readProperties(
      `<Project><PropertyGroup><TargetFramework>net9.0</TargetFramework></PropertyGroup></Project>`,
    );
    expect(
      readTargetFrameworks({ ...shared, ...readProperties('<Project/>') })
        .frameworks,
    ).toEqual(['net9.0']);
  });

  it('maps legacy TargetFrameworkVersion', () => {
    const props = readProperties(
      `<Project ToolsVersion="15.0"><PropertyGroup><TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion></PropertyGroup></Project>`,
    );
    expect(readTargetFrameworks(props).frameworks).toEqual(['net472']);
  });

  it('reads PackageReference attribute and child versions', () => {
    const items = readItems(`<Project><ItemGroup>
      <PackageReference Include="Newtonsoft.Json" Version="12.0.1" />
      <PackageReference Include="Serilog">
        <Version>3.4.0</Version>
      </PackageReference>
      <PackageReference Include="Polly" VersionOverride="8.0.0" />
      <PackageReference Include="Central.Only" />
    </ItemGroup></Project>`);
    expect(items).toEqual([
      expect.objectContaining({
        include: 'Newtonsoft.Json',
        version: '12.0.1',
      }),
      expect.objectContaining({ include: 'Serilog', version: '3.4.0' }),
      expect.objectContaining({ include: 'Polly', versionOverride: '8.0.0' }),
      expect.objectContaining({ include: 'Central.Only', version: undefined }),
    ]);
  });

  it('expands $(Prop) case-insensitively', () => {
    expect(
      expandProperties('$(serilogversion)', { SerilogVersion: '3.4.0' }),
    ).toEqual({
      value: '3.4.0',
      resolved: true,
    });
  });

  it('recognises exact versions vs ranges', () => {
    expect(exactVersion('12.0.1')).toBe('12.0.1');
    expect(exactVersion('[4.5.0]')).toBe('4.5.0');
    expect(exactVersion('1.0.0-beta.1')).toBe('1.0.0-beta.1');
    expect(exactVersion('[1.0,2.0)')).toBeUndefined();
    expect(exactVersion('1.*')).toBeUndefined();
    expect(exactVersion('$(Foo)')).toBeUndefined();
  });

  it('reads packages.lock.json with direct and transitive packages', () => {
    const lock = readPackagesLock(
      JSON.stringify({
        version: 1,
        dependencies: {
          'net8.0': {
            'Newtonsoft.Json': {
              type: 'Direct',
              requested: '[13.0.1, )',
              resolved: '13.0.1',
            },
            'System.Text.Json': { type: 'Transitive', resolved: '8.0.0' },
            'My.Project': { type: 'Project' },
          },
          'net6.0': {
            'Newtonsoft.Json': { type: 'Direct', resolved: '13.0.1' },
          },
        },
      }),
    );
    expect(lock).toEqual([
      { name: 'Newtonsoft.Json', version: '13.0.1', transitive: false },
      { name: 'System.Text.Json', version: '8.0.0', transitive: true },
    ]);
  });

  it('reads packages.config', () => {
    expect(
      readPackagesConfig(`<?xml version="1.0"?><packages>
        <package id="jQuery" version="1.4.1" targetFramework="net45" />
      </packages>`),
    ).toEqual([{ name: 'jQuery', version: '1.4.1' }]);
  });
});
