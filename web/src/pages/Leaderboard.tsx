import { useEffect, useMemo, useState } from "react";
import type { LeaderboardBoard } from "@/lib/api";
import { getLeaderboard } from "@/lib/platform";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { PageTabs } from "@/components/PageTabs";
import { toast } from "sonner";

export function LeaderboardPage({ role }: { role: "admin" | "student" }) {
  const { t } = useI18n();
  const [boards, setBoards] = useState<LeaderboardBoard[]>([]);
  const [active, setActive] = useState("");

  useEffect(() => {
    void getLeaderboard()
      .then((list) => {
        setBoards(list);
        setActive((prev) => prev || list[0]?.group_id || "");
      })
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : "load failed"));
  }, []);

  const tabs = useMemo(
    () => boards.map((b) => ({ id: b.group_id, label: b.group_name })),
    [boards],
  );

  const board = useMemo(
    () => boards.find((b) => b.group_id === active) ?? boards[0] ?? null,
    [boards, active],
  );

  return (
    <Shell role={role}>
      <h1>{t("nav_leaderboard")}</h1>
      <p className="muted">{t("leaderboard_body")}</p>

      {boards.length === 0 ? (
        <section className="card">
          <p className="small-text">{t("no_leaderboard")}</p>
        </section>
      ) : (
        <>
          <PageTabs
            tabs={tabs}
            active={board?.group_id || active}
            onChange={setActive}
            label={t("nav_classes")}
          />
          {board ? (
            <section className="card tab-panel">
              <h2 style={{ marginTop: 0 }}>{board.group_name}</h2>
              {board.rows.length === 0 ? (
                <p className="small-text">{t("no_scores")}</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("username")}</th>
                      <th>{t("points")}</th>
                      <th>{t("solved")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.rows.map((row, i) => (
                      <tr key={row.user_id}>
                        <td>{i + 1}</td>
                        <td className="font-mono">{row.username}</td>
                        <td>{row.points}</td>
                        <td>{row.solved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ) : null}
        </>
      )}
    </Shell>
  );
}
