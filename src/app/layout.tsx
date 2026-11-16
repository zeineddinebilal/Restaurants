import type { Metadata, Viewport } from "next";
import { BRAND, getBrandName, getBrandTagline } from "@/config/brand";
import { Navbar } from "@/components/Navbar";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { auth } from "@/lib/auth/config";
import { getI18nContext } from "@/lib/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18nContext();
  return {
    title: {
      default: getBrandName(locale),
      template: `%s | ${getBrandName(locale)}`,
    },
    description: getBrandTagline(locale),
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: BRAND.nameEn,
    },
    icons: {
      icon: "/icons/icon-192.png",
      apple: "/icons/apple-touch-icon.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: BRAND.themeColor,
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [{ locale, dir, dict }, session] = await Promise.all([getI18nContext(), auth()]);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
        <PwaRegistrar />
        <Navbar locale={locale} dict={dict} user={session?.user ?? null} />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
