import { readBaseImages, parseDotnetImage, parseNodeImage } from './dockerfile';
import { readGlobalJsonSdk } from './globalJson';
import { nodeMajorFromSpec } from './node';
import { channelOf, normaliseTfm } from './tfm';

describe('normaliseTfm', () => {
  it.each([
    ['net6.0', '.NET', '6.0'],
    ['net8.0-windows10.0.19041', '.NET', '8.0'],
    ['net10.0', '.NET', '10.0'],
    ['netcoreapp3.1', '.NET Core', '3.1'],
    ['netstandard2.0', '.NET Standard', '2.0'],
    ['net48', '.NET Framework', '4.8'],
    ['net472', '.NET Framework', '4.7.2'],
    ['net4.6.2', '.NET Framework', '4.6.2'],
  ])('%s → %s %s', (tfm, product, channel) => {
    expect(normaliseTfm(tfm)).toMatchObject({ product, channel });
  });

  it('returns undefined for junk', () => {
    expect(normaliseTfm('banana')).toBeUndefined();
  });

  it('channelOf', () => {
    expect(channelOf('6.0.100')).toBe('6.0');
    expect(channelOf('x')).toBeUndefined();
  });
});

describe('global.json', () => {
  it('reads sdk.version with comments', () => {
    expect(
      readGlobalJsonSdk(`{
        // pinned
        "sdk": { "version": "6.0.100", "rollForward": "latestFeature" } /* end */
      }`),
    ).toBe('6.0.100');
  });
  it('handles missing sdk and invalid json', () => {
    expect(readGlobalJsonSdk('{"msbuild-sdks":{}}')).toBeUndefined();
    expect(readGlobalJsonSdk('{nope')).toBeUndefined();
  });
});

describe('Dockerfile', () => {
  const dockerfile = `
ARG DOTNET_VERSION=8.0
FROM mcr.microsoft.com/dotnet/sdk:\${DOTNET_VERSION}-alpine AS build
WORKDIR /src
FROM build AS publish
FROM --platform=linux/amd64 mcr.microsoft.com/dotnet/aspnet:6.0 AS final
FROM node:20-alpine
`;
  it('reads base images, substitutes ARGs and skips stage references', () => {
    expect(readBaseImages(dockerfile).map(i => i.image)).toEqual([
      'mcr.microsoft.com/dotnet/sdk:8.0-alpine',
      'mcr.microsoft.com/dotnet/aspnet:6.0',
      'node:20-alpine',
    ]);
  });
  it.each([
    ['mcr.microsoft.com/dotnet/sdk:8.0-alpine', '8.0', 'sdk', false],
    [
      'mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled',
      '10.0',
      'runtime',
      false,
    ],
    ['mcr.microsoft.com/dotnet/runtime-deps:9.0.1', '9.0', 'runtime', false],
    ['mcr.microsoft.com/dotnet/core/aspnet:3.1', '3.1', 'runtime', true],
  ])('%s', (image, channel, kind, legacyCore) => {
    expect(parseDotnetImage(image)).toMatchObject({
      channel,
      kind,
      legacyCore,
    });
  });
  it('ignores non-.NET images and untagged images have no channel', () => {
    expect(parseDotnetImage('node:20')).toBeUndefined();
    expect(parseDotnetImage('mcr.microsoft.com/dotnet/aspnet')).toMatchObject({
      channel: undefined,
    });
    expect(parseNodeImage('node:18-bullseye')).toBe('18');
    expect(parseNodeImage('node:lts')).toBeUndefined();
  });
});

describe('node version specs', () => {
  it.each([
    ['>=18', '18'],
    ['^20.11.0', '20'],
    ['v22.3.0', '22'],
    ['20.x', '20'],
    ['lts/*', undefined],
  ])('%s → %s', (spec, major) => {
    expect(nodeMajorFromSpec(spec)).toBe(major);
  });
});
