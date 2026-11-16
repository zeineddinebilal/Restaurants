import {
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  CreditCard,
  QrCode,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { requirePageRole } from "@/lib/auth/rbac";
import { getI18nContext } from "@/lib/i18n/server";

export default async function RestaurantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, { locale }] = await Promise.all([
    requirePageRole(["RESTAURANT_OWNER", "RESTAURANT_STAFF", "ADMIN"]),
    getI18nContext(),
  ]);

  const isOwnerOrAdmin = user.role === "RESTAURANT_OWNER" || user.role === "ADMIN";
  const labels =
    locale === "ar"
      ? {
          setup: "بيانات المطعم والفروع",
          menu: "منشئ القائمة والتوثيق",
          tables: "الطاولات ورموز QR",
          analytics: "التحليلات والرؤى",
          billing: "الفوترة والرسوم",
          orders: "شاشة الطلبات المباشرة",
        }
      : {
          setup: "Setup & Branches",
          menu: "Menu Builder & Verify",
          tables: "Tables & QR Codes",
          analytics: "Analytics & Insights",
          billing: "Billing",
          orders: "Live Orders",
        };

  return (
    <div className="min-h-full">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
          {isOwnerOrAdmin && (
            <>
              <Link
                href="/dashboard"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)]"
              >
                <Settings2 className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
                <span>{labels.setup}</span>
              </Link>
              <Link
                href="/dashboard/menu"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)]"
              >
                <BookOpenCheck
                  className="h-4 w-4 text-[var(--accent-primary)]"
                  aria-hidden="true"
                />
                <span>{labels.menu}</span>
              </Link>
              <Link
                href="/dashboard/tables"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)]"
              >
                <QrCode className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
                <span>{labels.tables}</span>
              </Link>
              <Link
                href="/dashboard/analytics"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)]"
              >
                <BarChart3 className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
                <span>{labels.analytics}</span>
              </Link>
              <Link
                href="/dashboard/billing"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)]"
              >
                <CreditCard className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
                <span>{labels.billing}</span>
              </Link>
            </>
          )}
          <Link
            href="/dashboard/orders"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)]"
          >
            <ClipboardList className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <span>{labels.orders}</span>
          </Link>
        </div>
      </div>

      {children}
    </div>
  );
}
