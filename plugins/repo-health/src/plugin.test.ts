import plugin from './index';
import { relativeTime } from './components/time';

describe('repo-health frontend', () => {
  it('exports the plugin', () => {
    expect(plugin).toBeDefined();
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-11-28T12:00:00Z');
    expect(relativeTime('2026-11-28T11:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-11-28T11:50:00Z', now)).toBe('10 min ago');
    expect(relativeTime('2026-11-28T09:00:00Z', now)).toBe('3 hours ago');
    expect(relativeTime('2026-11-20T12:00:00Z', now)).toBe('8 days ago');
    expect(relativeTime('nope', now)).toBe('never');
  });
});
