import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { api, type Challenge } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { toast } from "sonner";

export function AdminChallengesPage() {
  const { t } = useI18n();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const data = await api.listChallenges();
    setChallenges(data.challenges ?? []);
  };

  useEffect(() => {
    void load().catch((cause) =>
      toast.error(cause instanceof Error ? cause.message : "load failed"),
    );
  }, []);

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

  return (
    <Shell role="admin">
      <div className="page-head">
        <h1 style={{ margin: 0 }}>{t("challenges_title")}</h1>
        <button
          type="button"
          className="secondary"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          onClick={() => setOpen(true)}
        >
          <Plus size={16} /> {t("import")}
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
              <button type="submit" disabled={busy}>
                {t("import_url")}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <section className="card">
        <ul className="list">
          {challenges.length === 0 ? <li>{t("no_challenges")}</li> : null}
          {challenges.map((ch) => (
            <li key={ch.id} className="row">
              <div>
                <strong>{ch.display_name || ch.name}</strong>
                <div className="small-text">{ch.description}</div>
                <span
                  className={`status-badge status-${ch.build_status === "ready" ? "success" : ch.build_status === "failed" ? "failed" : "building"}`}
                >
                  {ch.build_status}
                </span>
                <div className="small-text font-mono" style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {ch.name}
                  <ChevronRight size={12} aria-hidden />
                  {ch.image_tag}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void (async () => {
                      setBusy(true);
                      try {
                        await api.buildChallenge(ch.id);
                        toast.success(t("build"));
                        await load();
                      } catch (cause) {
                        toast.error(cause instanceof Error ? cause.message : "build failed");
                      } finally {
                        setBusy(false);
                      }
                    })()
                  }
                >
                  {ch.build_status === "ready" ? t("rebuild") : t("build")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void (async () => {
                      setBusy(true);
                      try {
                        await api.deleteChallenge(ch.id);
                        toast.success(t("deleted"));
                        await load();
                      } catch (cause) {
                        toast.error(cause instanceof Error ? cause.message : "delete failed");
                      } finally {
                        setBusy(false);
                      }
                    })()
                  }
                >
                  {t("delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}
