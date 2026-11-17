import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LANG,
  LANG_COOKIE,
  messages,
  type Lang,
  type MessageKey,
} from "./messages";

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function readLang(): Lang {
  const fromCookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LANG_COOKIE}=`))
    ?.split("=")[1];
  if (fromCookie === "uz" || fromCookie === "en") return fromCookie;
  const stored = localStorage.getItem(LANG_COOKIE);
  if (stored === "uz" || stored === "en") return stored;
  return DEFAULT_LANG;
}

function persistLang(lang: Lang) {
  localStorage.setItem(LANG_COOKIE, lang);
  document.cookie = `${LANG_COOKIE}=${lang};path=/;max-age=${365 * 24 * 3600};samesite=lax`;
  document.documentElement.lang = lang;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const initial = readLang();
    document.documentElement.lang = initial;
    return initial;
  });

  const setLang = useCallback((next: Lang) => {
    persistLang(next);
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: MessageKey) => messages[lang][key] ?? messages.en[key] ?? key,
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside provider");
  return ctx;
}
