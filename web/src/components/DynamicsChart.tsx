import { useMemo } from "react";
import type { CompetitionEvent, Team } from "@/lib/api";

const COLORS = ["#c9a227", "#3d8bfd", "#2f9e71", "#d97757", "#8b5cf6", "#0ea5e9", "#ef4444", "#14b8a6"];

export function DynamicsChart({
  events,
  teams,
}: {
  events: CompetitionEvent[];
  teams: Team[];
}) {
  const series = useMemo(() => {
    const byTeam = new Map<string, { at: number; pts: number }[]>();
    for (const t of teams) byTeam.set(t.id, []);
    const sorted = [...events].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    for (const ev of sorted) {
      const list = byTeam.get(ev.team_id);
      if (!list) continue;
      list.push({ at: new Date(ev.at).getTime(), pts: ev.points_total });
    }
    return [...byTeam.entries()].map(([teamId, points]) => ({
      teamId,
      name: teams.find((t) => t.id === teamId)?.name || teamId,
      points,
    }));
  }, [events, teams]);

  const width = 640;
  const height = 240;
  const pad = 28;

  const allPts = series.flatMap((s) => s.points);
  if (allPts.length === 0) {
    return <p className="muted">—</p>;
  }
  const minT = Math.min(...allPts.map((p) => p.at));
  const maxT = Math.max(...allPts.map((p) => p.at), minT + 1);
  const maxPts = Math.max(...allPts.map((p) => p.pts), 1);

  const x = (t: number) => pad + ((t - minT) / (maxT - minT)) * (width - pad * 2);
  const y = (pts: number) => height - pad - (pts / maxPts) * (height - pad * 2);

  return (
    <div className="dynamics-chart">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Points over time">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="currentColor" opacity={0.2} />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="currentColor" opacity={0.2} />
        {series.map((s, i) => {
          if (s.points.length === 0) return null;
          const d = s.points
            .map((p, idx) => `${idx === 0 ? "M" : "L"} ${x(p.at)} ${y(p.pts)}`)
            .join(" ");
          return (
            <path
              key={s.teamId}
              d={d}
              fill="none"
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="dynamics-legend">
        {series.map((s, i) => (
          <span key={s.teamId} className="dynamics-legend-item">
            <span className="dynamics-swatch" style={{ background: COLORS[i % COLORS.length] }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
