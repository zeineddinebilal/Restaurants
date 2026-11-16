import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runDishTaggingAgent } from "@/lib/agents/dish-tagging";
import { checkDailyAiQuota } from "@/lib/agents/guardrails";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { requireRestaurantOwnerApi } from "@/lib/restaurant/access";

const tagRequestSchema = z.object({
  dishes: z
    .array(
      z.object({
        nameEn: z.string().trim().min(1).max(160),
        nameAr: z.string().trim().max(160).optional(),
        descriptionEn: z.string().trim().max(600).optional(),
        ingredientsEn: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const access = await requireRestaurantOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  const clientIp = getClientIp(req.headers);
  const ipLimit = checkRateLimit({
    key: `ai:tag:ip:${clientIp}`,
    limit: 15,
    windowMs: 10 * 60 * 1000,
  });
  const userLimit = checkRateLimit({
    key: `ai:tag:user:${access.user.id}`,
    limit: 15,
    windowMs: 10 * 60 * 1000,
  });
  if (!ipLimit.allowed || !userLimit.allowed) {
    return NextResponse.json(
      { error: "AI tagging rate limit reached. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const quota = checkDailyAiQuota({
    callerKey: `user:${access.user.id}`,
    restaurantId,
  });
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.reason }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = tagRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const result = await runDishTaggingAgent({
    dishes: parsed.data.dishes,
    restaurantId,
    userId: access.user.id,
  });

  if (!result.ok) {
    const status = result.reason === "AI_NOT_CONFIGURED" ? 503 : 422;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }

  return NextResponse.json({ items: result.data.items });
}
