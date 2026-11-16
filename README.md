# PlateFit — Personalized Menu Platform (UAE)

> **Working name:** PlateFit (`بليت فيت`) — centralized in `src/config/brand.ts` (`NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_APP_NAME_AR`).
> **Market:** UAE (`AED`) • **Languages:** English (`LTR`) + Arabic (`RTL`).

Diners create a food profile once (hard allergies/intolerances, diet, soft preferences, and meal budget in AED), scan a restaurant table's QR code, and view that restaurant's menu deterministically filtered for safety and ranked for taste and remaining meal budget. Groups at the same table get a combined view and send live orders to the restaurant's staff screen.

Restaurants pay **`min(AED 1.00, 10% × order subtotal)`** (round half up) only when they accept an order placed through the app.

---

## Current Build Status

- [x] **Phase 1: Plan** (`SPEC.md`, `PLAN.md`)
- [x] **Phase 2: Foundation** (Next.js 16 + TypeScript, Tailwind v4, Prisma + PostgreSQL schema & initial migration, exact integer-fils money & fee math, Auth.js credentials + optional Google OAuth + RBAC + signed Guest cookies, EN/AR i18n with full RTL + dark mode, installable PWA manifest + service worker + offline fallback + iOS guidance, S3/dev-local storage guard, Gemini AI foundation with graceful missing-key fallback, `/api/health`, `render.yaml`)
- [x] **Phase 3: Restaurant side** (Restaurant setup, branches & staff management, Menu Builder with AI Menu Ingestion + Dish Tagging agents, editable review table, strict safety verification rules & bulk verify/publish, tables & printable branded QR sheet, 42-dish bilingual demo menu seed)
- [x] **Phase 4: Diner side** (Onboarding & Profile builder with Taste Profile AI Agent + quick-pick chips, camera QR scanner, Guest Mode with signed cookies & inline quick filter, Deterministic Personalized Menu Engine with hard allergen/diet filter + verified modifier unlock + meal-level remaining budget ranking + Group intersection, Dish Detail page, env-gated Demo Persona Switcher)
- [x] **Phase 5: Ordering** (Table group sessions with auto-close TTL, per-table 128-bit secret QR tokens `?k=...` with dashboard rotation, atomic CAS shared-cart double-submit protection, server-side DB pricing & integer-fils bill splits, atomic idempotent `PlatformFee` ledger on order acceptance & void-on-cancel, live staff kitchen screen with SSE + polling fallback + chime alerts + dietary safety notes, live diner order status & ratings, Playwright E2E test)
- [x] **Phase 6: AI extras** (Grounded Menu Assistant chat restricted to `RESTAURANT_VERIFIED` safe dishes + allergy confirmation, Group Table Agent with server-recomputed integer-fils splits & caching, External Menu Scanner via screenshot/photo upload & PWA Share Target with mandatory unverified disclaimers & prompt-injection tag sanitization, anonymous aggregate Restaurant Insights Agent & `/dashboard/analytics`, DB-backed `AiUsageLog` daily quotas across caller/IP/restaurant/global caps, `<= 4` images / `<= 5 MB` caps, short timeouts, and clean missing-key fallback)
- [x] **Phase 7: Admin & billing** (Owner `/dashboard/billing` & printable invoices, live-DB `ADMIN`-only portal across `/admin/restaurants`, `/admin/users` with self-deactivation protection, `/admin/orders` & `PlatformFee` ledger, `/admin/invoices` with `Asia/Dubai` month boundaries + sequential numbering + frozen `ISSUED` snapshots + post-invoice void credit adjustments, `/admin/settings` with range validation & `AdminAuditLog`, and `/admin/ai-logs`)
- [x] **Phase 7.5: Live iPhone UX enhancements** (Expanded diets + free-text AI interpretation with mandatory editable `"Here's what I understood"` confirmation screen, deterministic `customAvoidIngredients` EN/AR synonym hard filter, soft dislikes converted to `"Without X"` + automatic `"No X"` kitchen notes via `removableIngredients` with core-ingredient downrank, onboarding redirect to `/home` & `/profile` Back-to-Home UX, privacy-preserving Dining Companions invite link/QR/short code + pre-table group meal planner `/plan/[planId]` + automatic table session cart load on valid QR scan `?k=...` + `"Split by person"` vs `"One person pays for all"`)
- [x] **Phase 7.6: Research-driven UAE restaurant upgrades** (Admin Sales Pipeline CRM `/admin/pipeline` with CSV preview/import/deduplication/export, rank-sorted `"Next to Visit"` field view, timestamped outreach notes, and one-click `"Convert to Restaurant"` owner signup invite auto-turning partners `GREEN`; printable 14-allergen `/dashboard/allergen-matrix` that helps restaurants keep allergen information documented and consistent + optional dish `caloriesKcal` + `"Person in charge of allergen information"`; Qlub/Foodics Pay/FineDine table payment QR coexistence on `/orders/[orderId]`; bilingual `/for-restaurants` landing page with rate-limited inbound `"Request a demo"` form)
- [x] **Phase 8: Polish, CRM/Invite Hardening & `DEMO.md`** (Non-overwrite protection & 200-note cap on public demo requests, atomic CAS race protection + 14-day `inviteExpiresAt` + admin invite regeneration on prospect conversion, OWASP `\t`/`\r` CSV export escaping, full EN/AR RTL & 375px mobile & `@media print` polish, global loading/error/404 boundaries, and Dubai restaurant pitch script in [`DEMO.md`](./DEMO.md))

---

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Configure environment:**
   Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `AUTH_SECRET`, and (optionally) `GEMINI_API_KEY`:
   ```bash
   cp .env.example .env
   ```
   - If `GEMINI_API_KEY` is omitted, the app continues working and AI features report `"AI not configured"`.
   - Demo seeding is gated behind `SEED_DEMO="true"` and requires `DEMO_PASSWORD` (min 8 chars) in `.env`.
3. **Run migrations & seed:**
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```
4. **Start dev server:**
   ```bash
   npm run dev
   ```

---

## Scripts & Quality Checks

- `npm test` — Run unit & PGlite PostgreSQL DDL tests (`tsx --test`)
- `npm run lint` — Run ESLint
- `npm run format:check` — Verify Prettier formatting
- `npm run build` — Generate Prisma client & build production Next.js bundle

---

## Deploying on Render (`render.yaml`)

1. Push to `main` on `zeineddinebilal/Restaurants`.
2. In the Render Dashboard, click **New +** -> **Blueprint** and select `zeineddinebilal/Restaurants`.
3. Render reads `render.yaml` and provisions (defaulted to **Free** plans for the demo):
   - **`platefit-db`** (PostgreSQL, `plan: free`): **Render's free PostgreSQL databases expire after 30 days.** For persistent production storage, upgrade `plan: free` to `plan: basic-256mb` in `render.yaml`.
   - **`platefit-web`** (Node Web Service, `plan: free`):
     - **Free-tier cold start note:** Render's free web service spins down after ~15 minutes of inactivity (~1 minute cold start on next request). **Open the live URL ~1 minute before starting a restaurant pitch** so the instance is warm (or upgrade to `plan: starter` for always-on hosting).
     - Builds with `npm ci --include=dev && npm run build` so Prisma CLI, Tailwind CSS, TypeScript, and `tsx` remain available when `NODE_ENV=production`.
     - **Automatic migrations & seed on startup (no Render Shell required):** Runs `npx prisma migrate deploy && npm run db:seed && npm run start` in `startCommand`. `prisma/seed.ts` is strictly idempotent: when `SEED_DEMO=false`, it only ensures `PlatformSetting`; when `SEED_DEMO=true` (and `DEMO_PASSWORD` is set in Render Environment), it automatically upserts the `@example.com` demo users and the 42-dish `"Demo Lebanese Kitchen"` menu on boot without needing Render Shell.
     - Monitored via `/api/health` (verifies both app liveness and PostgreSQL connectivity).
     - Uses an in-memory per-instance sliding-window rate limiter (appropriate for a single Render web service instance; client IP extraction prefers Render's `true-client-ip`, falling back to the last entry of `x-forwarded-for`).
     - Dish photo uploads require S3 env vars (`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) in production; local `public/uploads` fallback is restricted strictly to `NODE_ENV=development` because Render's container filesystem is ephemeral.
4. Set `sync: false` environment variables prompted by Render (`GEMINI_API_KEY`; for demo deployments set `DEMO_MODE="true"`, `SEED_DEMO="true"`, and `DEMO_PASSWORD`, or `"false"` for production; optionally add S3 credentials). Using `sync: false` ensures values configured in the Render Dashboard are preserved across Blueprint syncs.
