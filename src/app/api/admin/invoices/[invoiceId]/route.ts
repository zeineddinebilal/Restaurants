import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth/rbac";
import { transitionInvoiceStatus } from "@/lib/billing/invoices";

const patchInvoiceSchema = z.object({
  status: z.enum(["ISSUED", "PAID"]),
});

export async function PATCH(req: NextRequest, context: { params: Promise<{ invoiceId: string }> }) {
  const authCheck = await requireApiRole(["ADMIN"]);
  if (!authCheck.ok) return authCheck.response;

  const { invoiceId } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = patchInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid target invoice status" }, { status: 400 });
  }

  try {
    const updated = await transitionInvoiceStatus({
      invoiceId,
      nextStatus: parsed.data.status,
      actorUserId: authCheck.user.id,
      actorEmail: authCheck.user.email ?? "admin",
    });

    return NextResponse.json({
      invoice: {
        id: updated.id,
        invoiceNumber: updated.invoiceNumber,
        status: updated.status,
        totalFeesAed: updated.totalFeesAed.toFixed(2),
        paidAt: updated.paidAt ? updated.paidAt.toISOString() : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update invoice";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
