import { expect, type Page } from "@playwright/test";

export async function loginAs(page: Page, email: string, locale = "ko") {
  await page.goto(`/${locale}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("staytalk-demo");
  await page.locator("form").first().getByRole("button").click();
  await expect(page.getByTestId("current-user")).toHaveText(email);
}
