"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Eye,
  Flame,
  Plus,
  Send,
  ShieldAlert,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MenuAssistantDrawer } from "@/components/diner/MenuAssistantDrawer";
import type { SerializedDinerProfile } from "@/lib/diner/profile";
import {
  type EngineDinerProfile,
  type EngineDishInput,
  type EvaluatedMenuItem,
  evaluateGroupSharedDishes,
  evaluatePersonalizedMenu,
  type MenuBadge,
} from "@/lib/engine/menu-engine";
import { type Locale, pickLocalized } from "@/lib/i18n/dictionaries";
import { ALLERGEN_LABELS, CANONICAL_ALLERGENS, DIET_TAG_LABELS } from "@/lib/menu/taxonomy";
import { aedToFils, formatAed } from "@/lib/money";

type PersonaKey = "self" | "claude" | "bilal" | "james" | "group";

interface DraftCartEntry {
  key: string;
  dishId: string;
  nameEn: string;
  nameAr: string;
  unitPriceFils: number;
  modifierIds: string[];
  modifierNamesEn: string[];
  modifierNamesAr: string[];
  personaOwner: PersonaKey;
  participantName: string;
  quantity: number;
}

const DEMO_PERSONAS: Record<"claude" | "bilal" | "james", EngineDinerProfile> = {
  claude: {
    displayName: "Claude",
    dietaryRestrictions: ["vegetarian"],
    allergens: [],
    likedIngredients: ["chickpeas", "eggplant", "pomegranate", "olive oil", "mint"],
    spiceTolerance: "MEDIUM",
    maxBudgetAed: null,
  },
  bilal: {
    displayName: "Bilal",
    dietaryRestrictions: ["halal"],
    allergens: ["milk"],
    likedIngredients: ["garlic", "charcoal chicken", "sumac", "lemon"],
    spiceTolerance: "HOT",
    maxBudgetAed: null,
  },
  james: {
    displayName: "James",
    dietaryRestrictions: [],
    allergens: [],
    likedIngredients: ["grilled meat", "fries", "hummus"],
    dislikedIngredients: ["olives"],
    spiceTolerance: "MILD",
    maxBudgetAed: "40.00",
  },
};

function renderBadge(badge: MenuBadge, locale: Locale) {
  const isAr = locale === "ar";
  switch (badge) {
    case "VERIFIED_SAFE":
      return (
        <span
          key={badge}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-3 w-3" />
          <span>{isAr ? "موثق آمن" : "Verified safe"}</span>
        </span>
      );
    case "SAFE_WITH_MODIFIER":
      return (
        <span
          key={badge}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-3 w-3" />
          <span>{isAr ? "آمن مع تعديل موثق" : "Verified safe with modifier"}</span>
        </span>
      );
    case "UNVERIFIED_WARNING":
      return (
        <span
          key={badge}
          className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="h-3 w-3" />
          <span>{isAr ? "غير موثق — اسأل النادل" : "Not verified — ask your server"}</span>
        </span>
      );
    case "BEST_VALUE":
      return (
        <span
          key={badge}
          className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300"
        >
          <Wallet className="h-3 w-3" />
          <span>{isAr ? "أفضل قيمة" : "Best value"}</span>
        </span>
      );
    case "POPULAR":
      return (
        <span
          key={badge}
          className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent-primary)]"
        >
          <Sparkles className="h-3 w-3" />
          <span>{isAr ? "الأكثر طلباً" : "Popular"}</span>
        </span>
      );
    case "SPICY":
      return (
        <span
          key={badge}
          className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700 dark:text-orange-300"
        >
          <Flame className="h-3 w-3" />
          <span>{isAr ? "حار" : "Spicy"}</span>
        </span>
      );
  }
}

export function PersonalizedMenuClient({
  locale,
  safetyDisclaimer,
  restaurant,
  table,
  dishes,
  initialProfile,
  showDemoSwitcher,
  canOrder,
  tableToken,
}: {
  locale: Locale;
  safetyDisclaimer: string;
  restaurant: {
    id: string;
    slug: string;
    nameEn: string;
    nameAr: string;
    descriptionEn: string | null;
    descriptionAr: string | null;
  };
  table: {
    tableCode: string;
    displayName: string;
  };
  dishes: EngineDishInput[];
  initialProfile: SerializedDinerProfile | null;
  showDemoSwitcher: boolean;
  canOrder: boolean;
  tableToken: string | null;
}) {
  const router = useRouter();
  const isAr = locale === "ar";

  const [persona, setPersona] = useState<PersonaKey>("self");
  const [showFullMenu, setShowFullMenu] = useState(false);
  const [showQuickGuestEditor, setShowQuickGuestEditor] = useState(!initialProfile);

  const [guestDiets, setGuestDiets] = useState<string[]>(initialProfile?.dietaryRestrictions ?? []);
  const [guestAllergens, setGuestAllergens] = useState<string[]>(initialProfile?.allergens ?? []);
  const [guestBudget, setGuestBudget] = useState<string>(initialProfile?.maxBudgetAed ?? "");
  const [savingGuest, setSavingGuest] = useState(false);

  const [cart, setCart] = useState<DraftCartEntry[]>([]);
  const [participantIdsByName, setParticipantIdsByName] = useState<Record<string, string>>({});
  const [selfParticipantId, setSelfParticipantId] = useState<string | null>(null);
  const [sendingOrder, setSendingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Join open TableSession on mount only when authorized (`canOrder === true`)
  useEffect(() => {
    if (!canOrder) return;
    let cancelled = false;
    const kQuery = tableToken ? `?k=${encodeURIComponent(tableToken)}` : "";

    async function initTableSession() {
      const res = await fetch(`/api/tables/${restaurant.slug}/${table.tableCode}/session${kQuery}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as {
        selfParticipantId?: string;
        canLoadDemoFriends?: boolean;
        participants?: Array<{ id: string; displayName: string }>;
      };

      if (data.selfParticipantId) {
        setSelfParticipantId(data.selfParticipantId);
      }

      if (data.canLoadDemoFriends) {
        await fetch(`/api/tables/${restaurant.slug}/${table.tableCode}/session${kQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "join_demo_friends", k: tableToken ?? undefined }),
        });
        const refreshed = await fetch(
          `/api/tables/${restaurant.slug}/${table.tableCode}/session${kQuery}`,
        );
        if (refreshed.ok && !cancelled) {
          const rData = (await refreshed.json()) as {
            participants?: Array<{ id: string; displayName: string }>;
          };
          const map: Record<string, string> = {};
          for (const p of rData.participants ?? []) {
            map[p.displayName.toLowerCase()] = p.id;
          }
          setParticipantIdsByName(map);
          return;
        }
      }

      const map: Record<string, string> = {};
      for (const p of data.participants ?? []) {
        map[p.displayName.toLowerCase()] = p.id;
      }
      if (!cancelled) setParticipantIdsByName(map);
    }

    void initTableSession();
    return () => {
      cancelled = true;
    };
  }, [canOrder, tableToken, restaurant.slug, table.tableCode]);

  const activeProfile: EngineDinerProfile = useMemo(() => {
    if (persona === "claude" || persona === "bilal" || persona === "james") {
      return DEMO_PERSONAS[persona];
    }
    return {
      displayName: initialProfile?.displayName ?? (isAr ? "ضيف" : "Guest"),
      dietaryRestrictions: guestDiets,
      allergens: guestAllergens,
      likedIngredients: initialProfile?.likedIngredients ?? [],
      dislikedIngredients: initialProfile?.dislikedIngredients ?? [],
      spiceTolerance: initialProfile?.spiceTolerance ?? "MEDIUM",
      maxBudgetAed: guestBudget.trim() || null,
      preferHighProtein: initialProfile?.preferHighProtein ?? false,
      preferKeto: initialProfile?.preferKeto ?? false,
      pastRatingsByDishId: initialProfile?.pastRatingsByDishId ?? {},
    };
  }, [persona, initialProfile, guestDiets, guestAllergens, guestBudget, isAr]);

  // Per-persona cart total for accurate per-person meal budget evaluation!
  const activePersonaCartTotalFils = useMemo(
    () =>
      cart
        .filter((item) => item.personaOwner === persona)
        .reduce((sum, item) => sum + item.unitPriceFils * item.quantity, 0),
    [cart, persona],
  );

  const combinedCartTotalFils = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPriceFils * item.quantity, 0),
    [cart],
  );

  const evaluated = useMemo(
    () =>
      evaluatePersonalizedMenu({
        dishes,
        profile: activeProfile,
        currentCartTotalFils: activePersonaCartTotalFils,
      }),
    [dishes, activeProfile, activePersonaCartTotalFils],
  );

  const groupEvaluated = useMemo(() => {
    if (persona !== "group") return null;
    const jamesCartFils = cart
      .filter((c) => c.personaOwner === "james")
      .reduce((s, c) => s + c.unitPriceFils * c.quantity, 0);
    return evaluateGroupSharedDishes({
      dishes,
      participants: [
        { id: "claude", name: "Claude", profile: DEMO_PERSONAS.claude },
        { id: "bilal", name: "Bilal", profile: DEMO_PERSONAS.bilal },
        { id: "james", name: "James", profile: DEMO_PERSONAS.james, cartTotalFils: jamesCartFils },
      ],
    });
  }, [persona, dishes, cart]);

  function addDishToCart(params: {
    dishId: string;
    nameEn: string;
    nameAr: string;
    unitPriceFils: number;
    modifierIds: string[];
    modifierNamesEn: string[];
    modifierNamesAr: string[];
    ownerPersona: PersonaKey;
  }) {
    const participantName =
      params.ownerPersona === "claude"
        ? "Claude"
        : params.ownerPersona === "bilal"
          ? "Bilal"
          : params.ownerPersona === "james"
            ? "James"
            : params.ownerPersona === "group"
              ? "Shared Table"
              : initialProfile?.displayName || "Guest Diner";

    const key = `${params.ownerPersona}:${params.dishId}:${params.modifierIds.join(",")}`;
    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.key === key);
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = {
          ...copy[existingIdx]!,
          quantity: copy[existingIdx]!.quantity + 1,
        };
        return copy;
      }
      return [
        ...prev,
        {
          key,
          dishId: params.dishId,
          nameEn: params.nameEn,
          nameAr: params.nameAr,
          unitPriceFils: params.unitPriceFils,
          modifierIds: params.modifierIds,
          modifierNamesEn: params.modifierNamesEn,
          modifierNamesAr: params.modifierNamesAr,
          personaOwner: params.ownerPersona,
          participantName,
          quantity: 1,
        },
      ];
    });
  }

  function removeCartKey(key: string) {
    setCart((prev) => prev.filter((c) => c.key !== key));
  }

  async function handleSendOrderToKitchen() {
    if (cart.length === 0) return;
    setSendingOrder(true);
    setOrderError(null);

    const lines = cart.map((c) => {
      let participantId: string | null = null;
      if (c.personaOwner === "self") {
        participantId = selfParticipantId;
      } else if (
        c.personaOwner === "claude" ||
        c.personaOwner === "bilal" ||
        c.personaOwner === "james"
      ) {
        participantId = participantIdsByName[c.personaOwner] ?? null;
      }

      return {
        menuItemId: c.dishId,
        modifierIds: c.modifierIds,
        quantity: c.quantity,
        participantId,
        participantName: c.participantName,
      };
    });

    const res = await fetch(`/api/tables/${restaurant.slug}/${table.tableCode}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, k: tableToken ?? undefined }),
    });
    setSendingOrder(false);

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      order?: { id: string };
    };

    if (!res.ok || !data.order?.id) {
      setOrderError(data.error || "Could not send order");
      return;
    }

    setCart([]);
    router.push(`/orders/${data.order.id}`);
  }

  async function handleSaveQuickGuestProfile() {
    setSavingGuest(true);
    await fetch("/api/diner/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: initialProfile?.displayName || (isAr ? "ضيف الطاولة" : "Table Guest"),
        dietaryRestrictions: guestDiets,
        allergens: guestAllergens,
        likedIngredients: initialProfile?.likedIngredients ?? [],
        dislikedIngredients: initialProfile?.dislikedIngredients ?? [],
        favoriteCuisines: initialProfile?.favoriteCuisines ?? ["Lebanese"],
        spiceTolerance: initialProfile?.spiceTolerance ?? "MEDIUM",
        maxBudgetAed: guestBudget.trim() || null,
        preferHighProtein: initialProfile?.preferHighProtein ?? false,
        preferKeto: initialProfile?.preferKeto ?? false,
      }),
    });
    setSavingGuest(false);
    setShowQuickGuestEditor(false);
    router.refresh();
  }

  function renderEvaluatedCard(item: EvaluatedMenuItem) {
    const dishHref = `/r/${restaurant.slug}/dish/${item.dish.id}?table=${encodeURIComponent(table.tableCode)}`;

    return (
      <article
        key={item.dish.id}
        className="flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs transition hover:border-[var(--accent-primary)]/40"
      >
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <Link href={dishHref} className="group">
              <h3 className="text-base font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)]">
                {pickLocalized(item.dish.nameEn, item.dish.nameAr, locale)}
              </h3>
            </Link>
            <div className="text-end font-mono text-sm font-extrabold text-[var(--text-primary)]">
              {formatAed(item.effectivePriceFils, locale)}
            </div>
          </div>

          {item.badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.badges.map((b) => renderBadge(b, locale))}
            </div>
          )}

          {item.preselectedModifiers.length > 0 && (
            <div className="rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              ✓ {isAr ? "تعديل مختار تلقائياً:" : "Pre-selected modifier:"}{" "}
              {item.preselectedModifiers
                .map((m) => pickLocalized(m.nameEn, m.nameAr, locale))
                .join(", ")}
            </div>
          )}

          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            {pickLocalized(item.dish.descriptionEn, item.dish.descriptionAr, locale)}
          </p>

          <p className="text-[11px] font-medium text-[var(--accent-primary)]">
            {isAr ? item.whyForYouAr : item.whyForYouEn}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2">
          <Link
            href={dishHref}
            className="text-xs font-semibold text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
          >
            {isAr ? "التفاصيل والمكونات" : "Details & Modifiers"}
          </Link>

          {canOrder && (
            <button
              type="button"
              onClick={() =>
                addDishToCart({
                  dishId: item.dish.id,
                  nameEn: item.dish.nameEn,
                  nameAr: item.dish.nameAr,
                  unitPriceFils: item.effectivePriceFils,
                  modifierIds: item.preselectedModifierIds,
                  modifierNamesEn: item.preselectedModifiers.map((m) => m.nameEn),
                  modifierNamesAr: item.preselectedModifiers.map((m) => m.nameAr),
                  ownerPersona: persona,
                })
              }
              aria-label={`Add ${item.dish.nameEn}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{isAr ? "إضافة" : "Add"}</span>
            </button>
          )}
        </div>
      </article>
    );
  }

  const fullMenuCategories = useMemo(() => {
    const map = new Map<string, { name: string; items: EngineDishInput[] }>();
    for (const d of dishes) {
      if (!d.isPublished || !d.isAvailable) continue;
      const label = pickLocalized(d.categoryNameEn, d.categoryNameAr, locale) || "Menu";
      const entry = map.get(d.categoryId) ?? { name: label, items: [] };
      entry.items.push(d);
      map.set(d.categoryId, entry);
    }
    return Array.from(map.values());
  }, [dishes, locale]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-36 sm:px-6">
      {/* Restaurant & Table Header */}
      <header className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-block rounded-full bg-[var(--accent-soft)] px-3 py-1 font-mono text-xs font-bold text-[var(--accent-primary)]">
              {table.displayName} ({table.tableCode})
            </span>
            <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
              {pickLocalized(restaurant.nameEn, restaurant.nameAr, locale)}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {pickLocalized(restaurant.descriptionEn, restaurant.descriptionAr, locale)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canOrder && (
              <Link
                href={`/r/${restaurant.slug}/t/${table.tableCode}/group${tableToken ? `?k=${encodeURIComponent(tableToken)}` : ""}`}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--accent-soft)] px-3.5 py-2 text-xs font-bold text-[var(--accent-primary)]"
              >
                <Users className="h-3.5 w-3.5" />
                <span>{isAr ? "طاولة المجموعة وتقسيم الفاتورة" : "Table Group & Split"}</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => setShowQuickGuestEditor((v) => !v)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 text-xs font-semibold"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
              <span>{isAr ? "تخصيص سريع" : "Quick Profile"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFullMenu((v) => !v)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
                showFullMenu
                  ? "bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>
                {showFullMenu
                  ? isAr
                    ? "العودة للقائمة المخصصة"
                    : "Back to Personalized Menu"
                  : isAr
                    ? "عرض القائمة الكاملة"
                    : "Full Original Menu"}
              </span>
            </button>
          </div>
        </div>

        {/* Mandatory Allergy Safety Disclaimer */}
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[var(--accent-soft)] px-4 py-2.5 text-xs font-bold text-[var(--accent-primary)]">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{safetyDisclaimer}</span>
        </div>

        {!canOrder && (
          <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-xs font-bold text-amber-800 dark:text-amber-300">
            {isAr
              ? "وضع القراءة فقط — امسح رمز QR الموجود على طاولتك للطلب."
              : "Read-only menu preview — Scan the QR at your table to order."}
          </div>
        )}
      </header>

      {/* Demo Persona Switcher — strictly gated by DEMO_MODE=true AND restaurant.isDemo */}
      {showDemoSwitcher && (
        <section
          aria-label="Demo Persona Switcher"
          className="rounded-2xl border border-dashed border-[var(--accent-primary)]/50 bg-[var(--bg-surface)] p-4"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
            {isAr
              ? "وضع العرض التجريبي — بدّل بين أصدقاء الطاولة بنقرة واحدة"
              : "Demo Mode — One-Tap Table Persona Switcher"}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {(
              [
                { id: "self", label: isAr ? "ملفي الحالي" : "My Profile" },
                { id: "claude", label: "Claude (Vegetarian)" },
                { id: "bilal", label: "Bilal (Lactose-Free)" },
                { id: "james", label: "James (Meal Budget AED 40)" },
                { id: "group", label: isAr ? "وضع المجموعة (الثلاثة معاً)" : "Group Mode (All 3)" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setPersona(tab.id);
                  setShowFullMenu(false);
                }}
                className={`min-h-9 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  persona === tab.id
                    ? "bg-[var(--accent-primary)] text-white"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Grounded Menu Assistant Chat (Agent #6) */}
      <MenuAssistantDrawer
        locale={locale}
        restaurantSlug={restaurant.slug}
        tableCode={table.tableCode}
        activeProfile={activeProfile}
        currentCartTotalFils={activePersonaCartTotalFils}
      />

      {/* Guest Mode Inline Quick Profile Builder */}
      {showQuickGuestEditor && persona === "self" && (
        <section className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">
              {isAr
                ? "إعداد سريع لملف الضيف (بدون تسجيل حساب)"
                : "Instant Guest Profile (No Account Required)"}
            </h2>
            <Link
              href={`/onboarding?returnTo=${encodeURIComponent(`/r/${restaurant.slug}/t/${table.tableCode}`)}`}
              className="text-xs font-semibold text-[var(--accent-primary)] underline"
            >
              {isAr ? "الإعداد الكامل" : "Full Profile"}
            </Link>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(["vegetarian", "vegan", "pescatarian", "halal"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setGuestDiets((prev) =>
                    prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
                  )
                }
                className={`min-h-9 rounded-full px-3 py-1 text-xs font-semibold ${
                  guestDiets.includes(d)
                    ? "bg-emerald-600 text-white"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                }`}
              >
                {DIET_TAG_LABELS[d][locale]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CANONICAL_ALLERGENS.slice(0, 10).map((alg) => (
              <button
                key={alg}
                type="button"
                onClick={() =>
                  setGuestAllergens((prev) =>
                    prev.includes(alg) ? prev.filter((x) => x !== alg) : [...prev, alg],
                  )
                }
                className={`min-h-9 rounded-full px-3 py-1 text-xs font-semibold ${
                  guestAllergens.includes(alg)
                    ? "bg-red-600 text-white"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                }`}
              >
                {ALLERGEN_LABELS[alg][locale]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={guestBudget}
              onChange={(e) => setGuestBudget(e.target.value)}
              placeholder="Meal budget AED (e.g. 40.00)"
              className="min-h-9 w-52 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 font-mono text-xs"
            />
            <button
              type="button"
              disabled={savingGuest}
              onClick={handleSaveQuickGuestProfile}
              className="min-h-9 rounded-xl bg-[var(--accent-primary)] px-4 py-1.5 text-xs font-bold text-white"
            >
              {savingGuest ? "..." : isAr ? "حفظ وتطبيق" : "Save Guest Filter"}
            </button>
          </div>
        </section>
      )}

      {/* Meal Budget Running Meter */}
      {persona !== "group" && evaluated.maxBudgetFils !== null && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-[var(--accent-primary)]" />
            <span>
              {isAr ? "ميزانية الوجبة:" : "Meal Budget:"}{" "}
              <span className="font-mono">{formatAed(evaluated.maxBudgetFils, locale)}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
            <span>
              {isAr ? "في السلة:" : "In Cart:"}{" "}
              <span className="font-mono">{formatAed(evaluated.cartTotalFils, locale)}</span>
            </span>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-mono text-emerald-700 dark:text-emerald-300">
              {isAr ? "المتبقي:" : "Remaining:"}{" "}
              {formatAed(evaluated.remainingBudgetFils ?? 0, locale)}
            </span>
          </div>
        </section>
      )}

      {orderError && (
        <div
          role="alert"
          className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--accent-primary)]"
        >
          {orderError}
        </div>
      )}

      {/* View A: Full Unfiltered Menu Toggle */}
      {showFullMenu ? (
        <div className="space-y-6">
          {fullMenuCategories.map((cat) => (
            <section
              key={cat.name}
              className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm"
            >
              <h2 className="text-lg font-bold">{cat.name}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {cat.items.map((dish) => (
                  <Link
                    key={dish.id}
                    href={`/r/${restaurant.slug}/dish/${dish.id}?table=${encodeURIComponent(table.tableCode)}`}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 transition hover:border-[var(--accent-primary)]"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-bold">
                        {pickLocalized(dish.nameEn, dish.nameAr, locale)}
                      </span>
                      <span className="font-mono text-sm font-bold">
                        {formatAed(aedToFils(dish.priceAed), locale)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {pickLocalized(dish.descriptionEn, dish.descriptionAr, locale)}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : persona === "group" && groupEvaluated ? (
        /* View B: Group Combined View (Claude + Bilal + James) */
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[var(--accent-primary)]" />
              <h2 className="text-xl font-extrabold">
                {isAr
                  ? `أطباق يمكن للجميع مشاركتها (${groupEvaluated.sharedDishes.length})`
                  : `Dishes All Three Can Share (${groupEvaluated.sharedDishes.length})`}
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Compatible simultaneously with Claude (Vegetarian), Bilal (Lactose-Free &amp; Halal),
              and ranked with James&apos;s budget in mind.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {groupEvaluated.sharedDishes.map((shared) => (
                <article
                  key={shared.dish.id}
                  className="flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/r/${restaurant.slug}/dish/${shared.dish.id}?table=${encodeURIComponent(table.tableCode)}`}
                        className="font-bold hover:text-[var(--accent-primary)]"
                      >
                        {pickLocalized(shared.dish.nameEn, shared.dish.nameAr, locale)}
                      </Link>
                      <span className="font-mono text-sm font-extrabold">
                        {formatAed(shared.effectivePriceFils, locale)}
                      </span>
                    </div>
                    {shared.hasUnverifiedWarning && (
                      <div className="mt-1.5">{renderBadge("UNVERIFIED_WARNING", locale)}</div>
                    )}
                    {shared.requiredModifiers.length > 0 && (
                      <p className="mt-2 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                        ✓ Shared modifier:{" "}
                        {shared.requiredModifiers
                          .map((m) => pickLocalized(m.nameEn, m.nameAr, locale))
                          .join(", ")}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                      {pickLocalized(shared.dish.descriptionEn, shared.dish.descriptionAr, locale)}
                    </p>
                  </div>

                  {canOrder && (
                    <div className="mt-3 flex justify-end border-t border-[var(--border-subtle)] pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          addDishToCart({
                            dishId: shared.dish.id,
                            nameEn: shared.dish.nameEn,
                            nameAr: shared.dish.nameAr,
                            unitPriceFils: shared.effectivePriceFils,
                            modifierIds: shared.requiredModifiers.map((m) => m.id),
                            modifierNamesEn: shared.requiredModifiers.map((m) => m.nameEn),
                            modifierNamesAr: shared.requiredModifiers.map((m) => m.nameAr),
                            ownerPersona: "group",
                          })
                        }
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-bold text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{isAr ? "إضافة للمشاركة" : "Add Shared"}</span>
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : (
        /* View C: Personalized Diner Menu */
        <div className="space-y-8">
          {evaluated.perfectForYou.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-extrabold">{isAr ? "مثالي لك" : "Perfect for you"}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {evaluated.perfectForYou.map(renderEvaluatedCard)}
              </div>
            </section>
          )}

          {evaluated.goodOptions.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-extrabold">{isAr ? "خيارات جيدة" : "Good options"}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {evaluated.goodOptions.map(renderEvaluatedCard)}
              </div>
            </section>
          )}

          {evaluated.moreOptions.length > 0 && (
            <details className="group rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-bold">
                <span>
                  {isAr
                    ? `المزيد من الخيارات — فوق الميزانية المتبقية (${evaluated.moreOptions.length})`
                    : `More options — Over remaining budget (${evaluated.moreOptions.length})`}
                </span>
                <ChevronDown className="h-5 w-5 transition group-open:rotate-180" />
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {evaluated.moreOptions.map(renderEvaluatedCard)}
              </div>
            </details>
          )}

          {evaluated.hidden.length > 0 && (
            <details className="group rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-bold text-[var(--text-secondary)]">
                <span>
                  {isAr
                    ? `أطباق مخفية لسلامتك (${evaluated.hidden.length}) — اضغط لمعرفة السبب`
                    : `Hidden (${evaluated.hidden.length}) — tap to see why`}
                </span>
                <ChevronDown className="h-5 w-5 transition group-open:rotate-180" />
              </summary>
              <ul className="mt-4 divide-y divide-[var(--border-subtle)]">
                {evaluated.hidden.map((h) => (
                  <li
                    key={h.dish.id}
                    className="flex flex-wrap justify-between gap-2 py-2.5 text-xs"
                  >
                    <span className="font-semibold">
                      {pickLocalized(h.dish.nameEn, h.dish.nameAr, locale)}
                    </span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      {(isAr ? h.hiddenReasonsAr : h.hiddenReasonsEn).join(" • ")}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Floating Combined Table Order Bar */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 p-4 shadow-lg backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShoppingBag className="mt-0.5 h-5 w-5 text-[var(--accent-primary)]" />
              <div>
                <p className="text-sm font-extrabold">
                  {cart.reduce((s, c) => s + c.quantity, 0)} {isAr ? "أصناف" : "item(s)"} •{" "}
                  <span className="font-mono">{formatAed(combinedCartTotalFils, locale)}</span>
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  {cart.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => removeCartKey(c.key)}
                      className="inline-flex items-center gap-1 rounded bg-[var(--bg-muted)] px-2 py-0.5 hover:text-red-600"
                    >
                      <span>
                        [{c.participantName}] {c.quantity}×{" "}
                        {pickLocalized(c.nameEn, c.nameAr, locale)}
                      </span>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={sendingOrder}
              onClick={handleSendOrderToKitchen}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--accent-primary)] px-6 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              <span>
                {sendingOrder
                  ? isAr
                    ? "جاري الإرسال..."
                    : "Sending..."
                  : isAr
                    ? "إرسال الطلب للمطبخ"
                    : "Send Order to Kitchen"}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
