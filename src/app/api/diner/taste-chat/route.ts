import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runTasteProfileAgent } from "@/lib/agents/taste-profile";
import { getLiveAuthenticatedUser } from "@/lib/auth/rbac";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const tasteChatSchema = z.object({
  message: z.string().trim().min(2).max(1200),
  locale: z.enum(["en", "ar"]).default("en"),
});

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req.headers);
  const rl = checkRateLimit({
    key: `ai:taste:${clientIp}`,
    limit: 12,
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

  const liveUser = await getLiveAuthenticatedUser();
  const result = await runTasteProfileAgent({
    message: parsed.data.message,
    locale: parsed.data.locale,
    userId: liveUser?.id,
  });

  if (!result.ok) {
    const status = result.reason === "AI_NOT_CONFIGURED" ? 503 : 422;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }

  return NextResponse.json(result.data);
}
