"use client";

import type { MeatType, SpiceLevel, VerificationStatus } from "@prisma/client";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  FileUp,
  ImagePlus,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/dictionaries";
import {
  ALLERGEN_LABELS,
  CANONICAL_ALLERGENS,
  CANONICAL_DIET_TAGS,
  DIET_TAG_LABELS,
  MEAT_TYPES,
  SPICE_LEVELS,
} from "@/lib/menu/taxonomy";

export interface SerializedModifier {
  id?: string;
  nameEn: string;
  nameAr: string;
  priceDeltaAed: string;
  removesAllergens: string[];
  addsDietTags: string[];
  verificationStatus: VerificationStatus;
}

export interface SerializedMenuItem {
  id: string;
  categoryId: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  priceAed: string;
  portionSize: string | null;
  caloriesKcal: number | null;
  ingredientsEn: string[];
  ingredientsAr: string[];
  removableIngredients: string[];
  removableIngredientsVerified: boolean;
  dietTags: string[];
  allergens: string[];
  allergenDataProvided: boolean;
  spiceLevel: SpiceLevel;
  meatType: MeatType;
  verificationStatus: VerificationStatus;
  aiConfidence: string | null;
  isAvailable: boolean;
  isPopular: boolean;
  isPublished: boolean;
  imageUrl: string | null;
  modifiers: SerializedModifier[];
}

export interface SerializedCategory {
  id: string;
  nameEn: string;
  nameAr: string;
  sortOrder: number;
  items: SerializedMenuItem[];
}

interface IngestReviewItem {
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  priceAed: string;
  portionSize: string;
  ingredientsEn: string[];
  ingredientsAr: string[];
  removableIngredients: string[];
  removableIngredientsVerified: boolean;
  dietTags: string[];
  allergens: string[];
  allergenDataProvided: boolean;
  spiceLevel: SpiceLevel;
  meatType: MeatType;
  aiConfidence: string | null;
  verifyNow: boolean;
  modifiers: SerializedModifier[];
}

interface IngestReviewCategory {
  nameEn: string;
  nameAr: string;
  items: IngestReviewItem[];
}

function toggleArrayValue(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function MenuBuilderClient({
  locale,
  restaurantId,
  restaurantName,
  categories,
  aiConfigured,
  photoUploadStatus,
}: {
  locale: Locale;
  restaurantId: string;
  restaurantName: string;
  categories: SerializedCategory[];
  aiConfigured: boolean;
  photoUploadStatus: { enabled: boolean; mode: string; reason?: string };
}) {
  const router = useRouter();
  const isAr = locale === "ar";

  const [pastedText, setPastedText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [ingesting, setIngesting] = useState(false);
  const [reviewCategories, setReviewCategories] = useState<IngestReviewCategory[] | null>(null);

  const [newCatEn, setNewCatEn] = useState("");
  const [newCatAr, setNewCatAr] = useState("");

  // Explicit selection state required for bulk_verify (empty selection is never allowed)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [confirmingVerifyItems, setConfirmingVerifyItems] = useState<SerializedMenuItem[] | null>(
    null,
  );

  const [editingItem, setEditingItem] = useState<{
    isNew: boolean;
    id?: string;
    categoryId: string;
    nameEn: string;
    nameAr: string;
    descriptionEn: string;
    descriptionAr: string;
    priceAed: string;
    portionSize: string;
    caloriesKcalText: string;
    ingredientsEnText: string;
    ingredientsArText: string;
    removableIngredientsText: string;
    removableIngredientsVerified: boolean;
    dietTags: string[];
    allergens: string[];
    allergenDataProvided: boolean;
    spiceLevel: SpiceLevel;
    meatType: MeatType;
    isPopular: boolean;
    isPublished: boolean;
    imageUrl: string;
    modifiers: SerializedModifier[];
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const allItemsFlat = categories.flatMap((c) => c.items);

  async function handleRunAiIngestion(e: React.FormEvent) {
    e.preventDefault();
    setIngesting(true);
    setBanner(null);

    const formData = new FormData();
    if (pastedText.trim()) {
      formData.append("pastedText", pastedText.trim());
    }
    for (const file of selectedFiles) {
      formData.append("files", file);
    }

    const res = await fetch(`/api/restaurant/${restaurantId}/menu/ingest`, {
      method: "POST",
      body: formData,
    });
    setIngesting(false);

    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      categories?: Array<{
        nameEn: string;
        nameAr: string;
        items: Array<Omit<IngestReviewItem, "verifyNow">>;
      }>;
    };

    if (!res.ok || !payload.categories) {
      setBanner({ type: "err", text: payload.error || "AI extraction failed" });
      return;
    }

    // AI outputs ALWAYS default to allergenDataProvided: false and verifyNow: false
    setReviewCategories(
      payload.categories.map((cat) => ({
        nameEn: cat.nameEn,
        nameAr: cat.nameAr,
        items: cat.items.map((it) => ({
          ...it,
          removableIngredients: it.removableIngredients ?? [],
          removableIngredientsVerified: false,
          allergenDataProvided: false,
          verifyNow: false,
        })),
      })),
    );
  }

  async function handleImportReviewedMenu(publishImmediately: boolean) {
    if (!reviewCategories) return;
    setBusy(true);
    setBanner(null);

    const res = await fetch(`/api/restaurant/${restaurantId}/menu/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "batch",
        publishImmediately,
        categories: reviewCategories,
      }),
    });
    setBusy(false);

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      importedCount?: number;
      verifiedCount?: number;
      validationWarnings?: Array<{ nameEn: string; message: string }>;
    };
    if (!res.ok) {
      setBanner({ type: "err", text: data.error || "Failed to save extracted menu" });
      return;
    }

    setReviewCategories(null);
    setPastedText("");
    setSelectedFiles([]);

    const warningNote =
      data.validationWarnings && data.validationWarnings.length > 0
        ? ` (${data.validationWarnings.length} dish(es) imported as AI_SUGGESTED because safety checks failed: ${data.validationWarnings.map((w) => w.nameEn).join(", ")})`
        : "";

    setBanner({
      type: "ok",
      text: `Imported ${data.importedCount ?? 0} dishes (${data.verifiedCount ?? 0} verified)${warningNote}.`,
    });
    router.refresh();
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setBanner(null);

    const res = await fetch(`/api/restaurant/${restaurantId}/menu/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nameEn: newCatEn, nameAr: newCatAr }),
    });
    setBusy(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setBanner({ type: "err", text: data.error || "Could not create category" });
      return;
    }

    setNewCatEn("");
    setNewCatAr("");
    router.refresh();
  }

  async function handleDeleteCategory(categoryId: string) {
    setBusy(true);
    setBanner(null);
    const res = await fetch(
      `/api/restaurant/${restaurantId}/menu/categories?categoryId=${encodeURIComponent(categoryId)}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setBanner({ type: "err", text: data.error || "Cannot delete category" });
      return;
    }
    router.refresh();
  }

  function openBulkVerifyDialog() {
    const picked = allItemsFlat.filter((i) => selectedItemIds.includes(i.id));
    if (picked.length === 0) {
      setBanner({
        type: "err",
        text: isAr
          ? "يرجى تحديد طبق واحد على الأقل لمراجعة مسببات الحساسية وتوثيقه."
          : "Select at least one dish using the row checkboxes before bulk verifying.",
      });
      return;
    }
    setConfirmingVerifyItems(picked);
  }

  async function handleConfirmVerifyModal() {
    if (!confirmingVerifyItems || confirmingVerifyItems.length === 0) return;
    setBusy(true);
    setBanner(null);

    // Owner has explicitly reviewed every dish & its allergens in this modal:
    // mark allergenDataProvided = true + reverify = true on each reviewed item
    let verifiedCount = 0;
    const errors: string[] = [];

    for (const item of confirmingVerifyItems) {
      const res = await fetch(`/api/restaurant/${restaurantId}/menu/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allergenDataProvided: true,
          reverify: true,
        }),
      });
      if (res.ok) {
        verifiedCount++;
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        errors.push(`${item.nameEn}: ${data.error || "Failed"}`);
      }
    }

    setBusy(false);
    setConfirmingVerifyItems(null);
    setSelectedItemIds([]);

    if (errors.length > 0) {
      setBanner({
        type: "err",
        text: `Verified ${verifiedCount}. Skipped: ${errors.join(" | ")}`,
      });
    } else {
      setBanner({
        type: "ok",
        text: `Restaurant-verified ${verifiedCount} dish(es).`,
      });
    }
    router.refresh();
  }

  async function handleBulkPublishToggle(action: "bulk_publish" | "bulk_unpublish") {
    setBusy(true);
    setBanner(null);
    const res = await fetch(`/api/restaurant/${restaurantId}/menu/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        itemIds: selectedItemIds.length > 0 ? selectedItemIds : undefined,
      }),
    });
    setBusy(false);
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      updatedCount?: number;
    };

    if (!res.ok) {
      setBanner({ type: "err", text: data.error || "Publish update failed" });
      return;
    }

    setBanner({ type: "ok", text: `Updated ${data.updatedCount ?? 0} dishes.` });
    router.refresh();
  }

  async function handleTogglePublish(item: SerializedMenuItem) {
    await fetch(`/api/restaurant/${restaurantId}/menu/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !item.isPublished }),
    });
    router.refresh();
  }

  function openNewDishModal(defaultCategoryId: string) {
    setEditingItem({
      isNew: true,
      categoryId: defaultCategoryId,
      nameEn: "",
      nameAr: "",
      descriptionEn: "",
      descriptionAr: "",
      priceAed: "25.00",
      portionSize: "Regular",
      caloriesKcalText: "",
      ingredientsEnText: "",
      ingredientsArText: "",
      removableIngredientsText: "",
      removableIngredientsVerified: false,
      dietTags: ["halal"],
      allergens: [],
      // Must default to false until the human explicitly ticks the confirmation checkbox
      allergenDataProvided: false,
      spiceLevel: "NONE",
      meatType: "NONE",
      isPopular: false,
      isPublished: true,
      imageUrl: "",
      modifiers: [],
    });
  }

  function openEditDishModal(item: SerializedMenuItem) {
    setEditingItem({
      isNew: false,
      id: item.id,
      categoryId: item.categoryId,
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      descriptionEn: item.descriptionEn ?? "",
      descriptionAr: item.descriptionAr ?? "",
      priceAed: item.priceAed,
      portionSize: item.portionSize ?? "",
      caloriesKcalText: item.caloriesKcal != null ? String(item.caloriesKcal) : "",
      ingredientsEnText: item.ingredientsEn.join(", "),
      ingredientsArText: item.ingredientsAr.join("، "),
      removableIngredientsText: item.removableIngredients.join(", "),
      removableIngredientsVerified: item.removableIngredientsVerified,
      dietTags: [...item.dietTags],
      allergens: [...item.allergens],
      allergenDataProvided: item.allergenDataProvided,
      spiceLevel: item.spiceLevel,
      meatType: item.meatType,
      isPopular: item.isPopular,
      isPublished: item.isPublished,
      imageUrl: item.imageUrl ?? "",
      modifiers: item.modifiers.map((m) => ({ ...m })),
    });
  }

  async function handleAiSuggestForEditingItem() {
    if (!editingItem || !editingItem.nameEn.trim()) return;
    setBusy(true);
    setBanner(null);

    const res = await fetch(`/api/restaurant/${restaurantId}/menu/tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dishes: [
          {
            nameEn: editingItem.nameEn,
            nameAr: editingItem.nameAr,
            descriptionEn: editingItem.descriptionEn,
            ingredientsEn: editingItem.ingredientsEnText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          },
        ],
      }),
    });
    setBusy(false);

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      items?: Array<{
        dietTags: string[];
        allergens: string[];
        removableIngredients?: string[];
        spiceLevel: SpiceLevel;
        meatType: MeatType;
        suggestedModifiers: SerializedModifier[];
      }>;
    };

    if (!res.ok || !data.items?.[0]) {
      setBanner({ type: "err", text: data.error || "AI tagging unavailable" });
      return;
    }

    const suggestion = data.items[0];
    setEditingItem({
      ...editingItem,
      dietTags: suggestion.dietTags,
      allergens: suggestion.allergens,
      removableIngredientsText: suggestion.removableIngredients?.length
        ? suggestion.removableIngredients.join(", ")
        : editingItem.removableIngredientsText,
      removableIngredientsVerified: false,
      spiceLevel: suggestion.spiceLevel,
      meatType: suggestion.meatType,
      // AI suggestions NEVER count as human-confirmed allergen data
      allergenDataProvided: false,
      modifiers:
        suggestion.suggestedModifiers.length > 0
          ? suggestion.suggestedModifiers
          : editingItem.modifiers,
    });
  }

  async function handlePhotoUpload(file: File) {
    if (!editingItem) return;
    setBusy(true);
    const formData = new FormData();
    formData.append("photo", file);

    const res = await fetch(`/api/restaurant/${restaurantId}/menu/photo`, {
      method: "POST",
      body: formData,
    });
    setBusy(false);

    const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
    if (!res.ok || !data.url) {
      setBanner({ type: "err", text: data.error || "Photo upload failed" });
      return;
    }
    setEditingItem({ ...editingItem, imageUrl: data.url });
  }

  async function handleSaveEditingItem(verifyAndSave: boolean) {
    if (!editingItem) return;
    if (verifyAndSave && !editingItem.allergenDataProvided) {
      setBanner({
        type: "err",
        text: "Tick the allergen confirmation checkbox in the form before verifying this dish.",
      });
      return;
    }

    setBusy(true);
    setBanner(null);

    const ingredientsEn = editingItem.ingredientsEnText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ingredientsAr = editingItem.ingredientsArText
      .split(/[،,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const removableIngredients = editingItem.removableIngredientsText
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const parsedKcal = editingItem.caloriesKcalText.trim()
      ? Number.parseInt(editingItem.caloriesKcalText.trim(), 10)
      : null;
    const caloriesKcal =
      parsedKcal !== null && Number.isFinite(parsedKcal) && parsedKcal >= 0 ? parsedKcal : null;

    const payload = {
      categoryId: editingItem.categoryId,
      nameEn: editingItem.nameEn,
      nameAr: editingItem.nameAr,
      descriptionEn: editingItem.descriptionEn || null,
      descriptionAr: editingItem.descriptionAr || null,
      priceAed: editingItem.priceAed,
      portionSize: editingItem.portionSize || null,
      caloriesKcal,
      ingredientsEn,
      ingredientsAr,
      removableIngredients,
      removableIngredientsVerified: verifyAndSave || editingItem.removableIngredientsVerified,
      dietTags: editingItem.dietTags,
      allergens: editingItem.allergens,
      allergenDataProvided: editingItem.allergenDataProvided,
      spiceLevel: editingItem.spiceLevel,
      meatType: editingItem.meatType,
      isPopular: editingItem.isPopular,
      isPublished: editingItem.isPublished,
      imageUrl: editingItem.imageUrl || null,
      modifiers: editingItem.modifiers.map((m) => ({
        nameEn: m.nameEn,
        nameAr: m.nameAr,
        priceDeltaAed: m.priceDeltaAed,
        removesAllergens: m.removesAllergens,
        addsDietTags: m.addsDietTags,
      })),
      ...(editingItem.isNew ? { verifyNow: verifyAndSave } : { reverify: verifyAndSave }),
    };

    const url = editingItem.isNew
      ? `/api/restaurant/${restaurantId}/menu/items`
      : `/api/restaurant/${restaurantId}/menu/items/${editingItem.id}`;

    const res = await fetch(url, {
      method: editingItem.isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setBanner({ type: "err", text: data.error || "Could not save dish" });
      return;
    }

    setEditingItem(null);
    router.refresh();
  }

  async function handleDeleteItem(itemId: string) {
    setBusy(true);
    await fetch(`/api/restaurant/${restaurantId}/menu/items/${itemId}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {isAr
              ? `منشئ القائمة والتوثيق — ${restaurantName}`
              : `Menu Builder — ${restaurantName}`}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {isAr
              ? "ارفع قائمة مطعمك بالذكاء الاصطناعي، راجع الأطباق، أكّد مسببات الحساسية يدوياً، وانشر القائمة بأمان."
              : "Upload menu photos/PDF or text for AI extraction, explicitly confirm allergen tags, and publish."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || selectedItemIds.length === 0}
            onClick={openBulkVerifyDialog}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {isAr
                ? `مراجعة وتوثيق المحدد (${selectedItemIds.length})`
                : `Review & Verify Selected (${selectedItemIds.length})`}
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleBulkPublishToggle("bulk_publish")}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-semibold"
          >
            <Eye className="h-4 w-4" />
            <span>{isAr ? "نشر الكل" : "Publish All"}</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleBulkPublishToggle("bulk_unpublish")}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-semibold"
          >
            <EyeOff className="h-4 w-4" />
            <span>{isAr ? "إلغاء نشر الكل" : "Unpublish All"}</span>
          </button>
        </div>
      </div>

      {banner && (
        <div
          role="alert"
          className={`rounded-2xl px-4 py-3 text-sm font-medium ${
            banner.type === "ok"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* AI Ingestion Card */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--accent-primary)]" />
            <h2 className="text-lg font-bold">
              {isAr
                ? "استخراج القائمة وتصنيف الأطباق بالذكاء الاصطناعي"
                : "AI Menu Ingestion & Dish Tagging"}
            </h2>
          </div>
          {!aiConfigured && (
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {isAr ? "الذكاء الاصطناعي غير مُعدّ" : "AI not configured"}
            </span>
          )}
        </div>

        {!aiConfigured ? (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {isAr
              ? "مفتاح GEMINI_API_KEY غير مضاف حالياً. يمكنك إضافة الفئات والأطباق يدوياً أدناه بالكامل."
              : "GEMINI_API_KEY is not configured. You can still create categories, add dishes, verify allergens, and publish manually below."}
          </p>
        ) : (
          <form onSubmit={handleRunAiIngestion} className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium">
                  {isAr
                    ? "رفع صور القائمة أو ملف PDF (تُعالج في الذاكرة فقط)"
                    : "Upload Menu Photo(s) or PDF (processed in-memory)"}
                </label>
                <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 text-center text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]">
                  <FileUp className="mb-1.5 h-5 w-5 text-[var(--accent-primary)]" />
                  <span>
                    {selectedFiles.length > 0
                      ? `${selectedFiles.length} file(s) selected`
                      : "JPEG, PNG, WebP, or PDF (up to 5 files / 15 MB)"}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => setSelectedFiles(Array.from(e.target.files ?? []))}
                    className="sr-only"
                  />
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium">
                  {isAr ? "أو الصق نص القائمة هنا" : "Or Paste Menu Text"}
                </label>
                <textarea
                  rows={3}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Cold Mezze: Hummus AED 22, Moutabal AED 25..."
                  className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={ingesting || (!pastedText.trim() && selectedFiles.length === 0)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              <span>
                {ingesting
                  ? isAr
                    ? "جاري الاستخراج والتصنيف..."
                    : "Extracting & Tagging Menu..."
                  : isAr
                    ? "استخراج ومراجعة القائمة"
                    : "Extract & Review with AI"}
              </span>
            </button>
          </form>
        )}

        {/* Editable AI Review Table before importing */}
        {reviewCategories && (
          <div className="mt-6 space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold">
                  {isAr
                    ? "جدول مراجعة الأطباق المستخرجة (قابلة للتعديل قبل الحفظ)"
                    : "Editable AI Extraction Review Table"}
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  All AI tags start unconfirmed (`allergenDataProvided = false`, `AI_SUGGESTED`).
                  Only tick &ldquo;Confirm &amp; Verify&rdquo; on rows whose allergens you have
                  personally checked.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleImportReviewedMenu(false)}
                  className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-semibold"
                >
                  Save as Drafts
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleImportReviewedMenu(true)}
                  className="min-h-10 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-white"
                >
                  Save & Publish Menu
                </button>
              </div>
            </div>

            {reviewCategories.map((cat, cIdx) => (
              <div
                key={`${cat.nameEn}-${cIdx}`}
                className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={cat.nameEn}
                    onChange={(e) => {
                      const next = [...reviewCategories];
                      next[cIdx] = { ...cat, nameEn: e.target.value };
                      setReviewCategories(next);
                    }}
                    className="min-h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm font-semibold"
                  />
                  <input
                    dir="rtl"
                    value={cat.nameAr}
                    onChange={(e) => {
                      const next = [...reviewCategories];
                      next[cIdx] = { ...cat, nameAr: e.target.value };
                      setReviewCategories(next);
                    }}
                    className="min-h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm font-semibold"
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                        <th className="py-2 pe-2 text-start">EN Name</th>
                        <th className="py-2 pe-2 text-start">AR Name</th>
                        <th className="py-2 pe-2 text-start">AED</th>
                        <th className="py-2 pe-2 text-start">Allergens</th>
                        <th className="py-2 pe-2 text-start">Diet Tags</th>
                        <th className="py-2 pe-2 text-start">Confirm &amp; Verify</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {cat.items.map((it, iIdx) => (
                        <tr key={`${it.nameEn}-${iIdx}`}>
                          <td className="py-2 pe-2">
                            <input
                              value={it.nameEn}
                              onChange={(e) => {
                                const next = [...reviewCategories];
                                const items = [...next[cIdx]!.items];
                                items[iIdx] = { ...it, nameEn: e.target.value };
                                next[cIdx] = { ...cat, items };
                                setReviewCategories(next);
                              }}
                              className="w-40 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1"
                            />
                          </td>
                          <td className="py-2 pe-2">
                            <input
                              dir="rtl"
                              value={it.nameAr}
                              onChange={(e) => {
                                const next = [...reviewCategories];
                                const items = [...next[cIdx]!.items];
                                items[iIdx] = { ...it, nameAr: e.target.value };
                                next[cIdx] = { ...cat, items };
                                setReviewCategories(next);
                              }}
                              className="w-40 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1"
                            />
                          </td>
                          <td className="py-2 pe-2">
                            <input
                              value={it.priceAed}
                              onChange={(e) => {
                                const next = [...reviewCategories];
                                const items = [...next[cIdx]!.items];
                                items[iIdx] = { ...it, priceAed: e.target.value };
                                next[cIdx] = { ...cat, items };
                                setReviewCategories(next);
                              }}
                              className="w-20 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1 font-mono"
                            />
                          </td>
                          <td className="py-2 pe-2">
                            <div className="flex max-w-xs flex-wrap gap-1">
                              {CANONICAL_ALLERGENS.slice(0, 8).map((alg) => (
                                <button
                                  key={alg}
                                  type="button"
                                  onClick={() => {
                                    const next = [...reviewCategories];
                                    const items = [...next[cIdx]!.items];
                                    // Editing allergen chips does NOT auto-set allergenDataProvided
                                    items[iIdx] = {
                                      ...it,
                                      allergens: toggleArrayValue(it.allergens, alg),
                                    };
                                    next[cIdx] = { ...cat, items };
                                    setReviewCategories(next);
                                  }}
                                  className={`rounded px-1.5 py-0.5 text-[11px] ${
                                    it.allergens.includes(alg)
                                      ? "bg-red-500/20 font-semibold text-red-700 dark:text-red-300"
                                      : "bg-[var(--bg-muted)] text-[var(--text-secondary)]"
                                  }`}
                                >
                                  {alg}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 pe-2">
                            <div className="flex flex-wrap gap-1">
                              {CANONICAL_DIET_TAGS.map((dt) => (
                                <button
                                  key={dt}
                                  type="button"
                                  onClick={() => {
                                    const next = [...reviewCategories];
                                    const items = [...next[cIdx]!.items];
                                    items[iIdx] = {
                                      ...it,
                                      dietTags: toggleArrayValue(it.dietTags, dt),
                                    };
                                    next[cIdx] = { ...cat, items };
                                    setReviewCategories(next);
                                  }}
                                  className={`rounded px-1.5 py-0.5 text-[11px] ${
                                    it.dietTags.includes(dt)
                                      ? "bg-emerald-500/20 font-semibold text-emerald-700 dark:text-emerald-300"
                                      : "bg-[var(--bg-muted)] text-[var(--text-secondary)]"
                                  }`}
                                >
                                  {dt}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="py-2">
                            <input
                              type="checkbox"
                              checked={it.verifyNow}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const next = [...reviewCategories];
                                const items = [...next[cIdx]!.items];
                                items[iIdx] = {
                                  ...it,
                                  allergenDataProvided: checked,
                                  verifyNow: checked,
                                };
                                next[cIdx] = { ...cat, items };
                                setReviewCategories(next);
                              }}
                              aria-label={`Confirm allergens and verify ${it.nameEn}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Category Form */}
      <form
        onSubmit={handleAddCategory}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
      >
        <div className="flex-1 min-w-48 space-y-1">
          <label className="block text-xs font-semibold text-[var(--text-secondary)]">
            New Category (English)
          </label>
          <input
            required
            value={newCatEn}
            onChange={(e) => setNewCatEn(e.target.value)}
            placeholder="Cold Mezze"
            className="w-full min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1 min-w-48 space-y-1">
          <label className="block text-xs font-semibold text-[var(--text-secondary)]">
            اسم الفئة الجديدة (عربي)
          </label>
          <input
            required
            dir="rtl"
            value={newCatAr}
            onChange={(e) => setNewCatAr(e.target.value)}
            placeholder="مقبلات باردة"
            className="w-full min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          <span>{isAr ? "إضافة فئة" : "Add Category"}</span>
        </button>
      </form>

      {/* Categories & Dishes List */}
      <div className="space-y-6">
        {categories.map((cat) => (
          <section
            key={cat.id}
            className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
              <div>
                <h2 className="text-lg font-bold">
                  {cat.nameEn} <span className="text-[var(--text-secondary)]">/ {cat.nameAr}</span>
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">{cat.items.length} dishes</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openNewDishModal(cat.id)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-semibold text-white"
                >
                  <Plus className="h-4 w-4" />
                  <span>{isAr ? "إضافة طبق" : "Add Dish"}</span>
                </button>
                {cat.items.length === 0 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(cat.id)}
                    aria-label={`Delete category ${cat.nameEn}`}
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-[var(--border-subtle)] text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 divide-y divide-[var(--border-subtle)]">
              {cat.items.map((item) => {
                const isVerified = item.verificationStatus === "RESTAURANT_VERIFIED";
                const isSelected = selectedItemIds.includes(item.id);

                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between gap-4 py-4 md:flex-row md:items-center"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() =>
                          setSelectedItemIds((prev) => toggleArrayValue(prev, item.id))
                        }
                        aria-label={`Select ${item.nameEn}`}
                        className="mt-1 h-4 w-4 rounded"
                      />
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[var(--text-primary)]">
                            {item.nameEn}
                          </span>
                          <span className="text-sm text-[var(--text-secondary)]" dir="rtl">
                            ({item.nameAr})
                          </span>
                          <span className="rounded-lg bg-[var(--bg-muted)] px-2.5 py-0.5 font-mono text-xs font-bold">
                            AED {item.priceAed}
                          </span>

                          {isVerified ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Restaurant Verified</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <span>AI Suggested (Unverified)</span>
                            </span>
                          )}

                          {!item.allergenDataProvided && (
                            <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
                              Allergen Data Unconfirmed
                            </span>
                          )}

                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              item.isPublished
                                ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                : "bg-[var(--bg-muted)] text-[var(--text-secondary)]"
                            }`}
                          >
                            {item.isPublished ? "Published" : "Draft"}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5 text-xs">
                          {item.dietTags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300"
                            >
                              {tag}
                            </span>
                          ))}
                          {item.allergens.length > 0 ? (
                            item.allergens.map((alg) => (
                              <span
                                key={alg}
                                className="rounded-md bg-red-500/10 px-2 py-0.5 text-red-700 dark:text-red-300"
                              >
                                Allergen: {alg}
                              </span>
                            ))
                          ) : item.allergenDataProvided ? (
                            <span className="text-[var(--text-secondary)]">
                              Confirmed 0 major allergens
                            </span>
                          ) : null}
                          {item.modifiers.length > 0 && (
                            <span className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[var(--accent-primary)]">
                              {item.modifiers.length} modifier(s)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isVerified && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmingVerifyItems([item])}
                          className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Review &amp; Verify</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleTogglePublish(item)}
                        className="inline-flex min-h-9 items-center rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium"
                      >
                        {item.isPublished ? "Unpublish" : "Publish"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditDishModal(item)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs font-medium"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        aria-label={`Delete ${item.nameEn}`}
                        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] text-red-600 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Explicit Allergen Verification Confirmation Modal (shows dishes + allergens before confirming) */}
      {confirmingVerifyItems && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xl">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              Confirm Allergen &amp; Diet Safety Verification
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              Please review the exact allergens, diet tags, meat type, and modifiers for each dish
              below. Confirming marks these dishes as <strong>RESTAURANT_VERIFIED</strong> so
              allergic diners may see them as safe.
            </p>

            <ul className="mt-4 divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
              {confirmingVerifyItems.map((it) => (
                <li key={it.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">
                      {it.nameEn} ({it.nameAr})
                    </span>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">
                      Meat: {it.meatType}
                    </span>
                  </div>
                  <p className="text-xs">
                    <strong>Allergens:</strong>{" "}
                    {it.allergens.length > 0 ? it.allergens.join(", ") : "None (0 major allergens)"}
                  </p>
                  <p className="text-xs">
                    <strong>Diet tags:</strong>{" "}
                    {it.dietTags.length > 0 ? it.dietTags.join(", ") : "None"}
                  </p>
                  {it.modifiers.length > 0 && (
                    <p className="text-xs text-[var(--accent-primary)]">
                      <strong>Modifiers:</strong>{" "}
                      {it.modifiers
                        .map(
                          (m) =>
                            `${m.nameEn} (removes: ${m.removesAllergens.join(", ") || "none"})`,
                        )
                        .join("; ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingVerifyItems(null)}
                className="min-h-10 rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmVerifyModal}
                className="min-h-10 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                I Confirm Allergens Are Accurate — Verify ({confirmingVerifyItems.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dish & Modifiers Modal */}
      {editingItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
              <h2 className="text-xl font-bold">
                {editingItem.isNew ? "Add Menu Item" : `Edit — ${editingItem.nameEn}`}
              </h2>
              {aiConfigured && (
                <button
                  type="button"
                  disabled={busy || !editingItem.nameEn.trim()}
                  onClick={handleAiSuggestForEditingItem}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-primary)]"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>AI Suggest Allergens &amp; Tags</span>
                </button>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold">Name (English)</label>
                  <input
                    required
                    value={editingItem.nameEn}
                    onChange={(e) => setEditingItem({ ...editingItem, nameEn: e.target.value })}
                    className="w-full min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold">الاسم (بالعربية)</label>
                  <input
                    required
                    dir="rtl"
                    value={editingItem.nameAr}
                    onChange={(e) => setEditingItem({ ...editingItem, nameAr: e.target.value })}
                    className="w-full min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold">Price (AED, 2 decimals)</label>
                  <input
                    required
                    value={editingItem.priceAed}
                    onChange={(e) => setEditingItem({ ...editingItem, priceAed: e.target.value })}
                    className="w-full min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold">Calories (kcal, optional)</label>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    placeholder="e.g. 420"
                    value={editingItem.caloriesKcalText}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, caloriesKcalText: e.target.value })
                    }
                    className="w-full min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold">Meat Type</label>
                  <select
                    value={editingItem.meatType}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, meatType: e.target.value as MeatType })
                    }
                    className="w-full min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
                  >
                    {MEAT_TYPES.map((mt) => (
                      <option key={mt} value={mt}>
                        {mt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold">Spice Level</label>
                  <select
                    value={editingItem.spiceLevel}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, spiceLevel: e.target.value as SpiceLevel })
                    }
                    className="w-full min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
                  >
                    {SPICE_LEVELS.map((sp) => (
                      <option key={sp} value={sp}>
                        {sp}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold">
                    Ingredients EN (comma-separated)
                  </label>
                  <input
                    value={editingItem.ingredientsEnText}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, ingredientsEnText: e.target.value })
                    }
                    className="w-full min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold">المكونات بالعربية</label>
                  <input
                    dir="rtl"
                    value={editingItem.ingredientsArText}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, ingredientsArText: e.target.value })
                    }
                    className="w-full min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3">
                <label className="block text-xs font-semibold">
                  Removable Garnishes / Soft-Dislike Ingredients (comma-separated, e.g. pickles,
                  onion, tomato)
                </label>
                <input
                  value={editingItem.removableIngredientsText}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, removableIngredientsText: e.target.value })
                  }
                  placeholder="pickles, onion, garlic, tomato, parsley"
                  className="w-full min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                />
                <label className="inline-flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={editingItem.removableIngredientsVerified}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        removableIngredientsVerified: e.target.checked,
                      })
                    }
                  />
                  <span>
                    Confirm kitchen can omit these garnishes on request (for soft dislikes only —
                    never used for allergies)
                  </span>
                </label>
              </div>

              {/* Dish Photo Upload */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Dish Photo</span>
                  {photoUploadStatus.enabled ? (
                    <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium">
                      <ImagePlus className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                      <span>Upload Photo</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handlePhotoUpload(f);
                        }}
                        className="sr-only"
                      />
                    </label>
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">
                      {photoUploadStatus.reason}
                    </span>
                  )}
                </div>
                {editingItem.imageUrl && (
                  <p className="mt-1 truncate font-mono text-xs text-emerald-600">
                    {editingItem.imageUrl}
                  </p>
                )}
              </div>

              {/* Diet Tags */}
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold">Diet Tags</span>
                <div className="flex flex-wrap gap-2">
                  {CANONICAL_DIET_TAGS.map((tag) => {
                    const active = editingItem.dietTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setEditingItem({
                            ...editingItem,
                            dietTags: toggleArrayValue(editingItem.dietTags, tag),
                          })
                        }
                        className={`min-h-9 rounded-full px-3 py-1 text-xs font-semibold ${
                          active
                            ? "bg-emerald-600 text-white"
                            : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                        }`}
                      >
                        {DIET_TAG_LABELS[tag][locale]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 14 Major Allergens */}
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold">
                  Allergens Present in Base Dish (select every allergen present)
                </span>
                <div className="flex flex-wrap gap-2">
                  {CANONICAL_ALLERGENS.map((alg) => {
                    const active = editingItem.allergens.includes(alg);
                    return (
                      <button
                        key={alg}
                        type="button"
                        onClick={() =>
                          setEditingItem({
                            ...editingItem,
                            // Never auto-flip allergenDataProvided when toggling chips
                            allergens: toggleArrayValue(editingItem.allergens, alg),
                          })
                        }
                        className={`min-h-9 rounded-full px-3 py-1 text-xs font-semibold ${
                          active
                            ? "bg-red-600 text-white"
                            : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                        }`}
                      >
                        {ALLERGEN_LABELS[alg][locale]}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-2 inline-flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={editingItem.allergenDataProvided}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, allergenDataProvided: e.target.checked })
                    }
                  />
                  <span>
                    I explicitly confirm that allergen information for this dish has been checked by
                    the restaurant (required before verification)
                  </span>
                </label>
              </div>

              {/* Modifiers ("Can be made X with modifier Y") */}
              <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide">
                    Dietary Modifiers (e.g. &ldquo;Without yogurt / cheese&rdquo;)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingItem({
                        ...editingItem,
                        modifiers: [
                          ...editingItem.modifiers,
                          {
                            nameEn: "",
                            nameAr: "",
                            priceDeltaAed: "0.00",
                            removesAllergens: [],
                            addsDietTags: [],
                            verificationStatus: "AI_SUGGESTED",
                          },
                        ],
                      })
                    }
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-semibold"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Modifier</span>
                  </button>
                </div>

                {editingItem.modifiers.map((mod, idx) => (
                  <div
                    key={idx}
                    className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        placeholder="Without yogurt sauce (EN)"
                        value={mod.nameEn}
                        onChange={(e) => {
                          const mods = [...editingItem.modifiers];
                          mods[idx] = { ...mod, nameEn: e.target.value };
                          setEditingItem({ ...editingItem, modifiers: mods });
                        }}
                        className="min-h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs"
                      />
                      <input
                        dir="rtl"
                        placeholder="بدون صلصة اللبن (AR)"
                        value={mod.nameAr}
                        onChange={(e) => {
                          const mods = [...editingItem.modifiers];
                          mods[idx] = { ...mod, nameAr: e.target.value };
                          setEditingItem({ ...editingItem, modifiers: mods });
                        }}
                        className="min-h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          placeholder="0.00"
                          value={mod.priceDeltaAed}
                          onChange={(e) => {
                            const mods = [...editingItem.modifiers];
                            mods[idx] = { ...mod, priceDeltaAed: e.target.value };
                            setEditingItem({ ...editingItem, modifiers: mods });
                          }}
                          className="w-24 min-h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const mods = editingItem.modifiers.filter((_, i) => i !== idx);
                            setEditingItem({ ...editingItem, modifiers: mods });
                          }}
                          className="text-xs font-semibold text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-semibold text-[var(--text-secondary)]">
                        Removes allergen:
                      </span>
                      {["milk", "gluten", "tree_nuts", "sesame", "eggs"].map((alg) => (
                        <button
                          key={alg}
                          type="button"
                          onClick={() => {
                            const mods = [...editingItem.modifiers];
                            mods[idx] = {
                              ...mod,
                              removesAllergens: toggleArrayValue(mod.removesAllergens, alg),
                            };
                            setEditingItem({ ...editingItem, modifiers: mods });
                          }}
                          className={`rounded px-2 py-0.5 ${
                            mod.removesAllergens.includes(alg)
                              ? "bg-emerald-600 font-semibold text-white"
                              : "bg-[var(--bg-muted)]"
                          }`}
                        >
                          -{alg}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="min-h-10 rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleSaveEditingItem(false)}
                className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-2 text-xs font-semibold"
              >
                Save as Unverified
              </button>
              <button
                type="button"
                disabled={busy || !editingItem.allergenDataProvided}
                onClick={() => handleSaveEditingItem(true)}
                className="min-h-10 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Verify &amp; Save Safe Tags
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
