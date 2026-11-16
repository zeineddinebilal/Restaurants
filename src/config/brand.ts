/**
 * Single source of truth for application branding across English & Arabic UI,
 * PWA manifest, metadata, printable QR sheets, invoices, and notifications.
 *
 * Renaming the platform later only requires changing these defaults or setting
 * NEXT_PUBLIC_APP_NAME / NEXT_PUBLIC_APP_NAME_AR in the environment.
 */

export const BRAND = {
  nameEn: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "PlateFit",
  nameAr: process.env.NEXT_PUBLIC_APP_NAME_AR?.trim() || "بليت فيت",
  taglineEn: "Every restaurant menu, tailored safely to your diet, taste & budget.",
  taglineAr: "قائمة كل مطعم، مصممة بأمان لتناسب نظامك الغذائي وذوقك وميزانيتك.",
  currency: "AED",
  currencyAr: "د.إ",
  themeColor: "#d9532f",
  backgroundColorLight: "#fffaf5",
  backgroundColorDark: "#14110f",
} as const;

export function getBrandName(locale: "en" | "ar"): string {
  return locale === "ar" ? BRAND.nameAr : BRAND.nameEn;
}

export function getBrandTagline(locale: "en" | "ar"): string {
  return locale === "ar" ? BRAND.taglineAr : BRAND.taglineEn;
}
