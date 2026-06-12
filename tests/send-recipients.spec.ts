import { test, expect, Page } from "@playwright/test";

const email = "test@example.com";
const password = "Test1234!";

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("**/dashboard", { timeout: 20000 });
}

async function ensureEdition(page: Page) {
  await page.goto("/dashboard/send", { waitUntil: "networkidle" });
  const firstEdition = page.getByText(/Week \d+, \d{4}/).first();
  if (await firstEdition.isVisible()) {
    await firstEdition.click();
    return;
  }

  const emptyState = page.getByText("No Editions Yet");
  const createButtons = [
    page.getByRole("button", { name: "Create First Edition" }),
    page.getByRole("button", { name: "Create Edition" }),
  ];
  if (await emptyState.isVisible()) {
    await createButtons[0].click();
    await page.getByRole("button", { name: "Create Edition" }).click();
    await page.waitForURL("**/dashboard/send/**", { timeout: 20000 });
    return;
  }
  for (const button of createButtons) {
    if (await button.isVisible()) {
      await button.click();
      await page.getByRole("button", { name: "Create Edition" }).click();
      try {
        await page.waitForURL("**/dashboard/send/**", { timeout: 20000 });
        return;
      } catch {
        await page.getByRole("button", { name: "Cancel" }).click();
      }
      break;
    }
  }
  await firstEdition.click();
}

test("subscribers appear in send recipients after adding", async ({ page }) => {
  await login(page);

  const uniqueEmail = `smoke+${Date.now()}@example.com`;

  await page.goto("/dashboard/subscribers", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add Subscriber" }).click();
  await page.fill("input#email", uniqueEmail);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add Subscriber" })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await expect(page.getByText(uniqueEmail).first()).toBeVisible();

  await ensureEdition(page);

  // The recipients panel only renders on FINALIZED editions; finalize the
  // draft first (the button opens a confirmation dialog). The edition detail
  // loads client-side, so wait for either the Finalize button (DRAFT) or the
  // recipients panel (already FINALIZED) instead of an instant isVisible check.
  const finalizeButton = page.getByRole("button", { name: "Finalize", exact: true });
  const recipientsPanel = page.getByText(/All subscribers \(\d+\)/);
  await expect(finalizeButton.or(recipientsPanel).first()).toBeVisible({
    timeout: 20000,
  });
  if (await finalizeButton.isVisible()) {
    await finalizeButton.click();
    await page.getByRole("button", { name: "Finalize Edition" }).click();
  }

  await expect(recipientsPanel).toBeVisible({ timeout: 20000 });
});
