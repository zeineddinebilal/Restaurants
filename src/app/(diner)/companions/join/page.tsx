import { JoinCompanionClient } from "@/app/(diner)/companions/join/JoinCompanionClient";
import { lookupValidCompanionInvite } from "@/lib/diner/companions";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function JoinCompanionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const [sp, { locale }, activeDiner] = await Promise.all([
    searchParams,
    getI18nContext(),
    getActiveDinerProfile(),
  ]);

  const code = (sp.code ?? "").trim().toUpperCase();
  const validInvite = await lookupValidCompanionInvite(code);

  return (
    <JoinCompanionClient
      locale={locale}
      isAuthenticated={activeDiner.isAuthenticated}
      code={code}
      inviterName={validInvite?.inviterProfile.displayName ?? null}
    />
  );
}
