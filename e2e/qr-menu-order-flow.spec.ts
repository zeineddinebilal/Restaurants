import { expect, test } from "@playwright/test";

test("QR -> personalized menu (Claude + Bilal) -> send order -> staff accepts -> fee recorded -> diner sees live status update", async ({
  browser,
}) => {
  const dinerContext = await browser.newContext();
  const dinerPage = await dinerContext.newPage();

  // 1. Open QR scanner page and follow the demo table QR link -> /r/demo-lebanese-kitchen/t/T1
  await dinerPage.goto("/scan");
  await dinerPage.getByRole("link", { name: /Demo Lebanese Kitchen — Table T1/i }).click();
  await expect(dinerPage).toHaveURL(/\/r\/demo-lebanese-kitchen\/t\/T1$/);
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

  // 7. Diner's open /orders/[id] page automatically updates to "Accepted" via SSE / polling!
  await expect(dinerPage.getByTestId("order-live-status")).toHaveText("Accepted", {
    timeout: 10_000,
  });

  await dinerContext.close();
  await staffContext.close();
});
