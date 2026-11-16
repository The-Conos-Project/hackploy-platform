import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n";
import type { Lang } from "@/i18n/messages";

const LABELS: Record<Lang, string> = {
  uz: "Oʻzbekcha",
  en: "English",
};

const FLAGS: Record<Lang, string> = {
  uz: "🇺🇿",
  en: "🇬🇧",
};

type Pos = { top?: number; bottom?: number; left?: number; right?: number };

export function LangSwitch({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const place = () => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuH = 120;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < menuH + 12;

    const menuW = 176;
    if (compact) {
      // Compact: park a fixed-width menu to the right of the rail
      const left = Math.min(r.right + 8, window.innerWidth - menuW - 8);
      setPos({
        ...(openUp ? { bottom: window.innerHeight - r.bottom + 6 } : { top: r.top }),
        left: Math.max(8, left),
      });
      return;
    }

    setPos({
      ...(openUp
        ? { bottom: window.innerHeight - r.top + 8 }
        : { top: r.bottom + 8 }),
      right: Math.max(8, window.innerWidth - r.right),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, compact]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const node = event.target as Node;
      if (rootRef.current?.contains(node) || menuRef.current?.contains(node)) return;
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
  }, [open, compact]);

  return (
    <div
      ref={rootRef}
      className={`lang-dropdown${compact ? " is-compact" : ""} ${className}`.trim()}
    >
      <button
        type="button"
        className={`lang-trigger${compact ? " is-compact" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={t("language")}
        title={LABELS[lang]}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="lang-flag" aria-hidden>
          {FLAGS[lang]}
        </span>
        {!compact ? <span className="lang-code">{lang.toUpperCase()}</span> : null}
        {!compact ? (
          <ChevronDown size={14} aria-hidden className={open ? "chev open" : "chev"} />
        ) : null}
      </button>
      {open && pos
        ? createPortal(
            <ul
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={t("language")}
              className="lang-menu lang-menu-portal"
              style={{
                top: pos.top,
                bottom: pos.bottom,
                left: pos.left,
                right: pos.right ?? "auto",
                width: compact ? 176 : undefined,
              }}
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
                    <span className="lang-flag" aria-hidden>
                      {FLAGS[code]}
                    </span>
                    <span>{LABELS[code]}</span>
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
