import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const TABLE_ACCESS_COOKIE_NAME = "pf_table_access";

function getSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production.");
  }
  return "dev-only-fallback-guest-signing-secret-32chars";
}

function signPayload(payload: string, secret = getSecret()): string {
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyPayload(signed: string | undefined | null, secret = getSecret()): string | null {
  if (!signed) return null;
  const lastDot = signed.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = signed.slice(0, lastDot);
  const sig = signed.slice(lastDot + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? payload : null;
}

export function encodeSignedSessionList(sessionIds: readonly string[], secret?: string): string {
  const unique = Array.from(new Set(sessionIds.filter((id) => /^[a-zA-Z0-9_-]+$/.test(id)))).slice(
    -10,
  );
  return signPayload(unique.join(","), secret);
}

export function decodeSignedSessionList(
  cookieValue: string | undefined | null,
  secret?: string,
): string[] {
  const raw = verifyPayload(cookieValue, secret);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getAuthorizedTableSessionIdsFromCookie(): Promise<Set<string>> {
  const store = await cookies();
  const raw = store.get(TABLE_ACCESS_COOKIE_NAME)?.value;
  return new Set(decodeSignedSessionList(raw));
}

export function isTableSessionExpired(
  lastActivityAt: Date,
  ttlHours: number,
  nowMs = Date.now(),
): boolean {
  const safeTtlHours = Math.max(1, ttlHours);
  return nowMs - lastActivityAt.getTime() > safeTtlHours * 60 * 60 * 1000;
}

/**
 * Resolves the active `OPEN` TableSession for `tableId`, auto-closing any stale session
 * that exceeded `tableSessionTtlHours` of inactivity, or creating a new one if none exists.
 */
export async function getOrCreateOpenTableSession(params: {
  restaurantId: string;
  tableId: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const settings = await prisma.platformSetting.findUnique({ where: { id: "default" } });
  const envTtl = Number(process.env.TABLE_SESSION_TTL_HOURS || "4");
  const ttlHours =
    settings?.tableSessionTtlHours ?? (Number.isFinite(envTtl) && envTtl > 0 ? envTtl : 4);

  const openSessions = await prisma.tableSession.findMany({
    where: {
      restaurantId: params.restaurantId,
      tableId: params.tableId,
      status: "OPEN",
    },
    orderBy: { lastActivityAt: "desc" },
  });

  const freshest = openSessions[0];
  if (freshest && !isTableSessionExpired(freshest.lastActivityAt, ttlHours, now.getTime())) {
    // Close any duplicate stray open sessions if any existed
    if (openSessions.length > 1) {
      await prisma.tableSession.updateMany({
        where: {
          id: { in: openSessions.slice(1).map((s) => s.id) },
        },
        data: { status: "CLOSED", closedAt: now },
      });
    }
    return prisma.tableSession.update({
      where: { id: freshest.id },
      data: { lastActivityAt: now },
    });
  }

  // Close all expired open sessions on this table so the new group starts fresh
  if (openSessions.length > 0) {
    await prisma.tableSession.updateMany({
      where: { id: { in: openSessions.map((s) => s.id) } },
      data: { status: "CLOSED", closedAt: now },
    });
  }

  const shareCode = crypto.randomBytes(12).toString("base64url");
  return prisma.tableSession.create({
    data: {
      restaurantId: params.restaurantId,
      tableId: params.tableId,
      status: "OPEN",
      shareCode,
      lastActivityAt: now,
    },
  });
}

/**
 * Formats a concise, kitchen-friendly dietary & modifier safety note for an order item
 * so restaurant staff immediately see critical allergy/diet requirements.
 */
export function buildKitchenDietarySafetyNote(params: {
  participantName: string | null;
  allergens: readonly string[];
  dietaryRestrictions: readonly string[];
  selectedModifierNamesEn: readonly string[];
  manualNote?: string | null;
}): string | null {
  const parts: string[] = [];
  const who = params.participantName?.trim() || "Shared Table";

  const restrictionLabels: string[] = [];
  for (const a of params.allergens) {
    restrictionLabels.push(`no ${a.replace(/_/g, " ")}`);
  }
  for (const d of params.dietaryRestrictions) {
    restrictionLabels.push(d);
  }

  if (restrictionLabels.length > 0) {
    const modSuffix =
      params.selectedModifierNamesEn.length > 0
        ? ` — modifier '${params.selectedModifierNamesEn.join(", ")}' selected`
        : "";
    parts.push(`${who}: ${restrictionLabels.join(", ")}${modSuffix}`);
  }

  if (params.manualNote?.trim()) {
    parts.push(params.manualNote.trim());
  }

  return parts.length > 0 ? parts.join(" | ").slice(0, 400) : null;
}
