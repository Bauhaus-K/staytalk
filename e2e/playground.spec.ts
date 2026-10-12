import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("playground: FAQ answered from knowledge, unknown question escalated", async ({ page }) => {
  await loginAs(page, "owner@seoul.example");
  await page.goto("/ko/playground");
  await expect(page.getByText("AI_MODE=mock")).toBeVisible();

  const input = page.getByRole("textbox");
  await input.fill("체크인은 몇 시부터인가요?");
  await page.getByRole("button", { name: "보내기" }).click();

  const bubbles = page.getByTestId("message-bubble");
  await expect(bubbles).toHaveCount(2);
  await expect(bubbles.nth(1)).toContainText("15:00");
  await expect(page.getByTestId("conversation-status")).toHaveText("AI 응대 중");

  // AI trace shows the tool call and cited knowledge
  await page.getByTestId("agent-trace").first().locator("summary").click();
  await expect(page.getByTestId("agent-trace").first()).toContainText("search_knowledge");
  await expect(page.getByTestId("cited-knowledge").first()).toContainText("체크인");

  // English question, KB in Korean
  await input.fill("Is there a rooftop swimming pool?");
  await page
    .getByRole("button", { name: "Send" })
    .or(page.getByRole("button", { name: "보내기" }))
    .click();
  await expect(bubbles).toHaveCount(4);
  await expect(page.getByTestId("conversation-status")).toHaveText("담당자 대기");
  await expect(page.getByTestId("escalation-reason")).toContainText("답변 불가");

  // Staff translation toggle
  await page.getByRole("link", { name: /사장용 번역 보기/ }).click();
  await expect(page.getByTestId("message-translation").first()).toBeVisible();
});

test("playground: emergency message gets local emergency numbers", async ({ page }) => {
  await loginAs(page, "owner@fukuoka.example", "ja");
  await page.goto("/ja/playground");
  await page.getByRole("textbox").fill("部屋で火事です！");
  await page.getByRole("button", { name: "送信" }).click();
  await expect(page.getByTestId("message-bubble").nth(1)).toContainText("119");
  await expect(page.getByTestId("escalation-reason")).toContainText("緊急");
});
