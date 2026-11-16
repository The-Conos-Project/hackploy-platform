export type Health = {
  status: string;
  version: string;
  docker: string;
  db: string;
};

export type PlatformStatus = {
  phase: string;
  message: string;
  version: string;
};

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => getJSON<Health>("/health"),
  status: () => getJSON<PlatformStatus>("/api/v1/status"),
  version: () =>
    getJSON<{
      version: string;
      challenge_format: string;
    }>("/api/v1/version"),
};
