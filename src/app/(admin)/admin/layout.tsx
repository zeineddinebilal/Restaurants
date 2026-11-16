import {
  Activity,
  Building2,
  FileSpreadsheet,
  LayoutDashboard,
  Receipt,
  Sliders,
  Users,
} from "lucide-react";
import Link from "next/link";
import { requirePageRole } from "@/lib/auth/rbac";
import { getI18nContext } from "@/lib/i18n/server";

export default async function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  const [, { locale }] = await Promise.all([requirePageRole(["ADMIN"]), getI18nContext()]);
  const isAr = locale === "ar";

  const links = [
    { href: "/admin", label: isAr ? "نظرة عامة" : "Overview", icon: LayoutDashboard },
    { href: "/admin/restaurants", label: isAr ? "المطاعم" : "Restaurants", icon: Building2 },
    { href: "/admin/users", label: isAr ? "المستخدمون" : "Users", icon: Users },
    { href: "/admin/orders", label: isAr ? "الطلبات والسجل" : "Orders & Ledger", icon: Receipt },
    { href: "/admin/invoices", label: isAr ? "الفواتير" : "Invoices", icon: FileSpreadsheet },
    {
      href: "/admin/settings",
      label: isAr ? "الإعدادات والتدقيق" : "Settings & Audit",
      icon: Sliders,
    },
    {
      href: "/admin/ai-logs",
      label: isAr ? "سجل الذكاء الاصطناعي" : "AI Usage Logs",
      icon: Activity,
    },
  ];

  return (
    <div className="min-h-full">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5 px-4 py-2.5 sm:px-6">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)] sm:text-sm"
              >
                <Icon className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {children}
    </div>
  );
}
