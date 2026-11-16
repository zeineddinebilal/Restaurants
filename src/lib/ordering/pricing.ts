import { aedToFils, filsToAedString, splitAmountEvenlyFils } from "@/lib/money";

export interface OrderDraftLineInput {
  menuItemId: string;
  modifierIds: readonly string[];
  quantity: number;
  /** `null` or omitted means "Shared Table" item split across all active table participants */
  participantId?: string | null;
  participantName?: string | null;
  specialInstructions?: string | null;
}

export interface DbDishForPricing {
  id: string;
  restaurantId: string;
  nameEn: string;
  nameAr: string;
  priceAed: { toString(): string } | string;
  isPublished: boolean;
  isAvailable: boolean;
  modifiers: ReadonlyArray<{
    id: string;
    menuItemId: string;
    nameEn: string;
    nameAr: string;
    priceDeltaAed: { toString(): string } | string;
    removesAllergens: readonly string[];
    addsDietTags: readonly string[];
  }>;
}

export interface PricedModifierSnapshot {
  id: string;
  nameEn: string;
  nameAr: string;
  priceDeltaAed: string;
  removesAllergens: string[];
  addsDietTags: string[];
}

export interface PricedOrderLine {
  menuItemId: string;
  dishNameEn: string;
  dishNameAr: string;
  participantId: string | null;
  participantName: string | null;
  quantity: number;
  unitPriceFils: number;
  unitPriceAed: string;
  lineTotalFils: number;
  lineTotalAed: string;
  selectedModifiers: PricedModifierSnapshot[];
  specialInstructions: string | null;
}

export type ServerPricingResult =
  | {
      ok: true;
      lines: PricedOrderLine[];
      subtotalFils: number;
      subtotalAed: string;
    }
  | {
      ok: false;
      code:
        | "EMPTY_ORDER"
        | "INVALID_QUANTITY"
        | "DISH_NOT_FOUND"
        | "DISH_WRONG_RESTAURANT"
        | "DISH_UNAVAILABLE"
        | "MODIFIER_INVALID";
      message: string;
    };

/**
 * Computes exact order line prices and subtotal strictly from authoritative database rows.
 * Client-sent prices or totals are never accepted or inspected.
 */
export function priceOrderFromDatabase(params: {
  restaurantId: string;
  draftLines: readonly OrderDraftLineInput[];
  dishesById: ReadonlyMap<string, DbDishForPricing>;
}): ServerPricingResult {
  const { restaurantId, draftLines, dishesById } = params;

  if (draftLines.length === 0 || draftLines.length > 50) {
    return {
      ok: false,
      code: "EMPTY_ORDER",
      message: "Order must contain between 1 and 50 line items.",
    };
  }

  const lines: PricedOrderLine[] = [];
  let subtotalFils = 0;

  for (const draft of draftLines) {
    if (!Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > 20) {
      return {
        ok: false,
        code: "INVALID_QUANTITY",
        message: "Each item quantity must be an integer between 1 and 20.",
      };
    }

    const dbDish = dishesById.get(draft.menuItemId);
    if (!dbDish) {
      return {
        ok: false,
        code: "DISH_NOT_FOUND",
        message: `Dish "${draft.menuItemId}" does not exist.`,
      };
    }

    if (dbDish.restaurantId !== restaurantId) {
      return {
        ok: false,
        code: "DISH_WRONG_RESTAURANT",
        message: `Dish "${dbDish.nameEn}" does not belong to this restaurant.`,
      };
    }

    if (!dbDish.isPublished || !dbDish.isAvailable) {
      return {
        ok: false,
        code: "DISH_UNAVAILABLE",
        message: `Dish "${dbDish.nameEn}" is currently unavailable.`,
      };
    }

    const dishModMap = new Map(dbDish.modifiers.map((m) => [m.id, m]));
    const uniqueModifierIds = Array.from(new Set(draft.modifierIds));
    const selectedModifiers: PricedModifierSnapshot[] = [];
    let modDeltaFils = 0;

    for (const modId of uniqueModifierIds) {
      const dbMod = dishModMap.get(modId);
      if (!dbMod || dbMod.menuItemId !== dbDish.id) {
        return {
          ok: false,
          code: "MODIFIER_INVALID",
          message: `Modifier "${modId}" does not belong to dish "${dbDish.nameEn}".`,
        };
      }

      const deltaStr = filsToAedString(aedToFils(dbMod.priceDeltaAed.toString()));
      modDeltaFils += aedToFils(deltaStr);
      selectedModifiers.push({
        id: dbMod.id,
        nameEn: dbMod.nameEn,
        nameAr: dbMod.nameAr,
        priceDeltaAed: deltaStr,
        removesAllergens: [...dbMod.removesAllergens],
        addsDietTags: [...dbMod.addsDietTags],
      });
    }

    const baseFils = aedToFils(dbDish.priceAed.toString());
    const unitPriceFils = Math.max(0, baseFils + modDeltaFils);
    const lineTotalFils = unitPriceFils * draft.quantity;
    subtotalFils += lineTotalFils;

    lines.push({
      menuItemId: dbDish.id,
      dishNameEn: dbDish.nameEn,
      dishNameAr: dbDish.nameAr,
      participantId: draft.participantId ?? null,
      participantName: draft.participantName?.trim() || null,
      quantity: draft.quantity,
      unitPriceFils,
      unitPriceAed: filsToAedString(unitPriceFils),
      lineTotalFils,
      lineTotalAed: filsToAedString(lineTotalFils),
      selectedModifiers,
      specialInstructions: draft.specialInstructions?.trim().slice(0, 240) || null,
    });
  }

  return {
    ok: true,
    lines,
    subtotalFils,
    subtotalAed: filsToAedString(subtotalFils),
  };
}

export interface ParticipantBillShare {
  participantId: string;
  displayName: string;
  personalFils: number;
  sharedShareFils: number;
  totalFils: number;
  totalAed: string;
}

/**
 * Computes an exact lossless bill split across table participants in integer fils:
 * - Personal items (`line.participantId` matching a participant) go to that person.
 * - Shared items (`line.participantId === null` or unmatched) are summed and split
 *   evenly via `splitAmountEvenlyFils` so every fil is accounted for.
 */
export function computeTableBillSplit(params: {
  participants: ReadonlyArray<{ id: string; displayName: string }>;
  lines: ReadonlyArray<{ participantId: string | null; lineTotalFils: number }>;
}): {
  sharedPoolFils: number;
  totalFils: number;
  totalAed: string;
  shares: ParticipantBillShare[];
} {
  const { participants, lines } = params;
  const totalFils = lines.reduce((s, l) => s + l.lineTotalFils, 0);

  if (participants.length === 0) {
    return {
      sharedPoolFils: totalFils,
      totalFils,
      totalAed: filsToAedString(totalFils),
      shares: [],
    };
  }

  const personalByParticipant = new Map<string, number>();
  for (const p of participants) {
    personalByParticipant.set(p.id, 0);
  }

  let sharedPoolFils = 0;
  for (const line of lines) {
    if (line.participantId && personalByParticipant.has(line.participantId)) {
      personalByParticipant.set(
        line.participantId,
        (personalByParticipant.get(line.participantId) ?? 0) + line.lineTotalFils,
      );
    } else {
      sharedPoolFils += line.lineTotalFils;
    }
  }

  const evenSharedSplits = splitAmountEvenlyFils(sharedPoolFils, participants.length);

  const shares: ParticipantBillShare[] = participants.map((p, idx) => {
    const personalFils = personalByParticipant.get(p.id) ?? 0;
    const sharedShareFils = evenSharedSplits[idx] ?? 0;
    const personTotal = personalFils + sharedShareFils;
    return {
      participantId: p.id,
      displayName: p.displayName,
      personalFils,
      sharedShareFils,
      totalFils: personTotal,
      totalAed: filsToAedString(personTotal),
    };
  });

  return {
    sharedPoolFils,
    totalFils,
    totalAed: filsToAedString(totalFils),
    shares,
  };
}
