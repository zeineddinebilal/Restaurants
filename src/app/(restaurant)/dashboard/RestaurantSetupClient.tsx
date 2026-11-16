"use client";

import { Building2, CheckCircle2, Clock, Plus, ShieldAlert, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/dictionaries";

interface BranchItem {
  id: string;
  nameEn: string;
  nameAr: string;
  city: string;
  addressEn: string | null;
  addressAr: string | null;
  isActive: boolean;
}

interface StaffMemberItem {
  id: string;
  branchId: string | null;
  isActive: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
  };
}

export interface SerializedRestaurantSummary {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  cuisine: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  allergenPersonInCharge: string | null;
  existingPaymentProvider: string;
  existingPaymentUrl: string | null;
  status: "PENDING" | "APPROVED" | "SUSPENDED";
  branches: BranchItem[];
  members: StaffMemberItem[];
  stats: {
    totalDishes: number;
    verifiedDishes: number;
    publishedDishes: number;
    activeTables: number;
  };
}

export function RestaurantSetupClient({
  locale,
  restaurants,
  active,
  inviteExpiredNotice,
}: {
  locale: Locale;
  restaurants: Array<{ id: string; nameEn: string; nameAr: string }>;
  active: SerializedRestaurantSummary | null;
  inviteExpiredNotice?: boolean;
}) {
  const router = useRouter();
  const isAr = locale === "ar";

  const [nameEn, setNameEn] = useState(active?.nameEn ?? "");
  const [nameAr, setNameAr] = useState(active?.nameAr ?? "");
  const [slug, setSlug] = useState(active?.slug ?? "");
  const [cuisine, setCuisine] = useState(active?.cuisine ?? "Lebanese");
  const [descriptionEn, setDescriptionEn] = useState(active?.descriptionEn ?? "");
  const [descriptionAr, setDescriptionAr] = useState(active?.descriptionAr ?? "");
  const [allergenPersonInCharge, setAllergenPersonInCharge] = useState(
    active?.allergenPersonInCharge ?? "",
  );
  const [existingPaymentProvider, setExistingPaymentProvider] = useState(
    active?.existingPaymentProvider ?? "NONE",
  );
  const [existingPaymentUrl, setExistingPaymentUrl] = useState(active?.existingPaymentUrl ?? "");
  const [initialCity, setInitialCity] = useState("Dubai");

  const [branchNameEn, setBranchNameEn] = useState("");
  const [branchNameAr, setBranchNameAr] = useState("");
  const [branchCity, setBranchCity] = useState("Dubai");
  const [branchAddressEn, setBranchAddressEn] = useState("");

  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");

  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreateRestaurant(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    const res = await fetch("/api/restaurant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nameEn,
        nameAr,
        slug: slug.trim() || undefined,
        cuisine,
        descriptionEn,
        descriptionAr,
        initialBranchCity: initialCity,
      }),
    });
    setSaving(false);

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setFeedback({ type: "err", text: data.error || "Failed to create restaurant" });
      return;
    }

    setFeedback({
      type: "ok",
      text: isAr ? "تم إنشاء المطعم بنجاح!" : "Restaurant created!",
    });
    router.refresh();
  }

  async function handleUpdateRestaurant(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    setSaving(true);
    setFeedback(null);

    const res = await fetch("/api/restaurant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: active.id,
        nameEn,
        nameAr,
        slug,
        cuisine,
        descriptionEn,
        descriptionAr,
        allergenPersonInCharge: allergenPersonInCharge.trim() || null,
        existingPaymentProvider,
        existingPaymentUrl: existingPaymentUrl.trim() || null,
      }),
    });
    setSaving(false);

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setFeedback({ type: "err", text: data.error || "Failed to save changes" });
      return;
    }

    setFeedback({
      type: "ok",
      text: isAr ? "تم حفظ بيانات المطعم." : "Restaurant details updated.",
    });
    router.refresh();
  }

  async function handleAddBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    setSaving(true);
    setFeedback(null);

    const res = await fetch(`/api/restaurant/${active.id}/branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nameEn: branchNameEn,
        nameAr: branchNameAr,
        city: branchCity,
        addressEn: branchAddressEn,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setFeedback({ type: "err", text: data.error || "Failed to add branch" });
      return;
    }

    setBranchNameEn("");
    setBranchNameAr("");
    setBranchAddressEn("");
    router.refresh();
  }

  async function toggleBranchActive(branchId: string, nextActive: boolean) {
    if (!active) return;
    await fetch(`/api/restaurant/${active.id}/branches`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, isActive: nextActive }),
    });
    router.refresh();
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    setSaving(true);
    setFeedback(null);

    const res = await fetch(`/api/restaurant/${active.id}/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: staffName,
        email: staffEmail,
        password: staffPassword,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setFeedback({ type: "err", text: data.error || "Failed to add staff member" });
      return;
    }

    setStaffName("");
    setStaffEmail("");
    setStaffPassword("");
    router.refresh();
  }

  async function toggleStaffActive(memberId: string, nextActive: boolean) {
    if (!active) return;
    await fetch(`/api/restaurant/${active.id}/staff`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, isActive: nextActive }),
    });
    router.refresh();
  }

  if (!active) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {isAr ? "تسجيل مطعمك الجديد" : "Create Your Restaurant"}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {isAr
              ? "أدخل اسم المطعم بالعربية والإنجليزية وابدأ بإعداد قائمتك المخصصة."
              : "Set up your bilingual UAE restaurant profile, first branch, and initial table."}
          </p>

          {inviteExpiredNotice && (
            <div
              role="status"
              className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/15 p-3 text-sm font-semibold text-amber-900 dark:text-amber-200"
            >
              {isAr
                ? "انتهت صلاحية رابط الدعوة أو تم استخدامه مسبقاً، يرجى التواصل معنا."
                : "Invite link expired or already used, contact us."}
            </div>
          )}

          {feedback && (
            <div
              role="alert"
              className="mt-4 rounded-xl bg-[var(--accent-soft)] p-3 text-sm font-medium text-[var(--accent-primary)]"
            >
              {feedback.text}
            </div>
          )}

          <form onSubmit={handleCreateRestaurant} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-sm font-medium">Restaurant Name (English)</label>
                <input
                  required
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="Cedar Terrace Kitchen"
                  className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium">اسم المطعم (بالعربية)</label>
                <input
                  required
                  dir="rtl"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder="مطبخ تراس الأرز"
                  className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-sm font-medium">Cuisine</label>
                <input
                  required
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                  className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium">First Branch Emirate / City</label>
                <input
                  required
                  value={initialCity}
                  onChange={(e) => setInitialCity(e.target.value)}
                  className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-12 rounded-xl bg-[var(--accent-primary)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {isAr ? "إنشاء المطعم والمتابعة" : "Create Restaurant & Continue"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      {/* Multi-restaurant switcher if Admin/Owner manages more than one */}
      {restaurants.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {restaurants.map((r) => (
            <Link
              key={r.id}
              href={`/dashboard?restaurantId=${r.id}`}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                r.id === active.id
                  ? "bg-[var(--accent-primary)] text-white"
                  : "border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
              }`}
            >
              {isAr ? r.nameAr : r.nameEn}
            </Link>
          ))}
        </div>
      )}

      {/* Status Banner + KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {active.status === "APPROVED" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : active.status === "PENDING" ? (
              <Clock className="h-4 w-4 text-amber-500" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-red-600" />
            )}
            <span>{isAr ? "الحالة" : "Status"}</span>
          </div>
          <p className="mt-2 text-lg font-bold">{active.status}</p>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            {isAr ? "إجمالي الأطباق" : "Total Dishes"}
          </p>
          <p className="mt-1 text-2xl font-bold">{active.stats.totalDishes}</p>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            {isAr ? "أطباق موثقة" : "Verified Safe Tags"}
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{active.stats.verifiedDishes}</p>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            {isAr ? "أطباق منشورة" : "Published"}
          </p>
          <p className="mt-1 text-2xl font-bold">{active.stats.publishedDishes}</p>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            {isAr ? "طاولات نشطة" : "Active QR Tables"}
          </p>
          <p className="mt-1 text-2xl font-bold">{active.stats.activeTables}</p>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            feedback.type === "ok"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Restaurant Details Editor */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
        <h2 className="text-xl font-bold">
          {isAr ? "بيانات المطعم الأساسية" : "Restaurant Profile (EN & AR)"}
        </h2>
        <form onSubmit={handleUpdateRestaurant} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium">Name (English)</label>
              <input
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium">الاسم (بالعربية)</label>
              <input
                required
                dir="rtl"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium">URL Slug (`/r/{slug}`)</label>
              <input
                required
                pattern="^[a-z0-9-]+$"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium">Cuisine</label>
              <input
                required
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium">Description (English)</label>
              <textarea
                rows={2}
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium">الوصف (بالعربية)</label>
              <textarea
                rows={2}
                dir="rtl"
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm"
              />
            </div>
          </div>

          {/* Allergen Documentation & Payment QR Coexistence */}
          <div className="grid gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium">
                {isAr
                  ? "المسؤول عن معلومات مسببات الحساسية"
                  : "Person in charge of allergen information"}
              </label>
              <input
                type="text"
                maxLength={120}
                value={allergenPersonInCharge}
                onChange={(e) => setAllergenPersonInCharge(e.target.value)}
                placeholder={isAr ? "مثال: الشيف التنفيذي كريم" : "e.g. Chef Karim Mansour"}
                className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-sm"
              />
              <p className="text-[11px] text-[var(--text-secondary)]">
                {isAr
                  ? "يساعدك على إبقاء معلومات مسببات الحساسية موثقة ومتسقة ويظهر على جدول مسببات الحساسية المطبوع."
                  : "Helps you keep allergen information documented and consistent; displayed on your printable Allergen Matrix."}
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium">
                {isAr ? "مزود دفع QR الحالي على الطاولة" : "Existing payment provider"}
              </label>
              <select
                value={existingPaymentProvider}
                onChange={(e) => setExistingPaymentProvider(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-sm"
              >
                <option value="NONE">{isAr ? "لا يوجد (الدفع عبر الكاشير)" : "None"}</option>
                <option value="QLUB">Qlub</option>
                <option value="FOODICS_PAY">Foodics Pay</option>
                <option value="FINEDINE">FineDine</option>
                <option value="OTHER">{isAr ? "مزود آخر" : "Other"}</option>
              </select>
              <p className="text-[11px] text-[var(--text-secondary)]">
                {isAr
                  ? "يعمل PlateFit جنباً إلى جنب مع رمز الدفع الحالي لديك."
                  : "PlateFit sits alongside your table payment QR and directs diners to pay there."}
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium">
                {isAr ? "رابط الدفع (اختياري)" : "Optional payment link (https://)"}
              </label>
              <input
                type="url"
                value={existingPaymentUrl}
                onChange={(e) => setExistingPaymentUrl(e.target.value)}
                placeholder="https://pay.qlub.io/..."
                className="w-full min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-11 items-center rounded-xl bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {isAr ? "حفظ التغييرات" : "Save Restaurant Details"}
          </button>
        </form>
      </section>

      {/* Branches & Staff Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Branches */}
        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[var(--accent-primary)]" />
            <h2 className="text-lg font-bold">{isAr ? "الفروع" : "Branches"}</h2>
          </div>

          <ul className="mt-4 space-y-2.5">
            {active.branches.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {b.nameEn} / {b.nameAr}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {b.city} {b.addressEn ? `• ${b.addressEn}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleBranchActive(b.id, !b.isActive)}
                  className={`min-h-9 rounded-full px-3 py-1 text-xs font-semibold ${
                    b.isActive
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-[var(--bg-muted)] text-[var(--text-secondary)]"
                  }`}
                >
                  {b.isActive ? (isAr ? "نشط" : "Active") : isAr ? "متوقف" : "Inactive"}
                </button>
              </li>
            ))}
          </ul>

          <form
            onSubmit={handleAddBranch}
            className="mt-5 space-y-3 border-t border-[var(--border-subtle)] pt-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              {isAr ? "إضافة فرع جديد" : "Add Branch"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                required
                placeholder="Branch Name (EN)"
                value={branchNameEn}
                onChange={(e) => setBranchNameEn(e.target.value)}
                className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
              />
              <input
                required
                dir="rtl"
                placeholder="اسم الفرع (عربي)"
                value={branchNameAr}
                onChange={(e) => setBranchNameAr(e.target.value)}
                className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                required
                placeholder="Emirate / City"
                value={branchCity}
                onChange={(e) => setBranchCity(e.target.value)}
                className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
              />
              <input
                placeholder="Address (optional)"
                value={branchAddressEn}
                onChange={(e) => setBranchAddressEn(e.target.value)}
                className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-2 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              <span>{isAr ? "إضافة فرع" : "Add Branch"}</span>
            </button>
          </form>
        </section>

        {/* Staff Accounts */}
        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--accent-primary)]" />
            <h2 className="text-lg font-bold">{isAr ? "طاقم العمل" : "Waiter & Kitchen Staff"}</h2>
          </div>

          <ul className="mt-4 space-y-2.5">
            {active.members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold">{m.user.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{m.user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleStaffActive(m.id, !m.isActive)}
                  className={`min-h-9 rounded-full px-3 py-1 text-xs font-semibold ${
                    m.isActive
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-red-500/15 text-red-700 dark:text-red-300"
                  }`}
                >
                  {m.isActive ? (isAr ? "مفعّل" : "Active") : isAr ? "موقوف" : "Deactivated"}
                </button>
              </li>
            ))}
          </ul>

          <form
            onSubmit={handleAddStaff}
            className="mt-5 space-y-3 border-t border-[var(--border-subtle)] pt-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              {isAr ? "إضافة موظف لشاشة الطلبات" : "Add Staff Account"}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                required
                placeholder="Staff Name"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
              />
              <input
                required
                type="email"
                placeholder="staff@example.com"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
              />
              <input
                required
                type="password"
                minLength={8}
                placeholder="Password (min 8)"
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-2 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              <span>{isAr ? "إضافة موظف" : "Create / Assign Staff"}</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
