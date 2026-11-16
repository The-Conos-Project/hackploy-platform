import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type Challenge, type Group, type LabInstance } from "@/lib/api";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

function flagCount(flags: string): number {
  try {
    const parsed = JSON.parse(flags) as unknown[];
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function StudentDashboardPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [labs, setLabs] = useState<LabInstance[]>([]);
  const [flagDrafts, setFlagDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [g, c, l] = await Promise.all([
      api.listGroups(),
      api.listChallenges(),
      api.listLabs(),
    ]);
    setGroups(g.groups ?? []);
    setChallenges(c.challenges ?? []);
    setLabs(l.labs ?? []);
  };

  useEffect(() => {
    void load().catch((cause) =>
      toast.error(cause instanceof Error ? cause.message : "load failed"),
    );
  }, []);

  const assignedIds = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      for (const id of g.challenge_ids) set.add(id);
    }
    return set;
  }, [groups]);

  const assigned = challenges.filter((ch) => assignedIds.has(ch.id));
  const runningByChallenge = useMemo(() => {
    const m = new Map<string, LabInstance>();
    for (const lab of labs) {
      if (lab.status === "running") m.set(lab.challenge_id, lab);
    }
    return m;
  }, [labs]);

  const start = async (challengeId: string) => {
    setBusy(true);
    try {
      await api.startLab(challengeId);
      toast.success(t("lab_started"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "start failed");
    } finally {
      setBusy(false);
    }
  };

  const stop = async (id: string) => {
    setBusy(true);
    try {
      await api.stopLab(id);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "stop failed");
    } finally {
      setBusy(false);
    }
  };

  const extend = async (id: string) => {
    setBusy(true);
    try {
      await api.extendLab(id);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "extend failed");
    } finally {
      setBusy(false);
    }
  };

  const submitFlag = async (e: FormEvent, lab: LabInstance) => {
    e.preventDefault();
    const flag = (flagDrafts[lab.id] || "").trim();
    if (!flag) return;
    setBusy(true);
    try {
      const res = await api.submitFlag(lab.id, flag);
      toast.success(`${t("flag_accepted")} · ${res.completed}/${res.total} · +${res.points}`);
      setFlagDrafts((prev) => ({ ...prev, [lab.id]: "" }));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "flag failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell role="student">
      <h1>{t("nav_dashboard")}</h1>
      <p className="muted">{t("student_dashboard_body")}</p>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{t("assigned_labs")}</h2>
        <ul className="list">
          {assigned.length === 0 ? <li>{t("no_assigned_labs")}</li> : null}
          {assigned.map((ch) => {
            const lab = runningByChallenge.get(ch.id);
            return (
              <li key={ch.id}>
                <div className="row">
                  <div>
                    <strong>{ch.display_name || ch.name}</strong>
                    <div className="small-text">{ch.description}</div>
                    <div className="small-text" style={{ marginTop: 4 }}>
                      {flagCount(ch.flags)} {t("flags")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!lab ? (
                      <button
                        type="button"
                        disabled={busy || ch.build_status !== "ready"}
                        onClick={() => void start(ch.id)}
                      >
                        {t("start_lab")}
                      </button>
                    ) : (
                      <>
                        <button type="button" className="secondary" disabled={busy} onClick={() => void extend(lab.id)}>
                          {t("extend_lab")}
                        </button>
                        <button type="button" className="secondary" disabled={busy} onClick={() => void stop(lab.id)}>
                          {t("stop_lab")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {lab ? (
                  <div style={{ marginTop: 12 }}>
                    <div className="small-text font-mono">
                      {[
                        lab.connection_type,
                        lab.host_port ? `:${lab.host_port}` : "",
                        lab.username || "",
                        lab.password || "",
                        lab.expires_at ? new Date(lab.expires_at).toLocaleString() : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <form
                      className="row"
                      style={{ marginTop: 10 }}
                      onSubmit={(e) => void submitFlag(e, lab)}
                    >
                      <input
                        className="font-mono"
                        value={flagDrafts[lab.id] || ""}
                        onChange={(e) =>
                          setFlagDrafts((prev) => ({ ...prev, [lab.id]: e.target.value }))
                        }
                        placeholder={t("flag_placeholder")}
                        style={{ flex: 1 }}
                        required
                      />
                      <button type="submit" disabled={busy}>
                        {t("submit_flag")}
                      </button>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {groups.length === 0 ? (
        <section className="card" style={{ marginTop: 18 }}>
          <p className="small-text">{t("join_group_hint")}</p>
        </section>
      ) : null}
    </Shell>
  );
}
