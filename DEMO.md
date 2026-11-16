# PlateFit (`بليت فيت`) — Dubai Restaurant Owner Demo & Pitch Script

This guide is designed for live in-person pitches to independent and small-group restaurants across Dubai, Abu Dhabi, and Sharjah.

---

## 0. Pre-Pitch Checklist (Do This Outside the Restaurant — 60 Seconds)

1. **Warm up Render Free (~1 minute before walking in):**
   - Render's free web service spins down after ~15 minutes of inactivity and takes ~45–60 seconds to wake on the first request.
   - **Open the live URL on your phone 1 minute before entering the venue** and wait until the landing page loads. Once awake, every tap during the pitch is instant.
2. **Prepare two screens (ideal) or two browser tabs on one phone:**
   - **Screen A — Diner Phone (normal tab):** Open `/scan` -> tap **`Demo Lebanese Kitchen — Table T1`** so you land on `/r/demo-lebanese-kitchen/t/T1?k=...` with table ordering unlocked and the **Demo Persona Switcher** visible at the top.
   - **Screen B — Kitchen / Owner Tablet (incognito tab or second device):** Log in at `/login` as `owner@example.com` (using your configured `DEMO_PASSWORD`) and keep `/dashboard/orders` open, with `/dashboard/allergen-matrix` and `/dashboard/menu` one tap away in the top bar.

---

## 1. Opening Hook (30 Seconds) — The *"Ask Our Team"* Allergy Gap

> *"Quick question—on a busy Friday night, how many times do waiters get stopped at a table to run back to the kitchen and double-check whether a sauce has dairy, tahini, nuts, or garlic—or have a dish sent back because someone said 'no pickles' and it got missed?*
>
> *Almost every menu in Dubai still says **'Please ask our team about allergies'** at the bottom. Guests with allergies or specific diets hesitate, order less mezze, and slow down your floor. We built **PlateFit** so guests scan once at the table and instantly see **your own menu** filtered for their exact allergies, diet, dislikes, and budget—in English and Arabic."*

---

## 2. Handling the #1 Dubai Objection: *"We Already Have Qlub / Foodics Pay!"*

Many Dubai casual and fine-casual venues already have **Qlub**, **Foodics Pay**, **FineDine**, or **ChatFood** QR pucks on their tables. Address this proactively before they even ask:

> *"Keep Qlub! You don't change your POS, your payment terminal, or your Qlub pucks.*
>
> *Qlub happens **after** the meal—it splits and pays the bill. PlateFit happens **before** the meal—it helps allergic, vegetarian, lactose-free, and picky guests figure out what they can safely eat and sends clean, accurate modifier notes to your kitchen. And the moment their order goes in, PlateFit displays **'Pay with Qlub at your table'** right on their live order tracker so checkout stays 100% on Qlub."*

---

## 3. Live 3-Minute Table Demo (The 3 Personas + Kitchen Loop)

Hand your phone (**Screen A**, on `/r/demo-lebanese-kitchen/t/T1?k=...`) to the owner or hold it side-by-side:

### Step 1 — Claude (Vegetarian)
1. Tap **`Claude (Vegetarian)`** in the Demo Persona bar.
2. Point out:
   - Every meat, chicken, and fish dish (`Lamb Kafta Meshwi`, `Mixed Grill`) is **deterministically hidden** by code—never left to AI guesswork.
   - Verified plant-based mezze (`Classic Hummus`, `Moutabal`, `Fattoush`) appear under **Perfect for you** with **`Verified Safe`** badges.
   - Any dish whose tags haven't been confirmed by the restaurant yet shows an amber **`Unverified — ask staff`** warning rather than pretending to be safe.
3. Tap **`+ Add`** on **Classic Hummus (`AED 22.00`)**.

### Step 2 — Bilal (Lactose-Free + Soft *"Without X"* Dislikes)
1. Tap **`Bilal (Lactose-Free)`**.
2. Point out two things owners love:
   - **Smart Modifier Unlock:** Plain dairy dishes stay hidden, *except* **Shish Tawook Platter**—because the restaurant verified a **`Without yogurt (dairy-free)`** modifier, PlateFit unlocks the dish and **pre-selects that modifier automatically**!
   - **Soft Dislikes -> *"Without X"* Kitchen Notes:** When a guest dislikes a removable garnish like pickles or raw tomato, PlateFit doesn't hide your shawarma—it keeps it at full rank, tells the guest *"Comes with pickles — we'll ask for it without"*, and automatically attaches **`No pickles`** to the kitchen order. (Allergies are *never* unlocked by garnish removal—only verified allergen-free modifiers.)
3. Tap **`+ Add`** on **Shish Tawook Platter (`AED 44.00`)**.

### Step 3 — James (`AED 40` Meal Budget, Zero Dietary Restrictions)
1. Tap **`James (Budget AED 40)`**.
2. Point out:
   - Because James has no allergies or diet restrictions, **zero safety badges** clutter his view.
   - Instead, dishes rank dynamically against his **remaining meal budget (`AED 40.00`)**, and items above his remaining budget tuck neatly into **More options**—helping solo lunch diners and office groups order fast.

### Step 4 — Group Table & Live Kitchen Acceptance
1. Briefly tap **`Table Group & Split`** (or mention **Dine with Companions** on `/home` where friends plan together before arriving while keeping individual health profiles private). Show how shared mezze safe for *everyone* at the table is highlighted and how the table can choose **Split by person** or **One person pays for all**.
2. Return to the cart (`AED 22.00 + AED 44.00 = AED 66.00`) and tap **`Send Order to Kitchen`**.
3. Show **Screen B (`/dashboard/orders`)**:
   - The order pops up live with an audio chime.
   - Point directly to the red/amber kitchen safety callout: **`Bilal: no milk, halal — modifier Without yogurt (dairy-free)`**. No lost verbal instructions!
4. Tap **`Accept Order`** on the staff screen:
   - Watch **Screen A** (`/orders/[orderId]`) flip live to **`Accepted`** AND display **`Pay with Qlub at your table`**!

---

## 4. Owner Back-Office Value (90 Seconds)

Switch **Screen B** through three quick tabs in `/dashboard`:

1. **Menu Builder (`/dashboard/menu`):**
   - *"Give us your PDF or a photo of your printed menu. Our AI extracts English + Arabic names, ingredients, calories, and suggested tags in under a minute—and nothing goes live as 'Verified Safe' until you or your chef tick confirm."*
2. **Printable 14-Allergen Matrix (`/dashboard/allergen-matrix`):**
   - Click **`Allergen Matrix`** in the dashboard bar.
   - Show the clean, printable 14-allergen grid listing every published dish, optional `kcal`, **Person in charge of allergen information** (`Chef Karim Mansour`), who verified each dish and when, and the clear footer: *"Prepared from information confirmed by the restaurant."*
   - Key phrasing: *"This **helps you keep allergen information documented and consistent** across your print menu, table QR, and delivery tablets whenever you update a recipe."*
3. **Full Arabic (`RTL`) Support:**
   - Tap **`العربية`** in the top bar—every dish, allergen badge, kitchen note, and button flips cleanly into native RTL Arabic.

---

## 5. Pricing & Zero-Risk Close (30 Seconds)

> *"Here is why restaurants say yes on the spot:*
>
> - **AED 0 setup fee. AED 0 monthly subscription.**
> - **AED 0** when guests just browse your filtered menu and order through your waiter or pay via Qlub.
> - You only pay **`min(AED 1.00, 10% × order subtotal)`** when your staff **accepts** an order placed through PlateFit—and **AED 0** if an order is cancelled.
> - That means on a **AED 66** order—or even a **AED 500** family table—your platform fee is capped at **AED 1.00**."*

### Next Step on the Spot
- Open `/admin/pipeline` on your admin account -> click **`Convert to Restaurant`** on their prospect card -> WhatsApp or AirDrop the 14-day owner invite link (`/register?role=RESTAURANT_OWNER&prospectInvite=...`), **or** have them submit their contact details at `/for-restaurants` and offer to import their current menu PDF for them today.
