import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { httpStatusForAgentError } from "@/lib/agents/gemini";
import { runTasteProfileAgent } from "@/lib/agents/taste-profile";
import { getVerifiedGuestToken } from "@/lib/auth/guest";
import { getLiveAuthenticatedUser } from "@/lib/auth/rbac";
import { parseFreeTextProfileFallback } from "@/lib/menu/ingredient-synonyms";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const tasteChatSchema = z.object({
  message: z.string().trim().min(2).max(1600),
  locale: z.enum(["en", "ar"]).default("en"),
  otherDietText: z.string().trim().max(300).optional(),
  otherAllergyText: z.string().trim().max(400).optional(),
  freePreferencesText: z.string().trim().max(600).optional(),
  allowFallback: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req.headers);
  const rl = checkRateLimit({
    key: `ai:taste:${clientIp}`,
    limit: 15,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many AI chat messages. Please use the quick-pick chips or wait a moment." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = tasteChatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a valid message." }, { status: 400 });
  }

  const [liveUser, guestToken] = await Promise.all([
    getLiveAuthenticatedUser(),
    getVerifiedGuestToken(),
  ]);
  const callerKey = liveUser ? `user:${liveUser.id}` : guestToken ? `guest:${guestToken}` : null;

  const result = await runTasteProfileAgent({
    message: parsed.data.message,
    locale: parsed.data.locale,
    userId: liveUser?.id,
    callerKey,
    clientIp,
  });

  if (!result.ok) {
    if (result.reason === "AI_NOT_CONFIGURED" && parsed.data.allowFallback) {
      const fb = parseFreeTextProfileFallback({
        otherDietText: parsed.data.otherDietText,
        otherAllergyText: parsed.data.otherAllergyText,
        freePreferencesText: parsed.data.freePreferencesText || parsed.data.message,
      });
      return NextResponse.json({
        reply:
          parsed.data.locale === "ar"
            ? "تم تفسير ملاحظاتك النصية محلياً — راجعها وأكّدها قبل الحفظ."
            : "Interpreted your notes using deterministic matching — please review & confirm before saving.",
        patch: {
          dietaryRestrictions: fb.dietaryRestrictions,
          allergens: fb.allergens,
          customAvoidIngredients: fb.customAvoidIngredients,
          likedIngredients: fb.likedIngredients,
          dislikedIngredients: fb.dislikedIngredients,
          favoriteCuisines: [],
        },
        usedFallback: true,
      });
    }

    const status = httpStatusForAgentError(result.reason);
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }

  return NextResponse.json(result.data);
}
