import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { httpStatusForAgentError } from "@/lib/agents/gemini";
import { resolveTasteChatWithFallback } from "@/lib/agents/taste-profile";
import { getVerifiedGuestToken } from "@/lib/auth/guest";
import { getLiveAuthenticatedUser } from "@/lib/auth/rbac";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const tasteChatSchema = z.object({
  message: z.string().trim().min(2).max(1600),
  locale: z.enum(["en", "ar"]).default("en"),
  otherDietText: z.string().trim().max(300).optional(),
  otherAllergyText: z.string().trim().max(400).optional(),
  freePreferencesText: z.string().trim().max(600).optional(),
  allowFallback: z.boolean().default(true),
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

  const resolved = await resolveTasteChatWithFallback({
    message: parsed.data.message,
    locale: parsed.data.locale,
    otherDietText: parsed.data.otherDietText,
    otherAllergyText: parsed.data.otherAllergyText,
    freePreferencesText: parsed.data.freePreferencesText,
    allowFallback: parsed.data.allowFallback,
    userId: liveUser?.id,
    callerKey,
    clientIp,
  });

  if (!resolved.ok) {
    const status = httpStatusForAgentError(resolved.reason);
    return NextResponse.json({ error: resolved.safeError, reason: resolved.reason }, { status });
  }

  return NextResponse.json({
    reply: resolved.reply,
    patch: resolved.patch,
    usedFallback: resolved.usedFallback,
  });
}
