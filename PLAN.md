# PlateFit — Implementation Plan (`PLAN.md`)

> **Phase 1 Deliverable (Updated per Phase 1 Review):** Architecture, Data Model, Engine & AI Design, Page & Route Map, and Deployment Details.
> Working Name: **PlateFit** (`بليت فيت`) — centralized in `src/config/brand.ts` (`NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_APP_NAME_AR`) so renaming across UI, PWA manifest, print sheets, and emails is a one-line change.

---

## 1. Architecture & Technical Stack

We follow `SPEC.md` with strict domain isolation so auth, money math, the deterministic menu engine, AI agents, ordering, and billing are cleanly separated and testable:

- **Framework:** Latest stable **Next.js (16.x, App Router)** + TypeScript (strict mode).
- **Brand Configuration:** Single source of truth in `src/config/brand.ts` reading `NEXT_PUBLIC_APP_NAME` (default `"PlateFit"`) and `NEXT_PUBLIC_APP_NAME_AR` (default `"بليت فيت"`), consumed by UI layouts, dynamic `app/manifest.ts`, metadata, printable QR/invoice views, and notifications.
- **Styling & UI:** Tailwind CSS + CSS variables for warm, food-friendly light/dark themes + logical RTL properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `<html dir="rtl" | "ltr">`) for full English + Arabic support, Lucide icons.
- **Database & ORM:** PostgreSQL + Prisma ORM (`Decimal(10, 2)` for all monetary columns).
- **Money Arithmetic (`src/lib/money.ts`):** **Zero floating-point math anywhere.** All monetary calculations (order subtotals, modifier deltas, meal budget remaining, bill splits, and platform fees) convert `Decimal(10, 2)` strings into integer **fils** (`1 AED = 100 fils`) using exact string/BigInt/integer arithmetic, with explicit **round-half-up** to 2 decimals for percentage fees.
- **Authentication & Authorization:** Auth.js (`next-auth`) with Credentials provider (email + `bcryptjs` password hash), optional Google OAuth (enabled automatically when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set), role-based guards on every API route and dashboard layout, plus signed cookie-backed **Guest Sessions** (`guestToken`) for frictionless QR table scanning.
- **AI SDK:** Official Google Gen AI SDK (`@google/genai`), configured via `GEMINI_API_KEY` and `GEMINI_MODEL` (defaulting to `"gemini-flash-latest"`, targeting the latest stable Flash-tier model, overridable via env). Every agent validates outputs with **Zod**, logs calls to `AiUsageLog`, and **degrades gracefully when `GEMINI_API_KEY` is missing** (app continues working cleanly and AI endpoints/UI display `"AI not configured"`).
- **Real-Time Live Orders & Table Sync:** Server-Sent Events (SSE) endpoint with automatic 3-second polling fallback for rock-solid reliability on Render.
- **File / Image Storage (`src/lib/storage/`):**
  - Menu ingestion uploads (photos/PDFs) are processed in memory by Gemini and never persisted.
  - Dish photos use an S3-compatible bucket (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`).
  - **Dev-only local fallback:** `public/uploads` is used **only** when `NODE_ENV === "development"` and S3 env vars are absent. In `NODE_ENV === "production"`, if S3 is not configured, photo upload is cleanly disabled with `"Photo storage is not configured"` rather than writing to Render's ephemeral disk.
- **Testing:**
  - **Node test runner (`tsx --test`)** for unit & PGlite PostgreSQL DDL tests (money/fee edge cases, deterministic hard filter, missing allergen data handling, no-restriction badge suppression, meal-level remaining budget ranking, and the Claude/Bilal/James scenario).
  - **Playwright** for end-to-end tests (QR scan -> personalized menu -> group table order -> staff acceptance -> fee ledger).

### Directory Structure

```text
src/
├── config/
│   └── brand.ts               # Single source of truth for EN/AR brand name & metadata
├── app/
│   ├── manifest.ts            # Dynamic PWA manifest using brand config
│   ├── (diner)/               # Landing, Onboarding, Home, QR Scan, Menu, Table, Order Status, External Scan, Profile
│   ├── (restaurant)/          # Restaurant Dashboard: Setup, Menu Builder, Tables/QR, Live Staff Screen, Analytics, Billing
│   ├── (admin)/               # Platform Admin: Restaurants, Users, Orders, Fee Ledger, Invoices, Settings, AI Logs
│   └── api/                   # RBAC-protected REST + SSE endpoints, Auth, Health check (/api/health)
├── components/                # Shared UI, RTL language switcher, theme toggle, PWA install prompt
├── lib/
│   ├── money.ts               # Exact integer-fils arithmetic & round-half-up fee helpers (no floats)
│   ├── engine/                # Deterministic hard filter, modifier resolver, meal-budget scorer & ranker (0 LLM calls)
│   ├── agents/                # 8 Gemini AI agents with Zod schemas, usage logger & missing-key fallback
│   ├── billing/               # Fee calculation, ledger recording on order acceptance, invoice generation
│   ├── payments/              # Clean interface boundary for future Stripe / Checkout.com integration
│   ├── storage/               # S3-compatible + dev-only local fallback storage service
│   ├── rate-limit/            # Per-IP, per-guestToken, per-table, and AI endpoint rate limiters
│   ├── i18n/                  # EN/AR dictionaries, RTL helpers, localized field selectors
│   └── auth/                  # Auth.js config, RBAC guards, and Guest session manager
└── prisma/
    ├── schema.prisma          # PostgreSQL schema
    ├── migrations/            # Versioned SQL migrations run via `prisma migrate deploy`
    └── seed.ts                # Env-gated (`SEED_DEMO=true` + `DEMO_PASSWORD`) demo seed
```

---

## 2. Database Schema (Prisma Data Model)

### Enums

```prisma
enum Role {
  DINER
  RESTAURANT_OWNER
  RESTAURANT_STAFF
  ADMIN
}

enum RestaurantStatus {
  PENDING
  APPROVED
  SUSPENDED
}

enum VerificationStatus {
  AI_SUGGESTED
  RESTAURANT_VERIFIED
}

enum SpiceLevel {
  NONE
  MILD
  MEDIUM
  HOT
}

enum MeatType {
  NONE
  CHICKEN
  BEEF
  LAMB
  FISH
  SHELLFISH
  OTHER
}

enum TableSessionStatus {
  OPEN
  CLOSED
}

enum OrderStatus {
  SENT
  ACCEPTED
  PREPARING
  SERVED
  CANCELLED
}

enum InvoiceStatus {
  DRAFT
  ISSUED
  PAID
}
```

### Core Models

1. **`User` & `DinerProfile`**
   - `User`: `id`, `email` (unique), `passwordHash` (nullable for OAuth), `name`, `role` (`DINER`, `RESTAURANT_OWNER`, `RESTAURANT_STAFF`, `ADMIN`), `locale` (`"en"` | `"ar"`), `isActive` (`Boolean`), `createdAt`, `updatedAt`.
   - `DinerProfile`:
     - `id`, `userId` (unique, nullable for guests), `guestToken` (unique, nullable for registered users), `displayName`
     - **Hard Restrictions (treated identically in deterministic hard filter):**
       - `dietaryRestrictions`: `String[]` (`vegetarian`, `vegan`, `pescatarian`, `halal`)
       - `allergens`: `String[]` (covers both allergies and intolerances from the 14 major allergens: `milk`, `gluten`, `tree_nuts`, `peanuts`, `sesame`, `eggs`, `fish`, `crustaceans`, `molluscs`, `soy`, `celery`, `mustard`, `lupin`, `sulphites` — with `shellfish` mapped to `crustaceans`/`molluscs` + canonical `shellfish` support)
     - **Soft Preferences & Meal Budget:**
       - `likedIngredients`: `String[]`
       - `dislikedIngredients`: `String[]`
       - `favoriteCuisines`: `String[]`
       - `spiceTolerance`: `SpiceLevel` (default `MEDIUM`)
       - `maxBudgetAed`: `Decimal(10, 2)?` — **Meal-level budget for this diner's entire order** (e.g., `40.00` for James). Never floats.
       - `preferHighProtein`: `Boolean`, `preferKeto`: `Boolean`
     - `onboardingTranscript`: `Json?`

2. **`Restaurant`, `Branch`, & `RestaurantMember`**
   - `Restaurant`: `id`, `slug` (unique), `nameEn`, `nameAr`, `descriptionEn`, `descriptionAr`, `cuisine`, `logoUrl`, `status` (`PENDING`, `APPROVED`, `SUSPENDED`), `isDemo` (`Boolean`, default `false` — Demo Persona Switcher only appears when `isDemo === true` AND `DEMO_MODE=true`), `ownerId`, `createdAt`, `updatedAt`.
   - `Branch`: `id`, `restaurantId`, `nameEn`, `nameAr`, `addressEn`, `addressAr`, `city`, `isActive`.
   - `RestaurantMember`: `id`, `restaurantId`, `branchId?`, `userId`, `role` (`RESTAURANT_OWNER` | `RESTAURANT_STAFF`).

3. **`MenuCategory`, `MenuItem`, & `MenuItemModifier`**
   - `MenuCategory`: `id`, `restaurantId`, `nameEn`, `nameAr`, `sortOrder`.
   - `MenuItem`:
     - `id`, `restaurantId`, `categoryId`
     - `nameEn`, `nameAr`, `descriptionEn`, `descriptionAr`
     - `priceAed`: `Decimal(10, 2)`
     - `portionSize`: `String?`
     - `ingredientsEn`: `String[]`, `ingredientsAr`: `String[]`
     - `dietTags`: `String[]` (`vegetarian`, `vegan`, `pescatarian`, `halal`, `keto`, `high_protein`)
     - `allergens`: `String[]`
     - `allergenDataProvided`: `Boolean` (default `false` — explicitly tracks whether allergen information exists vs. missing/unknown; missing data is NEVER treated as safe for restricted diners)
     - `spiceLevel`: `SpiceLevel`
     - `meatType`: `MeatType`
     - `verificationStatus`: `VerificationStatus` (`AI_SUGGESTED` vs `RESTAURANT_VERIFIED`)
     - `aiConfidence`: `Decimal(4, 3)?`
     - `verifiedAt`: `DateTime?`, `verifiedById`: `String?`
     - `isAvailable`: `Boolean`, `isPopular`: `Boolean`, `isPublished`: `Boolean`
     - `cachedBlurbEn`: `String?`, `cachedBlurbAr`: `String?`
     - `imageUrl`: `String?`
   - `MenuItemModifier`:
     - `id`, `menuItemId`
     - `nameEn`, `nameAr` (e.g., `"Without yogurt sauce"` / `"بدون صلصة اللبن"`)
     - `priceDeltaAed`: `Decimal(10, 2)` (default `0.00`)
     - `removesAllergens`: `String[]`
     - `addsDietTags`: `String[]`
     - `verificationStatus`: `VerificationStatus` (`AI_SUGGESTED` vs `RESTAURANT_VERIFIED`)

4. **`DiningTable`, `TableSession`, & `TableParticipant`**
   - `DiningTable`: `id`, `restaurantId`, `branchId`, `tableCode` (`"T1"`), `displayName` (`"Table 1"`), `capacity`, `isActive`. Unique `[restaurantId, tableCode]`.
   - `TableSession`: `id`, `restaurantId`, `tableId`, `status` (`OPEN`, `CLOSED`), `shareCode`, `lastActivityAt` (`DateTime` — sessions auto-close after configurable `tableSessionTtlHours`, default `4` hours of inactivity, so the next group starts fresh), `createdAt`, `closedAt`.
   - `TableParticipant`: `id`, `tableSessionId`, `dinerProfileId`, `guestToken?`, `displayName`, `cartItems` (`Json` — tracks live per-person draft selections for meal budget & group cart), `joinedAt`.

5. **`Order`, `OrderItem`, & `DishRating`**
   - `Order`:
     - `id`, `orderNumber`, `restaurantId`, `tableSessionId`, `tableId`
     - `placedByProfileId?`, `placedByGuestToken?` (used for per-guest and per-table rate limiting)
     - `status`: `OrderStatus` (`SENT` -> `ACCEPTED` -> `PREPARING` -> `SERVED` / `CANCELLED`)
     - `subtotalAed`: `Decimal(10, 2)`
     - `notes`: `String?`, `cancelReason`: `String?`
     - `sentAt`, `acceptedAt`, `preparingAt`, `servedAt`, `cancelledAt`
   - `OrderItem`:
     - `id`, `orderId`, `menuItemId`, `participantId?`, `participantName?`
     - `quantity`: `Int`
     - `unitPriceAed`: `Decimal(10, 2)`
     - `lineTotalAed`: `Decimal(10, 2)`
     - `selectedModifiers`: `Json`
     - `specialInstructions`: `String?`
   - `DishRating`: `id`, `dinerProfileId`, `menuItemId`, `orderId?`, `rating` (`Int` 1–5), `comment`, `createdAt`.

6. **`PlatformSetting`, `PlatformFee`, `Invoice`, `MenuScanEvent`, `ExternalMenuScan`, & `AiUsageLog`**
   - `PlatformSetting` (singleton `id = "default"`):
     - `feePercentage`: `Decimal(5, 2)` (default `10.00`)
     - `feeCapAed`: `Decimal(10, 2)` (default `1.00`)
     - `currency`: `String` (default `"AED"`)
     - `tableSessionTtlHours`: `Int` (default `4`)
   - `PlatformFee`:
     - `id`, `orderId` (unique), `restaurantId`
     - `orderSubtotalAed`: `Decimal(10, 2)`
     - `feePercentageApplied`: `Decimal(5, 2)`
     - `feeCapAppliedAed`: `Decimal(10, 2)`
     - `feeAmountAed`: `Decimal(10, 2)`
     - `isVoided`: `Boolean` (default `false` — set to `true` if staff cancels an order so cancelled orders always owe AED 0.00)
     - `recordedAt`: `DateTime`, `voidedAt`: `DateTime?`
     - `invoiceId`: `String?`
   - `Invoice`:
     - `id`, `invoiceNumber` (unique), `restaurantId`, `year`, `month`, `totalOrders`, `grossSalesAed`: `Decimal(10, 2)`, `totalFeesAed`: `Decimal(10, 2)`, `status` (`DRAFT`, `ISSUED`, `PAID`), `generatedAt`.
   - `MenuScanEvent`: `id`, `restaurantId`, `tableId?`, `dietaryRestrictions`: `String[]`, `allergens`: `String[]`, `hasBudget`: `Boolean`, `createdAt`.
   - `ExternalMenuScan`: `id`, `dinerProfileId?`, `guestToken?`, `sourceLabel`, `extractedMenu`: `Json`, `createdAt`.
   - `AiUsageLog`: `id`, `agentName`, `model`, `inputTokens`, `outputTokens`, `latencyMs`, `success`, `errorMessage?`, `restaurantId?`, `userId?`, `createdAt`.

---

## 3. Core Engine: Safety-First Deterministic Filter & Meal-Budget Ranker (`src/lib/engine/`)

Runs in **100% deterministic TypeScript** with zero LLM calls on page load and integer-fils price comparisons.

### Step 1: Deterministic Hard Filter (Allergies, Intolerances & Strict Diets)

Let `hasHardRestrictions = diner.allergens.length > 0 || diner.dietaryRestrictions.length > 0`.

1. **Diner has NO hard restrictions (`!hasHardRestrictions`):**
   - Every published dish passes the hard filter with `safetyBadge: "NONE"`.
   - **Rule:** Diners without hard restrictions NEVER see a `"Verified safe"` or `"Not verified"` badge (nothing to verify).
2. **Diner HAS hard restrictions (`hasHardRestrictions`):**
   - **Rule (Missing Data = Not Safe):** If `item.allergenDataProvided === false` (or `item.allergens == null`), the dish is NEVER marked safe; if there is no explicit known conflict, it receives `safetyState: "UNVERIFIED_WARNING"` (*"Not verified — ask your server"*).
   - **Evaluate Base Dish Conflicts:**
     - Allergen/intolerance conflict: any overlap between `diner.allergens` and `item.allergens`.
     - Diet conflict: e.g., `vegetarian` requires `"vegetarian"` in `item.dietTags` AND `item.meatType === "NONE"`; `vegan` requires `"vegan"` in `item.dietTags` AND `item.meatType === "NONE"` AND no `"milk"`/`"eggs"` in `item.allergens`; `pescatarian` forbids `CHICKEN`/`BEEF`/`LAMB`/`OTHER`; `halal` requires `"halal"` in `item.dietTags`.
   - **Case A — Base dish has zero conflicts:**
     - If `item.allergenDataProvided && item.verificationStatus === "RESTAURANT_VERIFIED"` -> `safetyState: "VERIFIED_SAFE"` (**"Verified safe"** badge).
     - Otherwise -> `safetyState: "UNVERIFIED_WARNING"` (**"Not verified — ask your server"** warning badge, never labeled safe).
   - **Case B — Base dish conflicts, check Modifier Unlock:**
     - Search `item.modifiers` for a modifier (or minimal modifier set) whose `removesAllergens` eliminates all conflicting allergens and whose `addsDietTags` satisfies missing diet tags.
     - Effective dish price becomes `item.priceFils + modifier.priceDeltaFils`.
     - If `item.allergenDataProvided && item.verificationStatus === "RESTAURANT_VERIFIED" && modifier.verificationStatus === "RESTAURANT_VERIFIED"` -> `safetyState: "SAFE_WITH_MODIFIER"` with that modifier **pre-selected** and **"Verified safe with modifier"** badge.
     - If unlocked by an `AI_SUGGESTED` modifier or unverified item -> `safetyState: "UNVERIFIED_WARNING"` with modifier pre-selected and **"Not verified — ask your server"** warning.
   - **Case C — Conflict cannot be resolved:**
     - Dish is **HARD HIDDEN** (`safetyState: "HIDDEN"`), placed only in `"Hidden (n) — tap to see why"` with exact deterministic reasons.

### Step 2: Meal-Level Remaining Budget & Soft Preference Ranking

- **Meal-Level Budget Semantics (`maxBudgetAed`):**
  - `maxBudgetAed` (e.g., James's `AED 40.00`) is the budget for **that person's entire meal**, not a static per-dish ceiling.
  - Given what the person already has in their cart (`personCartTotalFils`), compute:
    $$\text{remainingBudgetFils} = \max(0,\ \text{maxBudgetFils} - \text{personCartTotalFils})$$
  - A dish (including any required safety modifier delta) is **within budget** iff `effectivePriceFils <= remainingBudgetFils`.
  - Within-budget dishes receive a budget-fit score boost (`+30 pts`), and top value dishes (`effectivePriceFils <= remainingBudgetFils` in the most affordable quartile/tier) earn the **"Best value"** badge.
  - Dishes with `effectivePriceFils > remainingBudgetFils` are **never marked unsafe**, but are collapsed into **"More options (Over remaining budget)"** (`"المزيد من الخيارات"`).
  - As James adds a `AED 24.00` dish to his cart, his remaining budget updates live to `AED 16.00`, dynamically re-ranking the menu so dishes `<= AED 16.00` surface to the top and the cart bar displays `AED 24.00 / AED 40.00`.
- **Soft Preference Score:**
  - `+15 pts` per matched `likedIngredients`
  - `-20 pts` per matched `dislikedIngredients`
  - `+10 pts` for matching `spiceTolerance`
  - `+10 pts` for `isPopular`
  - `+15 pts` for past positive rating (`>= 4`) by this diner
  - `-20 pts` if `safetyState === "UNVERIFIED_WARNING"` (verified safe dishes always rank above unverified ones)

---

## 4. AI Agents Design (`src/lib/agents/`)

All 8 agents use `@google/genai`, default `GEMINI_MODEL` to `"gemini-flash-latest"` (configurable via env), validate JSON outputs with Zod, log latency + tokens to `AiUsageLog`, rate-limit requests, and return a typed `{ status: "ai_not_configured" }` response when `GEMINI_API_KEY` is unset so the UI degrades cleanly:

1. **Menu Ingestion Agent** — Photo(s), PDF, or pasted text -> structured EN/AR categories, items, AED prices, ingredients, and modifiers for editable owner review.
2. **Dish Tagging Agent** — Suggests `dietTags`, 14 major `allergens`, `spiceLevel`, `meatType`, confidence, and modifier unlocks (`AI_SUGGESTED` until owner verifies).
3. **Taste Profile Agent** — Optional friendly chat turning natural-language preferences into a structured `DinerProfile` update.
4. **Personalized Blurb Helper** (Optional cached Step 3 of Engine) — Cached 1-line EN/AR *"Why this is for you"* blurbs.
5. **Group Table Agent** — Builds on the deterministic intersection of all table participants' profiles + combined group budget to recommend a shared spread + bill split.
6. **Menu Assistant (Chat)** — Grounded strictly in the current restaurant's `RESTAURANT_VERIFIED` dishes; links directly to valid dish IDs and never invents dishes.
7. **External Menu Scanner** — Extracts dishes from diner-uploaded delivery app screenshots or paper menu photos (upload / Web Share Target only; zero scraping) and applies the deterministic filter & ranker.
8. **Restaurant Insights Agent** — Summarizes scan diet/allergen breakdown, menu gaps, top dishes, and platform revenue for owners.

---

## 5. Business Model & Exact Fee Math (`src/lib/billing/`)

- **Exact Integer-Fils Formula (Round Half Up):**
  - Convert `subtotalAed` -> `subtotalFils` (integer), `feeCapAed` -> `capFils` (integer), `feePercentage` (e.g. `10.00%`) -> basis points `rateBps` (integer, e.g. `1000` bps where `100% = 10000` bps).
  - Raw percentage fee in fils with **round half up**:
    $$\text{pctFeeFils} = \left\lfloor \frac{\text{subtotalFils} \times \text{rateBps} + 5000}{10000} \right\rfloor$$
  - Final fee in fils:
    $$\text{feeFils} = \min(\text{capFils},\ \text{pctFeeFils})$$
  - **Verified Edge Cases (at 10% rate, AED 1.00 cap):**
    - `AED 0.00` -> `0 fils` (`AED 0.00`)
    - `AED 0.05` (`5 fils`) -> `5 * 1000 = 5000` -> `(5000 + 5000) / 10000 = 1 fil` (`AED 0.01`, round half up from `0.005`)
    - `AED 5.00` (`500 fils`) -> `50 fils` (`AED 0.50`)
    - `AED 9.99` (`999 fils`) -> `999 * 1000 = 999000` -> `(999000 + 5000) / 10000 = 100 fils` (`AED 1.00`, round half up from `0.999`)
    - `AED 10.00` (`1000 fils`) -> `100 fils` (`AED 1.00`)
    - `AED 10.01` (`1001 fils`) -> `min(100, 100) = 100 fils` (`AED 1.00`)
    - `AED 80.00` (`8000 fils`) -> `min(100, 800) = 100 fils` (`AED 1.00`)
- **Ledger Lifecycle:** Recorded atomically in `PlatformFee` when an order transitions to `ACCEPTED`. Orders cancelled before acceptance create no fee; if an accepted order is subsequently cancelled by staff, `PlatformFee.isVoided` is set to `true` so cancelled orders never owe a fee.
- **Payments Module Boundary:** `src/lib/payments/` exposes a clean provider interface (`OfflineAtTablePaymentProvider` active in v1; ready for Stripe / Checkout.com later).

---

## 6. Anti-Spam, Security & Table Session Lifecycle

- **RBAC:** Every API route enforces role and ownership checks (`RESTAURANT_OWNER` / `RESTAURANT_STAFF` scoped strictly to their own `restaurantId`; `ADMIN` for platform management).
- **Table Session Auto-Expiry:** Open `TableSession` records check `lastActivityAt` on access and auto-close after `tableSessionTtlHours` (default `4` hours, configurable in admin settings / env) so a new party scanning the same table QR code starts a clean session.
- **Guest & Table Rate Limiting:** Order creation is rate-limited per `guestToken`/user AND per `tableId` (e.g., max orders per window), AI endpoints are rate-limited per user/IP, and staff can 1-tap cancel spam orders on the live screen.
- **Demo Persona Switcher Guard:** Rendered **only** when `process.env.DEMO_MODE === "true"` AND `restaurant.isDemo === true`. Never visible on real restaurants.

---

## 7. Pages & Routes Map

- **Diner (`src/app/(diner)/`):**
  - `/` (Landing + Install PWA prompt + iOS Add-to-Home-Screen guide)
  - `/login`, `/register` (Auth pages)
  - `/onboarding` (Hard restrictions -> Likes/Dislikes -> Meal Budget + optional Taste Profile Agent chat)
  - `/home` (Participating restaurants, recent visits, Scan QR CTA, Scan External Menu CTA)
  - `/scan` (Camera QR scanner)
  - `/r/[restaurantSlug]/t/[tableCode]` (Personalized menu + Guest quick-profile + safety disclaimer + Full Menu toggle + Group Table tab + Menu Assistant chat + env-gated Demo Switcher on demo restaurant)
  - `/r/[restaurantSlug]/dish/[dishId]` (Dish detail, verified allergen statuses, interactive modifiers, "Why it's for you")
  - `/r/[restaurantSlug]/t/[tableCode]/group` (Group members, shared compatible dishes, per-person cart & remaining meal budget bar, bill split estimate, Send Order)
  - `/orders/[orderId]` (Live order status `Sent` -> `Accepted` -> `Preparing` -> `Served` + dish ratings)
  - `/external-scan` (Screenshot/photo upload & PWA share target -> filtered/ranked results)
  - `/profile` (Restrictions, meal budget, EN/AR switch, order history, ratings)
- **Restaurant Dashboard (`src/app/(restaurant)/dashboard/`):**
  - `/dashboard` (Restaurant setup, EN/AR details, branches)
  - `/dashboard/menu` (Upload menu -> AI Ingestion & Tagging -> editable review table -> verify allergens/modifiers -> publish)
  - `/dashboard/tables` (Create tables, printable branded QR code sheet)
  - `/dashboard/orders` (Large touch-friendly live staff order screen: Accept, Preparing, Served, Cancel)
  - `/dashboard/analytics` (Scans, orders, diner diet breakdown, Restaurant Insights Agent summary)
  - `/dashboard/billing` (Fees owed this month, ledger history, monthly invoices)
- **Admin (`src/app/(admin)/admin/`):**
  - `/admin` (Platform overview), `/admin/restaurants` (Approve/suspend), `/admin/users`, `/admin/orders`, `/admin/fees`, `/admin/invoices`, `/admin/settings` (Fee %, cap, currency, session TTL), `/admin/ai-logs`.
- **System / Ops:**
  - `/api/health` (App + PostgreSQL connectivity health check for Render)
  - `/offline` (Service worker offline fallback page in EN/AR)

---

## 8. Seed Data & Render Deployment (`render.yaml`)

- **Seed Data (`prisma/seed.ts`):**
  - Always ensures default `PlatformSetting` (`10%`, `AED 1.00` cap, `AED` currency) exists.
  - **Demo seeding is gated by `SEED_DEMO=true`** and requires `DEMO_PASSWORD` from env (no hard-coded passwords in git).
  - Seeds fictional `"Demo Lebanese Kitchen"` (`isDemo: true`, ~40 EN/AR dishes across Mezze, Grills, Salads, Desserts, Drinks, with verified tags, dairy-free modifiers, and a few `AI_SUGGESTED` dishes to showcase the unverified warning) and `@example.com` demo users:
    - `claude@example.com` (Vegetarian)
    - `bilal@example.com` (Lactose intolerant — `milk`)
    - `james@example.com` (Meal budget `AED 40.00`)
    - `owner@example.com`, `staff@example.com`, `admin@example.com`
- **Render Blueprint (`render.yaml`):**
  - **Database:** Defaults to paid starter tier `plan: basic-256mb` because Render's `free` Postgres expires after 30 days (with comments in `render.yaml` and documentation in `README.md` showing how to switch to `plan: free` if desired).
  - **Migrations on Deploy:** Uses `startCommand: npx prisma migrate deploy && npm run start` so database migrations execute reliably before server boot on **both** free and paid web service plans (`preDeployCommand` requires paid web instances, which we document clearly in `render.yaml` and `README.md`).
  - **Health Check:** `healthCheckPath: /api/health`.
