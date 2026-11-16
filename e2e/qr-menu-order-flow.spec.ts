import { expect, test } from "@playwright/test";

test("QR -> personalized menu (Claude + Bilal) -> send order -> staff accepts -> fee recorded -> diner sees live status update", async ({
  browser,
}) => {
  const dinerContext = await browser.newContext();
  const dinerPage = await dinerContext.newPage();

  // 0. Visiting a guessable table URL without `?k={tableToken}` renders read-only (no Add buttons!)
  await dinerPage.goto("/r/demo-lebanese-kitchen/t/T1");
  await expect(dinerPage.getByText(/Scan the QR at your table to order/i)).toBeVisible();
  await expect(dinerPage.getByRole("button", { name: "Add Classic Hummus" })).toHaveCount(0);

  // 1. Open QR scanner page and follow the demo table QR link -> /r/demo-lebanese-kitchen/t/T1?k=...
  await dinerPage.goto("/scan");
  await dinerPage.getByRole("link", { name: /Demo Lebanese Kitchen — Table T1/i }).click();
  await expect(dinerPage).toHaveURL(/\/r\/demo-lebanese-kitchen\/t\/T1\?k=/);
  await expect(dinerPage.getByText("Always confirm allergies with staff.")).toBeVisible();

  // Wait for background table session initialization so demo friends are seated
  await dinerPage.waitForTimeout(1200);

  // 2. Switch to Claude (Vegetarian): meat dishes are hidden, add Classic Hummus (AED 22.00)
  await dinerPage.getByRole("button", { name: "Claude (Vegetarian)" }).click();
  await expect(dinerPage.getByRole("heading", { name: "Classic Hummus" })).toBeVisible();
  await expect(dinerPage.getByRole("heading", { name: "Lamb Kafta Meshwi" })).toHaveCount(0);
  await dinerPage.getByRole("button", { name: "Add Classic Hummus" }).click();

  // 3. Switch to Bilal (Lactose-Free): Shish Tawook Platter is unlocked with dairy-free modifier pre-selected!
  await dinerPage.getByRole("button", { name: "Bilal (Lactose-Free)" }).click();
  await expect(dinerPage.getByRole("heading", { name: "Shish Tawook Platter" })).toBeVisible();
  await expect(dinerPage.getByText(/without yogurt \(dairy-free\)/i).first()).toBeVisible();
  await dinerPage.getByRole("button", { name: "Add Shish Tawook Platter" }).click();

  // 4. Send combined table order (AED 22.00 + AED 44.00 = AED 66.00) to kitchen
  await dinerPage.getByRole("button", { name: /Send Order to Kitchen/i }).click();
  await expect(dinerPage).toHaveURL(/\/orders\/[a-z0-9]+/i);
  await expect(dinerPage.getByTestId("order-live-status")).toHaveText("Sent to Kitchen");

  // 5. Staff logs in on a separate context -> sees dietary alert & modifier -> clicks Accept Order
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();

  await staffPage.goto("/login");
  await staffPage.getByLabel(/Email/i).fill("staff@example.com");
  await staffPage.getByLabel(/Password/i).fill("e2e-demo-password-123");
  await staffPage.getByRole("button", { name: /^Log in$/i }).click();

  await staffPage.waitForURL(/\/dashboard\/orders/);
  await expect(staffPage.getByText(/1× Classic Hummus/i)).toBeVisible();
  await expect(staffPage.getByText(/1× Shish Tawook Platter/i)).toBeVisible();
  // Verify kitchen sees Bilal's dairy restriction + selected dairy-free modifier!
  await expect(
    staffPage.getByText(/Bilal: no milk, halal — modifier .*without yogurt/i),
  ).toBeVisible();

  await staffPage.getByRole("button", { name: /Accept Order/i }).click();

  // 6. PlatformFee is atomically recorded: min(AED 1.00, 10% * AED 66.00) = AED 1.00
  await expect(staffPage.getByText("Platform fee: AED 1.00")).toBeVisible();

  // 7. Diner's open /orders/[id] page automatically updates to "Accepted" via SSE / polling & shows Qlub coexistence!
  await expect(dinerPage.getByTestId("order-live-status")).toHaveText("Accepted", {
    timeout: 10_000,
  });
  await expect(dinerPage.getByText("Pay with Qlub at your table")).toBeVisible();

  await dinerContext.close();
  await staffContext.close();
});

test("375px mobile layout, Arabic RTL toggle, /for-restaurants demo request, and Owner Allergen Matrix", async ({
  browser,
}) => {
  const mobileCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await mobileCtx.newPage();

  // 1. /for-restaurants at 375px: no horizontal overflow + submit demo request
  await page.goto("/for-restaurants");
  await expect(page.getByRole("heading", { name: /Turn “Ask Our Team”/i })).toBeVisible();
  const overflowEn = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflowEn).toBe(false);

  await page.getByLabel(/Restaurant name/i).fill("E2E Terrace Bistro");
  await page.getByLabel(/Area \/ District/i).fill("JLT");
  await page.getByLabel(/Your name/i).fill("Samir");
  await page.getByLabel(/Phone \/ WhatsApp/i).fill("+971 50 777 8888");
  await page.getByRole("button", { name: /Submit Demo Request/i }).click();
  await expect(page.getByText(/Your demo request has been recorded/i)).toBeVisible();

  // 2. Switch to Arabic (RTL) at 375px and verify dir="rtl" + zero horizontal overflow
  await page.getByRole("button", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: /قائمة ذكية تُصفي/i })).toBeVisible();
  const overflowAr = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflowAr).toBe(false);

  // 3. Owner logs in and views printable 14-Allergen Matrix with Chef Karim Mansour & disclaimer
  const ownerCtx = await browser.newContext();
  const ownerPage = await ownerCtx.newPage();
  await ownerPage.goto("/login");
  await ownerPage.getByLabel(/Email/i).fill("owner@example.com");
  await ownerPage.getByLabel(/Password/i).fill("e2e-demo-password-123");
  await ownerPage.getByRole("button", { name: /^Log in$/i }).click();
  await ownerPage.waitForURL(/\/dashboard/);

  await ownerPage.goto("/dashboard/allergen-matrix");
  await expect(ownerPage.getByText("Chef Karim Mansour")).toBeVisible();
  await expect(
    ownerPage.getByText("Prepared from information confirmed by the restaurant."),
  ).toBeVisible();

  await mobileCtx.close();
  await ownerCtx.close();
});
