import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("metrics dashboard shows KPIs and distributions from seeded conversations", async ({
  page,
}) => {
  await loginAs(page, "owner@seoul.example");
  await page.goto("/ko/metrics");
  await expect(page.getByRole("heading", { name: "지표" })).toBeVisible();
  // Seed has 5 Seoul conversations; other specs may add more before this runs.
  const total = Number(await page.getByTestId("kpi-conversations-value").textContent());
  expect(total).toBeGreaterThanOrEqual(5);
  await expect(page.getByTestId("kpi-automation-value")).toHaveText(/\d+%/);
  await expect(page.getByTestId("kpi-automation")).toContainText("AI");
  await expect(page.getByTestId("column-chart")).toBeVisible();
  await expect(page.getByTestId("language-share")).toContainText("영어");
  await expect(page.getByTestId("escalation-reasons")).toContainText("답변 불가");
  await expect(page.getByTestId("usage-meter")).toBeVisible();

  await page.getByRole("link", { name: "최근 7일" }).click();
  await expect(page).toHaveURL(/days=7/);
});

test("unanswered question becomes knowledge in one click", async ({ page }) => {
  await loginAs(page, "owner@seoul.example");
  await page.goto("/ko/knowledge");
  await page.getByTestId("unanswered-link").click();
  const item = page.getByTestId("unanswered-question").filter({ hasText: "サウナはありますか" });
  await expect(item).toBeVisible();
  await item.getByRole("link", { name: "지식에 추가" }).click();

  // Title is pre-filled with the staff-language translation of the guest question.
  await expect(page.getByLabel("제목(대표 질문)")).toHaveValue(/サウナはありますか/);
  await page.getByLabel("제목(대표 질문)").fill("사우나");
  await page
    .getByLabel("내용")
    .fill("사우나 시설은 없습니다. 도보 10분 거리에 공중목욕탕이 있습니다.");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page).toHaveURL(/\/ko\/knowledge\?property=/);

  await page.goto("/ko/knowledge/unanswered");
  await expect(
    page.getByTestId("unanswered-question").filter({ hasText: "サウナはありますか" }),
  ).toHaveCount(0);
});

test("owner connects LINE; signed webhooks become inbox conversations", async ({
  page,
  request,
}) => {
  await loginAs(page, "owner@fukuoka.example", "ja");
  await page.goto("/ja/settings");
  const form = page.getByTestId("line-form");
  await form.getByLabel("チャネルID").fill("1650000000");
  await form.getByRole("button", { name: "保存" }).click();
  await expect(form.getByRole("alert")).toContainText("チャネルシークレット");
  await form.getByLabel("チャネルシークレット").fill("test-secret");
  await form.getByLabel("チャネルアクセストークン").fill("test-token");
  await form.getByRole("button", { name: "保存" }).click();
  await expect(form.getByRole("status")).toBeVisible();
  const webhookUrl = (await page.getByTestId("line-webhook-url").textContent())!.trim();
  expect(webhookUrl).toContain("/api/webhooks/line/");

  const body = JSON.stringify({
    destination: "Ubot",
    events: [
      {
        type: "message",
        replyToken: "rt-e2e",
        source: { type: "user", userId: "Ue2e-line-user" },
        message: { type: "text", id: "1", text: "大浴場は何時までですか？" },
      },
    ],
  });
  const path = new URL(webhookUrl).pathname;
  const unsigned = await request.post(path, {
    data: body,
    headers: { "content-type": "application/json" },
  });
  expect(unsigned.status()).toBe(401);
  const signature = createHmac("sha256", "test-secret").update(body).digest("base64");
  const signed = await request.post(path, {
    data: body,
    headers: { "content-type": "application/json", "x-line-signature": signature },
  });
  expect(signed.status()).toBe(200);

  // Processed after the response; the conversation shows up in the inbox as a LINE chat.
  await expect(async () => {
    await page.goto("/ja/inbox");
    await expect(page.getByTestId("inbox-row").filter({ hasText: "LINE" }).first()).toContainText(
      "大浴場",
    );
  }).toPass({ timeout: 20_000 });
});
