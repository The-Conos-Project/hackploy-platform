import { useEffect, useState } from "react";
import { api, type AdminMetrics } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

const HISTORY = 28;

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
  const w = 220;
  const h = 56;
  const pts = values.length ? values : [0];
  const max = Math.max(100, ...pts);
  const step = pts.length > 1 ? w / (pts.length - 1) : w;
  const d = pts
    .map((v, i) => {
      const x = i * step;
      const y = h - (Math.max(0, Math.min(max, v)) / max) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="spark-card">
      <div className="small-text">{label}</div>
      <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
        <path d={d} fill="none" />
      </svg>
      <div className="spark-foot">
        <span className="small-text">{pts[pts.length - 1]?.toFixed(0) ?? 0}%</span>
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
        const data = await api.adminMetrics();
        if (!alive) return;
        setM(data);
        setCpuHist((h) => [...h, data.cpu_percent].slice(-HISTORY));
        setMemHist((h) => [...h, data.mem_percent].slice(-HISTORY));
      } catch {
        /* ignore poll errors */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <Shell role="admin">
      <h1>{t("platform_overview")}</h1>
      <p className="muted">{t("platform_overview_body")}</p>

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

      <section className="card section-block" style={{ marginTop: 4 }}>
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
