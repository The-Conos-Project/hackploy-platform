import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n();
  const [ok, setOk] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setOk(true);
      toast.success(t("copied"));
      window.setTimeout(() => setOk(false), 1200);
    } catch {
      toast.error(t("copy_failed"));
    }
  };

  return (
    <button type="button" className="copy-btn secondary" onClick={() => void onCopy()} title={label || t("copy")}>
      {ok ? <Check size={14} /> : <Copy size={14} />}
      <span>{ok ? t("copied") : label || t("copy")}</span>
    </button>
  );
}
