import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

export function StudentPlaceholderPage({
  titleKey,
}: {
  titleKey: "nav_my_classes" | "nav_leaderboard" | "nav_password";
}) {
  const { t } = useI18n();
  return (
    <Shell role="student">
      <h1>{t(titleKey)}</h1>
      <section className="card">
        <p className="muted">{t("coming_soon")}</p>
      </section>
    </Shell>
  );
}
