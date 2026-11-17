import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Droplets, Play, RefreshCw, Square, X } from "lucide-react";
import { toast } from "sonner";
import { api, type Challenge, type LabInstance } from "@/lib/api";
import {
  challengeDifficulty,
  challengeHints,
  challengePoints,
  challengeSolved,
  connectionFields,
  parseSubmittedFlags,
} from "@/lib/challengeMeta";
import { useI18n } from "@/i18n";
import { PageTabs } from "@/components/PageTabs";
import { copyText } from "@/lib/clipboard";

type Solver = { username: string; at: string };

function formatTimerMMSS(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function AdminPracticeModal({
  challenge,
  solvers = [],
  blood,
  onClose,
}: {
  challenge: Challenge;
  solvers?: Solver[];
  blood?: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState("challenge");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<LabInstance | null>(null);
  const [flagDraft, setFlagDraft] = useState("");
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const refreshLabs = async () => {
    const { labs } = await api.listLabs();
    const mine = labs.filter(
      (l) => l.status === "running" && (l.user_id === "root" || l.user_id === "admin"),
    );
    const found =
      mine.find((l) => l.challenge_id === challenge.id) ||
      mine.find((l) => l.image_tag && l.image_tag === challenge.image_tag) ||
      null;
    setRunning(found);
    if (found) {
      setSubmitted(parseSubmittedFlags(found.submitted_flags));
    } else {
      setSubmitted([]);
    }
  };

  useEffect(() => {
    void refreshLabs().catch(() => setRunning(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge.id]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const leftSec = useMemo(() => {
    if (!running?.expires_at) return 0;
    return Math.max(0, Math.floor((new Date(running.expires_at).getTime() - now) / 1000));
  }, [running, now]);

  const connect = running ? connectionFields(running) : [];
  const ready = challenge.build_status === "ready";
  const tabs = useMemo(
    () => [
      { id: "challenge", label: t("tab_details") },
      { id: "solvers", label: t("tab_solvers") },
    ],
    [t],
  );

  const start = async () => {
    setBusy(true);
    try {
      const lab = await api.startLab(challenge.id);
      setRunning(lab);
      setSubmitted(parseSubmittedFlags(lab.submitted_flags));
      toast.success(t("lab_started"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "start failed");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!running) return;
    setBusy(true);
    try {
      await api.stopLab(running.id);
      setRunning(null);
      toast.success(t("lab_stopped"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "stop failed");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!running) return;
    setBusy(true);
    try {
      await api.stopLab(running.id);
      const lab = await api.startLab(challenge.id);
      setRunning(lab);
      setSubmitted(parseSubmittedFlags(lab.submitted_flags));
      toast.success(t("lab_reset"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "reset failed");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!running) return;
    setBusy(true);
    try {
      const res = await api.submitFlag(running.id, flagDraft, { challengeId: challenge.id });
      setFlagDraft("");
      setSubmitted((prev) => [...prev, res.accepted]);
      toast.success(t("flag_accepted"));
      await refreshLabs();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "incorrect");
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async (value: string) => {
    try {
      await copyText(value);
      toast.success(t("copied"));
    } catch {
      toast.error("copy failed");
    }
  };

  return (
    <div className="modal" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content challenge-modal">
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="challenge-meta-row" style={{ marginTop: 0 }}>
            {challengeDifficulty(challenge) ? (
              <span className={`diff-pill diff-${challengeDifficulty(challenge).toLowerCase()}`}>
                {challengeDifficulty(challenge)}
              </span>
            ) : null}
            <span className="points-yellow">
              {challengePoints(challenge.flags)} {t("points")}
            </span>
            <span className="small-text">{t("admin_practice_hint")}</span>
          </div>
          <button type="button" className="icon-action" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <h3 style={{ margin: "0 0 12px" }}>{challenge.display_name || challenge.name}</h3>

        <PageTabs equal tabs={tabs} active={tab} onChange={setTab} />

        {tab === "solvers" ? (
          <div className="modal-tab-body">
            {solvers.length === 0 ? (
              <div className="tab-empty">
                <Droplets size={28} className="tab-empty-icon" aria-hidden />
                <p className="muted" style={{ margin: 0 }}>
                  {t("no_solvers")}
                </p>
              </div>
            ) : (
              <ul className="solver-list">
                {solvers.map((s) => (
                  <li key={s.username + s.at}>
                    <strong>{s.username}</strong>
                    <span className="small-text">{new Date(s.at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="modal-tab-body">
            {blood ? (
              <div className="first-blood-chip first-blood-banner-chip">
                <Droplets size={14} />
                <span>
                  {t("first_blood")}: <strong>{blood}</strong>
                </span>
              </div>
            ) : null}

            <p style={{ marginTop: 0 }}>{challenge.description}</p>

            {challengeHints(challenge.flags).length > 0 ? (
              <div className="hint-block hint-yellow">
                <div className="hint-yellow-label">{t("hints")}</div>
                <ul className="list">
                  {challengeHints(challenge.flags).map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="lab-machine-card">
              <div className="lab-machine-head">
                <strong>{t("challenge_lab")}</strong>
                {running ? (
                  <div className={`lab-machine-timer font-mono${leftSec <= 300 ? " is-urgent" : ""}`}>
                    {formatTimerMMSS(leftSec)}
                  </div>
                ) : null}
              </div>

              {!running ? (
                <button type="button" className="btn-compact" disabled={busy || !ready} onClick={() => void start()}>
                  <Play size={14} /> {t("start_lab")}
                </button>
              ) : (
                <>
                  {connect.length > 0 ? (
                    <div className="connect-panel">
                      <div className="small-text connect-panel-label">{t("connection")}</div>
                      {connect.map((field) => (
                        <button
                          key={field.id}
                          type="button"
                          className="connect-inline connect-copy"
                          title={t("copy")}
                          onClick={() => void onCopy(field.copyValue ?? field.value)}
                        >
                          <span className="connect-label">
                            {field.id === "password" ? t("password") : field.label}
                          </span>
                          <code className="font-mono connect-value">{field.value}</code>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="lab-machine-actions">
                    <button type="button" className="btn-compact secondary" disabled={busy} onClick={() => void reset()}>
                      <RefreshCw size={14} /> {t("reset_lab")}
                    </button>
                    <button type="button" className="btn-compact danger" disabled={busy} onClick={() => void stop()}>
                      <Square size={14} /> {t("stop_destroy")}
                    </button>
                  </div>
                </>
              )}
            </div>

            {running ? (
              challengeSolved(challenge, submitted) ? (
                <p className="muted" style={{ marginTop: 14 }}>
                  {t("challenge_complete")}
                </p>
              ) : (
                <form onSubmit={(e) => void submit(e)} style={{ marginTop: 14 }}>
                  <label className="small-text">{t("submit_flag")}</label>
                  <div className="inline-field">
                    <input
                      className="font-mono"
                      value={flagDraft}
                      onChange={(e) => setFlagDraft(e.target.value)}
                      placeholder={t("flag_placeholder")}
                      required
                      autoFocus
                    />
                    <button type="submit" className="btn-compact" disabled={busy}>
                      {t("submit_flag")}
                    </button>
                  </div>
                </form>
              )
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
