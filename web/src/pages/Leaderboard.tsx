import { useEffect, useState } from "react";
import { api, type LeaderboardBoard } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { toast } from "sonner";

export function LeaderboardPage({ role }: { role: "admin" | "student" }) {
  const { t } = useI18n();
  const [boards, setBoards] = useState<LeaderboardBoard[]>([]);

  useEffect(() => {
    void api
      .leaderboard()
      .then((data) => setBoards(data.boards ?? []))
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : "load failed"));
  }, []);

  return (
    <Shell role={role}>
      <h1>{t("nav_leaderboard")}</h1>
      <p className="muted">{t("leaderboard_body")}</p>
      {boards.length === 0 ? (
        <section className="card">
          <p className="small-text">{t("no_leaderboard")}</p>
        </section>
      ) : null}
      {boards.map((board) => (
        <section className="card" key={board.group_id} style={{ marginBottom: 18 }}>
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
      ))}
    </Shell>
  );
}
