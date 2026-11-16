import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { runExternalMenuScannerAgent } from "@/lib/agents/external-scanner";
import {
  MAX_AI_IMAGES,
  MAX_AI_TOTAL_IMAGE_BYTES,
  peekDailyAiQuota,
  validateAiImagesPayload,
} from "@/lib/agents/guardrails";
import {
  createSignedGuestCookieValue,
  GUEST_COOKIE_NAME,
  verifySignedGuestCookieValue,
} from "@/lib/auth/guest";
import { prisma } from "@/lib/db";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function redirectToScanner(req: NextRequest, query: Record<string, string>) {
  const url = new URL("/external-scan", req.url);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url, 303);
}

/**
 * Web Share Target receiver (`POST /api/diner/external-scan/share`)
 * Accepts screenshots shared directly from the phone's OS share sheet (no scraping / unofficial APIs).
 */
export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req.headers);
  const ipLimit = checkRateLimit({
    key: `ai:extscan:ip:${clientIp}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!ipLimit.allowed) {
    return redirectToScanner(req, { shareError: "rate_limited" });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return redirectToScanner(req, { shareError: "invalid_upload" });
  }

  const rawTitle = formData.get("title");
  const customLabel =
    typeof rawTitle === "string" && rawTitle.trim().length > 0
      ? rawTitle.trim().slice(0, 120)
      : "Shared Screenshot";

  const entries = formData.getAll("files");
  const fileEntries = entries
    .filter((e): e is File => e instanceof File && e.size > 0)
    .slice(0, MAX_AI_IMAGES);

  const preCheck = validateAiImagesPayload(
    fileEntries.map((f) => ({ mimeType: f.type, byteLength: f.size })),
  );
  if (!preCheck.ok) {
    return redirectToScanner(req, { shareError: "invalid_upload" });
  }

  const activeDiner = await getActiveDinerProfile();
  let newlySignedGuestCookie: string | null = null;
  let guestToken =
    activeDiner.guestToken ??
    verifySignedGuestCookieValue(req.cookies.get(GUEST_COOKIE_NAME)?.value);

  if (!activeDiner.isAuthenticated && !guestToken) {
    newlySignedGuestCookie = createSignedGuestCookieValue();
    guestToken = verifySignedGuestCookieValue(newlySignedGuestCookie)!;
  }

  const callerKey = activeDiner.userId
    ? `user:${activeDiner.userId}`
    : guestToken
      ? `guest:${guestToken}`
      : null;

  const quota = await peekDailyAiQuota({ callerKey, clientIp });
  if (!quota.allowed) {
    return redirectToScanner(req, { shareError: "daily_limit" });
  }

  let runningBytes = 0;
  const images: Array<{ mimeType: string; base64Data: string; byteLength: number }> = [];
  for (const file of fileEntries) {
    runningBytes += file.size;
    if (runningBytes > MAX_AI_TOTAL_IMAGE_BYTES) {
      return redirectToScanner(req, { shareError: "too_large" });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    images.push({
      mimeType: file.type,
      base64Data: buf.toString("base64"),
      byteLength: buf.byteLength,
    });
  }

  const result = await runExternalMenuScannerAgent({
    images,
    userId: activeDiner.userId,
    callerKey,
    clientIp,
  });

  if (!result.ok) {
    return redirectToScanner(req, {
      shareError:
        result.reason === "AI_NOT_CONFIGURED"
          ? "ai_not_configured"
          : result.reason === "AI_QUOTA_EXCEEDED"
            ? "daily_limit"
            : "scan_failed",
    });
  }

  const saved = await prisma.externalMenuScan.create({
    data: {
      dinerProfileId: activeDiner.profile?.id ?? null,
      guestToken: activeDiner.isAuthenticated ? null : guestToken,
      sourceLabel: customLabel || result.data.sourceLabel,
      extractedMenu: result.data.dishes as unknown as Prisma.InputJsonValue,
    },
  });

  const res = redirectToScanner(req, { scanId: saved.id });
  if (newlySignedGuestCookie) {
    res.cookies.set(GUEST_COOKIE_NAME, newlySignedGuestCookie, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    });
  }
  return res;
}
