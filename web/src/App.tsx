import { useEffect, useState } from "react";
import { Activity, Boxes, Shield, Terminal } from "lucide-react";
import { api, type Health, type PlatformStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [h, s] = await Promise.all([api.health(), api.status()]);
      setHealth(h);
      setStatus(s);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <Terminal className="size-5" />
            Hackploy
          </div>
          <span className="text-xs text-muted-foreground">
            {health?.version ?? "…"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">
        <section className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Hackploy 2.0
          </h1>
          <p className="max-w-2xl text-muted-foreground leading-relaxed">
            Go API + React/Vite base. Phase 0 is live — auth, store, and Docker
            labs come next, one step at a time.
          </p>
          <Button type="button" onClick={() => void load()}>
            Refresh status
          </Button>
        </section>

        {error ? (
          <Card className="border-red-500/40 text-red-600 dark:text-red-400">
            {error}
            <p className="mt-2 text-sm text-muted-foreground">
              Start the API: <code>go run ./cmd/hackploy</code>
            </p>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="space-y-2">
            <Activity className="size-5" />
            <h2 className="font-semibold">Health</h2>
            <p className="text-sm text-muted-foreground">
              {health
                ? `${health.status} · db ${health.db} · docker ${health.docker}`
                : "Loading…"}
            </p>
          </Card>
          <Card className="space-y-2">
            <Shield className="size-5" />
            <h2 className="font-semibold">Phase</h2>
            <p className="text-sm text-muted-foreground">
              {status?.phase ?? "…"}
            </p>
          </Card>
          <Card className="space-y-2">
            <Boxes className="size-5" />
            <h2 className="font-semibold">Next</h2>
            <p className="text-sm text-muted-foreground">
              Phase 1 — Auth (admin + students)
            </p>
          </Card>
        </div>

        {status ? (
          <Card>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {status.message}
            </p>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
