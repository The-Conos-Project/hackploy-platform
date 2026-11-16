import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n";
import type { Lang } from "@/i18n/messages";

const LABELS: Record<Lang, string> = {
  uz: "Oʻzbekcha",
  en: "English",
};

export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const place = () => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.bottom + 8,
      right: Math.max(8, window.innerWidth - r.right),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const t = event.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onScroll = () => place();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`lang-dropdown ${className}`.trim()}>
      <button
        type="button"
        className="lang-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={t("language")}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{lang.toUpperCase()}</span>
        <ChevronDown size={14} aria-hidden className={open ? "chev open" : "chev"} />
      </button>
      {open && pos
        ? createPortal(
            <ul
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={t("language")}
              className="lang-menu lang-menu-portal"
              style={{ top: pos.top, right: pos.right }}
            >
              {(["uz", "en"] as const).map((code) => (
                <li key={code} role="option" aria-selected={lang === code}>
                  <button
                    type="button"
                    className={lang === code ? "lang-option active" : "lang-option"}
                    onClick={() => {
                      setLang(code);
                      setOpen(false);
                    }}
                  >
                    {LABELS[code]}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
