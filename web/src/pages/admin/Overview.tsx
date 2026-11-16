import { useEffect, useState } from "react";
import { api, type Challenge } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

export function AdminOverviewPage() {
  const { t } = useI18n();
  const [challenges, setChallenges] = useState<Challenge[]>([]);

  useEffect(() => {
    void api.listChallenges().then((d) => setChallenges(d.challenges ?? []));
  }, []);

  const ready = challenges.filter((c) => c.build_status === "ready" || c.build_status === "pending").length;

  return (
    <Shell role="admin">
      <h1>{t("platform_overview")}</h1>
      <p className="muted">{t("platform_overview_body")}</p>
      <div className="grid">
        <div className="card">
          <div className="small-text">{t("ready_challenges")}</div>
          <div className="stat">{ready}</div>
        </div>
        <div className="card">
          <div className="small-text">{t("active_instances")}</div>
          <div className="stat">0</div>
        </div>
        <div className="card">
          <div className="small-text">{t("imported_challenges")}</div>
          <div className="stat">{challenges.length}</div>
        </div>
      </div>
    </Shell>
  );
}
