# PlateFit — Personalized Menu Platform (UAE)

> **Working name:** PlateFit (`بليت فيت`) — centralized in `src/config/brand.ts` (`NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_APP_NAME_AR`).
> **Market:** UAE (`AED`) • **Languages:** English (`LTR`) + Arabic (`RTL`).

Diners create a food profile once (hard allergies/intolerances, diet, soft preferences, and meal budget in AED), scan a restaurant table's QR code, and view that restaurant's menu deterministically filtered for safety and ranked for taste and remaining meal budget. Groups at the same table get a combined view and send live orders to the restaurant's staff screen.

Restaurants pay **`min(AED 1.00, 10% × order subtotal)`** (round half up) only when they accept an order placed through the app.

---

## Current Build Status

- [x] **Phase 1: Plan** (`SPEC.md`, `PLAN.md`)
- [x] **Phase 2: Foundation** (Next.js 16 + TypeScript, Tailwind v4, Prisma + PostgreSQL schema & initial migration, exact integer-fils money & fee math, Auth.js credentials + optional Google OAuth + RBAC + signed Guest cookies, EN/AR i18n with full RTL + dark mode, installable PWA manifest + service worker + offline fallback + iOS guidance, S3/dev-local storage guard, Gemini AI foundation with graceful missing-key fallback, `/api/health`, `render.yaml`)
- [ ] **Phase 3: Restaurant side**
- [ ] **Phase 4: Diner side**
- [ ] **Phase 5: Ordering**
- [ ] **Phase 6: AI extras**
- [ ] **Phase 7: Admin & billing**
- [ ] **Phase 8: Polish & `DEMO.md`**

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
3. Render reads `render.yaml` and provisions:
   - **`platefit-db`** (PostgreSQL): Defaults to `plan: basic-256mb` (Render's paid starter tier) because **Render's `free` PostgreSQL databases expire after 30 days**. For temporary free evaluation, change `plan: basic-256mb` to `plan: free` in `render.yaml`.
   - **`platefit-web`** (Node Web Service):
     - Builds with `npm ci --include=dev && npm run build` so Prisma CLI, Tailwind CSS, TypeScript, and `tsx` remain available when `NODE_ENV=production`.
     - Runs `npx prisma migrate deploy && npm run start` in `startCommand` so migrations always execute before server startup on **both** free and paid web plans (`preDeployCommand` only runs on paid web instances).
     - Monitored via `/api/health` (verifies both app liveness and PostgreSQL connectivity).
     - Uses an in-memory per-instance sliding-window rate limiter (appropriate for a single Render web service instance; client IP extraction prefers Render's `true-client-ip`, falling back to the last entry of `x-forwarded-for`).
     - Dish photo uploads require S3 env vars (`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) in production; local `public/uploads` fallback is restricted strictly to `NODE_ENV=development` because Render's container filesystem is ephemeral.
4. Set secret environment variables prompted by Render (`GEMINI_API_KEY`; optionally `DEMO_MODE`, `SEED_DEMO`, `DEMO_PASSWORD`, and S3 credentials).
