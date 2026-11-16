import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSignedGuestCookieValue,
  GUEST_COOKIE_NAME,
  verifySignedGuestCookieValue,
} from "@/lib/auth/guest";
import { getLiveAuthenticatedUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import { normalizeAllergenList, normalizeDietTagList, SPICE_LEVELS } from "@/lib/menu/taxonomy";
import { aedToFils, filsToAedString } from "@/lib/money";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const upsertProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(60).default("Guest Diner"),
  dietaryRestrictions: z.array(z.string()).default([]),
  allergens: z.array(z.string()).default([]),
  likedIngredients: z.array(z.string().trim().min(1).max(50)).max(25).default([]),
  dislikedIngredients: z.array(z.string().trim().min(1).max(50)).max(25).default([]),
  favoriteCuisines: z.array(z.string().trim().min(1).max(50)).max(15).default([]),
  spiceTolerance: z.enum(SPICE_LEVELS).default("MEDIUM"),
  maxBudgetAed: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((val) => {
      if (!val) return null;
      const fils = aedToFils(val);
      if (fils <= 0) return null;
      return filsToAedString(fils);
    }),
  preferHighProtein: z.boolean().default(false),
  preferKeto: z.boolean().default(false),
});

export async function GET() {
  const data = await getActiveDinerProfile();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req.headers);
  const rl = checkRateLimit({
    key: `diner:profile:${clientIp}`,
    limit: 30,
    windowMs: 5 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many profile updates. Try again shortly." },
      { status: 429 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  let parsed: z.infer<typeof upsertProfileSchema>;
  try {
    const result = upsertProfileSchema.safeParse(rawBody);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid monetary budget value" },
      { status: 400 },
    );
  }

  const normalizedAllergens = normalizeAllergenList(parsed.allergens);
  const normalizedDiets = normalizeDietTagList(parsed.dietaryRestrictions).filter(
    (d) => d === "vegetarian" || d === "vegan" || d === "pescatarian" || d === "halal",
  );

  const liveUser = await getLiveAuthenticatedUser();
  let newlySignedGuestCookie: string | null = null;

  if (liveUser) {
    const saved = await prisma.dinerProfile.upsert({
      where: { userId: liveUser.id },
      update: {
        displayName: parsed.displayName,
        dietaryRestrictions: normalizedDiets,
        allergens: normalizedAllergens,
        likedIngredients: parsed.likedIngredients,
        dislikedIngredients: parsed.dislikedIngredients,
        favoriteCuisines: parsed.favoriteCuisines,
        spiceTolerance: parsed.spiceTolerance,
        maxBudgetAed: parsed.maxBudgetAed,
        preferHighProtein: parsed.preferHighProtein,
        preferKeto: parsed.preferKeto,
      },
      create: {
        userId: liveUser.id,
        displayName: parsed.displayName,
        dietaryRestrictions: normalizedDiets,
        allergens: normalizedAllergens,
        likedIngredients: parsed.likedIngredients,
        dislikedIngredients: parsed.dislikedIngredients,
        favoriteCuisines: parsed.favoriteCuisines,
        spiceTolerance: parsed.spiceTolerance,
        maxBudgetAed: parsed.maxBudgetAed,
        preferHighProtein: parsed.preferHighProtein,
        preferKeto: parsed.preferKeto,
      },
    });

    return NextResponse.json({
      profile: {
        ...saved,
        maxBudgetAed: saved.maxBudgetAed ? saved.maxBudgetAed.toFixed(2) : null,
      },
    });
  }

  // Guest Mode: reuse verified guest cookie or mint a new signed guest cookie
  const rawCookie = req.cookies.get(GUEST_COOKIE_NAME)?.value;
  let guestToken = verifySignedGuestCookieValue(rawCookie);
  if (!guestToken) {
    newlySignedGuestCookie = createSignedGuestCookieValue();
    guestToken = verifySignedGuestCookieValue(newlySignedGuestCookie)!;
  }

  const savedGuest = await prisma.dinerProfile.upsert({
    where: { guestToken },
    update: {
      displayName: parsed.displayName,
      dietaryRestrictions: normalizedDiets,
      allergens: normalizedAllergens,
      likedIngredients: parsed.likedIngredients,
      dislikedIngredients: parsed.dislikedIngredients,
      favoriteCuisines: parsed.favoriteCuisines,
      spiceTolerance: parsed.spiceTolerance,
      maxBudgetAed: parsed.maxBudgetAed,
      preferHighProtein: parsed.preferHighProtein,
      preferKeto: parsed.preferKeto,
    },
    create: {
      guestToken,
      displayName: parsed.displayName,
      dietaryRestrictions: normalizedDiets,
      allergens: normalizedAllergens,
      likedIngredients: parsed.likedIngredients,
      dislikedIngredients: parsed.dislikedIngredients,
      favoriteCuisines: parsed.favoriteCuisines,
      spiceTolerance: parsed.spiceTolerance,
      maxBudgetAed: parsed.maxBudgetAed,
      preferHighProtein: parsed.preferHighProtein,
      preferKeto: parsed.preferKeto,
    },
  });

  const res = NextResponse.json({
    profile: {
      ...savedGuest,
      maxBudgetAed: savedGuest.maxBudgetAed ? savedGuest.maxBudgetAed.toFixed(2) : null,
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
