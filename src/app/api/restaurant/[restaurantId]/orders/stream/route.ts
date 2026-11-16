import { NextRequest } from "next/server";
import { requireRestaurantStaffOrOwnerApi } from "@/lib/ordering/access";
import { orderEventBus } from "@/lib/ordering/lifecycle";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const access = await requireRestaurantStaffOrOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: orders_changed\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Stream closed
        }
      };

      sendEvent({ connected: true, restaurantId });

      const listener = (payload: unknown) => sendEvent(payload);
      orderEventBus.on(`restaurant:${restaurantId}`, listener);

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 15_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        orderEventBus.off(`restaurant:${restaurantId}`, listener);
        try {
          controller.close();
        } catch {
          // Ignore already closed controller
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
