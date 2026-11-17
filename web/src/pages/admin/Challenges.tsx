import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronDown, FileText, Hammer, Layers, Play, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, type Challenge } from "@/lib/api";
import { listChallenges } from "@/lib/platform";
import { groupBySet, setName } from "@/lib/challengeMeta";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { AdminPracticeModal } from "@/components/AdminPracticeModal";

export function AdminChallengesPage() {
  const { t } = useI18n();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [logSet, setLogSet] = useState<string | null>(null);
  const [logChallengeId, setLogChallengeId] = useState<string | null>(null);
  const [logText, setLogText] = useState("");
  const [logBuilding, setLogBuilding] = useState(false);
  const [practice, setPractice] = useState<Challenge | null>(null);
  const logEndRef = useRef<HTMLPreElement | null>(null);
  const pollRef = useRef<number | null>(null);

  const load = async () => {
    setChallenges(await listChallenges());
  };

  useEffect(() => {
    void load().catch((cause) =>
      toast.error(cause instanceof Error ? cause.message : "load failed"),
    );
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollTo({ top: logEndRef.current.scrollHeight });
  }, [logText]);

  const sets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = groupBySet(challenges);
    if (!q) return all;
    return all.filter(([name, labs]) => {
      const hay = `${name} ${labs.map((c) => `${c.display_name} ${c.name} ${c.description}`).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [challenges, query]);

  const stopPoll = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollLog = (id: string) => {
    stopPoll();
    const tick = async () => {
      try {
        const res = await api.buildLog(id);
        setLogText(res.log || "");
        const list = await listChallenges();
        setChallenges(list);
        const ch = list.find((c) => c.id === id);
        if (ch && (ch.build_status === "ready" || ch.build_status === "failed")) {
          setLogBuilding(false);
          stopPoll();
        }
      } catch {
        /* keep polling */
      }
    };
    void tick();
    pollRef.current = window.setInterval(() => void tick(), 1200);
  };

  const openLog = (setKey: string, labs: Challenge[]) => {
    const id = labs[0]?.id;
    if (!id) return;
    setLogSet(setKey);
    setLogChallengeId(id);
    setLogText("");
    setLogBuilding(labs.some((c) => c.build_status === "building"));
    pollLog(id);
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      await api.importUpload(file);
      setOpen(false);
      toast.success(t("import"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const onURL = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.importURL(url);
      setUrl("");
      setOpen(false);
      toast.success(t("import"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const buildSet = async (setKey: string, labs: Challenge[]) => {
    if (labs.length === 0) return;
    const id = labs[0].id;
    setBusy(true);
    setLogSet(setKey);
    setLogChallengeId(id);
    setLogText("");
    setLogBuilding(true);
    pollLog(id);
    try {
      await api.buildChallenge(id);
      toast.success(t("build_started"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "build failed");
      setLogBuilding(false);
      stopPoll();
    } finally {
      setBusy(false);
    }
  };

  const deleteSet = async (labs: Challenge[]) => {
    setBusy(true);
    try {
      for (const ch of labs) {
        await api.deleteChallenge(ch.id);
      }
      toast.success(t("deleted"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell role="admin">
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>{t("challenges_title")}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {t("labs_admin_body")}
          </p>
        </div>
        <button
          type="button"
          className="btn-compact"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          onClick={() => setOpen(true)}
        >
          <Plus size={16} /> {t("import")}
        </button>
      </div>

      <div className="page-toolbar assign-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search_labs")}
        />
        <button type="button" className="btn-compact secondary" onClick={() => setQuery(query.trim())}>
          <Search size={14} /> {t("search")}
        </button>
      </div>

      {open ? (
        <div className="modal" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-content" style={{ width: "90%", maxWidth: 480 }}>
            <div className="row" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>{t("import")}</h3>
              <button type="button" className="modal-close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <label className="small-text">{t("import_file")}</label>
            <input
              type="file"
              accept=".tar.gz,application/gzip"
              className="font-mono"
              disabled={busy}
              onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
            />
            <form onSubmit={(e) => void onURL(e)} style={{ marginTop: 12 }}>
              <label className="small-text">{t("import_url")}</label>
              <input
                className="font-mono"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…/set.tar.gz"
                required
              />
              <button type="submit" className="btn-compact" disabled={busy}>
                {t("import_url")}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {challenges.length === 0 ? (
        <section className="card panel-fill">
          <div className="tab-empty">
            <Layers size={28} className="tab-empty-icon" aria-hidden />
            <p className="muted" style={{ margin: 0 }}>
              {t("no_challenges")}
            </p>
          </div>
        </section>
      ) : sets.length === 0 ? (
        <section className="card panel-fill">
          <div className="tab-empty">
            <Search size={28} className="tab-empty-icon" aria-hidden />
            <p className="muted" style={{ margin: 0 }}>
              {t("no_search_matches")}
            </p>
          </div>
        </section>
      ) : (
        <div className="set-stack panel-fill">
          {sets.map(([name, labs]) => {
            const isOpen = expanded[name] ?? false;
            const status = labs[0]?.build_status || "pending";
            return (
              <section key={name} className="card set-card">
                <div className="set-card-head">
                  <button
                    type="button"
                    className="set-card-toggle"
                    onClick={() => setExpanded((p) => ({ ...p, [name]: !isOpen }))}
                  >
                    <Layers size={18} />
                    <div>
                      <strong>{name}</strong>
                      <div className="small-text">
                        {labs.length} {t("challenges_in_set")}
                      </div>
                    </div>
                    <ChevronDown size={18} className={isOpen ? "chev open" : "chev"} />
                  </button>
                  <div className="icon-actions">
                    <span
                      className={`status-badge status-${status === "ready" ? "success" : status === "failed" ? "failed" : "building"}`}
                    >
                      {status}
                    </span>
                    <button
                      type="button"
                      className="icon-action"
                      title={t("build")}
                      disabled={busy}
                      onClick={() => void buildSet(name, labs)}
                    >
                      <Hammer size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-action"
                      title={t("view_build_log")}
                      onClick={() => openLog(name, labs)}
                    >
                      <FileText size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-action danger"
                      title={t("delete")}
                      disabled={busy}
                      onClick={() => void deleteSet(labs)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {isOpen ? (
                  <div className="tile-panel">
                    <div className="tile-grid">
                      {labs.map((ch) => (
                        <div key={ch.id} className="tile-card">
                          <strong>{ch.display_name || ch.name}</strong>
                          <div className="small-text" style={{ marginTop: 6 }}>
                            {ch.description}
                          </div>
                          <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
                            <span
                              className={`status-badge status-${ch.build_status === "ready" ? "success" : ch.build_status === "failed" ? "failed" : "building"}`}
                            >
                              {ch.build_status}
                            </span>
                            <button
                              type="button"
                              className="btn-compact secondary"
                              disabled={ch.build_status !== "ready"}
                              title={t("start_lab")}
                              onClick={() => setPractice(ch)}
                            >
                              <Play size={14} /> {t("start")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {practice ? (
        <AdminPracticeModal challenge={practice} onClose={() => setPractice(null)} />
      ) : null}

      {logSet ? (
        <div
          className="modal"
          style={{ display: "flex" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              stopPoll();
              setLogSet(null);
            }
          }}
        >
          <div className="modal-content build-log-modal">
            <div className="row" style={{ marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  {t("build_log")} · {logSet}
                </h3>
                <div className="small-text">
                  {logBuilding ? t("build_running") : t("build_log_hint")}
                  {logChallengeId ? ` · ${setName(challenges.find((c) => c.id === logChallengeId)?.image_tag || logSet)}` : null}
                </div>
              </div>
              <button
                type="button"
                className="icon-action"
                onClick={() => {
                  stopPoll();
                  setLogSet(null);
                }}
              >
                <X size={16} />
              </button>
            </div>
            <pre className="build-log" ref={logEndRef}>
              {logText || t("build_log_empty")}
            </pre>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
