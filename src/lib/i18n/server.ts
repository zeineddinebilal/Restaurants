import { cookies } from "next/headers";
import { getDictionary, getDirection, isLocale, type Locale } from "@/lib/i18n/dictionaries";

export const LOCALE_COOKIE_NAME = "pf_locale";

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (isLocale(raw)) {
    return raw;
  }
  return "en";
}

export async function getI18nContext() {
  const locale = await getRequestLocale();
  const dir = getDirection(locale);
  const dict = getDictionary(locale);
  return { locale, dir, dict };
}
