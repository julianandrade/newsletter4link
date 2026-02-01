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
      await page.waitForURL("**/dashboard/send/**", { timeout: 20000 });
      return;
    }
  }
}

test("approved draft shows subject line preview in send page", async ({ page }) => {
  await login(page);
  await ensureEdition(page);

  await page.goto("/dashboard/generate", { waitUntil: "networkidle" });
  await page.getByText("Select edition...").click();
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Generate Newsletter" }).click();

  const viewButton = page.getByRole("button", { name: "View" }).first();
  await viewButton.waitFor({ timeout: 60000 });

  const draftRow = viewButton.locator("..").locator("..");
  const approveButton = draftRow.locator("button").nth(1);
  await approveButton.click();
  await page.getByText("APPROVED").first().waitFor({ timeout: 20000 });

  await page.goto("/dashboard/send", { waitUntil: "networkidle" });
  await page.getByText(/Week \d+, \d{4}/).first().click();
  await page.getByText("Subject Lines").first().waitFor({ timeout: 20000 });
});
