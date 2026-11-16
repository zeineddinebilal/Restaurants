import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createGroupMealPlan } from "@/lib/diner/companions";
import { getActiveDinerProfile } from "@/lib/diner/profile";

const createPlanSchema = z.object({
  restaurantId: z.string().min(1),
  companionProfileIds: z.array(z.string().min(1)).max(12).default([]),
});

export async function POST(req: NextRequest) {
  const active = await getActiveDinerProfile();
  if (!active.isAuthenticated || !active.profile?.id) {
    return NextResponse.json(
      { error: "Sign in to plan a meal with Dining Companions." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const result = await createGroupMealPlan({
    hostProfileId: active.profile.id,
    companionProfileIds: parsed.data.companionProfileIds,
    restaurantId: parsed.data.restaurantId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ mealPlanId: result.mealPlanId }, { status: 201 });
}
