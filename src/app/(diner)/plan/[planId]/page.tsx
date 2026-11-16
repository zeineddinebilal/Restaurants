import { notFound, redirect } from "next/navigation";
import { MealPlanClient } from "@/app/(diner)/plan/[planId]/MealPlanClient";
import { loadMealPlanViewForMember } from "@/lib/diner/companions";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function GroupMealPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const [{ planId }, { locale }, activeDiner] = await Promise.all([
    params,
    getI18nContext(),
    getActiveDinerProfile(),
  ]);

  if (!activeDiner.isAuthenticated || !activeDiner.profile?.id) {
    redirect(`/login?returnTo=${encodeURIComponent(`/plan/${planId}`)}`);
  }

  const planView = await loadMealPlanViewForMember({
    mealPlanId: planId,
    viewerProfileId: activeDiner.profile.id,
  });

  if (!planView) {
    notFound();
  }

  return <MealPlanClient locale={locale} initialPlan={planView} />;
}
