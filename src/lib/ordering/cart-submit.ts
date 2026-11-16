import type { Prisma, PrismaClient } from "@prisma/client";
import { emitOrderChanged } from "@/lib/ordering/lifecycle";
import { type OrderDraftLineInput, priceOrderFromDatabase } from "@/lib/ordering/pricing";
import { buildKitchenDietarySafetyNote } from "@/lib/ordering/session";

export type CartOrderSubmitResult =
  | {
      ok: true;
      alreadySent: boolean;
      message?: string;
      order: {
        id: string;
        orderNumber: number;
        status: string;
        subtotalAed: string;
      };
    }
  | {
      ok: false;
      status: 400 | 404;
      code?: string;
      error: string;
    };

/**
 * Atomically submits a table's shared participant carts inside a single transaction,
 * preventing duplicate orders when two members at the same table tap "Send" simultaneously.
 *
 * If the carts were just submitted by another member at the table, returns
 * `{ ok: true, alreadySent: true, message: "Order already sent", order }` with the existing order ID.
 */
export async function submitSharedTableCartAtomically(params: {
  db: PrismaClient;
  restaurantId: string;
  tableId: string;
  tableSessionId: string;
  placedByProfileId: string | null;
  placedByGuestToken: string | null;
  callerFallbackAllergens?: readonly string[];
  callerFallbackDiets?: readonly string[];
  notes?: string | null;
}): Promise<CartOrderSubmitResult> {
  const { db, restaurantId, tableId, tableSessionId } = params;

  const txResult = await db
    .$transaction(async (tx) => {
      const session = await tx.tableSession.findFirst({
        where: { id: tableSessionId, restaurantId, tableId },
      });
      if (!session) {
        return { ok: false as const, status: 404 as const, error: "Table session not found." };
      }

      const participants = await tx.tableParticipant.findMany({
        where: { tableSessionId: session.id },
        include: { dinerProfile: true },
      });
      const participantById = new Map(participants.map((p) => [p.id, p]));

      const draftLines: OrderDraftLineInput[] = [];
      for (const p of participants) {
        if (!Array.isArray(p.cartItems)) continue;
        for (const rawItem of p.cartItems as Array<Record<string, unknown>>) {
          if (typeof rawItem?.menuItemId === "string" && typeof rawItem?.quantity === "number") {
            const forShared = Boolean(rawItem.forSharedTable);
            draftLines.push({
              menuItemId: rawItem.menuItemId,
              modifierIds: Array.isArray(rawItem.modifierIds)
                ? rawItem.modifierIds.filter((x): x is string => typeof x === "string")
                : [],
              quantity: rawItem.quantity,
              participantId: forShared ? null : p.id,
              participantName: forShared ? "Shared Table" : p.displayName,
              specialInstructions:
                typeof rawItem.specialInstructions === "string"
                  ? rawItem.specialInstructions
                  : null,
            });
          }
        }
      }

      if (draftLines.length === 0) {
        if (session.lastCartOrderId) {
          const prevOrder = await tx.order.findUnique({
            where: { id: session.lastCartOrderId },
          });
          if (prevOrder) {
            return {
              ok: true as const,
              alreadySent: true,
              message: "Order already sent",
              order: {
                id: prevOrder.id,
                orderNumber: prevOrder.orderNumber,
                status: prevOrder.status,
                subtotalAed: prevOrder.subtotalAed.toFixed(2),
              },
            };
          }
        }
        return {
          ok: false as const,
          status: 400 as const,
          error: "Your table cart is empty.",
        };
      }

      // Atomic CAS lock on `cartVersion`: only ONE concurrent caller can claim this cart generation
      const claimed = await tx.tableSession.updateMany({
        where: {
          id: session.id,
          cartVersion: session.cartVersion,
        },
        data: {
          cartVersion: { increment: 1 },
        },
      });

      if (claimed.count === 0) {
        const latestOrder = await tx.order.findFirst({
          where: { tableSessionId: session.id },
          orderBy: { sentAt: "desc" },
        });
        if (latestOrder) {
          return {
            ok: true as const,
            alreadySent: true,
            message: "Order already sent",
            order: {
              id: latestOrder.id,
              orderNumber: latestOrder.orderNumber,
              status: latestOrder.status,
              subtotalAed: latestOrder.subtotalAed.toFixed(2),
            },
          };
        }
        return {
          ok: false as const,
          status: 400 as const,
          error: "Your table cart is empty.",
        };
      }

      const uniqueDishIds = Array.from(new Set(draftLines.map((l) => l.menuItemId)));
      const dbDishes = await tx.menuItem.findMany({
        where: { id: { in: uniqueDishIds } },
        include: { modifiers: true },
      });
      const dishesById = new Map(dbDishes.map((d) => [d.id, d]));

      const priced = priceOrderFromDatabase({
        restaurantId,
        draftLines,
        dishesById,
      });
      if (!priced.ok) {
        throw new Error(`PRICING_ERR:${priced.code}:${priced.message}`);
      }

      const now = new Date();
      const created = await tx.order.create({
        data: {
          restaurantId,
          tableSessionId: session.id,
          tableId,
          placedByProfileId: params.placedByProfileId,
          placedByGuestToken: params.placedByGuestToken,
          status: "SENT",
          subtotalAed: priced.subtotalAed,
          notes: params.notes || null,
          sentAt: now,
          items: {
            create: priced.lines.map((line) => {
              const part = line.participantId ? participantById.get(line.participantId) : undefined;
              const allergens =
                part?.dinerProfile?.allergens ??
                (!line.participantId ? [] : (params.callerFallbackAllergens ?? []));
              const diets =
                part?.dinerProfile?.dietaryRestrictions ??
                (!line.participantId ? [] : (params.callerFallbackDiets ?? []));

              const kitchenSafetyNote = buildKitchenDietarySafetyNote({
                participantName: line.participantName,
                allergens,
                dietaryRestrictions: diets,
                selectedModifierNamesEn: line.selectedModifiers.map((m) => m.nameEn),
                manualNote: line.specialInstructions,
              });

              return {
                menuItemId: line.menuItemId,
                participantId: line.participantId,
                participantName: line.participantName,
                quantity: line.quantity,
                unitPriceAed: line.unitPriceAed,
                lineTotalAed: line.lineTotalAed,
                selectedModifiers: line.selectedModifiers as unknown as Prisma.InputJsonValue,
                specialInstructions: kitchenSafetyNote,
              };
            }),
          },
        },
      });

      await tx.tableParticipant.updateMany({
        where: { tableSessionId: session.id },
        data: { cartItems: [] },
      });

      await tx.tableSession.update({
        where: { id: session.id },
        data: {
          lastCartOrderId: created.id,
          lastActivityAt: now,
        },
      });

      return {
        ok: true as const,
        alreadySent: false,
        order: {
          id: created.id,
          orderNumber: created.orderNumber,
          status: created.status,
          subtotalAed: created.subtotalAed.toFixed(2),
        },
      };
    })
    .catch((err: unknown) => {
      if (err instanceof Error && err.message.startsWith("PRICING_ERR:")) {
        const [, code, ...rest] = err.message.split(":");
        return {
          ok: false as const,
          status: 400 as const,
          code,
          error: rest.join(":"),
        };
      }
      throw err;
    });

  if (txResult.ok && !txResult.alreadySent) {
    emitOrderChanged({
      restaurantId,
      orderId: txResult.order.id,
      status: "SENT",
    });
  }

  return txResult;
}
