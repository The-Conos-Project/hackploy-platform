import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

export function AdminPlaceholderPage({ titleKey }: { titleKey: "nav_classes" | "nav_leaderboard" | "nav_users" }) {
  const { t } = useI18n();
  return (
    <Shell role="admin">
      <h1>{t(titleKey)}</h1>
      <section className="card">
        <p className="muted">{t("coming_soon")}</p>
      </section>
    </Shell>
  );
}
