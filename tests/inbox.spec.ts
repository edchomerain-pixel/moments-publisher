import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
// Mocked cloud requests must stay visible to Playwright after PWA reloads.
// Real service-worker/offline behavior is covered separately in mvp.spec.ts.
test.use({ serviceWorkers: "block" });
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=",
  "base64",
);
const id = createHash("sha256").update(png).digest("hex");
test("云端导入不覆盖旧记录，重试去重，凭据恢复及清除", async ({ page }) => {
  await page.route("https://inbox.example/**", async (route) => {
    expect(route.request().headers().authorization).toBe("Bearer read-only");
    if (route.request().url().endsWith(`/images/${id}`))
      await route.fulfill({ contentType: "image/png", body: png });
    else
      await route.fulfill({
        json: {
          items: [
            {
              id,
              name: "云图.png",
              type: "image/png",
              size: png.length,
              uploaded: new Date().toISOString(),
            },
          ],
          cursor: null,
        },
      });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "＋ 新建记录", exact: true }).click();
  await page.getByRole("textbox", { name: "朋友圈文案" }).fill("原有记录保留");
  await page
    .locator("input[type=file]")
    .setInputFiles([{ name: "旧图.png", mimeType: "image/png", buffer: png }]);
  await expect(page.locator(".photo")).toHaveCount(1);
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  await page.getByRole("button", { name: "← 返回相册" }).click();
  await page.getByRole("button", { name: "云端连接", exact: true }).click();
  await page.getByLabel("云端服务地址").fill("https://inbox.example");
  await page.getByLabel("查看凭据").fill("read-only");
  await page.getByRole("button", { name: "连接 / 刷新" }).click();
  await expect(page.locator(".card")).toHaveCount(2);
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.locator(".inbox-preview")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /导入所选到本机/ }).click();
  await expect(
    page.getByRole("region", { name: "云端收件箱" }).getByRole("status"),
  ).toContainText("已导入 0 条");
  await expect(page.locator(".card")).toHaveCount(2);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /导入所选到本机/ }).click();
  await expect(
    page.getByRole("region", { name: "云端收件箱" }).getByRole("status"),
  ).toContainText("已导入 0 条");
  await page.reload();
  await expect(page.locator(".card")).toHaveCount(2);
  await page.getByRole("button", { name: "云端连接", exact: true }).click();
  await expect(page.getByLabel("查看凭据")).toHaveValue("read-only");
  await expect(
    page.getByRole("button", { name: "预览", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "断开 / 清除本机凭据" }).click();
  await expect(page.getByLabel("查看凭据")).toHaveValue("");
  await page.reload();
  await page.getByRole("button", { name: "云端连接", exact: true }).click();
  await expect(page.getByLabel("查看凭据")).toHaveValue("");
  await page
    .getByRole("button", { name: "编辑 原有记录保留", exact: true })
    .click();
  await expect(page.locator(".photo img")).toHaveAttribute("alt", "旧图.png");
  await expect(page.getByRole("textbox", { name: "朋友圈文案" })).toHaveValue(
    "原有记录保留",
  );
});

test("自动同步逐张保存，损坏图片不写入", async ({ page }) => {
  const badId = "b".repeat(64);
  await page.route("https://inbox.example/**", async (route) => {
    if (route.request().url().includes("/images/"))
      await route.fulfill({ contentType: "image/png", body: png });
    else
      await route.fulfill({
        json: {
          items: [id, badId].map((key) => ({
            id: key,
            name: key + ".png",
            type: "image/png",
            size: png.length,
            uploaded: new Date().toISOString(),
          })),
          cursor: null,
        },
      });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "云端连接", exact: true }).click();
  await page.getByLabel("云端服务地址").fill("https://inbox.example");
  await page.getByLabel("查看凭据").fill("read-only");
  await page.getByRole("button", { name: "连接 / 刷新" }).click();
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: /导入所选到本机/ }).click();
  await expect(
    page.getByRole("region", { name: "云端收件箱" }).getByRole("status"),
  ).toContainText("完整性校验失败");
  await page.reload();
  await expect(page.locator(".card")).toHaveCount(1);
});

test("云端异常响应不将凭据样式的内容带入界面或日志", async ({ page }) => {
  const marker = "synthetic-sensitive-error-marker";
  const messages: string[] = [];
  page.on("console", (message) => messages.push(message.text()));
  page.on("pageerror", (error) => messages.push(error.message));
  await page.route("https://inbox.example/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: `Authorization: Bearer ${marker}`,
    }),
  );
  await page.goto("./");
  await page.getByRole("button", { name: "云端连接", exact: true }).click();
  await page.getByLabel("云端服务地址").fill("https://inbox.example");
  await page.getByLabel("查看凭据").fill("synthetic-view-credential");
  await page.getByRole("button", { name: "连接 / 刷新" }).click();
  await expect(page.getByRole("status")).toContainText(
    "连接失败，请检查网络。",
  );
  await expect(page.locator("body")).not.toContainText(marker);
  expect(messages.join("\n")).not.toContain(marker);
});

test("失效凭据清除，网络失败保留连接，存储失败可继续使用", async ({ page }) => {
  let status = 200;
  await page.route("https://inbox.example/**", async (route) => {
    if (status === 0) return route.abort();
    await route.fulfill({ status, json: { items: [], cursor: null } });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "云端连接", exact: true }).click();
  await page.getByLabel("云端服务地址").fill("https://inbox.example");
  await page.getByLabel("查看凭据").fill("read-only");
  await page.getByRole("button", { name: "连接 / 刷新" }).click();
  await expect(page.getByRole("note")).toContainText("已记住连接");
  status = 0;
  await page.getByRole("button", { name: "连接 / 刷新" }).click();
  await expect(
    page.getByRole("region", { name: "云端收件箱" }).getByRole("status"),
  ).toContainText("连接失败");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bashang:inbox-connection:v1"),
    ),
  ).toContain("read-only");
  status = 401;
  await page.getByRole("button", { name: "连接 / 刷新" }).click();
  await expect(page.getByLabel("查看凭据")).toHaveValue("");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bashang:inbox-connection:v1"),
    ),
  ).toBeNull();
  status = 200;
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
  });
  await page.getByLabel("查看凭据").fill("read-only");
  await page.getByRole("button", { name: "连接 / 刷新" }).click();
  await expect(page.getByRole("note")).toContainText("本机存储不可用");
  await expect(
    page.getByRole("region", { name: "云端收件箱" }).getByRole("status"),
  ).toContainText("云端暂无图片");
});

test("已记住连接时打开正式相册自动同步，重开去重，断开保留本地记录", async ({
  page,
}) => {
  let available = false;
  let downloads = 0;
  await page.route("https://inbox.example/**", async (route) => {
    if (route.request().url().endsWith(`/images/${id}`)) {
      downloads++;
      return route.fulfill({ contentType: "image/png", body: png });
    }
    return route.fulfill({
      json: {
        items: available
          ? [
              {
                id,
                name: "自动.png",
                type: "image/png",
                size: png.length,
                uploaded: "2026-10-20T00:00:00Z",
              },
            ]
          : [],
        cursor: null,
      },
    });
  });
  await page.goto("./");
  await page.evaluate(() =>
    localStorage.setItem(
      "bashang:inbox-connection:v1",
      JSON.stringify({ endpoint: "https://inbox.example", token: "test-only" }),
    ),
  );
  available = true;
  await page.reload();
  await expect(page.locator(".card")).toHaveCount(1);
  expect(downloads).toBe(1);
  await page.reload();
  await expect(page.locator(".card")).toHaveCount(1);
  await expect(
    page.getByText("云端图片已自动同步到相册", { exact: true }),
  ).toBeVisible();
  expect(downloads).toBe(1);
  await page.getByRole("button", { name: "云端连接", exact: true }).click();
  await page.getByRole("button", { name: "断开 / 清除本机凭据" }).click();
  await page.reload();
  await expect(page.locator(".card")).toHaveCount(1);
  expect(downloads).toBe(1);
});
