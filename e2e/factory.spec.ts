import { test, expect, type Page, type TestInfo } from "@playwright/test";

const articlePath = "/blog/11111111-1111-4111-8111-111111111111";

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, request, baseURL }) => {
  // Check before executing any client-side POST, including the visitor counter.
  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  const status = await health.json();
  expect(status.dataMode).toBe("fixture");
  if (process.env.PREVIEW_REVISION) expect(status.revision).toBe(process.env.PREVIEW_REVISION);
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
  // Seeded data and local images make all external browser traffic unnecessary.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === new URL(baseURL!).origin ? route.continue() : route.abort();
  });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test("home renders the fixture BBS and deterministic counter", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /ようこそ！私のホームページへ/ })).toBeVisible();
  await expect(page.getByText("検証用の掲示板です。", { exact: true })).toBeVisible();
  await expect(page.getByText("001234", { exact: true })).toBeVisible();
  await capture(page, testInfo, "home");
});

test("blog filtering, detail, related articles and back navigation work", async ({ page }, testInfo) => {
  await page.goto("/blog");
  const article = page.locator(`a[href="${articlePath}"]`).first();
  await expect(article).toContainText("ファクトリー検証用の記事");
  await page.getByRole("tab", { name: "一般 (1)", exact: true }).click();
  await expect(article).toHaveCount(0);
  await page.getByRole("tab", { name: "テック (1)", exact: true }).click();
  await expect(article).toBeVisible();
  await capture(page, testInfo, "blog");
  await article.click();
  await expect(page.getByRole("heading", { name: "ファクトリー検証用の記事", exact: true })).toBeVisible();
  await expect(page.getByText("外部サービスに接続せず表示を確認できます。", { exact: true })).toBeVisible();
  await expect(page.getByText("関連記事の表示確認", { exact: true })).toBeVisible();
  await capture(page, testInfo, "blog-detail");
  await page.getByRole("link", { name: "ブログ一覧に戻る" }).click();
  await expect(page).toHaveURL(/\/blog$/);
  await expect(article).toBeVisible();
});

test("books opens seeded book details", async ({ page }, testInfo) => {
  await page.goto("/books");
  await page.getByRole("tab", { name: "技術書 (1)", exact: true }).click();
  const book = page.getByRole("img", { name: "検証用の技術書", exact: true });
  await expect(book).toBeVisible();
  await capture(page, testInfo, "books");
  await book.click();
  await expect(page.getByRole("dialog")).toContainText("検証用著者");
});

test("contents renders a seeded entry", async ({ page }, testInfo) => {
  await page.goto("/contents");
  await expect(page.getByText("検証用コンテンツ", { exact: true })).toBeVisible();
  await capture(page, testInfo, "contents");
});

test("BBS validates input and visibly refuses persistence in the fixture environment", async ({ page }, testInfo) => {
  await page.goto("/");
  const submit = page.getByRole("button", { name: "投稿", exact: true });
  await submit.click();
  await expect(page.getByText("メッセージを入力してください", { exact: true })).toBeVisible();
  await page.getByPlaceholder("メッセージ（200文字以内）").fill("保存されない検証投稿");
  await submit.click();
  await expect(page.getByText("検証環境では投稿を保存できません", { exact: true })).toBeVisible();
  await expect(page.getByText("検証用の掲示板です。", { exact: true })).toBeVisible();
  await capture(page, testInfo, "bbs-validation");
});

test("unknown article IDs show not found and return API 404", async ({ page, request }, testInfo) => {
  await page.goto("/blog/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "ページが見つかりません", exact: true })).toBeVisible();
  expect((await request.get("/api/notion/blog/00000000-0000-4000-8000-000000000000")).status()).toBe(404);
  await capture(page, testInfo, "not-found");
});
