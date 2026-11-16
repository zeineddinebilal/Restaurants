import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { runExternalMenuScannerAgent } from "@/lib/agents/external-scanner";
import {
  checkDailyAiQuota,
  MAX_AI_IMAGES,
  MAX_AI_TOTAL_IMAGE_BYTES,
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

export async function GET(req: NextRequest) {
  const activeDiner = await getActiveDinerProfile();
  const guestToken =
    activeDiner.guestToken ??
    verifySignedGuestCookieValue(req.cookies.get(GUEST_COOKIE_NAME)?.value);

  if (!activeDiner.profile?.id && !guestToken) {
    return NextResponse.json({ scans: [] });
  }

  const scans = await prisma.externalMenuScan.findMany({
    where: activeDiner.profile?.id
      ? { dinerProfileId: activeDiner.profile.id }
      : { guestToken: guestToken! },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    scans: scans.map((s) => ({
      id: s.id,
      sourceLabel: s.sourceLabel ?? "Menu Screenshot",
      dishes: Array.isArray(s.extractedMenu) ? s.extractedMenu : [],
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req.headers);
  const ipLimit = checkRateLimit({
    key: `ai:extscan:ip:${clientIp}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many external menu scans. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Upload 1 to 4 menu screenshot or photo files via multipart/form-data." },
      { status: 400 },
    );
  }

  const formData = await req.formData();
  const rawLabel = formData.get("sourceLabel");
  const customLabel =
    typeof rawLabel === "string" && rawLabel.trim().length > 0
      ? rawLabel.trim().slice(0, 120)
      : undefined;

  const entries = formData.getAll("files");
  const fileEntries = entries.filter((e): e is File => e instanceof File && e.size > 0);

  if (fileEntries.length === 0) {
    return NextResponse.json(
      { error: "Please select at least one screenshot or menu photo." },
      { status: 400 },
    );
  }

  if (fileEntries.length > MAX_AI_IMAGES) {
    return NextResponse.json(
      { error: `Upload at most ${MAX_AI_IMAGES} images per scan.` },
      { status: 400 },
    );
  }

  const preCheck = validateAiImagesPayload(
    fileEntries.map((f) => ({ mimeType: f.type, byteLength: f.size })),
  );
  if (!preCheck.ok) {
    return NextResponse.json({ error: preCheck.error }, { status: 400 });
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
      : `ip:${clientIp}`;

  const quota = checkDailyAiQuota({
    callerKey,
    perCallerDailyLimit: 20,
  });
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.reason }, { status: 429 });
  }

  let runningBytes = 0;
  const images: Array<{ mimeType: string; base64Data: string; byteLength: number }> = [];
  for (const file of fileEntries) {
    runningBytes += file.size;
    if (runningBytes > MAX_AI_TOTAL_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Total uploaded image size must not exceed 5 MB." },
        { status: 400 },
      );
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
  });

  if (!result.ok) {
    const status = result.reason === "AI_NOT_CONFIGURED" ? 503 : 422;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }

  const finalLabel = customLabel || result.data.sourceLabel || "Menu Screenshot";
  const saved = await prisma.externalMenuScan.create({
    data: {
      dinerProfileId: activeDiner.profile?.id ?? null,
      guestToken: activeDiner.isAuthenticated ? null : guestToken,
      sourceLabel: finalLabel,
      extractedMenu: result.data.dishes as unknown as Prisma.InputJsonValue,
    },
  });

  const res = NextResponse.json({
    scan: {
      id: saved.id,
      sourceLabel: finalLabel,
      dishes: result.data.dishes,
      createdAt: saved.createdAt.toISOString(),
    },
  });

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
