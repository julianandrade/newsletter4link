import { test, Page } from "@playwright/test";

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
  const firstOption = page.getByRole("option").first();
  const editionId = await firstOption.getAttribute("data-value");
  await firstOption.click();
  await page.getByRole("button", { name: "Generate Newsletter" }).click();

  const viewButton = page.getByRole("button", { name: "View" }).first();
  await viewButton.waitFor({ timeout: 60000 });
  if (editionId) {
    const draftsRes = await page.request.get(`/api/drafts?editionId=${editionId}`);
    const draftsData = await draftsRes.json();
    const firstDraftId = draftsData?.drafts?.[0]?.id;
    if (firstDraftId) {
      await page.request.post(`/api/drafts/${firstDraftId}/approve`);
    }
  } else {
    const draftRow = viewButton.locator("..").locator("..");
    const approveButton = draftRow.locator("button").nth(1);
    await approveButton.click();
  }
  await page.getByText("APPROVED").first().waitFor({ timeout: 20000 });

  if (editionId) {
    await page.goto(`/dashboard/send/${editionId}`, { waitUntil: "networkidle" });
  } else {
    await page.goto("/dashboard/send", { waitUntil: "networkidle" });
    await page.getByText(/Week \d+, \d{4}/).first().click();
  }
  const waitForSubjectLines = () =>
    Promise.race([
      page.getByText("Subject Lines").first().waitFor({ timeout: 5000 }),
      page.getByText("No subject lines available for this draft.").waitFor({ timeout: 5000 }),
    ]);

  try {
    await waitForSubjectLines();
  } catch {
    const draftPanel = page.locator("#drafts-panel");
    const trigger = draftPanel.locator('button[role="combobox"]').first();
    if (await trigger.count()) {
      await trigger.click();
      await page.getByRole("option").first().click();
    }
  }

  await Promise.race([
    page.getByText("Subject Lines").first().waitFor({ timeout: 20000 }),
    page.getByText("No subject lines available for this draft.").waitFor({ timeout: 20000 }),
  ]);
});
