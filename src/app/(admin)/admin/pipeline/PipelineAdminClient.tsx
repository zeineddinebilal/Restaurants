"use client";

import {
  Check,
  Compass,
  Copy,
  Download,
  ExternalLink,
  ListFilter,
  Plus,
  Upload,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ParsedProspectRow, ProspectNoteEntry, ProspectStatus } from "@/lib/admin/prospects";
import type { Locale } from "@/lib/i18n/dictionaries";

export interface ProspectItem {
  id: string;
  name: string;
  area: string;
  district: string | null;
  city: string;
  cuisine: string | null;
  priceTier: string | null;
  address: string | null;
  website: string | null;
  instagram: string | null;
  phone: string | null;
  ownership: string | null;
  existingQrProvider: string | null;
  whyFitNotes: string | null;
  top30Rank: number | null;
  status: ProspectStatus;
  source: string;
  contactPerson: string | null;
  dateApproached: string | null;
  outcomeNotes: string | null;
  rewardOrOffer: string | null;
  notesHistory: ProspectNoteEntry[];
  inviteToken: string | null;
  convertedRestaurant: {
    id: string;
    slug: string;
    nameEn: string;
    status: string;
  } | null;
  lastUpdatedByEmail: string | null;
  updatedAtIso: string;
}

interface CsvPreviewResult {
  totalUniqueRows: number;
  newCount: number;
  existingUpdateCount: number;
  sampleRows: ParsedProspectRow[];
}

export function PipelineAdminClient({
  locale,
  initialProspects,
}: {
  locale: Locale;
  initialProspects: ProspectItem[];
}) {
  const isAr = locale === "ar";
  const router = useRouter();

  const [prospects, setProspects] = useState<ProspectItem[]>(initialProspects);
  const [viewMode, setViewMode] = useState<"all" | "next_to_visit">("all");

  // Filters
  const [cityFilter, setCityFilter] = useState<string>("ALL");
  const [districtFilter, setDistrictFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ProspectStatus>("ALL");
  const [top30Only, setTop30Only] = useState(false);
  const [hasQrOnly, setHasQrOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // CSV Import State
  const [pendingCsvText, setPendingCsvText] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreviewResult | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  // Quick Add Prospect Modal State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("Dubai");
  const [newArea, setNewArea] = useState("");
  const [newCuisine, setNewCuisine] = useState("");
  const [newQr, setNewQr] = useState("");
  const [newRank, setNewRank] = useState("");

  // Inline Edit / Notes Drawer State
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [inviteUrls, setInviteUrls] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const availableCities = useMemo(() => {
    const base = new Set<string>(["Dubai", "Beirut", "Frankfurt"]);
    for (const p of prospects) {
      if (p.city) base.add(p.city);
    }
    return Array.from(base);
  }, [prospects]);

  const counts = useMemo(() => {
    let green = 0;
    let grey = 0;
    let red = 0;
    for (const p of prospects) {
      if (p.status === "GREEN") green++;
      else if (p.status === "RED") red++;
      else grey++;
    }
    return { total: prospects.length, green, grey, red };
  }, [prospects]);

  const filteredProspects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const distQ = districtFilter.trim().toLowerCase();

    const list = prospects.filter((p) => {
      if (viewMode === "next_to_visit" && p.status !== "GREY") return false;
      if (cityFilter !== "ALL" && p.city.toLowerCase() !== cityFilter.toLowerCase()) return false;
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (top30Only && !p.top30Rank) return false;
      if (hasQrOnly) {
        const qr = (p.existingQrProvider ?? "").trim().toLowerCase();
        if (!qr || qr === "none" || qr === "no" || qr === "n/a") return false;
      }
      if (distQ) {
        const hay = `${p.district ?? ""} ${p.area}`.toLowerCase();
        if (!hay.includes(distQ)) return false;
      }
      if (q) {
        const hay =
          `${p.name} ${p.area} ${p.district ?? ""} ${p.cuisine ?? ""} ${p.existingQrProvider ?? ""} ${p.contactPerson ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (viewMode === "next_to_visit") {
      return [...list].sort((a, b) => {
        const ra = a.top30Rank ?? 999999;
        const rb = b.top30Rank ?? 999999;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      });
    }

    return list;
  }, [
    prospects,
    viewMode,
    cityFilter,
    districtFilter,
    statusFilter,
    top30Only,
    hasQrOnly,
    searchQuery,
  ]);

  async function handleCsvFileSelected(file: File | null) {
    if (!file) return;
    setBanner(null);
    setCsvBusy(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/admin/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview_csv", csvText: text }),
      });
      const data = (await res.json()) as { preview?: CsvPreviewResult; error?: string };
      if (!res.ok || !data.preview) {
        setBanner({ type: "err", text: data.error || "Failed to preview CSV" });
        return;
      }
      setCsvFileName(file.name);
      setPendingCsvText(text);
      setCsvPreview(data.preview);
    } catch {
      setBanner({ type: "err", text: "Could not read CSV file" });
    } finally {
      setCsvBusy(false);
    }
  }

  async function confirmCsvImport() {
    if (!pendingCsvText) return;
    setCsvBusy(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "import_csv", csvText: pendingCsvText }),
      });
      const data = (await res.json()) as {
        imported?: { createdCount: number; updatedCount: number; total: number };
        error?: string;
      };
      if (!res.ok || !data.imported) {
        setBanner({ type: "err", text: data.error || "CSV import failed" });
        return;
      }
      setBanner({
        type: "ok",
        text: isAr
          ? `تم استيراد ${data.imported.total} مطعم (${data.imported.createdCount} جديد، ${data.imported.updatedCount} محدّث).`
          : `Imported ${data.imported.total} prospects (${data.imported.createdCount} new, ${data.imported.updatedCount} deduplicated updates).`,
      });
      setPendingCsvText(null);
      setCsvPreview(null);
      setCsvFileName(null);
      router.refresh();
      window.location.reload();
    } finally {
      setCsvBusy(false);
    }
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCsvBusy(true);
    setBanner(null);
    try {
      const parsedRank = Number.parseInt(newRank, 10);
      const res = await fetch("/api/admin/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          name: newName.trim(),
          city: newCity.trim() || "Dubai",
          area: newArea.trim(),
          cuisine: newCuisine.trim() || undefined,
          existingQrProvider: newQr.trim() || undefined,
          top30Rank: Number.isFinite(parsedRank) && parsedRank > 0 ? parsedRank : null,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setBanner({ type: "err", text: err.error || "Could not create prospect" });
        return;
      }
      setShowAddForm(false);
      setNewName("");
      setNewArea("");
      setNewCuisine("");
      setNewQr("");
      setNewRank("");
      window.location.reload();
    } finally {
      setCsvBusy(false);
    }
  }

  async function patchProspect(
    prospectId: string,
    patch: {
      status?: ProspectStatus;
      contactPerson?: string | null;
      dateApproached?: string | null;
      outcomeNotes?: string | null;
      rewardOrOffer?: string | null;
      existingQrProvider?: string | null;
      newNote?: string;
    },
  ) {
    setBusyId(prospectId);
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as {
        prospect?: {
          status: ProspectStatus;
          contactPerson: string | null;
          dateApproached: string | null;
          outcomeNotes: string | null;
          rewardOrOffer: string | null;
          existingQrProvider: string | null;
          notesHistory: ProspectNoteEntry[];
          lastUpdatedByEmail: string | null;
          updatedAt: string;
        };
        error?: string;
      };
      if (!res.ok || !data.prospect) {
        setBanner({ type: "err", text: data.error || "Update failed" });
        return;
      }
      const updated = data.prospect;
      setProspects((prev) =>
        prev.map((item) =>
          item.id === prospectId
            ? {
                ...item,
                status: updated.status,
                contactPerson: updated.contactPerson,
                dateApproached: updated.dateApproached,
                outcomeNotes: updated.outcomeNotes,
                rewardOrOffer: updated.rewardOrOffer,
                existingQrProvider: updated.existingQrProvider,
                notesHistory: Array.isArray(updated.notesHistory)
                  ? updated.notesHistory
                  : item.notesHistory,
                lastUpdatedByEmail: updated.lastUpdatedByEmail,
                updatedAtIso: updated.updatedAt,
              }
            : item,
        ),
      );
      if (patch.newNote) {
        setNoteDrafts((prev) => ({ ...prev, [prospectId]: "" }));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function generateInviteLink(prospectId: string) {
    setBusyId(prospectId);
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert_invite" }),
      });
      const data = (await res.json()) as { inviteUrl?: string; error?: string };
      if (!res.ok || !data.inviteUrl) {
        setBanner({ type: "err", text: data.error || "Could not create invite link" });
        return;
      }
      setInviteUrls((prev) => ({ ...prev, [prospectId]: data.inviteUrl! }));
      await navigator.clipboard.writeText(data.inviteUrl).catch(() => {});
      setCopiedId(prospectId);
      setTimeout(() => setCopiedId(null), 2500);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      {/* Header & Top Actions */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {isAr ? "خط مبيعات المطاعم (CRM)" : "Restaurant Sales Pipeline (CRM)"}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {isAr
              ? "استورد أبحاث المطاعم عبر CSV، تابع الزيارات الميدانية، وحوّل المطاعم المهتمة إلى شركاء."
              : "Import research CSVs, prioritize field visits, log outreach notes, and convert owners into live partners."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)]">
            <Upload className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <span>{isAr ? "استيراد CSV" : "Import CSV"}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={csvBusy}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                void handleCsvFileSelected(file);
                e.currentTarget.value = "";
              }}
            />
          </label>

          <a
            href="/api/admin/prospects/export"
            download="prospects-export.csv"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-muted)]"
          >
            <Download className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <span>{isAr ? "تصدير CSV" : "Export CSV"}</span>
          </a>

          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{isAr ? "إضافة مطعم" : "Add Prospect"}</span>
          </button>
        </div>
      </div>

      {banner && (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
            banner.type === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200"
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* CSV Preview Modal / Banner before Import */}
      {csvPreview && (
        <div className="rounded-3xl border-2 border-[var(--accent-primary)] bg-[var(--bg-surface)] p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {isAr ? "معاينة استيراد CSV" : "Preview CSV Import"} —{" "}
                <span className="font-mono text-sm">{csvFileName}</span>
              </h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {isAr
                  ? `إجمالي الصفوف الفريدة (الاسم + المنطقة): ${csvPreview.totalUniqueRows} • جديد: ${csvPreview.newCount} • تحديث موجود: ${csvPreview.existingUpdateCount}`
                  : `Unique rows (deduped by Name + Area): ${csvPreview.totalUniqueRows} • New: ${csvPreview.newCount} • Existing updates: ${csvPreview.existingUpdateCount}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={csvBusy}
                onClick={() => {
                  setCsvPreview(null);
                  setPendingCsvText(null);
                  setCsvFileName(null);
                }}
                className="min-h-10 rounded-xl border border-[var(--border-subtle)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)]"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={csvBusy || csvPreview.totalUniqueRows === 0}
                onClick={confirmCsvImport}
                className="min-h-10 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
              >
                {csvBusy
                  ? isAr
                    ? "جارٍ الاستيراد..."
                    : "Importing..."
                  : isAr
                    ? `تأكيد استيراد ${csvPreview.totalUniqueRows} مطعم`
                    : `Confirm Import (${csvPreview.totalUniqueRows})`}
              </button>
            </div>
          </div>

          {csvPreview.sampleRows.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border-subtle)]">
              <table className="w-full text-start text-xs">
                <thead className="bg-[var(--bg-muted)] text-[var(--text-secondary)]">
                  <tr>
                    <th className="px-3 py-2 text-start">#</th>
                    <th className="px-3 py-2 text-start">Name</th>
                    <th className="px-3 py-2 text-start">Area / City</th>
                    <th className="px-3 py-2 text-start">Cuisine</th>
                    <th className="px-3 py-2 text-start">QR Provider</th>
                    <th className="px-3 py-2 text-start">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {csvPreview.sampleRows.slice(0, 8).map((r) => (
                    <tr key={r.normalizedKey}>
                      <td className="px-3 py-2 font-mono">{r.top30Rank ?? "—"}</td>
                      <td className="px-3 py-2 font-semibold text-[var(--text-primary)]">
                        {r.name}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">
                        {r.area || r.district || "—"} ({r.city})
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{r.cuisine || "—"}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">
                        {r.existingQrProvider || "—"}
                      </td>
                      <td className="px-3 py-2 font-semibold">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Quick Add Prospect Form */}
      {showAddForm && (
        <form
          onSubmit={handleQuickAdd}
          className="grid gap-3 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:grid-cols-3"
        >
          <input
            type="text"
            required
            placeholder={isAr ? "اسم المطعم *" : "Restaurant name *"}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
          />
          <input
            type="text"
            placeholder={
              isAr ? "المدينة (Dubai / Beirut / Frankfurt)" : "City (Dubai / Beirut / Frankfurt)"
            }
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
          />
          <input
            type="text"
            placeholder={isAr ? "المنطقة (مثل JLT, DIFC)" : "Area / District (e.g. JLT, DIFC)"}
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
            className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
          />
          <input
            type="text"
            placeholder={isAr ? "المطبخ" : "Cuisine (e.g. Lebanese)"}
            value={newCuisine}
            onChange={(e) => setNewCuisine(e.target.value)}
            className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
          />
          <input
            type="text"
            placeholder={
              isAr ? "مزود QR الحالي (Qlub, Foodics...)" : "Existing QR (e.g. Qlub, Foodics Pay)"
            }
            value={newQr}
            onChange={(e) => setNewQr(e.target.value)}
            className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={1000}
              placeholder={isAr ? "ترتيب Top 30" : "Top 30 Rank"}
              value={newRank}
              onChange={(e) => setNewRank(e.target.value)}
              className="min-h-10 w-28 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={csvBusy}
              className="min-h-10 flex-1 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-white"
            >
              {isAr ? "حفظ" : "Save"}
            </button>
          </div>
        </form>
      )}

      {/* KPI Chips + View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5">
            {isAr ? `الإجمالي: ${counts.total}` : `Total: ${counts.total}`}
          </span>
          <span className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-emerald-700 dark:text-emerald-300">
            🟢 {isAr ? `شريك (${counts.green})` : `GREEN Partner (${counts.green})`}
          </span>
          <span className="rounded-full bg-slate-500/15 px-3 py-1.5 text-slate-700 dark:text-slate-300">
            ⚪ {isAr ? `محتمل (${counts.grey})` : `GREY Potential (${counts.grey})`}
          </span>
          <span className="rounded-full bg-rose-500/15 px-3 py-1.5 text-rose-700 dark:text-rose-300">
            🔴 {isAr ? `مغلق/مرفوض (${counts.red})` : `RED Declined (${counts.red})`}
          </span>
        </div>

        <div className="inline-flex rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1">
          <button
            type="button"
            onClick={() => setViewMode("all")}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === "all"
                ? "bg-[var(--accent-primary)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isAr ? "جميع المطاعم" : "All Prospects"}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("next_to_visit")}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === "next_to_visit"
                ? "bg-[var(--accent-primary)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isAr ? "الزيارات القادمة (حسب الترتيب)" : "Next to Visit (By Rank)"}</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid gap-2.5 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:grid-cols-6">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={isAr ? "بحث بالاسم، المطبخ، QR..." : "Search name, cuisine, QR..."}
          className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs sm:col-span-2"
        />

        <select
          aria-label="City filter"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
        >
          <option value="ALL">{isAr ? "كل المدن" : "All Cities"}</option>
          {availableCities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={districtFilter}
          onChange={(e) => setDistrictFilter(e.target.value)}
          placeholder={isAr ? "المنطقة / الحي" : "District / Area"}
          className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
        />

        <select
          aria-label="Status filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "ALL" | ProspectStatus)}
          className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
        >
          <option value="ALL">{isAr ? "كل الحالات" : "All Statuses"}</option>
          <option value="GREEN">GREEN (Partner)</option>
          <option value="GREY">GREY (Potential)</option>
          <option value="RED">RED (Declined/Closed)</option>
        </select>

        <div className="flex flex-wrap items-center gap-3 px-1 text-xs font-medium text-[var(--text-primary)]">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={top30Only}
              onChange={(e) => setTop30Only(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent-primary)]"
            />
            <span>Top 30</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={hasQrOnly}
              onChange={(e) => setHasQrOnly(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent-primary)]"
            />
            <span>{isAr ? "لديه QR" : "Has QR"}</span>
          </label>
        </div>
      </div>

      {/* Prospect Cards / List */}
      {filteredProspects.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center text-sm text-[var(--text-secondary)]">
          {isAr
            ? "لا توجد مطاعم مطابقة للفلاتر الحالية. قم باستيراد ملف CSV للبدء."
            : "No prospects match the current filters. Upload your research CSV above or add a prospect manually."}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProspects.map((p) => {
            const isExpanded = expandedId === p.id;
            const inviteUrl = inviteUrls[p.id];

            return (
              <div
                key={p.id}
                className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs transition sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.top30Rank && (
                        <span className="rounded-lg bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-bold text-amber-800 dark:text-amber-300">
                          #{p.top30Rank}
                        </span>
                      )}
                      <h2 className="text-base font-bold text-[var(--text-primary)]">{p.name}</h2>
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        • {p.area || p.district || p.city} ({p.city})
                      </span>
                      {p.cuisine && (
                        <span className="rounded-full bg-[var(--bg-muted)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                          {p.cuisine}
                        </span>
                      )}
                      {p.priceTier && (
                        <span className="font-mono text-xs text-[var(--text-secondary)]">
                          {p.priceTier}
                        </span>
                      )}
                      {p.source === "website" && (
                        <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                          {isAr ? "طلب موقع" : "Inbound Demo Request"}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                      {p.existingQrProvider && (
                        <span>
                          <strong className="text-[var(--text-primary)]">QR:</strong>{" "}
                          {p.existingQrProvider}
                        </span>
                      )}
                      {p.ownership && (
                        <span>
                          <strong className="text-[var(--text-primary)]">Ownership:</strong>{" "}
                          {p.ownership}
                        </span>
                      )}
                      {p.phone && (
                        <a href={`tel:${p.phone}`} className="underline">
                          {p.phone}
                        </a>
                      )}
                      {p.instagram && <span>IG: {p.instagram}</span>}
                      {p.address && <span>📍 {p.address}</span>}
                    </div>

                    {p.whyFitNotes && (
                      <p className="pt-1 text-xs text-[var(--text-secondary)]">{p.whyFitNotes}</p>
                    )}
                  </div>

                  {/* Inline Status Chips & Convert Action */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(["GREEN", "GREY", "RED"] as const).map((st) => {
                      const active = p.status === st;
                      const chipClass =
                        st === "GREEN"
                          ? active
                            ? "bg-emerald-600 text-white"
                            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : st === "RED"
                            ? active
                              ? "bg-rose-600 text-white"
                              : "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                            : active
                              ? "bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900"
                              : "bg-slate-500/10 text-slate-700 dark:text-slate-300";

                      return (
                        <button
                          key={st}
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => void patchProspect(p.id, { status: st })}
                          className={`min-h-8 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${chipClass}`}
                        >
                          {st}
                        </button>
                      );
                    })}

                    {p.convertedRestaurant ? (
                      <Link
                        href="/admin/restaurants"
                        className="inline-flex min-h-8 items-center gap-1 rounded-xl bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-200"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {isAr ? "شريك مسجل:" : "Linked:"} {p.convertedRestaurant.slug}
                        </span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => void generateInviteLink(p.id)}
                        className="inline-flex min-h-8 items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
                      >
                        {copiedId === p.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                            <span>{isAr ? "تم نسخ الرابط" : "Invite Copied"}</span>
                          </>
                        ) : (
                          <>
                            <UserPlus
                              className="h-3.5 w-3.5 text-[var(--accent-primary)]"
                              aria-hidden="true"
                            />
                            <span>{isAr ? "تحويل إلى مطعم" : "Convert to Restaurant"}</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      className="min-h-8 rounded-xl px-2.5 py-1 text-xs font-semibold text-[var(--accent-primary)] underline"
                    >
                      {isExpanded
                        ? isAr
                          ? "إخفاء التفاصيل"
                          : "Hide"
                        : isAr
                          ? `ملاحظات (${p.notesHistory.length})`
                          : `Details & Notes (${p.notesHistory.length})`}
                    </button>
                  </div>
                </div>

                {inviteUrl && !p.convertedRestaurant && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs">
                    <span className="truncate font-mono text-emerald-900 dark:text-emerald-200">
                      {inviteUrl}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(inviteUrl);
                        setCopiedId(p.id);
                        setTimeout(() => setCopiedId(null), 2000);
                      }}
                      className="inline-flex items-center gap-1 font-semibold text-emerald-800 underline dark:text-emerald-200"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{isAr ? "نسخ" : "Copy"}</span>
                    </button>
                  </div>
                )}

                {/* Expanded CRM Outreach Details & Notes History */}
                {isExpanded && (
                  <div className="mt-4 space-y-4 border-t border-[var(--border-subtle)] pt-4">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                          {isAr ? "مسؤول التواصل" : "Contact Person"}
                        </label>
                        <input
                          type="text"
                          defaultValue={p.contactPerson ?? ""}
                          onBlur={(e) => {
                            const val = e.target.value.trim() || null;
                            if (val !== p.contactPerson) {
                              void patchProspect(p.id, { contactPerson: val });
                            }
                          }}
                          className="mt-1 w-full min-h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                          {isAr ? "تاريخ التواصل" : "Date Approached"}
                        </label>
                        <input
                          type="text"
                          placeholder="YYYY-MM-DD"
                          defaultValue={p.dateApproached ?? ""}
                          onBlur={(e) => {
                            const val = e.target.value.trim() || null;
                            if (val !== p.dateApproached) {
                              void patchProspect(p.id, { dateApproached: val });
                            }
                          }}
                          className="mt-1 w-full min-h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                          {isAr ? "العرض المتفق عليه" : "Reward / Offer"}
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. First month free"
                          defaultValue={p.rewardOrOffer ?? ""}
                          onBlur={(e) => {
                            const val = e.target.value.trim() || null;
                            if (val !== p.rewardOrOffer) {
                              void patchProspect(p.id, { rewardOrOffer: val });
                            }
                          }}
                          className="mt-1 w-full min-h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                          {isAr ? "مزود QR الحالي" : "Existing QR Provider"}
                        </label>
                        <input
                          type="text"
                          placeholder="Qlub, Foodics Pay..."
                          defaultValue={p.existingQrProvider ?? ""}
                          onBlur={(e) => {
                            const val = e.target.value.trim() || null;
                            if (val !== p.existingQrProvider) {
                              void patchProspect(p.id, { existingQrProvider: val });
                            }
                          }}
                          className="mt-1 w-full min-h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                        {isAr ? "ملخص النتيجة" : "Outcome Summary"}
                      </label>
                      <input
                        type="text"
                        defaultValue={p.outcomeNotes ?? ""}
                        onBlur={(e) => {
                          const val = e.target.value.trim() || null;
                          if (val !== p.outcomeNotes) {
                            void patchProspect(p.id, { outcomeNotes: val });
                          }
                        }}
                        className="mt-1 w-full min-h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs"
                      />
                    </div>

                    {/* Add timestamped note */}
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={noteDrafts[p.id] ?? ""}
                          onChange={(e) =>
                            setNoteDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder={
                            isAr
                              ? "أضف ملاحظة زيارة أو مكالمة (تُسجل باسمك والتاريخ)..."
                              : "Add outreach note (logged with your email & timestamp)..."
                          }
                          className="min-h-10 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
                        />
                        <button
                          type="button"
                          disabled={busyId === p.id || !(noteDrafts[p.id] ?? "").trim()}
                          onClick={() =>
                            void patchProspect(p.id, { newNote: (noteDrafts[p.id] ?? "").trim() })
                          }
                          className="min-h-10 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {isAr ? "إضافة ملاحظة" : "Log Note"}
                        </button>
                      </div>

                      {p.notesHistory.length > 0 && (
                        <ul className="space-y-1.5 rounded-2xl bg-[var(--bg-muted)] p-3 text-xs">
                          {p.notesHistory.map((n) => (
                            <li key={n.id} className="flex flex-wrap justify-between gap-2">
                              <span className="text-[var(--text-primary)]">{n.text}</span>
                              <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                                {n.actorEmail} • {new Date(n.createdAtIso).toLocaleString()}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
