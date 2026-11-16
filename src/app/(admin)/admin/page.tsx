import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { requirePageRole } from "@/lib/auth/rbac";
import { formatDubaiDateTime } from "@/lib/billing/invoices";
import { prisma } from "@/lib/db";
import { getI18nContext } from "@/lib/i18n/server";
import { aedToFils, filsToAedString } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [, { locale }] = await Promise.all([requirePageRole(["ADMIN"]), getI18nContext()]);
  const isAr = locale === "ar";

  const [
    pendingRestaurants,
    approvedRestaurants,
    totalUsers,
    activeFees,
    invoiceCount,
    recentAudits,
  ] = await Promise.all([
    prisma.restaurant.count({ where: { status: "PENDING" } }),
    prisma.restaurant.count({ where: { status: "APPROVED" } }),
    prisma.user.count(),
    prisma.platformFee.findMany({
      where: { isVoided: false },
      select: { feeAmountAed: true, orderSubtotalAed: true },
    }),
    prisma.invoice.count(),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  let totalFeesFils = 0;
  let totalGmvFils = 0;
  for (const f of activeFees) {
    totalFeesFils += aedToFils(f.feeAmountAed);
    totalGmvFils += aedToFils(f.orderSubtotalAed);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent-primary)]">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>{isAr ? "لوحة إدارة المنصة" : "Platform Administration"}</span>
        </span>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
          {isAr ? "نظرة عامة على المنصة والسجل المالي" : "Platform Overview & Governance"}
        </h1>
      </div>

      {/* KPI Grid */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/admin/restaurants"
          className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs transition hover:border-[var(--accent-primary)]"
        >
          <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">
            {isAr ? "المطاعم المعتمدة / المعلقة" : "Approved / Pending Restaurants"}
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold">
            {approvedRestaurants} / <span className="text-amber-600">{pendingRestaurants}</span>
          </p>
        </Link>

        <Link
          href="/admin/users"
          className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs transition hover:border-[var(--accent-primary)]"
        >
          <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">
            {isAr ? "إجمالي المستخدمين" : "Registered Users"}
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold">{totalUsers}</p>
        </Link>

        <Link
          href="/admin/orders"
          className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs transition hover:border-[var(--accent-primary)]"
        >
          <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">
            {isAr ? "صافي رسوم المنصة النشطة" : "Active Platform Fees Earned"}
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold text-[var(--accent-primary)]">
            AED {filsToAedString(totalFeesFils)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            GMV AED {filsToAedString(totalGmvFils)} ({activeFees.length} orders)
          </p>
        </Link>

        <Link
          href="/admin/invoices"
          className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs transition hover:border-[var(--accent-primary)]"
        >
          <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">
            {isAr ? "الفواتير الشهرية" : "Monthly Invoices"}
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold">{invoiceCount}</p>
        </Link>
      </section>

      {/* Recent Audit Log */}
      <section className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
        <h2 className="text-lg font-extrabold">
          {isAr ? "أحدث عمليات التدقيق الإداري" : "Recent Admin Audit Log"}
        </h2>
        {recentAudits.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">
            {isAr ? "لا توجد عمليات مسجلة بعد." : "No administrative actions recorded yet."}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)] text-xs">
            {recentAudits.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <span className="rounded bg-[var(--bg-muted)] px-2 py-0.5 font-mono font-bold">
                    {log.action}
                  </span>{" "}
                  <span className="font-semibold text-[var(--text-primary)]">{log.summary}</span>
                  <span className="ms-2 text-[var(--text-secondary)]">by {log.actorEmail}</span>
                </div>
                <span className="font-mono text-[var(--text-secondary)]">
                  {formatDubaiDateTime(log.createdAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
