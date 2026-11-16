import { cookies } from "next/headers";
import {
  ExternalScannerClient,
  type SavedExternalScan,
} from "@/app/(diner)/external-scan/ExternalScannerClient";
import { GUEST_COOKIE_NAME, verifySignedGuestCookieValue } from "@/lib/auth/guest";
import { prisma } from "@/lib/db";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import type { EngineDishInput } from "@/lib/engine/menu-engine";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ExternalScanPage({
  searchParams,
}: {
  searchParams: Promise<{ scanId?: string; shareError?: string }>;
}) {
  const [sp, cookieStore, { locale }, activeDiner] = await Promise.all([
    searchParams,
    cookies(),
    getI18nContext(),
    getActiveDinerProfile(),
  ]);

  const guestToken =
    activeDiner.guestToken ??
    verifySignedGuestCookieValue(cookieStore.get(GUEST_COOKIE_NAME)?.value);

  const dbScans =
    activeDiner.profile?.id || guestToken
      ? await prisma.externalMenuScan.findMany({
          where: activeDiner.profile?.id
            ? { dinerProfileId: activeDiner.profile.id }
            : { guestToken: guestToken! },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : [];

  const initialScans: SavedExternalScan[] = dbScans.map((s) => ({
    id: s.id,
    sourceLabel: s.sourceLabel ?? "Menu Screenshot",
    dishes: (Array.isArray(s.extractedMenu) ? s.extractedMenu : []) as unknown as EngineDishInput[],
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <ExternalScannerClient
      locale={locale}
      initialProfile={activeDiner.profile}
      initialScans={initialScans}
      initialScanId={sp.scanId}
      initialShareError={sp.shareError}
    />
  );
}
