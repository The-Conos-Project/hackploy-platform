/** Marks this browser as the admin who started an update, then waits for the progress UI. */
export async function handoffToUpdateProgress(): Promise<void> {
  try {
    localStorage.setItem("hackploy_update_admin", "1");
  } catch {
    /* ignore */
  }

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`/progress.json?ts=${Date.now()}`, { cache: "no-store" });
      if (r.ok) {
        const ct = r.headers.get("content-type") || "";
        if (ct.includes("json") || (await r.clone().text()).startsWith("{")) {
          window.location.replace(`/?progress=1&updating=${Date.now()}`);
          return;
        }
      }
    } catch {
      /* progress UI not up yet */
    }
    await new Promise((r) => window.setTimeout(r, 500));
  }
  // Fallback: hard navigate anyway (manual refresh may still be needed on slow pulls).
  window.location.replace(`/?progress=1&updating=${Date.now()}`);
}

/** If the SPA loaded with ?updating= before nginx switched, keep probing until progress HTML wins. */
export function watchUpdateHandoff(): () => void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("updating") && params.get("progress") !== "1") {
    return () => {};
  }

  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const r = await fetch(`/progress.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const text = await r.text();
      if (text.trimStart().startsWith("{")) {
        // Nginx is on the progress UI — reload so we get index.html (not the SPA shell).
        window.location.reload();
      }
    } catch {
      /* keep waiting */
    }
  };

  void tick();
  const id = window.setInterval(() => void tick(), 800);
  return () => {
    stopped = true;
    window.clearInterval(id);
  };
}
