import type { Challenge, LabInstance } from "./api";

export type FlagMeta = {
  flag: string;
  points: number;
  description?: string;
  hints?: string[];
};

/** One copyable connection row — SSH, IP-only, RDP, etc. */
export type ConnectField = {
  id: string;
  label: string;
  /** Shown in the UI */
  value: string;
  /** Copied to clipboard (defaults to value) */
  copyValue?: string;
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

export function challengeDifficulty(ch: Challenge): string {
  const fromDesc = (ch.description || "").match(/^\s*(Easy|Medium|Hard)\b/i);
  if (fromDesc) return fromDesc[1];
  return "";
}

export function flagsCapturedCount(challenges: Challenge[], submitted: string[]): number {
  const set = new Set(submitted);
  let n = 0;
  for (const ch of challenges) {
    for (const f of parseFlagSpecs(ch.flags)) {
      if (set.has(f.flag)) n++;
    }
  }
  return n;
}

export function pointsFromSubmitted(challenges: Challenge[], submitted: string[]): number {
  const set = new Set(submitted);
  let n = 0;
  for (const ch of challenges) {
    for (const f of parseFlagSpecs(ch.flags)) {
      if (set.has(f.flag)) n += Number(f.points) || 0;
    }
  }
  return n;
}

export function solvedCount(challenges: Challenge[], submitted: string[]): number {
  return challenges.filter((ch) => challengeSolved(ch, submitted)).length;
}

export function challengeHints(flags: string): string[] {
  return parseFlagSpecs(flags).flatMap((f) => f.hints || []).filter(Boolean);
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

/** Group challenges into optional sections (empty section = ungrouped). */
export function groupBySection(challenges: Challenge[]): { section: string; challenges: Challenge[] }[] {
  const map = new Map<string, Challenge[]>();
  for (const ch of challenges) {
    const key = (ch.section || "").trim();
    const list = map.get(key) ?? [];
    list.push(ch);
    map.set(key, list);
  }
  const entries = [...map.entries()];
  entries.sort((a, b) => {
    if (!a[0]) return 1;
    if (!b[0]) return -1;
    return a[0].localeCompare(b[0], undefined, { numeric: true });
  });
  return entries.map(([section, list]) => ({ section, challenges: list }));
}

/** Live countdown as MM:SS (minutes may exceed 59). */
export function formatTimerMMSS(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function formatDuration(sec: number): string {
  return formatTimerMMSS(sec);
}

export function remainingSeconds(expiresAt?: string | null): number {
  if (!expiresAt) return 0;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((t - Date.now()) / 1000));
}

/**
 * Flexible connection rows from a running lab.
 * Supports SSH, host:port only, user+host, Windows/RDP-style, etc.
 */
export function connectionFields(
  lab: LabInstance,
  host = typeof window !== "undefined" ? window.location.hostname : "localhost",
): ConnectField[] {
  const fields: ConnectField[] = [];
  const port = lab.host_port && lab.host_port > 0 ? lab.host_port : undefined;
  const user = (lab.username || "").trim();
  const pass = lab.password || "";
  const type = (lab.connection_type || "ssh").toLowerCase();

  const addr = port ? `${host}:${port}` : host;

  if (type === "ssh" || type === "sftp") {
    if (user && port) {
      fields.push({
        id: "ssh",
        label: "SSH",
        value: `ssh -p ${port} ${user}@${host}`,
      });
    } else if (port) {
      fields.push({ id: "host", label: "Host", value: addr });
    } else {
      fields.push({ id: "ip", label: "IP", value: host });
    }
    if (user && !(user && port)) {
      fields.push({ id: "user", label: "User", value: user });
    }
  } else if (type === "rdp" || type === "windows" || type === "win") {
    fields.push({ id: "host", label: "Host", value: addr });
    if (user) fields.push({ id: "user", label: "User", value: user });
  } else if (type === "http" || type === "https" || type === "web") {
    const scheme = type === "https" ? "https" : "http";
    const url = port ? `${scheme}://${host}:${port}` : `${scheme}://${host}`;
    fields.push({ id: "url", label: "URL", value: url });
  } else {
    // Generic / future types: expose whatever we have.
    if (port || host) fields.push({ id: "host", label: "Host", value: addr });
    if (user) fields.push({ id: "user", label: "User", value: user });
  }

  if (pass) {
    fields.push({
      id: "password",
      label: "Password",
      value: pass,
      copyValue: pass,
    });
  }

  return fields;
}

/** @deprecated use connectionFields */
export function sshSnippet(lab: LabInstance, host = window.location.hostname): string {
  return connectionFields(lab, host)
    .map((f) => f.value)
    .join("\n");
}
