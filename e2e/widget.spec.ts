import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

const DEMO_SITE = "http://localhost:4173/";
const NOT_ALLOWED_SITE = "http://localhost:4174/";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

async function openWidget(page: Page, url = DEMO_SITE) {
  await page.goto(url);
  await page.locator('button[data-staytalk="launcher"]').click();
  return page.frameLocator('iframe[title="StayTalk chat"]');
}

test("guest chats on the property website, staff replies from the inbox", async ({
  page,
  browser,
  request,
}) => {
  await request.delete(`${MAILPIT}/api/v1/messages`);

  // Guest (browser language en-US) asks something the knowledge base doesn't cover.
  const widget = await openWidget(page);
  await expect(widget.getByTestId("widget-title")).toHaveText("서촌 한옥 게스트하우스");
  await widget.getByRole("textbox").fill("Do you have a rooftop swimming pool?");
  await widget.getByRole("textbox").press("Enter");
  const hostMessages = widget.locator('[data-testid="widget-message"][data-from="host"]');
  await expect(hostMessages).toHaveCount(1);
  await expect(hostMessages.first()).toContainText(/staff/i);

  // Staff gets an email in their dashboard language.
  await expect
    .poll(async () => {
      const res = await request.get(`${MAILPIT}/api/v1/search?query=to:owner@seoul.example`);
      return (await res.json()).messages?.[0]?.Subject ?? "";
    })
    .toContain("답변 불가");

  // Owner opens the inbox in a separate session.
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await loginAs(staff, "owner@seoul.example");
  await staff.goto("/ko/inbox?status=ESCALATED");
  const row = staff.getByTestId("inbox-row").first();
  await expect(row).toContainText("rooftop swimming pool");
  await row.click();
  // First visit compiles the route in dev mode; allow for it.
  await expect(staff).toHaveURL(/\/ko\/inbox\/[^/?]+$/, { timeout: 30_000 });
  await expect(staff.getByTestId("conversation-status")).toHaveText("담당자 대기");
  await expect(staff.getByTestId("escalation")).toContainText("답변 불가");

  // Staff replies in Korean; the guest receives the (mock) English translation via polling.
  await staff.getByLabel("직접 답장").fill("수영장은 없지만 근처 공공 수영장을 안내해 드릴게요.");
  await staff.getByRole("button", { name: "보내기" }).click();
  await expect(staff.locator('[data-role="STAFF"]')).toContainText("수영장은 없지만");

  await expect(hostMessages).toHaveCount(2, { timeout: 15_000 });
  await expect(hostMessages.nth(1)).toContainText("Staff");
  await expect(hostMessages.nth(1)).toContainText("[en] 수영장은 없지만");

  // Guest follow-up while staff handles it: the AI stays silent.
  await widget.getByRole("textbox").fill("Thank you!");
  await widget.getByRole("textbox").press("Enter");
  await expect(widget.locator('[data-testid="widget-message"][data-from="guest"]')).toHaveCount(2);
  await expect(hostMessages).toHaveCount(2);

  // Resolve.
  await staff.getByRole("button", { name: "해결 처리" }).click();
  await expect(staff.getByTestId("conversation-status")).toHaveText("해결됨");
  await staffContext.close();
});

test("widget answers FAQs from the knowledge base and keeps the session on reload", async ({
  page,
}) => {
  const widget = await openWidget(page);
  await widget.getByRole("textbox").fill("チェックインは何時からですか？");
  await widget.getByRole("button", { name: "Send" }).click();
  const host = widget.locator('[data-testid="widget-message"][data-from="host"]');
  await expect(host.first()).toContainText("15:00");

  await page.reload();
  const again = await page
    .locator('button[data-staytalk="launcher"]')
    .click()
    .then(() => page.frameLocator('iframe[title="StayTalk chat"]'));
  await expect(again.locator('[data-testid="widget-message"]')).toHaveCount(2);
});

test("widget UI follows the browser language", async ({ browser }) => {
  const context = await browser.newContext({ locale: "ja-JP" });
  const page = await context.newPage();
  const widget = await openWidget(page);
  await expect(widget.getByRole("textbox")).toHaveAttribute("placeholder", "メッセージを入力");
  await context.close();
});

test("widget is full screen on mobile", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page = await context.newPage();
  const widget = await openWidget(page);
  await expect(widget.getByTestId("widget-title")).toBeVisible();
  const box = await page.locator('[data-staytalk="panel"]').boundingBox();
  expect(box?.width).toBe(390);
  expect(box?.height).toBe(844);
  await widget.getByRole("button", { name: "Close" }).click();
  await expect(page.locator('[data-staytalk="panel"]')).toBeHidden();
  await context.close();
});

test("sites that are not whitelisted cannot embed the widget", async ({ page }) => {
  const frameResponse = page.waitForResponse((r) => r.url().includes("/widget/frame"));
  const widget = await openWidget(page, NOT_ALLOWED_SITE);
  const csp = (await frameResponse).headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors");
  expect(csp).not.toContain("localhost:4174");
  await page.waitForTimeout(1500);
  await expect(widget.getByTestId("widget-title")).toHaveCount(0);
});

test("widget API rejects foreign origins and bad tokens", async ({ request, baseURL }) => {
  const session = await request.post(`${baseURL}/api/widget/v1/session`, {
    headers: { origin: "https://evil.example" },
    data: { key: "pk_demo_seoul" },
  });
  expect(session.status()).toBe(403);
  const unknownKey = await request.post(`${baseURL}/api/widget/v1/session`, {
    headers: { origin: baseURL! },
    data: { key: "pk_nope" },
  });
  expect(unknownKey.status()).toBe(404);
  const poll = await request.get(`${baseURL}/api/widget/v1/messages`, {
    headers: { origin: baseURL!, authorization: "Bearer forged.token" },
  });
  expect(poll.status()).toBe(401);
});
