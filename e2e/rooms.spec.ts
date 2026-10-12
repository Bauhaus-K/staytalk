import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

function isoDaysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

test("owner edits a room type, sets a date override and imports a CSV", async ({ page }) => {
  await loginAs(page, "owner@seoul.example");
  await page.goto("/ko/rooms");
  await expect(page.getByTestId("room-type")).toHaveCount(3);

  // Edit base rate of the family room.
  await page
    .getByTestId("room-type")
    .filter({ hasText: "패밀리룸" })
    .getByRole("link", { name: "수정" })
    .click();
  await page.getByLabel(/기본 요금/).fill("170000");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByTestId("room-type").filter({ hasText: "패밀리룸" })).toContainText(
    "170,000",
  );

  // Close a date for the double room via the day form.
  const day = isoDaysFromNow(3);
  const form = page.getByTestId("day-form");
  await form.getByLabel("객실 타입").selectOption({ label: "한옥 더블룸" });
  await form.getByLabel("날짜", { exact: true }).fill(day);
  await form.getByLabel("이 날짜 판매 중지").check();
  await form.getByRole("button", { name: "적용" }).click();
  const row = page.getByTestId("inventory-calendar").locator("tr", { hasText: "한옥 더블룸" });
  await expect(row.locator(`td[data-date="${day}"]`)).toContainText("✕");

  // CSV: first with an error, then a valid file.
  const d1 = isoDaysFromNow(5);
  const d2 = isoDaysFromNow(6);
  const upload = async (content: string) => {
    await page
      .getByLabel("CSV 파일")
      .setInputFiles({ name: "inventory.csv", mimeType: "text/csv", buffer: Buffer.from(content) });
    await page.getByRole("button", { name: "미리보기" }).click();
  };
  await upload(
    `date,room_type,available,rate,closed\n${d1},한옥 더블룸,2,120000,\n${d2},스위트룸,1,,\n`,
  );
  await expect(page.getByTestId("csv-errors")).toContainText("3행");
  await expect(page.getByTestId("csv-errors")).toContainText("알 수 없는 객실 타입");

  await upload(
    `date,room_type,available,rate,closed\n${d1},한옥 더블룸,2,120000,\n${d2},패밀리룸,0,,\n`,
  );
  await page.getByRole("button", { name: "2건 적용" }).click();
  await expect(page.getByRole("status")).toContainText("저장 2건");
  await page.reload();
  await expect(row.locator(`td[data-date="${d1}"]`)).toContainText("120,000");
  const family = page.getByTestId("inventory-calendar").locator("tr", { hasText: "패밀리룸" });
  await expect(family.locator(`td[data-date="${d2}"]`)).toContainText("0");
});
