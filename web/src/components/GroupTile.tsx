import { Link } from "react-router-dom";
import { Users, Workflow } from "lucide-react";
import { toast } from "sonner";
import type { Group } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/i18n";

export function GroupTile({
  group,
  to,
  action,
}: {
  group: Group;
  to: string;
  action?: React.ReactNode;
}) {
  const { t } = useI18n();

  const copyCode = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await copyText(group.join_code);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copy_failed"));
    }
  };

  return (
    <Link to={to} className="tile-card tile-link group-tile">
      <div className="row" style={{ marginBottom: 8 }}>
        <strong>{group.name}</strong>
        {action}
      </div>
      <div className="tile-meta">
        <span>
          <Users size={14} /> {group.member_ids.length} {t("members")}
        </span>
        <span>
          <Workflow size={14} /> {group.challenge_ids.length} {t("assigned_labs")}
        </span>
      </div>
      <div className="group-tile-code">
        <span className="small-text">{t("join_code")}</span>
        <code
          className="font-mono code-copy"
          title={t("copy")}
          onClick={(e) => void copyCode(e)}
        >
          {group.join_code}
        </code>
      </div>
    </Link>
  );
}
