"use client";

import type { Role } from "@prisma/client";
import { useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n/dictionaries";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAtIso: string;
}

export function UsersAdminClient({
  locale,
  currentAdminId,
  initialUsers,
}: {
  locale: Locale;
  currentAdminId: string;
  initialUsers: AdminUserRow[];
}) {
  const isAr = locale === "ar";
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (!q) return true;
      return u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q);
    });
  }, [users, search, roleFilter]);

  async function handleToggleActive(user: AdminUserRow) {
    setBusyId(user.id);
    setError(null);

    const nextActive = !user.isActive;
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: nextActive }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusyId(null);

    if (!res.ok) {
      setError(data.error || "Could not update user status");
      return;
    }

    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: nextActive } : u)));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-extrabold">
          {isAr ? "إدارة المستخدمين والصلاحيات" : "User Management"}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {isAr
            ? "البحث عن المستخدمين وتعطيل أو إعادة تفعيل الحسابات (لا يمكن للمسؤول تعطيل حسابه الخاص)."
            : "Search accounts and deactivate/reactivate access (admins cannot deactivate themselves)."}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isAr ? "ابحث بالاسم أو البريد الإلكتروني..." : "Search by name or email..."}
          className="min-h-10 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by role"
          className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold"
        >
          <option value="ALL">{isAr ? "جميع الأدوار" : "All Roles"}</option>
          <option value="DINER">DINER</option>
          <option value="RESTAURANT_OWNER">RESTAURANT_OWNER</option>
          <option value="RESTAURANT_STAFF">RESTAURANT_STAFF</option>
          <option value="ADMIN">ADMIN</option>
        </select>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
        <table className="w-full text-start text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <th className="py-2.5 text-start">{isAr ? "الاسم والبريد" : "User"}</th>
              <th className="py-2.5 text-start">{isAr ? "الدور" : "Role"}</th>
              <th className="py-2.5 text-start">{isAr ? "الحالة" : "Status"}</th>
              <th className="py-2.5 text-end">{isAr ? "الإجراء" : "Action"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {filtered.map((u) => {
              const isSelf = u.id === currentAdminId;
              return (
                <tr key={u.id}>
                  <td className="py-3">
                    <p className="font-bold">
                      {u.name}{" "}
                      {isSelf && (
                        <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent-primary)]">
                          YOU
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-[11px] text-[var(--text-secondary)]">{u.email}</p>
                  </td>
                  <td className="py-3 font-mono font-semibold">{u.role}</td>
                  <td className="py-3">
                    {u.isActive ? (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 font-bold text-red-700 dark:text-red-300">
                        Deactivated
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-end">
                    {isSelf ? (
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {isAr ? "حسابك الحالي" : "Current admin"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => void handleToggleActive(u)}
                        className={`min-h-8 rounded-lg px-3 py-1 font-bold text-white disabled:opacity-50 ${
                          u.isActive
                            ? "bg-red-600 hover:bg-red-700"
                            : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                      >
                        {u.isActive
                          ? isAr
                            ? "تعطيل"
                            : "Deactivate"
                          : isAr
                            ? "تفعيل"
                            : "Reactivate"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
