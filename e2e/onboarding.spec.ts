import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("owner adds a property with the setup wizard", async ({ page }) => {
  await loginAs(page, "owner@seoul.example");
  await page.goto("/ko/onboarding");

  // Step 1: property
  const step1 = page.getByTestId("property-step");
  await step1.getByLabel("숙소 이름").fill("부산 바다 게스트하우스");
  await step1.getByLabel("주소").fill("부산광역시 해운대구 (샘플)");
  await step1.getByRole("button", { name: "다음" }).click();
  await expect(page).toHaveURL(/step=2/, { timeout: 30_000 });

  // Step 2: rooms
  const room = page.getByTestId("room-step");
  await room.getByLabel("객실 이름").fill("오션뷰 트윈");
  await room.getByLabel(/기본 요금/).fill("120000");
  await room.getByLabel("보유 객실 수").fill("4");
  await room.getByRole("button", { name: "객실 타입 추가" }).click();
  await expect(page.getByTestId("onboarding-rooms")).toContainText("오션뷰 트윈");
  await page.getByRole("link", { name: "다음" }).click();

  // Step 3: knowledge templates
  const kb = page.getByTestId("knowledge-step");
  await kb
    .getByLabel("체크인·체크아웃 시간은 언제인가요?")
    .fill("체크인 16:00, 체크아웃 10:00입니다.");
  await kb.getByLabel("와이파이가 있나요?").fill("전 객실 무료 와이파이가 있습니다.");
  await kb.getByRole("button", { name: "지식 저장" }).click();
  await expect(kb.getByRole("status")).toContainText("2개 항목");
  await expect(kb.getByLabel(/와이파이가 있나요\?/)).toBeDisabled();
  await page.getByRole("link", { name: "다음" }).click();

  // Step 4: widget
  await expect(page.getByTestId("embed-snippet")).toContainText('data-key="pk_');

  // The property shows up on the home page with a "finish setup" link (few knowledge items).
  await page.goto("/ko");
  const card = page.getByTestId("property-card").filter({ hasText: "부산 바다 게스트하우스" });
  await expect(card).toContainText("지식 2개");
  await expect(card.getByTestId("continue-setup")).toBeVisible();
});

test("legal pages are reachable signed out and signed in", async ({ page }) => {
  await page.goto("/ko/login");
  await page.getByRole("link", { name: "개인정보처리방침" }).click();
  await expect(page.getByRole("heading", { name: "개인정보처리방침" })).toBeVisible();
  await expect(page.getByTestId("legal-draft")).toBeVisible();
  await expect(page.getByText("90일")).toBeVisible();

  await loginAs(page, "owner@seoul.example");
  await page.goto("/en/legal/terms");
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
});
