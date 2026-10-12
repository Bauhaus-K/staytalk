import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("owner creates, edits, filters and deletes a knowledge item", async ({ page }) => {
  await loginAs(page, "owner@seoul.example");
  await page.goto("/ko/knowledge");
  await expect(page.getByRole("heading", { name: "지식베이스" })).toBeVisible();
  await expect(page.getByTestId("knowledge-item")).toHaveCount(20);

  // Create
  await page.getByRole("link", { name: "새 항목" }).click();
  await page.getByLabel("카테고리").selectOption("FACILITY");
  await page.getByLabel("제목(대표 질문)").fill("루프탑 테라스");
  await page.getByLabel("내용").fill("루프탑 테라스는 10:00~21:00에 이용 가능합니다.");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page).toHaveURL(/\/ko\/knowledge\?property=/);
  await expect(page.getByTestId("knowledge-item")).toHaveCount(21);

  // Filter by category + search
  await page.getByRole("link", { name: "시설", exact: true }).click();
  await page.getByPlaceholder("제목·내용 검색").fill("루프탑");
  await page.getByRole("button", { name: "검색" }).click();
  const item = page.getByTestId("knowledge-item");
  await expect(item).toHaveCount(1);

  // Edit
  await item.getByRole("link", { name: "수정" }).click();
  await page.getByLabel("내용").fill("루프탑 테라스는 10:00~22:30에 이용 가능합니다.");
  await page.getByRole("button", { name: "저장" }).click();
  await page.getByPlaceholder("제목·내용 검색").fill("22:30");
  await page.getByRole("button", { name: "검색" }).click();
  await expect(page.getByTestId("knowledge-item")).toHaveCount(1);

  // Delete
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("knowledge-item").getByRole("button", { name: "삭제" }).click();
  await page.goto("/ko/knowledge");
  await expect(page.getByTestId("knowledge-item")).toHaveCount(20);
});

test("validation errors are shown", async ({ page }) => {
  await loginAs(page, "owner@seoul.example");
  await page.goto("/ko/knowledge/new");
  await page.getByLabel("제목(대표 질문)").fill("   ");
  await page.getByLabel("내용").fill("   ");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("alert").first()).toContainText("필수");
});
