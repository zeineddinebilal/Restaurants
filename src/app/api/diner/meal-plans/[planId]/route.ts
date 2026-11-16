import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  loadMealPlanViewForMember,
  plannedCartItemSchema,
  updateMealPlanMemberItems,
} from "@/lib/diner/companions";
import { getActiveDinerProfile } from "@/lib/diner/profile";

const patchPlanSchema = z.object({
  targetProfileId: z.string().min(1),
  plannedItems: z.array(plannedCartItemSchema).max(30),
});

export async function GET(_req: NextRequest, context: { params: Promise<{ planId: string }> }) {
  const active = await getActiveDinerProfile();
  if (!active.isAuthenticated || !active.profile?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { planId } = await context.params;
  const view = await loadMealPlanViewForMember({
    mealPlanId: planId,
    viewerProfileId: active.profile.id,
  });

  if (!view) {
    return NextResponse.json({ error: "Meal plan not found" }, { status: 404 });
  }

  return NextResponse.json({ plan: view });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ planId: string }> }) {
  const active = await getActiveDinerProfile();
  if (!active.isAuthenticated || !active.profile?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { planId } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = patchPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const res = await updateMealPlanMemberItems({
    mealPlanId: planId,
    actorProfileId: active.profile.id,
    targetProfileId: parsed.data.targetProfileId,
    plannedItems: parsed.data.plannedItems,
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }

  return NextResponse.json({ ok: true });
}
