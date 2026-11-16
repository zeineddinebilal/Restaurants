# PlateFit — Implementation Plan (`PLAN.md`)

> **Phase 1 Deliverable:** Architecture, Data Model, Engine & AI Design, Page & Route Map, and Open Questions.
> Built for **PlateFit** — Personalized Menu Platform (UAE / AED, English + Arabic RTL).

---

## 1. Architecture & Technical Stack

We will follow the recommended stack in `SPEC.md` with clean module boundaries so each domain (auth, deterministic menu engine, AI agents, ordering, billing) is isolated and testable:

- **Framework:** Next.js 15 (App Router) + TypeScript (strict mode)
- **Styling & UI:** Tailwind CSS + CSS variables for warm food-friendly light/dark themes + logical layout properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `dir="rtl"` / `dir="ltr"`) for seamless English/Arabic RTL switching, Lucide icons.
- **Database & ORM:** PostgreSQL + Prisma ORM.
- **Authentication & Authorization:** Auth.js (NextAuth v5) with Credentials provider (email + bcrypt password hash) and optional Google OAuth, plus stateless/cookie-backed **Guest Sessions** so diners scanning a table QR code with their native camera can build a quick profile, join a table group, and place orders without mandatory registration.
- **AI SDK:** Official Google Gen AI SDK (`@google/genai`), configured via `GEMINI_API_KEY` and `GEMINI_MODEL` (defaulting to `gemini-2.5-flash`). Every AI agent uses structured JSON output validated by **Zod** and logs token usage, latency, and status to `AiUsageLog`.
- **Real-Time Live Orders & Table Sync:** Server-Sent Events (SSE) endpoint with automatic 3-second smart polling fallback for reliability on Render's standard proxy infrastructure.
- **File / Image Storage:** S3-compatible storage adapter (`@aws-sdk/client-s3` supporting AWS S3, Cloudflare R2, or Supabase S3) when env vars are set, with an automatic local disk fallback (`public/uploads`) in development. Menu ingestion photos/PDFs are processed in memory and discarded after extraction.
- **QR & Printable PDFs:** `qrcode` for generating SVG/PNG QR codes and printable multi-table branded sheets (print-optimized HTML/PDF view).
- **Testing:**
  - **Vitest** for deterministic unit tests (hard allergen/diet filters, modifier unlocks, budget & preference ranking, Claude/Bilal/James scenario, and `PlatformFee` calculations).
  - **Playwright** for end-to-end flows (QR scan -> personalized menu -> group table order -> staff acceptance -> fee ledger).

### Directory Structure

```text
src/
├── app/
│   ├── (diner)/               # Landing, Onboarding, Home, QR Scan, Menu, Table, Order Status, External Scan, Profile
│   ├── (restaurant)/          # Restaurant Dashboard: Setup, Menu Builder, Tables/QR, Live Staff Screen, Analytics, Billing
│   ├── (admin)/               # Platform Admin: Restaurants, Users, Orders, Fee Ledger, Invoices, Settings, AI Logs
│   └── api/                   # REST + SSE endpoints, Auth, Health check (/api/health)
├── lib/
│   ├── engine/                # Deterministic hard filter, modifier resolver, soft scorer & ranker (100% unit-tested, 0 LLM calls)
│   ├── agents/                # 8 Gemini AI agents with Zod schemas + usage logger
│   ├── billing/               # Fee calculation, ledger recording on order acceptance, invoice generation
│   ├── payments/              # Clean interface boundary for future Stripe / Checkout.com integration
│   ├── storage/               # S3-compatible + local fallback image storage service
│   ├── i18n/                  # EN/AR dictionaries, RTL helpers, localized field selectors
│   └── auth/                  # Auth.js config, RBAC guards, and Guest session manager
└── prisma/
    ├── schema.prisma          # Database schema
    └── seed.ts                # "Demo Lebanese Kitchen" (~40 dishes) + Claude, Bilal, James, Owner, Staff, Admin
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
   - `User`: `id`, `email` (optional for temporary guest records or linked via `guestToken`), `passwordHash`, `name`, `role` (`DINER`, `RESTAURANT_OWNER`, `RESTAURANT_STAFF`, `ADMIN`), `locale` (`"en"` | `"ar"`), `createdAt`.
   - `DinerProfile`:
     - `userId` (unique, nullable if guest) / `guestToken` (unique, nullable)
     - `displayName` (e.g., "Claude", "Bilal", "James")
     - **Hard Restrictions:**
       - `dietaryRestrictions`: `String[]` (e.g., `["vegetarian", "vegan", "pescatarian", "halal"]`)
       - `allergens`: `String[]` (from the 14 major allergens: `["milk", "gluten", "tree_nuts", "peanuts", "sesame", "eggs", "fish", "shellfish", "crustaceans", "molluscs", "soy", "celery", "mustard", "lupin", "sulphites"]`)
     - **Soft Preferences & Budget:**
       - `likedIngredients`: `String[]`
       - `dislikedIngredients`: `String[]`
       - `favoriteCuisines`: `String[]`
       - `spiceTolerance`: `SpiceLevel`
       - `maxBudgetFils`: `Int?` (stored in fils or Decimal AED, e.g., AED 40.00 -> `40.00`)
       - `preferHighProtein`: `Boolean`, `preferKeto`: `Boolean`
     - `onboardingTranscript`: `Json?` (optional Taste Profile Agent history)

2. **`Restaurant`, `Branch`, & `RestaurantStaff`**
   - `Restaurant`: `id`, `slug` (unique, e.g., `demo-lebanese-kitchen`), `nameEn`, `nameAr`, `descriptionEn`, `descriptionAr`, `cuisine`, `logoUrl`, `status` (`PENDING`, `APPROVED`, `SUSPENDED`), `ownerId`, `createdAt`.
   - `Branch`: `id`, `restaurantId`, `nameEn`, `nameAr`, `addressEn`, `addressAr`, `city` (e.g., Dubai, Abu Dhabi), `isActive`.
   - `RestaurantMember`: links `RESTAURANT_STAFF` or managers to a `Restaurant` / `Branch`.

3. **`MenuCategory`, `MenuItem`, `MenuItemTag`, & `MenuItemModifier`**
   - `MenuCategory`: `id`, `restaurantId`, `nameEn`, `nameAr`, `sortOrder`.
   - `MenuItem`:
     - `id`, `restaurantId`, `categoryId`
     - `nameEn`, `nameAr`, `descriptionEn`, `descriptionAr`
     - `priceAed`: `Decimal(10, 2)`
     - `portionSize`: `String?` (e.g., `"Regular"`, `"Sharing (2-3 pax)"`)
     - `ingredientsEn`: `String[]`, `ingredientsAr`: `String[]`
     - `dietTags`: `String[]` (`vegetarian`, `vegan`, `pescatarian`, `halal`, `keto`, `high_protein`)
     - `allergens`: `String[]` (the 14 major allergens present in the base dish)
     - `spiceLevel`: `SpiceLevel`
     - `meatType`: `MeatType`
     - `verificationStatus`: `VerificationStatus` (`AI_SUGGESTED` vs `RESTAURANT_VERIFIED`)
     - `aiConfidence`: `Float?`
     - `verifiedAt`: `DateTime?`, `verifiedById`: `String?`
     - `isAvailable`: `Boolean`, ` isPopular`: `Boolean`, ` isPublished`: `Boolean`
     - `imageUrl`: `String?`
   - `MenuItemModifier`:
     - `id`, `menuItemId`
     - `nameEn`, `nameAr` (e.g., `"Without yogurt sauce"` / `"بدون صلصة اللبن"`, `"Without halloumi cheese"`)
     - `priceDeltaAed`: `Decimal(10, 2)` (default `0.00`)
     - `removesAllergens`: `String[]` (e.g., `["milk"]`)
     - `addsDietTags`: `String[]` (e.g., `["vegan", "vegetarian"]`)
     - `verificationStatus`: `VerificationStatus` (`AI_SUGGESTED` vs `RESTAURANT_VERIFIED`)

4. **`DiningTable`, `TableSession`, & `TableParticipant`**
   - `DiningTable`: `id`, `restaurantId`, `branchId`, `tableCode` (e.g., `"T1"`, `"T2"`), `displayName` (`"Table 1"`), `capacity`, `isActive`. (Unique constraint on `[restaurantId, tableCode]`).
   - `TableSession`: `id`, `restaurantId`, `tableId`, `status` (`OPEN`, `CLOSED`), `shareCode`, `createdAt`, `closedAt`.
   - `TableParticipant`: `id`, `tableSessionId`, `dinerProfileId`, `displayName`, `joinedAt`.

5. **`Order`, `OrderItem`, `DishRating`**
   - `Order`:
     - `id`, `orderNumber`, `restaurantId`, `tableSessionId`, `tableId`
     - `status`: `OrderStatus` (`SENT` -> `ACCEPTED` -> `PREPARING` -> `SERVED` / `CANCELLED`)
     - `subtotalAed`: `Decimal(10, 2)`
     - `notes`: `String?`
     - `sentAt`, `acceptedAt`, `preparingAt`, `servedAt`, `cancelledAt`
   - `OrderItem`:
     - `id`, `orderId`, `menuItemId`, `participantId` (tracks whether Claude, Bilal, James, or "Shared Table" ordered it)
     - `quantity`: `Int`
     - `unitPriceAed`: `Decimal(10, 2)`
     - `selectedModifiers`: `Json` (array of `{ id, nameEn, nameAr, priceDeltaAed }`)
     - `specialInstructions`: `String?`
   - `DishRating`: `id`, `dinerProfileId`, `menuItemId`, `orderId?`, `rating` (1–5), `comment`, `createdAt`.

6. **`PlatformSetting`, `PlatformFee`, `Invoice`, & `AiUsageLog`**
   - `PlatformSetting` (singleton row `id = "default"`):
     - `feePercentage`: `Decimal(5, 2)` (default `10.00` for 10%)
     - `feeCapAed`: `Decimal(10, 2)` (default `1.00` for AED 1.00)
     - `currency`: `String` (default `"AED"`)
   - `PlatformFee`:
     - `id`, `orderId` (unique), `restaurantId`
     - `orderSubtotalAed`: `Decimal(10, 2)`
     - `feePercentageApplied`: `Decimal(5, 2)`
     - `feeCapAppliedAed`: `Decimal(10, 2)`
     - `feeAmountAed`: `Decimal(10, 2)`
     - `recordedAt`: `DateTime` (created atomically when order transitions to `ACCEPTED`)
     - `invoiceId`: `String?`
   - `Invoice`:
     - `id`, `invoiceNumber`, `restaurantId`, `year`, `month`, `totalOrders`, `grossSalesAed`, `totalFeesAed`, `status` (`DRAFT`, `ISSUED`, `PAID`), `generatedAt`.
   - `MenuScanEvent`: tracks QR scans and diner dietary/allergen breakdown anonymously for the Restaurant Insights Agent.
   - `ExternalMenuScan`: stores a diner's uploaded screenshot/photo extraction result for viewing and re-filtering.
   - `AiUsageLog`: `id`, `agentName`, `model`, `inputTokens`, `outputTokens`, `latencyMs`, `success`, `restaurantId?`, `userId?`, `createdAt`.

---

## 3. Core Engine: Safety-First Deterministic Filter & Ranking (`src/lib/engine/`)

Per Section 3 & 4 of `SPEC.md`, the Personalized Menu Engine runs in **100% deterministic TypeScript** with zero LLM calls on page load.

### Step 1: Deterministic Hard Filter (Allergies, Intolerances & Hard Diets)

For a given `DinerProfile` and `MenuItem` (with its `MenuItemModifier[]`):

1. **Diner has NO hard restrictions (`allergens.length === 0` and `dietaryRestrictions.length === 0`):**
   - Dish passes the hard filter automatically (`status: "SAFE"`).
2. **Diner HAS hard restrictions (allergies/intolerances or strict diet like vegetarian/vegan/halal):**
   - **Check Base Dish:**
     - Does `item.allergens` intersect with `diner.allergens`?
     - Is any `diner.dietaryRestrictions` missing from `item.dietTags` (or violated by `item.meatType`, e.g. meat/fish/chicken for a vegetarian)?
   - **Case A — Base dish has no conflict:**
     - If `item.verificationStatus === "RESTAURANT_VERIFIED"` -> **Shown as `"VERIFIED_SAFE"`** (with "Verified safe" badge).
     - If `item.verificationStatus === "AI_SUGGESTED"` -> **Shown with mandatory `"UNVERIFIED_WARNING"`** badge: *"Not verified — ask your server"*, never labeled safe.
   - **Case B — Base dish conflicts, check Modifier Unlock:**
     - Inspect `item.modifiers` where modifier removes the conflicting allergen(s) (`removesAllergens` covers all conflicting allergens) and/or adds the required diet tag (`addsDietTags` covers missing diet tags).
     - If a matching modifier exists AND both the item and modifier are `RESTAURANT_VERIFIED` -> **Shown as `"SAFE_WITH_MODIFIER"`** with that modifier **pre-selected** (e.g., Bilal sees *Shish Tawook Platter* or *Fattoush with Labneh* with **"Without yogurt / dairy"** pre-selected).
     - If a matching modifier exists but is `AI_SUGGESTED` -> Shown with `"UNVERIFIED_WARNING"` and modifier pre-selected.
   - **Case C — Conflict cannot be resolved:**
     - Dish is **HARD HIDDEN** (`status: "HIDDEN"`) and placed in the collapsed `"Hidden (n) — tap to see why"` drawer with the exact deterministic reason (e.g., *"Hidden: Contains meat (Lamb)"* for Claude, or *"Hidden: Contains Dairy/Milk"* for Bilal).

### Step 2: Deterministic Soft Scoring & Ranking

For all non-hidden dishes:
- **Budget check:** If `diner.maxBudgetAed` is set (e.g., James at AED 40):
  - Dishes with effective price `<= maxBudgetAed` receive a budget fit boost (`+30 pts`), and dishes in the lowest price tier with good portion/value get the **"Best value"** badge.
  - Dishes with effective price `> maxBudgetAed` are **never hidden as unsafe**, but are separated into the collapsible **"More options (Over budget)"** section and ranked lower.
- **Preference score:**
  - `+15 pts` per matched `likedIngredients`
  - `-20 pts` per matched `dislikedIngredients`
  - `+10 pts` for matching `spiceTolerance`
  - `+10 pts` for `isPopular`
  - `+15 pts` for past positive rating by this diner
  - `-15 pts` if `UNVERIFIED_WARNING` (so verified safe dishes always rank above unverified ones for restricted diners)
- **Sections generated:**
  1. **Perfect for you** (Top-scoring verified/matching dishes within budget)
  2. **Good options** (Other compatible dishes within budget)
  3. **More options (Over budget)** (Collapsed section when a budget is active, e.g., for James)
  4. **Hidden (n) — tap to see why** (Hard-filtered dishes with transparent explanations)

### Step 3: Deterministic Group Table Combiner (+ AI Group Enhancement)

- Computes the **Intersection Set** of dishes that pass Step 1 for **every participant** at the table (e.g., dishes that are both Vegetarian for Claude AND Dairy-free for Bilal, prioritized within James's AED 40 budget).
- Suggests a shared mezze/platter combination + individual picks for each friend + estimated per-person bill split.

---

## 4. AI Agents Design (`src/lib/agents/`)

All 8 agents use `@google/genai`, enforce strict JSON output via `zod`, and write an entry to `AiUsageLog`:

1. **`menuIngestionAgent`**: Accepts image/PDF bytes (via Gemini multimodal `inlineData`) or raw text; extracts categories and dishes with `nameEn`, `nameAr` (auto-translating if only one language is on the menu), `descriptionEn`, `descriptionAr`, `priceAed`, `portionSize`, `ingredientsEn`, `ingredientsAr`, and `modifiers`.
2. **`dishTaggingAgent`**: Analyzes each extracted dish and outputs `dietTags`, `allergens` (mapped strictly to the 14 major allergens enum), `spiceLevel`, `meatType`, `confidence`, and modifier transformations (`removesAllergens`, `addsDietTags`). Saved with `verificationStatus = AI_SUGGESTED`.
3. **`tasteProfileAgent`**: Conversational helper that converts natural-language diner statements (e.g. *"I can't have milk or cheese, love grilled chicken and garlic, trying to spend under 45 dirhams"*) into a structured `DinerProfile` update patch.
4. **`personalizedBlurbAgent`** (Optional/Cached in Engine Step 3): Generates cached one-line *"Why this is for you"* blurbs in EN/AR for top-ranked dishes.
5. **`groupTableAgent`**: Builds on the deterministic group compatibility matrix to propose a curated sharing spread for the table within their combined budget.
6. **`menuAssistantAgent`**: RAG-style grounded chat over **only** the current restaurant's `RESTAURANT_VERIFIED` menu items. Returns text + structured `dishIds` links. System prompt + schema validation prevent inventing any dish not in the verified menu list.
7. **`externalMenuScannerAgent`**: Takes a diner's uploaded screenshot (e.g., from Talabat, Deliveroo, Careem, or a paper menu photo), runs OCR + extraction + tagging in one pass, and runs the deterministic filter/ranker over the extracted items with a clear unverified disclaimer.
8. **`restaurantInsightsAgent`**: Aggregates `MenuScanEvent` (diet/allergen distribution of scanning diners), `OrderItem` volume, and menu coverage gaps to produce actionable weekly insights in EN/AR for the restaurant owner.

---

## 5. Business Model & Fee Logic (`src/lib/billing/`)

- **Formula:**
  $$\text{fee} = \min\left(\text{feeCapAed},\ \text{round}\left(\text{subtotalAed} \times \frac{\text{feePercentage}}{100},\ 2\right)\right)$$
  With default settings (`feeCapAed = 1.00`, `feePercentage = 10.0`):
  - Order subtotal `AED 5.00` -> `10% = AED 0.50` -> `min(1.00, 0.50) = AED 0.50`
  - Order subtotal `AED 80.00` -> `10% = AED 8.00` -> `min(1.00, 8.00) = AED 1.00`
- **Trigger:** Recorded inside a Prisma transaction when the restaurant staff/owner transitions an order status to `ACCEPTED`. Orders that remain `SENT` or are `CANCELLED` before acceptance incur **AED 0.00** fee. If an already-accepted order is later cancelled, the ledger entry is voided/marked cancelled so restaurants never pay for cancelled orders.
- **Configurability:** Admin can update `feePercentage`, `feeCapAed`, and `currency` in `/admin/settings`; each `PlatformFee` record snapshots the rate and cap applied at the time of acceptance.

---

## 6. Pages & Routes Map

### Diner App (`src/app/(diner)/...`)
- `/` — **Landing Page**: Value proposition, demo preview, EN/AR switch, PWA "Install App" prompt (with iOS "Share -> Add to Home Screen" drawer), Sign Up / Log In / Try Demo Table.
- `/onboarding` — **Onboarding & Taste Profile**: Step-by-step quick-pick chips (Hard Restrictions -> Likes/Dislikes -> Budget in AED) + optional Taste Profile AI Chat tab.
- `/home` — **Diner Home**: Participating UAE restaurants, quick demo switcher (Claude / Bilal / James), big "Scan Table QR" button, "Scan Any Menu Screenshot" button.
- `/scan` — **QR Camera Scanner**: Camera viewfinder + quick demo table buttons.
- `/r/[restaurantSlug]/t/[tableCode]` — **Table Entry & Personalized Menu**:
  - Supports authenticated diners AND instant **Guest Mode** (1-tap quick profile or demo persona selector).
  - Shows safety disclaimer: *"Always confirm allergies with staff."*
  - Tabs/Sections: **For You** (`Perfect for you`, `Good options`, `More options (Over budget)`, `Hidden (n) — tap to see why`), **Group Table Mode** (Claude + Bilal + James combined view), **Full Original Menu** toggle, and floating **Menu Assistant Chat**.
- `/r/[restaurantSlug]/dish/[dishId]` — **Dish Detail Modal / Page**: Photo, AED price, EN/AR description, ingredients, verified allergen badges, interactive modifiers (with auto-preselected safety modifiers), "Why it's for you", add to table cart.
- `/r/[restaurantSlug]/t/[tableCode]/group` — **Table / Group Cart & Split**: Active table members, **"Shared Dishes All Can Eat"** section, per-person picks, combined order cart, bill split estimate, "Send Order to Kitchen" button.
- `/orders/[orderId]` — **Live Order Status**: Real-time tracker (`Sent` -> `Accepted` -> `Preparing` -> `Served`) + post-meal dish rating prompt.
- `/external-scan` — **External Menu Scanner**: Upload screenshot/photo (or share target from mobile share sheet) -> extracted & personalized menu results.
- `/profile` — **Diner Profile**: Edit allergies, diets, budget, language (EN/AR), order history, past ratings.

### Restaurant Dashboard (`src/app/(restaurant)/dashboard/...`)
- `/dashboard` — **Overview & Setup**: Restaurant details (EN/AR), branches, approval status banner.
- `/dashboard/menu` — **Menu Builder & Verification**:
  - Upload menu photo/PDF/text -> Menu Ingestion + Dish Tagging Agents.
  - Editable review table (inline edit EN/AR names, AED prices, allergens, diet tags, modifiers).
  - One-click **"Verify Dish & Modifiers"** (`AI_SUGGESTED` -> `RESTAURANT_VERIFIED`) + bulk verify + Publish toggle.
- `/dashboard/tables` — **Tables & QR Codes**: Create/edit tables per branch, preview QR URL `/r/{slug}/t/{code}`, print/download branded QR sheet.
- `/dashboard/orders` — **Live Staff Order Screen**: High-contrast, large touch targets, real-time updates + audio/visual alert on new `SENT` orders, table code, participant dietary notes, 1-tap `Accept` (triggers `PlatformFee`) -> `Preparing` -> `Served` / `Cancel`.
- `/dashboard/analytics` — **Analytics & Insights**: Total scans, conversion rate, top dishes, diner restriction breakdown chart, AI Restaurant Insights summary card.
- `/dashboard/billing` — **Billing & Fees**: Current month order count, gross sales via app, total platform fees owed, monthly invoice history.

### Platform Admin (`src/app/(admin)/admin/...`)
- `/admin` — **Admin Overview**: KPIs across all restaurants, orders, and platform fees.
- `/admin/restaurants` — **Restaurants Management**: Approve, suspend, or inspect restaurants.
- `/admin/users` — **Users Management**: View diners, owners, staff, and admins.
- `/admin/orders` — **Global Orders & Fee Ledger**: Filterable table of all orders and their `PlatformFee` calculations.
- `/admin/invoices` — **Monthly Invoices**: Generate and view printable monthly invoices per restaurant.
- `/admin/settings` — **Platform Settings**: Configure fee percentage (default 10%), fee cap (default AED 1.00), currency.
- `/admin/ai-logs` — **AI Usage & Cost Log**: Token usage, latency, and call history across all 8 agents.

---

## 7. Seed Data Plan ("Demo Lebanese Kitchen")

`prisma/seed.ts` will populate a complete, immediately playable demo environment:
- **Restaurant:** `"Demo Lebanese Kitchen"` (`"المطبخ اللبناني التجريبي"`, slug: `demo-lebanese-kitchen`), status `APPROVED`, 2 branches (Dubai Marina & Abu Dhabi Corniche), tables `T1`–`T5`.
- **~40 Authentic Fictional Dishes across 5 categories** (Cold & Hot Mezze, Charcoal Grills, Salads, Desserts, Drinks) with realistic UAE prices (AED 12 to AED 85), full EN + AR names/descriptions, `RESTAURANT_VERIFIED` allergen/diet tags, plus a few `AI_SUGGESTED` items to demonstrate the unverified warning badge, and dairy-free modifiers (`"Without labneh / yogurt"`, `"Without halloumi"`, `"Grill with olive oil instead of butter"`).
- **Demo Accounts & Pre-linked Table Session (`T1`):**
  - **Claude** (`claude@demo.platefit.ae`) — Vegetarian (`dietaryRestrictions: ["vegetarian"]`)
  - **Bilal** (`bilal@demo.platefit.ae`) — Lactose intolerant (`allergens: ["milk"]`)
  - **James** (`james@demo.platefit.ae`) — Budget conscious (`maxBudgetAed: 40.00`)
  - **Owner** (`owner@demo.platefit.ae`) — Owner of Demo Lebanese Kitchen
  - **Staff** (`staff@demo.platefit.ae`) — Waiter/Kitchen staff account
  - **Admin** (`admin@demo.platefit.ae`) — Platform administrator

---

## 8. Open Questions for Review

Before we proceed to **Phase 2 (Foundation)**, please let me know if you have any preferences on the following (or approve the proposed defaults):

1. **Brand Name:** Should we keep **PlateFit** as the display name in the UI and PWA manifest, or would you like a different name?
2. **Demo Switcher UX:** To make pitching and testing effortless on a single phone or laptop, I plan to include a subtle **"Demo Persona Switcher" bar** on the demo table page so you can switch between **Claude (Vegetarian)**, **Bilal (Lactose-Free)**, **James (Budget <= AED 40)**, and **Combined Group View** in one tap without logging out and back in. Is that desirable?
3. **Intolerances vs. Allergies in Hard Filter:** The spec states allergies and intolerances are both HARD filters, and gives Bilal (lactose intolerant) as an example where dishes with dairy are hidden unless a verified *"without cheese / without yogurt"* modifier makes them dairy-free. We will treat both allergies and intolerances identically in the deterministic hard filter (hiding conflicting dishes unless unlocked by a verified modifier). Does that match your expectation?
4. **Render Deployment:** In Phase 2 we will create `render.yaml` and push to `zeineddinebilal/Restaurants`. Do you already have the Render service connected to this GitHub repo, or will you connect the Blueprint on Render after Phase 2 is pushed?
