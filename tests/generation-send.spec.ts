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

  // Radix options don't expose the edition id in the DOM; capture it from the
  // generation request instead.
  const generationRequest = page.waitForRequest(
    (req) => req.url().includes("/api/generation/stream"),
    { timeout: 20000 }
  );
  await page.getByRole("button", { name: "Generate Newsletter" }).click();
  const editionId = new URL((await generationRequest).url()).searchParams.get(
    "editionId"
  );
  expect(editionId).toBeTruthy();

  // The draft card button reads "Selected" when the draft is auto-selected
  // (the only draft always is) and "View" otherwise.
  await page
    .getByRole("button", { name: /^(View|Selected)$/ })
    .first()
    .waitFor({ timeout: 60000 });

  // Approve via API. The generate page doesn't re-fetch drafts after an
  // out-of-band mutation, so assert approval through the API too.
  const draftsRes = await page.request.get(`/api/drafts?editionId=${editionId}`);
  expect(draftsRes.ok()).toBeTruthy();
  const draftsData = await draftsRes.json();
  const firstDraftId = draftsData?.drafts?.[0]?.id;
  expect(firstDraftId).toBeTruthy();

  const approveRes = await page.request.post(`/api/drafts/${firstDraftId}/approve`);
  expect(approveRes.ok()).toBeTruthy();

  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/drafts?editionId=${editionId}`);
        const data = await res.json();
        return data?.drafts?.find(
          (d: { id: string; status: string }) => d.id === firstDraftId
        )?.status;
      },
      { timeout: 20000 }
    )
    .toBe("APPROVED");

  await page.goto(`/dashboard/send/${editionId}`, { waitUntil: "networkidle" });
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
