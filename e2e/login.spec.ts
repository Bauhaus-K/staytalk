import { expect, test } from "@playwright/test";

test("redirects anonymous visitors to the login screen", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/ko\/login/);
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
});

test("login screen is localized", async ({ page }) => {
  await page.goto("/ja/login");
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("rejects a wrong password", async ({ page }) => {
  await page.goto("/ko/login");
  await page.getByLabel("이메일").first().fill("owner@seoul.example");
  await page.getByLabel("비밀번호").fill("wrong-password");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByTestId("login-error")).toContainText("올바르지 않습니다");
});

test("owner signs in and sees only their own property", async ({ page }) => {
  await page.goto("/ko/login");
  await page.getByLabel("이메일").first().fill("owner@seoul.example");
  await page.getByLabel("비밀번호").fill("staytalk-demo");
  await page.getByRole("button", { name: "로그인", exact: true }).click();

  await expect(page).toHaveURL(/\/ko$/);
  await expect(page.getByTestId("current-user")).toHaveText("owner@seoul.example");
  const cards = page.getByTestId("property-card");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("서촌 한옥 게스트하우스");
  await expect(cards.first()).toContainText("지식 20개");

  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/ko\/login/);
});

test("staff signs in with an email magic link", async ({ page, request }) => {
  const mailpit = process.env.MAILPIT_URL ?? "http://localhost:8025";
  const email = "owner@fukuoka.example";
  await request.delete(`${mailpit}/api/v1/messages`);

  await page.goto("/ja/login");
  await page.getByPlaceholder("メールアドレス").fill(email);
  await page.getByRole("button", { name: "メールでログインリンクを受け取る" }).click();
  await expect(page.getByRole("status")).toBeVisible();

  let link: string | undefined;
  await expect
    .poll(async () => {
      const list = await (await request.get(`${mailpit}/api/v1/search?query=to:${email}`)).json();
      const id = list.messages?.[0]?.ID;
      if (!id) return undefined;
      const msg = await (await request.get(`${mailpit}/api/v1/message/${id}`)).json();
      link = String(msg.Text).match(/https?:\/\/\S+\/api\/auth\/callback\/nodemailer\S+/)?.[0];
      return link;
    })
    .toBeTruthy();

  await page.goto(link!);
  await expect(page.getByTestId("current-user")).toHaveText(email);
  await expect(page.getByTestId("property-card")).toContainText("博多 ゆらり庵");
});

test("unknown emails get the same confirmation but no mail", async ({ page, request }) => {
  const mailpit = process.env.MAILPIT_URL ?? "http://localhost:8025";
  const email = "stranger@example.com";
  await page.goto("/ko/login");
  await page.getByPlaceholder("이메일").fill(email);
  await page.getByRole("button", { name: "이메일로 로그인 링크 받기" }).click();
  await expect(page.getByRole("status")).toContainText("로그인 링크를 이메일로 보냈습니다");

  const list = await (await request.get(`${mailpit}/api/v1/search?query=to:${email}`)).json();
  expect(list.messages ?? []).toHaveLength(0);
});
