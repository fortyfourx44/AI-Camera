import { cookies } from "next/headers";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  dict,
  interpolate,
  isLocale,
  type Locale,
  type MessageKey,
} from "./i18n";

/** Read the locale from the request cookie (server components / route handlers only). */
export async function getServerLocale(): Promise<Locale> {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

/** Get a server-side t() function for the current request. */
export async function getServerT() {
  const locale = await getServerLocale();
  const messages = dict(locale);
  return {
    locale,
    t: (key: MessageKey, vars?: Record<string, string | number>) => {
      const template = messages[key] ?? key;
      return vars ? interpolate(template, vars) : template;
    },
  };
}
