import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canCurrentCallerViewOrder } from "@/lib/ordering/access";
import { orderEventBus } from "@/lib/ordering/lifecycle";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      restaurantId: true,
      tableSessionId: true,
      placedByProfileId: true,
      placedByGuestToken: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const allowed = await canCurrentCallerViewOrder(order);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: order_update\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Stream already closed
        }
      };

      // Initial snapshot event
      sendEvent({ orderId: order.id, status: order.status });

      const listener = (payload: unknown) => sendEvent(payload);
      orderEventBus.on(`order:${order.id}`, listener);

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 15_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        orderEventBus.off(`order:${order.id}`, listener);
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
