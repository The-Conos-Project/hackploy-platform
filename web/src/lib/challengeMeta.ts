import type { Challenge, LabInstance } from "./api";

export type FlagMeta = {
  flag: string;
  points: number;
  description?: string;
  hints?: string[];
};

/** Set key from image tag, e.g. hackploy-linux-basics-i → linux-basics-i */
export function setName(tag: string): string {
  return tag.replace(/^hackploy-/, "") || tag || "unknown";
}

export function parseFlagSpecs(flags: string): FlagMeta[] {
  try {
    const parsed = JSON.parse(flags) as FlagMeta[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f) => f && typeof f.flag === "string" && f.flag);
  } catch {
    return [];
  }
}

export function challengePoints(flags: string): number {
  return parseFlagSpecs(flags).reduce((sum, f) => sum + (Number(f.points) || 0), 0);
}

export function parseSubmittedFlags(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function challengeSolved(ch: Challenge, submitted: string[]): boolean {
  const specs = parseFlagSpecs(ch.flags);
  if (specs.length === 0) return false;
  const set = new Set(submitted);
  return specs.every((s) => set.has(s.flag));
}

export function groupBySet(challenges: Challenge[]): [string, Challenge[]][] {
  const map = new Map<string, Challenge[]>();
  for (const ch of challenges) {
    const key = setName(ch.image_tag);
    const list = map.get(key) ?? [];
    list.push(ch);
    map.set(key, list);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function formatDuration(sec: number): string {
  if (sec < 0) sec = 0;
  if (!Number.isFinite(sec)) return "—";
  const s = Math.floor(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) {
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  }
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function remainingSeconds(expiresAt?: string | null): number {
  if (!expiresAt) return 0;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((t - Date.now()) / 1000));
}

export function sshSnippet(lab: LabInstance, host = window.location.hostname): string {
  const port = lab.host_port || 22;
  const user = lab.username || "user";
  const pass = lab.password || "";
  return [
    `# SSH into the lab`,
    `ssh -p ${port} ${user}@${host}`,
    `# password: ${pass}`,
  ].join("\n");
}
