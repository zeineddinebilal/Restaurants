import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PrintSheetButton } from "@/app/(restaurant)/dashboard/tables/print/PrintSheetButton";
import { BRAND } from "@/config/brand";
import { requirePageRole } from "@/lib/auth/rbac";
import { getI18nContext } from "@/lib/i18n/server";
import { buildTableQrUrl, generateQrCodeSvg } from "@/lib/qr";
import { loadManagedRestaurants } from "@/lib/restaurant/loader";

export default async function PrintableQrSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurantId?: string }>;
}) {
  const [user, { locale }, hdrs, sp] = await Promise.all([
    requirePageRole(["RESTAURANT_OWNER", "ADMIN"]),
    getI18nContext(),
    headers(),
    searchParams,
  ]);

  const { activeRestaurant } = await loadManagedRestaurants(user, sp.restaurantId);
  if (!activeRestaurant) {
    redirect("/dashboard");
  }

  const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || `${proto}://${host}`;

  const activeTables = activeRestaurant.tables.filter((t) => t.isActive);
  const cards = await Promise.all(
    activeTables.map(async (t) => {
      const url = buildTableQrUrl(origin, activeRestaurant.slug, t.tableCode);
      const svg = await generateQrCodeSvg(url);
      return {
        id: t.id,
        tableCode: t.tableCode,
        displayName: t.displayName,
        url,
        svg,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/dashboard/tables?restaurantId=${encodeURIComponent(activeRestaurant.id)}`}
          className="text-sm font-semibold text-[var(--accent-primary)] underline"
        >
          {locale === "ar" ? "← العودة لإدارة الطاولات" : "← Back to Tables & QR Codes"}
        </Link>
        <PrintSheetButton
          label={locale === "ar" ? "طباعة أو حفظ كملف PDF" : "Print / Save as PDF"}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 print:grid-cols-2 print:gap-4">
        {cards.map((card) => (
          <div
            key={card.id}
            className="flex flex-col items-center rounded-3xl border-2 border-[#1f1916] bg-white p-6 text-center text-[#1f1916] break-inside-avoid"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-[#d9532f]">
              {activeRestaurant.nameEn} • {activeRestaurant.nameAr}
            </p>
            <h2 className="mt-1 text-xl font-extrabold">{card.displayName}</h2>
            <span className="mt-1 rounded-full bg-[#fdebe5] px-3 py-0.5 font-mono text-xs font-bold text-[#d9532f]">
              Table {card.tableCode}
            </span>

            <div
              className="my-4 flex h-48 w-48 items-center justify-center"
              dangerouslySetInnerHTML={{ __html: card.svg }}
            />

            <p className="text-sm font-bold">Scan for your personalized allergen-safe menu</p>
            <p className="mt-0.5 text-sm font-bold" dir="rtl">
              امسح الرمز لعرض القائمة المخصصة لنظامك الغذائي وميزانيتك
            </p>
            <p className="mt-3 text-[11px] font-medium text-neutral-500">
              Powered by {BRAND.nameEn} ({BRAND.nameAr})
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
