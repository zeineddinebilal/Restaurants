# Product Spec — Personalized Menu Platform

> Working name: **PlateFit** (placeholder — rename freely).
> Market: **UAE** (prices in **AED**). Languages: **English + Arabic (RTL)**.
> This file is the single source of truth. Build in the phases at the bottom, in order.

---

## 1. The idea in one paragraph

Diners create a food profile once (diet, allergies/intolerances, likes/dislikes, budget). When they sit at a restaurant, they scan the table's QR code and see **that restaurant's menu filtered and ranked for them**: dishes they can't eat are hidden, dishes they're likely to order are on top, and cheaper options are highlighted if they're on a budget. A group at one table gets a combined view. They order from the app, and the order goes straight to the restaurant's staff screen. The platform earns **AED 1 or 10% of the order, whichever is less**, only on orders placed through the app, so restaurants pay nothing unless it brings value.

### Demo scenario (must work end-to-end)
Three friends sit at a table at a demo Lebanese restaurant and scan the QR code:
- **Claude** is **vegetarian** → no meat/fish/chicken dishes shown.
- **Bilal** is **lactose intolerant** → no dishes containing dairy, unless a "without cheese / without yogurt" modifier makes them dairy-free (then shown with that modifier pre-selected).
- **James** is **on a budget** (e.g. max AED 40 per person) → cheaper dishes ranked first, "best value" badges, over-budget dishes collapsed under "More options".
- Group mode shows dishes **all three can share** (e.g. vegetarian + dairy-free mezze), then each person's own picks.
- Each person adds items to the table order; it is sent to the restaurant's live order screen; the platform fee is recorded per order.

---

## 2. Users and roles

| Role | What they do |
|---|---|
| **Diner** | Signs up, builds food profile, scans QR, sees personalized menu, joins a table group, orders, rates dishes, scans external menus |
| **Restaurant owner/manager** | Creates restaurant + branches, uploads menu (photo/PDF/text), reviews AI-extracted dishes and tags, manages tables & QR codes, sees analytics and fees owed |
| **Restaurant staff** (waiter/kitchen) | Live order screen: new orders by table, accept → preparing → served |
| **Platform admin** (us) | Approves restaurants, sees all orders and the fee ledger, monthly invoices per restaurant, manages users |

---

## 3. Core principle: safety first

- **Allergies and intolerances are HARD filters and must be deterministic code, not AI guesses.** A dish is only shown to an allergic diner as safe if its allergen tags are **verified by the restaurant**.
- AI may *suggest* ingredients, allergens and diet tags, but each suggestion has a status: `ai_suggested` or `restaurant_verified`. Unverified dishes are shown to restricted diners with a clear **"Not verified — ask your server"** warning, never as safe.
- Show a disclaimer on every personalized menu: "Always confirm allergies with staff."
- Preferences and budget are SOFT: they rank and badge, never hide.

---

## 4. AI agents inside the platform

Each agent is a server-side module with a clear input/output schema (JSON), using the Gemini API (`GEMINI_API_KEY` env var, model name configurable via `GEMINI_MODEL`). All agent outputs are validated with Zod before saving. Log every call (agent, latency, tokens) for cost tracking.

1. **Menu Ingestion Agent** — Input: photo(s), PDF or pasted text of a menu. Output: structured categories and items (name EN/AR, description, price AED, portion, ingredients, modifiers). Owner reviews in an editable table before publishing.
2. **Dish Tagging Agent** — For each item, suggests: diet tags (vegetarian, vegan, pescatarian, halal, keto, high-protein), allergens (the 14 major allergens incl. milk/lactose, gluten, nuts, peanuts, sesame, eggs, fish, shellfish, soy), spice level, meat type, and "can be made X with modifier Y". Each tag has confidence + status `ai_suggested` until the owner verifies.
3. **Taste Profile Agent** — Short friendly onboarding chat (or quick-pick screens) that turns a diner's answers into a structured profile: hard restrictions, soft likes/dislikes, cuisines, spice tolerance, budget per meal. Learns over time from orders and ratings.
4. **Personalized Menu Engine** — NOT an LLM call per page load. Step 1: deterministic hard filter. Step 2: scoring/ranking (preference match, budget fit, popularity, past orders). Step 3 (optional, cached): one-line AI "why this is for you" blurbs.
5. **Group Table Agent** — Combines profiles of everyone at a table: shared dishes all members can eat, suggested sharing set within the group budget, per-person picks, and bill split estimate.
6. **Menu Assistant (chat)** — Diner asks "What's filling but under AED 30 with no dairy?" Answers ONLY from this restaurant's verified menu data, with links to the dishes. Never invents dishes.
7. **External Menu Scanner** — Diner takes a screenshot of a menu from a delivery app (Talabat, Deliveroo, Careem, etc.) or a photo of a paper menu; the app extracts dishes and applies the same filter/ranking. (No scraping or unofficial APIs of delivery apps: screenshot/photo upload and the phone's share sheet only. Official partnerships come later.)
8. **Restaurant Insights Agent** — For owners: weekly summary like "32% of diners who scanned your menu are vegetarian but you have only 3 vegetarian mains", top dishes, dishes nobody can eat, revenue via platform.

---

## 5. Business model and fee logic

- Fee per order placed through the app: **`fee = min(AED 1.00, 10% × order subtotal)`**, rounded to 2 decimals. Example: AED 5 order → AED 0.50 fee; AED 80 order → AED 1.00.
- Fees are recorded in a `PlatformFee` ledger at the moment the restaurant **accepts** the order (cancelled orders = no fee).
- Admin and owner dashboards show fees per day/month; admin can generate a monthly invoice (PDF or printable page) per restaurant.
- Fee amount and cap must be configurable (admin settings), not hard-coded.
- No online card payments in the first version: diners pay the restaurant as usual. Leave a clean `payments` module boundary for later (e.g. Stripe or Checkout.com).

---

## 6. Diner app — pages

- **Landing** — what the app does, "Install app" prompt, sign up / log in.
- **Onboarding** — profile builder (quick-pick chips + optional chat with Taste Profile Agent). Hard restrictions first, then likes/dislikes, then budget.
- **Home** — nearby/participating restaurants, recent restaurants, "Scan QR" big button, "Scan any menu" button.
- **QR scan** — opens camera; QR URL format `/r/{restaurantSlug}/t/{tableCode}`. Also works if scanned with the phone's normal camera (opens the web app directly, even without an account → guest mode with quick profile).
- **Personalized menu** — sections: "Perfect for you", "Good options", "Hidden (n) — tap to see why". Badges: Verified safe, Best value, Popular, Spicy. Toggle to see full original menu.
- **Dish detail** — photo, price, ingredients, allergens (with verified status), modifiers, "why it's for you".
- **Table / group** — see who's at the table, shared suggestions, combined order cart, send order.
- **Order status** — sent → accepted → preparing → served.
- **External scan** — upload screenshot/photo → filtered results.
- **Profile** — edit restrictions, budget, language (EN/AR), order history, ratings.

## 7. Restaurant dashboard — pages

- Sign up / restaurant details / branches.
- **Menu builder** — upload menu → AI extraction → editable review table → verify tags → publish.
- **Tables & QR codes** — create tables, download printable QR codes (PDF sheet with restaurant branding).
- **Live orders** (staff screen, large touch-friendly, auto-refresh/real-time) — accept, preparing, served, cancel.
- **Analytics & insights** — scans, orders, top dishes, diner diet breakdown, Insights Agent summary.
- **Billing** — fees owed this month, history.

## 8. Admin — pages

- Restaurants (approve/suspend), users, all orders, fee ledger, invoices, settings (fee %, cap, currency), AI usage/cost log.

---

## 9. Technical requirements

- **Stack:** Next.js (App Router) + TypeScript, Tailwind CSS, Prisma + PostgreSQL, Zod, Auth.js (email + password; Google sign-in optional), Gemini API via the official Google Gen AI SDK. If you strongly prefer a different stack, explain why in PLAN.md before building.
- **PWA:** installable on Android and iPhone (manifest, icons, service worker, offline fallback page, "Add to Home Screen" guidance for iOS). Mobile-first; also looks great on laptop.
- **i18n:** English and Arabic with full RTL layout; menu items store both languages.
- **Real-time orders:** Server-Sent Events or polling every few seconds (keep it simple and reliable on Render).
- **Images:** menu uploads processed by AI then not required to be stored; dish photos stored in an S3-compatible bucket configured by env vars (provide a local fallback for development).
- **Security:** role-based access on every API route; restaurants can only see their own data; rate-limit AI endpoints; validate all input with Zod; never commit secrets — use `.env` (gitignored) and keep `.env.example` up to date.
- **Deployment:** Render, from GitHub repo `zeineddinebilal/Restaurants`. Provide `render.yaml` (web service + Render Postgres), run Prisma migrations on deploy, health check endpoint `/api/health`.
- **Quality:** ESLint + Prettier, unit tests for the hard filter, ranking and fee calculation (these MUST have tests, including the Claude/Bilal/James scenario), and a few end-to-end tests (Playwright) for the QR → menu → order flow.
- **Seed data:** one **fictional** demo restaurant ("Demo Lebanese Kitchen", ~40 items across mezze, grills, salads, desserts, drinks, with realistic AED prices, verified tags and some dairy-free modifiers), demo users Claude/Bilal/James, an owner, a staff user and an admin. Do not use real restaurant names, logos or menus in seed data.
- **Design:** clean, modern, food-friendly; warm accent color; large tap targets; dark mode; fast. Accessible (contrast, labels).

---

## 10. Build phases (do them in order, commit and push after each working step)

1. **Plan** — write `PLAN.md` (architecture, data model, page list, open questions). Wait for approval.
2. **Foundation** — project setup, auth & roles, database schema, i18n/RTL, PWA shell, `render.yaml`, health check, first deploy to Render.
3. **Restaurant side** — restaurant setup, menu builder with Menu Ingestion + Dish Tagging agents, verification flow, tables & QR codes.
4. **Diner side** — onboarding/Taste Profile, QR flow, personalized menu engine (hard filter + ranking), dish detail, guest mode.
5. **Ordering** — group tables, cart, send order, live staff order screen, fee ledger.
6. **AI extras** — Menu Assistant chat, Group Table Agent, External Menu Scanner, Insights Agent.
7. **Admin & billing** — admin pages, invoices, settings.
8. **Polish** — design pass, Arabic review, performance, tests, demo walkthrough script in `DEMO.md` for pitching to restaurants.

After each phase: run tests and the build, fix errors, update `README.md`, commit with a clear message, push to `main`.
