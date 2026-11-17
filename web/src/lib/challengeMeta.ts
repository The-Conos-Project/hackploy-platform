import type { Challenge } from "./api";

/** Package key from image tag, e.g. hackploy-linux-basics-i → linux-basics-i */
export function packageName(tag: string): string {
  return tag.replace(/^hackploy-/, "") || tag || "unknown";
}

export function challengePoints(flags: string): number {
  try {
    const parsed = JSON.parse(flags) as { points?: number }[];
    if (!Array.isArray(parsed)) return 0;
    return parsed.reduce((sum, f) => sum + (Number(f?.points) || 0), 0);
  } catch {
    return 0;
  }
}

export function groupByPackage(challenges: Challenge[]): [string, Challenge[]][] {
  const map = new Map<string, Challenge[]>();
  for (const ch of challenges) {
    const key = packageName(ch.image_tag);
    const list = map.get(key) ?? [];
    list.push(ch);
    map.set(key, list);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
