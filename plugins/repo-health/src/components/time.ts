/** "3 hours ago" style relative time (no date library needed). */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (isNaN(t)) return 'never';
  const s = Math.round((now - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.round(h / 24)} days ago`;
}
