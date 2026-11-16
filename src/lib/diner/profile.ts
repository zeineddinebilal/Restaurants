import type { SpiceLevel } from "@prisma/client";
import { getVerifiedGuestToken } from "@/lib/auth/guest";
import { getLiveAuthenticatedUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";

export interface SerializedDinerProfile {
  id?: string;
  isGuest: boolean;
  displayName: string;
  dietaryRestrictions: string[];
  allergens: string[];
  likedIngredients: string[];
  dislikedIngredients: string[];
  favoriteCuisines: string[];
  spiceTolerance: SpiceLevel;
  maxBudgetAed: string | null;
  preferHighProtein: boolean;
  preferKeto: boolean;
  pastRatingsByDishId: Record<string, number>;
}

export async function getActiveDinerProfile(): Promise<{
  profile: SerializedDinerProfile | null;
  isAuthenticated: boolean;
  userId?: string;
  guestToken?: string;
}> {
  const liveUser = await getLiveAuthenticatedUser();

  if (liveUser) {
    let dbProfile = await prisma.dinerProfile.findUnique({
      where: { userId: liveUser.id },
      include: {
        ratings: {
          orderBy: { createdAt: "desc" },
          take: 100,
        },
      },
    });

    if (!dbProfile) {
      dbProfile = await prisma.dinerProfile.create({
        data: {
          userId: liveUser.id,
          displayName: liveUser.name || "Diner",
        },
        include: { ratings: true },
      });
    }

    const pastRatingsByDishId: Record<string, number> = {};
    for (const r of dbProfile.ratings) {
      if (pastRatingsByDishId[r.menuItemId] === undefined) {
        pastRatingsByDishId[r.menuItemId] = r.rating;
      }
    }

    return {
      isAuthenticated: true,
      userId: liveUser.id,
      profile: {
        id: dbProfile.id,
        isGuest: false,
        displayName: dbProfile.displayName,
        dietaryRestrictions: dbProfile.dietaryRestrictions,
        allergens: dbProfile.allergens,
        likedIngredients: dbProfile.likedIngredients,
        dislikedIngredients: dbProfile.dislikedIngredients,
        favoriteCuisines: dbProfile.favoriteCuisines,
        spiceTolerance: dbProfile.spiceTolerance,
        maxBudgetAed: dbProfile.maxBudgetAed ? dbProfile.maxBudgetAed.toFixed(2) : null,
        preferHighProtein: dbProfile.preferHighProtein,
        preferKeto: dbProfile.preferKeto,
        pastRatingsByDishId,
      },
    };
  }

  const guestToken = await getVerifiedGuestToken();
  if (!guestToken) {
    return { profile: null, isAuthenticated: false };
  }

  const guestProfile = await prisma.dinerProfile.findUnique({
    where: { guestToken },
    include: {
      ratings: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!guestProfile) {
    return { profile: null, isAuthenticated: false, guestToken };
  }

  const pastRatingsByDishId: Record<string, number> = {};
  for (const r of guestProfile.ratings) {
    if (pastRatingsByDishId[r.menuItemId] === undefined) {
      pastRatingsByDishId[r.menuItemId] = r.rating;
    }
  }

  return {
    isAuthenticated: false,
    guestToken,
    profile: {
      id: guestProfile.id,
      isGuest: true,
      displayName: guestProfile.displayName,
      dietaryRestrictions: guestProfile.dietaryRestrictions,
      allergens: guestProfile.allergens,
      likedIngredients: guestProfile.likedIngredients,
      dislikedIngredients: guestProfile.dislikedIngredients,
      favoriteCuisines: guestProfile.favoriteCuisines,
      spiceTolerance: guestProfile.spiceTolerance,
      maxBudgetAed: guestProfile.maxBudgetAed ? guestProfile.maxBudgetAed.toFixed(2) : null,
      preferHighProtein: guestProfile.preferHighProtein,
      preferKeto: guestProfile.preferKeto,
      pastRatingsByDishId,
    },
  };
}
