import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=",
  "base64",
);
const id = createHash("sha256").update(png).digest("hex");
test("云端导入不覆盖旧记录，重试去重，凭据不持久化", async ({ page }) => {
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
  await page.getByRole("button", { name: "云端收件箱", exact: true }).click();
  await page.getByLabel("云端服务地址").fill("https://inbox.example");
  await page.getByLabel("查看凭据").fill("read-only");
  await page.getByRole("button", { name: "连接 / 刷新" }).click();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.locator(".inbox-preview")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /导入所选到本机/ }).click();
  await expect(
    page.getByRole("region", { name: "云端收件箱" }).getByRole("status"),
  ).toContainText("已导入 1 条");
  await expect(page.locator(".card")).toHaveCount(2);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /导入所选到本机/ }).click();
  await expect(
    page.getByRole("region", { name: "云端收件箱" }).getByRole("status"),
  ).toContainText("已导入 0 条");
  await page.reload();
  await expect(page.locator(".card")).toHaveCount(2);
  await page.getByRole("button", { name: "云端收件箱", exact: true }).click();
  await expect(page.getByLabel("查看凭据")).toHaveValue("");
  await page
    .getByRole("button", { name: "编辑 原有记录保留", exact: true })
    .click();
  await expect(page.locator(".photo img")).toHaveAttribute("alt", "旧图.png");
  await expect(page.getByRole("textbox", { name: "朋友圈文案" })).toHaveValue(
    "原有记录保留",
  );
});

test("图片校验失败时本批不写入", async ({ page }) => {
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
  await page.getByRole("button", { name: "云端收件箱", exact: true }).click();
  await page.getByLabel("云端服务地址").fill("https://inbox.example");
  await page.getByLabel("查看凭据").fill("read-only");
  await page.getByRole("button", { name: "连接 / 刷新" }).click();
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: /导入所选到本机/ }).click();
  await expect(page.getByRole("status")).toContainText("完整性校验失败");
  await page.reload();
  await expect(page.locator(".card")).toHaveCount(0);
});
