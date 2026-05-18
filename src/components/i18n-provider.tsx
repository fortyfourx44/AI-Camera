"use client";

import * as React from "react";
import {
  dict,
  interpolate,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";

interface I18nContextValue {
  locale: Locale;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  setLocale: (next: Locale) => void;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale: initialLocale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale);

  const value = React.useMemo<I18nContextValue>(() => {
    const messages = dict(locale);
    return {
      locale,
      t: (key, vars) => {
        const template = messages[key] ?? key;
        return vars ? interpolate(template, vars) : template;
      },
      setLocale: (next) => {
        setLocaleState(next);
        document.cookie = `ai_ip_cam_locale=${next}; path=/; max-age=31536000; samesite=lax`;
        // Full reload so <html lang/dir> re-renders cleanly with the right direction.
        window.location.reload();
      },
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

/** Convenience hook that returns just the t() function. */
export function useT() {
  return useI18n().t;
}
