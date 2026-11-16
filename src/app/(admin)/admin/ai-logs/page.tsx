import { getDailyAiQuotaLimits, getUtcDayBounds } from "@/lib/agents/guardrails";
import { requirePageRole } from "@/lib/auth/rbac";
import { formatDubaiDateTime } from "@/lib/billing/invoices";
import { prisma } from "@/lib/db";
import { getI18nContext } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminAiUsageLogsPage() {
  const [, { locale }] = await Promise.all([requirePageRole(["ADMIN"]), getI18nContext()]);
  const isAr = locale === "ar";
  const limits = getDailyAiQuotaLimits();
  const { utcStart, utcEnd } = getUtcDayBounds();

  const [todayGlobalCount, groupedByAgent, recentLogs] = await Promise.all([
    prisma.aiUsageLog.count({
      where: { createdAt: { gte: utcStart, lt: utcEnd } },
    }),
    prisma.aiUsageLog.groupBy({
      by: ["agentName"],
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
      _avg: { latencyMs: true },
    }),
    prisma.aiUsageLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        restaurant: { select: { nameEn: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-extrabold">
          {isAr
            ? "سجل استخدام الذكاء الاصطناعي والحدود اليومية"
            : "AI Usage, Tokens & Daily Quotas"}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          UTC Day Calls:{" "}
          <strong className="font-mono">
            {todayGlobalCount} / {limits.globalLimit}
          </strong>{" "}
          (Caller cap {limits.callerLimit}/day • IP cap {limits.ipLimit}/day • Restaurant cap{" "}
          {limits.restaurantLimit}/day)
        </p>
      </div>

      {/* Agent Breakdown */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {groupedByAgent.map((g) => (
          <div
            key={g.agentName}
            className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs"
          >
            <p className="font-mono text-xs font-bold text-[var(--accent-primary)]">
              {g.agentName}
            </p>
            <p className="mt-2 font-mono text-2xl font-extrabold">{g._count._all} calls</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              In: {g._sum.inputTokens ?? 0} • Out: {g._sum.outputTokens ?? 0} tokens
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Avg latency: {Math.round(g._avg.latencyMs ?? 0)} ms
            </p>
          </div>
        ))}
      </section>

      {/* Recent Logs Table */}
      <div className="overflow-x-auto rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
        <table className="w-full text-start text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <th className="py-2 text-start">Time (Dubai)</th>
              <th className="py-2 text-start">Agent / Model</th>
              <th className="py-2 text-start">Status</th>
              <th className="py-2 text-start">Caller / IP / Restaurant</th>
              <th className="py-2 text-end">Tokens (In/Out)</th>
              <th className="py-2 text-end">Latency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {recentLogs.map((l) => (
              <tr key={l.id}>
                <td className="py-2.5 font-mono text-[var(--text-secondary)]">
                  {formatDubaiDateTime(l.createdAt, locale)}
                </td>
                <td className="py-2.5">
                  <p className="font-mono font-bold">{l.agentName}</p>
                  <p className="font-mono text-[11px] text-[var(--text-secondary)]">{l.model}</p>
                </td>
                <td className="py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${
                      l.status === "COMPLETED" && l.success
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : l.status === "PENDING"
                          ? "bg-amber-500/20 text-amber-800"
                          : "bg-red-500/15 text-red-700 dark:text-red-300"
                    }`}
                  >
                    {l.status}
                  </span>
                  {l.errorMessage && (
                    <p className="mt-0.5 max-w-xs truncate text-[11px] text-red-600">
                      {l.errorMessage}
                    </p>
                  )}
                </td>
                <td className="py-2.5 font-mono text-[11px]">
                  {l.callerKey || "—"} • {l.clientIp || "—"}
                  {l.restaurant ? ` • ${l.restaurant.nameEn}` : ""}
                </td>
                <td className="py-2.5 text-end font-mono">
                  {l.inputTokens} / {l.outputTokens}
                </td>
                <td className="py-2.5 text-end font-mono">{l.latencyMs} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
