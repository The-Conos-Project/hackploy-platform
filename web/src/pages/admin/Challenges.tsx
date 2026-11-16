import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDown, Hammer, Package, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Challenge } from "@/lib/api";
import { listChallenges } from "@/lib/platform";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

function packageName(tag: string): string {
  return tag.replace(/^hackploy-/, "") || tag || "unknown";
}

export function AdminChallengesPage() {
  const { t } = useI18n();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");

  const load = async () => {
    setChallenges(await listChallenges());
  };

  useEffect(() => {
    void load().catch((cause) =>
      toast.error(cause instanceof Error ? cause.message : "load failed"),
    );
  }, []);

  const packages = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, Challenge[]>();
    for (const ch of challenges) {
      const key = packageName(ch.image_tag);
      if (q) {
        const hay = `${key} ${ch.display_name} ${ch.name} ${ch.description}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const list = map.get(key) ?? [];
      list.push(ch);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [challenges, query]);

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

  const buildOne = async (id: string) => {
    setBusy(true);
    try {
      await api.buildChallenge(id);
      toast.success(t("build"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "build failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteOne = async (id: string) => {
    setBusy(true);
    try {
      await api.deleteChallenge(id);
      toast.success(t("deleted"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "delete failed");
    } finally {
      setBusy(false);
    }
  };

  const buildPackage = async (labs: Challenge[]) => {
    if (labs.length === 0) return;
    setBusy(true);
    try {
      await api.buildChallenge(labs[0].id);
      toast.success(t("build"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "build failed");
    } finally {
      setBusy(false);
    }
  };

  const deletePackage = async (labs: Challenge[]) => {
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
          value={queryDraft}
          onChange={(e) => setQueryDraft(e.target.value)}
          placeholder={t("search_labs")}
          onKeyDown={(e) => {
            if (e.key === "Enter") setQuery(queryDraft);
          }}
        />
        <button type="button" className="btn-compact secondary" onClick={() => setQuery(queryDraft)}>
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
                placeholder="https://…/package.tar.gz"
                required
              />
              <button type="submit" className="btn-compact" disabled={busy}>
                {t("import_url")}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {packages.length === 0 ? (
        <section className="empty-state card">
          <p className="muted" style={{ margin: 0 }}>
            {t("no_challenges")}
          </p>
        </section>
      ) : (
        <div className="pkg-stack">
          {packages.map(([name, labs]) => {
            const isOpen = expanded[name] ?? true;
            const status = labs[0]?.build_status || "pending";
            return (
              <section key={name} className="card pkg-card">
                <div className="pkg-card-head">
                  <button
                    type="button"
                    className="pkg-card-toggle"
                    onClick={() => setExpanded((p) => ({ ...p, [name]: !isOpen }))}
                  >
                    <Package size={18} />
                    <div>
                      <strong>{name}</strong>
                      <div className="small-text">
                        {labs.length} {t("labs_in_package")}
                      </div>
                    </div>
                    <ChevronDown size={18} className={isOpen ? "chev open" : "chev"} />
                  </button>
                  <div className="icon-actions">
                    <span className={`status-badge status-${status === "ready" ? "success" : status === "failed" ? "failed" : "building"}`}>
                      {status}
                    </span>
                    <button
                      type="button"
                      className="icon-action"
                      title={t("build")}
                      disabled={busy}
                      onClick={() => void buildPackage(labs)}
                    >
                      <Hammer size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-action danger"
                      title={t("delete")}
                      disabled={busy}
                      onClick={() => void deletePackage(labs)}
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
                          <div className="row">
                            <strong>{ch.display_name || ch.name}</strong>
                            <div className="icon-actions">
                              <button
                                type="button"
                                className="icon-action"
                                title={ch.build_status === "ready" ? t("rebuild") : t("build")}
                                disabled={busy}
                                onClick={() => void buildOne(ch.id)}
                              >
                                <Hammer size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-action danger"
                                title={t("delete")}
                                disabled={busy}
                                onClick={() => void deleteOne(ch.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="small-text" style={{ marginTop: 6 }}>
                            {ch.description}
                          </div>
                          <span
                            className={`status-badge status-${ch.build_status === "ready" ? "success" : ch.build_status === "failed" ? "failed" : "building"}`}
                            style={{ marginTop: 10 }}
                          >
                            {ch.build_status}
                          </span>
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
    </Shell>
  );
}
