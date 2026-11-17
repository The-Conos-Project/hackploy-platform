import { useEffect, useState } from "react";
import { HardDrive, RefreshCw, Square, X } from "lucide-react";
import { toast } from "sonner";
import { api, type LabInstance } from "@/lib/api";
import { formatTimerMMSS, remainingSeconds, setName } from "@/lib/challengeMeta";
import { useI18n } from "@/i18n";

export function MachinesFab() {
  const { t } = useI18n();
  const [labs, setLabs] = useState<LabInstance[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = async () => {
    try {
      const res = await api.listLabs();
      setLabs((res.labs ?? []).filter((l) => l.status === "running"));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 8_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const stop = async (labId: string) => {
    setBusy(true);
    try {
      await api.stopLab(labId);
      toast.success(t("lab_stopped"));
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "stop failed");
    } finally {
      setBusy(false);
    }
  };

  const reset = async (lab: LabInstance) => {
    setBusy(true);
    try {
      await api.stopLab(lab.id);
      await api.startLab(lab.challenge_id);
      toast.success(t("lab_reset"));
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "reset failed");
    } finally {
      setBusy(false);
    }
  };

  void now;
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const count = labs.length;

  return (
    <div className="machines-fab-wrap">
      {open ? (
        <div className="machines-fab-panel">
          <div className="row" style={{ marginBottom: 10 }}>
            <strong>{t("active_machines")}</strong>
            <button type="button" className="icon-action" onClick={() => setOpen(false)}>
              <X size={14} />
            </button>
          </div>
          {count === 0 ? (
            <p className="muted small-text" style={{ margin: 0 }}>
              {t("no_active_machines")}
            </p>
          ) : (
            <ul className="machines-fab-list">
              {labs.map((lab) => {
                const addr =
                  lab.host_port && lab.host_port > 0
                    ? `${host}:${lab.host_port}`
                    : host || "—";
                const title = lab.set_name || setName(lab.image_tag || "") || lab.challenge_id;
                const left = remainingSeconds(lab.expires_at);
                return (
                  <li key={lab.id}>
                    <div className="machines-fab-info">
                      <div className="machines-fab-name">{title}</div>
                      <div className="machines-fab-meta">
                        <code className="font-mono machines-fab-addr">{addr}</code>
                        <span className={`machines-fab-timer font-mono${left <= 300 ? " is-urgent" : ""}`}>
                          {formatTimerMMSS(left)}
                        </span>
                      </div>
                    </div>
                    <div className="machines-fab-actions">
                      <button
                        type="button"
                        className="btn-compact secondary"
                        disabled={busy}
                        onClick={() => void reset(lab)}
                      >
                        <RefreshCw size={14} /> {t("reset_lab")}
                      </button>
                      <button
                        type="button"
                        className="btn-compact danger"
                        disabled={busy}
                        onClick={() => void stop(lab.id)}
                      >
                        <Square size={14} /> {t("stop_lab")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      <button
        type="button"
        className={`machines-fab${count > 0 ? " has-machines" : ""}`}
        aria-label={t("active_machines")}
        onClick={() => {
          setOpen((v) => !v);
          void refresh();
        }}
      >
        <HardDrive size={20} />
        {count > 0 ? <span className="machines-fab-badge">{count}</span> : null}
      </button>
    </div>
  );
}
