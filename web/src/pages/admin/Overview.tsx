import { useEffect, useState } from "react";
import type { AdminMetrics } from "@/lib/api";
import { getAdminMetrics } from "@/lib/platform";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

/** ~60s window at 2s poll */
const POLL_MS = 2000;
const HISTORY = 30;

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

function Gauge({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number;
  detail: string;
}) {
  const p = Math.max(0, Math.min(100, percent || 0));
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (p / 100) * c;
  return (
    <div className="gauge-card">
      <svg className="gauge-ring" viewBox="0 0 100 100" aria-hidden>
        <circle className="gauge-track" cx="50" cy="50" r={r} />
        <circle
          className="gauge-value"
          cx="50"
          cy="50"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="gauge-center">
        <strong>{p.toFixed(0)}%</strong>
        <span className="small-text">{label}</span>
      </div>
      <div className="small-text gauge-detail">{detail}</div>
    </div>
  );
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 320;
  const h = 72;
  const pad = 2;
  // Keep a fixed 60s slot count so the chart width maps to time even before filled
  const slots = HISTORY;
  const pts = Array.from({ length: slots }, (_, i) => {
    const src = values[values.length - slots + i];
    return src === undefined ? null : src;
  });
  const known = pts.filter((v): v is number => v !== null);
  const max = Math.max(100, ...known, 1);
  const step = slots > 1 ? w / (slots - 1) : w;
  const line: string[] = [];
  const area: string[] = [];
  let started = false;
  pts.forEach((v, i) => {
    if (v === null) return;
    const x = i * step;
    const y = h - pad - (Math.max(0, Math.min(max, v)) / max) * (h - pad * 2);
    if (!started) {
      line.push(`M${x.toFixed(1)} ${y.toFixed(1)}`);
      area.push(`M${x.toFixed(1)} ${(h - pad).toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)}`);
      started = true;
    } else {
      line.push(`L${x.toFixed(1)} ${y.toFixed(1)}`);
      area.push(`L${x.toFixed(1)} ${y.toFixed(1)}`);
    }
  });
  if (started) {
    let lastIdx = 0;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i] !== null) lastIdx = i;
    }
    area.push(`L${(lastIdx * step).toFixed(1)} ${(h - pad).toFixed(1)} Z`);
  }
  const latest = known.length ? known[known.length - 1] : 0;
  return (
    <div className="spark-card">
      <div className="row" style={{ width: "100%" }}>
        <div className="small-text">{label}</div>
        <strong className="font-mono" style={{ fontSize: "1.05rem" }}>
          {latest.toFixed(0)}%
        </strong>
      </div>
      <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
        <path className="spark-area" d={area.join(" ") || "M0 0"} />
        <path className="spark-line" d={line.join(" ") || "M0 0"} fill="none" />
      </svg>
      <div className="spark-foot">
        <span className="small-text">−60s</span>
        <span className="small-text">now</span>
      </div>
    </div>
  );
}

export function AdminOverviewPage() {
  const { t } = useI18n();
  const [m, setM] = useState<AdminMetrics | null>(null);
  const [cpuHist, setCpuHist] = useState<number[]>([]);
  const [memHist, setMemHist] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const data = await getAdminMetrics();
        if (!alive) return;
        setM(data);
        setCpuHist((h) => [...h, data.cpu_percent].slice(-HISTORY));
        setMemHist((h) => [...h, data.mem_percent].slice(-HISTORY));
      } catch {
        if (!alive) return;
        // Keep UI usable if metrics endpoint is down
        setM((prev) =>
          prev ?? {
            cpu_percent: 0,
            mem_used_bytes: 0,
            mem_total_bytes: 0,
            mem_percent: 0,
            disk_used_bytes: 0,
            disk_total_bytes: 0,
            disk_percent: 0,
            load_1: 0,
            num_cpu: 0,
            active_labs: 0,
            challenges: 0,
            ready_challenges: 0,
            groups: 0,
            users: 0,
          },
        );
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <Shell role="admin">
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>{t("platform_overview")}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {t("platform_overview_body")}
          </p>
        </div>
      </div>

      <div className="grid stats-grid">
        <div className="card stat-card">
          <div className="small-text">{t("ready_challenges")}</div>
          <div className="stat">{m?.ready_challenges ?? "…"}</div>
        </div>
        <div className="card stat-card">
          <div className="small-text">{t("active_instances")}</div>
          <div className="stat">{m?.active_labs ?? "…"}</div>
        </div>
        <div className="card stat-card">
          <div className="small-text">{t("imported_challenges")}</div>
          <div className="stat">{m?.challenges ?? "…"}</div>
        </div>
        <div className="card stat-card">
          <div className="small-text">{t("nav_classes")}</div>
          <div className="stat">{m?.groups ?? "…"}</div>
        </div>
      </div>

      <section className="card section-block">
        <h2 style={{ margin: "0 0 14px" }}>{t("system_resources")}</h2>
        <div className="metrics-layout">
          <div className="gauge-row">
            <Gauge
              label={t("cpu")}
              percent={m?.cpu_percent ?? 0}
              detail={m ? `${m.num_cpu} ${t("cores")} · load ${m.load_1}` : "…"}
            />
            <Gauge
              label={t("memory")}
              percent={m?.mem_percent ?? 0}
              detail={
                m
                  ? `${formatBytes(m.mem_used_bytes)} / ${formatBytes(m.mem_total_bytes)}`
                  : "…"
              }
            />
            <Gauge
              label={t("disk")}
              percent={m?.disk_percent ?? 0}
              detail={
                m
                  ? `${formatBytes(m.disk_used_bytes)} / ${formatBytes(m.disk_total_bytes)}`
                  : "…"
              }
            />
          </div>
          <div className="spark-row">
            <Sparkline values={cpuHist} label={`${t("cpu")} · ${t("last_samples")}`} />
            <Sparkline values={memHist} label={`${t("memory")} · ${t("last_samples")}`} />
          </div>
        </div>
      </section>
    </Shell>
  );
}
