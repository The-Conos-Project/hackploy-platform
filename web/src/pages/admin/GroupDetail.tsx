import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { api, type Challenge, type Group } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { toast } from "sonner";
import { CopyButton } from "@/components/CopyButton";

export function AdminGroupDetailPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const [group, setGroup] = useState<Group | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [g, c] = await Promise.all([api.getGroup(id), api.listChallenges()]);
        setGroup(g);
        setPicked([...g.challenge_ids]);
        setChallenges(c.challenges ?? []);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "load failed");
      }
    })();
  }, [id]);

  const onSave = async () => {
    if (!group) return;
    setBusy(true);
    try {
      const g = await api.assignLabs(group.id, picked);
      setGroup(g);
      toast.success(t("labs_assigned"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell role="admin">
      <p className="small-text" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Link to="/admin/groups">{t("nav_classes")}</Link>
        <ChevronRight size={14} aria-hidden />
        <span>{group?.name || "…"}</span>
      </p>
      <h1>{group?.name || t("loading")}</h1>
      {group ? (
        <div className="row" style={{ marginBottom: 12 }}>
          <p className="muted font-mono" style={{ margin: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {t("join_code")}
              <ChevronRight size={12} aria-hidden />
              {group.join_code}
            </span>
            {" · "}
            {group.member_ids.length} {t("members")}
          </p>
          <CopyButton value={group.join_code} />
        </div>
      ) : null}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{t("assign_labs")}</h2>
        <ul className="list">
          {challenges.map((ch) => {
            const on = picked.includes(ch.id);
            return (
              <li key={ch.id}>
                <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setPicked((prev) => (on ? prev.filter((x) => x !== ch.id) : [...prev, ch.id]))
                    }
                  />
                  <span>{ch.display_name || ch.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <button type="button" disabled={busy || !group} onClick={() => void onSave()} style={{ marginTop: 12 }}>
          {t("save")}
        </button>
      </section>
    </Shell>
  );
}
