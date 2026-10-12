import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

function isoDaysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

test("guest asks availability, requests a booking; staff approves; guest gets confirmation", async ({
  page,
  browser,
}) => {
  const checkIn = isoDaysFromNow(45);
  const checkOut = isoDaysFromNow(47);

  // Guest on the property website.
  await page.goto("http://localhost:4173/");
  await page.locator('button[data-staytalk="launcher"]').click();
  const widget = page.frameLocator('iframe[title="StayTalk chat"]');
  const host = widget.locator('[data-testid="widget-message"][data-from="host"]');
  const input = widget.getByRole("textbox");

  await input.fill(`Do you have a room for 2 guests from ${checkIn} to ${checkOut}?`);
  await input.press("Enter");
  await expect(host.first()).toContainText("Available rooms");
  await expect(host.first()).toContainText("Hanok Double Room");

  await input.fill(
    "Please book the Hanok Double Room. My name is Mina Park, email mina@example.com.",
  );
  await input.press("Enter");
  await expect(host.nth(1)).toContainText("booking request has been received");
  const reference = (await host.nth(1).textContent())?.match(/reference ([A-Z0-9]{6})/)?.[1];
  expect(reference).toBeTruthy();
  // Contact details are masked in the chat log.
  await expect(widget.locator('[data-from="guest"]').nth(1)).toContainText("[REDACTED_EMAIL]");

  // Staff approves from the booking requests screen.
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await loginAs(staff, "owner@seoul.example");
  await staff.goto("/ko/bookings");
  const card = staff.getByTestId("booking-card").filter({ hasText: reference! });
  await expect(card).toContainText("Mina Park");
  await expect(card).toContainText("mina@example.com");
  await expect(card).toContainText(`${checkIn} → ${checkOut}`);
  await card.getByRole("button", { name: "승인" }).click();
  await expect(staff.getByTestId("booking-card").filter({ hasText: reference! })).toHaveCount(0);
  await staff.goto("/ko/bookings?status=APPROVED");
  await expect(staff.getByTestId("booking-card").filter({ hasText: reference! })).toBeVisible();
  await staffContext.close();

  // Guest receives the confirmation by polling.
  await expect(host.nth(2)).toContainText("Your booking is confirmed", { timeout: 15_000 });
  await expect(host.nth(2)).toContainText(reference!);
});

test("staff declines with a reason; the guest is told in their language", async ({ browser }) => {
  const checkIn = isoDaysFromNow(50);
  const guestContext = await browser.newContext({ locale: "ja-JP" });
  const guest = await guestContext.newPage();
  await guest.goto("http://localhost:4173/");
  await guest.locator('button[data-staytalk="launcher"]').click();
  const widget = guest.frameLocator('iframe[title="StayTalk chat"]');
  const host = widget.locator('[data-testid="widget-message"][data-from="host"]');
  const input = widget.getByRole("textbox");
  await input.fill(`${checkIn}から1泊、2名で空室はありますか？`);
  await input.press("Enter");
  await expect(host.first()).toContainText("ご利用いただける客室");
  await input.fill("ダブルルームを予約します。名前は田中です、電話番号は090-1234-5678です。");
  await input.press("Enter");
  await expect(host.nth(1)).toContainText("予約リクエストを受け付けました");
  const reference = (await host.nth(1).textContent())?.match(/予約番号 ([A-Z0-9]{6})/)?.[1];

  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await loginAs(staff, "owner@seoul.example");
  await staff.goto("/ko/bookings");
  const card = staff.getByTestId("booking-card").filter({ hasText: reference! });
  await card.getByRole("button", { name: "거절" }).click();
  await card.getByLabel("거절 사유").selectOption("FULLY_BOOKED");
  await card.getByRole("button", { name: "거절하기" }).click();
  await expect(staff.getByTestId("booking-card").filter({ hasText: reference! })).toHaveCount(0);
  await staffContext.close();

  await expect(host.nth(2)).toContainText("満室", { timeout: 15_000 });
  await guestContext.close();
});
