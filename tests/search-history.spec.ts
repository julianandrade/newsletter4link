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

test("search history converts to a saved topic", async ({ page }) => {
  await login(page);

  const query = `AI compliance ${Date.now()}`;
  const expectedTopicName = `Search: ${query}`;

  await page.goto("/dashboard/search", { waitUntil: "networkidle" });
  await page.getByPlaceholder("e.g., What's trending in AI agents for enterprise?").fill(query);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText(/Found \d+ results/).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Save Search" }).click();
  await page.getByText("Saved").waitFor({ timeout: 10000 });

  await page.getByRole("tab", { name: "History" }).click();
  const historyEntry = page.getByText(query).first();
  await historyEntry.waitFor({ timeout: 10000 });
  await historyEntry
    .locator("..")
    .locator("..")
    .locator('button[title="Convert to Topic"]')
    .click();
  await page.getByText("Topic").first().waitFor({ timeout: 10000 });

  await page.getByRole("tab", { name: "Saved Topics" }).click();
  await page.getByText(expectedTopicName).first().waitFor({ timeout: 10000 });
});
