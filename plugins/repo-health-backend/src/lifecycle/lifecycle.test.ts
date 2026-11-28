import {
  dotnetChannelLifecycle,
  dotnetFrameworkLifecycle,
  DotnetChannelInfo,
} from './dotnet';
import { nodeMajorLifecycle } from './node';

const index: DotnetChannelInfo[] = [
  {
    'channel-version': '11.0',
    'support-phase': 'active',
    'release-type': 'sts',
    'eol-date': '2028-11-14',
    'latest-sdk': '11.0.100',
    'latest-runtime': '11.0.0',
  },
  {
    'channel-version': '10.0',
    'support-phase': 'active',
    'release-type': 'lts',
    'eol-date': '2028-11-14',
  },
  {
    'channel-version': '9.0',
    'support-phase': 'eol',
    'release-type': 'sts',
    'eol-date': '2026-11-10',
  },
  {
    'channel-version': '6.0',
    'support-phase': 'eol',
    'release-type': 'lts',
    'eol-date': '2024-11-12',
    'latest-sdk': '6.0.428',
  },
  {
    'channel-version': '3.1',
    product: '.NET Core',
    'support-phase': 'eol',
    'eol-date': '2022-12-13',
  },
  {
    'channel-version': '12.0',
    'support-phase': 'preview',
    'release-type': 'lts',
    'eol-date': null,
  },
  {
    'channel-version': '8.0',
    'support-phase': 'maintenance',
    'release-type': 'lts',
    'eol-date': '2027-02-01',
  },
];
const now = new Date('2026-11-28T00:00:00Z');

describe('.NET lifecycle', () => {
  it.each([
    ['11.0', 'supported'],
    ['10.0', 'supported'],
    ['9.0', 'eol'],
    ['6.0', 'eol'],
    ['3.1', 'eol'],
    ['12.0', 'preview'],
    ['8.0', 'eol-soon'],
    ['2.5', 'unknown'],
  ])('%s is %s', (channel, status) => {
    expect(dotnetChannelLifecycle(index, channel, now, 180).status).toBe(
      status,
    );
  });

  it('treats a passed eol-date as eol even if the phase says otherwise', () => {
    const stale = [
      {
        'channel-version': '7.0',
        'support-phase': 'active',
        'eol-date': '2024-05-14',
      },
    ];
    expect(dotnetChannelLifecycle(stale, '7.0', now, 180).status).toBe('eol');
  });

  it('returns latest SDK/runtime in the channel', () => {
    expect(dotnetChannelLifecycle(index, '6.0', now, 180)).toMatchObject({
      latestSdk: '6.0.428',
      eolDate: '2024-11-12',
      releaseType: 'lts',
    });
  });

  it('is unknown without metadata', () => {
    expect(dotnetChannelLifecycle(undefined, '6.0', now, 180).status).toBe(
      'unknown',
    );
  });

  it.each([
    ['4.8', 'supported'],
    ['4.6.2', 'supported'],
    ['4.6.1', 'eol'],
    ['4.5.2', 'eol'],
    ['4.0', 'eol'],
    ['3.5', 'supported'],
  ])('.NET Framework %s is %s', (channel, status) => {
    expect(dotnetFrameworkLifecycle(channel, now, 180).status).toBe(status);
  });
});

describe('Node lifecycle', () => {
  const schedule = {
    v18: { start: '2022-04-19', end: '2025-04-30' },
    v22: { start: '2024-04-24', end: '2027-04-30' },
    v24: { start: '2025-05-06', end: '2028-04-30' },
    v28: { start: '2027-04-01', end: '2030-04-30' },
  };
  it.each([
    ['18', 'eol'],
    ['22', 'eol-soon'],
    ['24', 'supported'],
    ['28', 'preview'],
    ['99', 'unknown'],
  ])('node %s is %s', (major, status) => {
    expect(nodeMajorLifecycle(schedule, major, now, 180).status).toBe(status);
  });
});
