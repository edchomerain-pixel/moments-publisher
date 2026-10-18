import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const iconVersion = createHash("sha256")
  .update(readFileSync("public/branding/bashang-logo.png"))
  .digest("hex")
  .slice(0, 8);

test.beforeEach(async ({ page }) => {
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error(`[browser] ${message.text()}`);
  });
  page.on("pageerror", (error) =>
    console.error(`[pageerror] ${error.name}: ${error.message}`),
  );
});
test("手机草稿编辑、九图限制、排序、持久化、筛选与复制删除", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "＋ 新建商品", exact: true }).click();
  await page.getByLabel("商品名称 *", { exact: true }).fill("经典手袋");
  await page.getByLabel("品牌", { exact: true }).fill("CHANEL");
  await page.getByLabel("价格（人民币）").fill("26800");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4xkAAAAASUVORK5CYII=",
    "base64",
  );
  await page.locator("input[type=file]").setInputFiles(
    Array.from({ length: 10 }, (_, i) => ({
      name: `photo-${i}.png`,
      mimeType: "image/png",
      buffer: png,
    })),
  );
  await expect(page.locator(".photo")).toHaveCount(9);
  await expect(page.getByRole("status")).toContainText("每条最多 9 张");
  await page
    .getByRole("button", { name: "后移第1张图片", exact: true })
    .click();
  await expect(page.locator(".photo img").first()).toHaveAttribute(
    "alt",
    "photo-1.png",
  );
  await page
    .getByRole("button", { name: "删除第9张图片", exact: true })
    .click();
  await expect(page.locator(".photo")).toHaveCount(8);
  await page
    .getByRole("button", { name: "根据商品信息生成", exact: false })
    .click();
  await expect(page.getByRole("textbox", { name: "朋友圈文案" })).toHaveValue(
    /CHANEL · 经典手袋/,
  );
  await page
    .getByRole("textbox", { name: "朋友圈文案" })
    .fill("手动编辑的文案");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  await page.reload();
  await expect(page.locator(".card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "编辑 经典手袋", exact: true })
    .click();
  await expect(page.locator(".photo")).toHaveCount(8);
  await expect(page.locator(".photo img").first()).toHaveAttribute(
    "alt",
    "photo-1.png",
  );
  await expect(page.getByRole("textbox", { name: "朋友圈文案" })).toHaveValue(
    "手动编辑的文案",
  );
  await expect
    .poll(() =>
      page
        .locator(".photo img")
        .first()
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBe(1);
  await page
    .getByRole("textbox", { name: "备注", exact: true })
    .fill("再次编辑后保存");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  await page.reload();
  await page
    .getByRole("button", { name: "编辑 经典手袋", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "备注", exact: true }),
  ).toHaveValue("再次编辑后保存");
  await expect(page.locator(".photo")).toHaveCount(8);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出图片 ZIP ↓", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("商品图片.zip");
  await page.getByRole("button", { name: "返回草稿箱", exact: false }).click();
  await page.getByRole("button", { name: "标记已发布", exact: true }).click();
  await expect(page.locator(".badge")).toHaveText("已发布");
  await page
    .getByRole("button", { name: "待发布", exact: false })
    .filter({ hasNotText: "改为" })
    .click();
  await expect(page.locator(".card")).toHaveCount(0);
  await page.locator(".tabs button").first().click();
  await page.getByLabel("搜索商品").fill("no-match");
  await expect(page.locator(".card")).toHaveCount(0);
  await page.getByLabel("搜索商品").fill("chanel");
  await expect(page.locator(".card")).toHaveCount(1);
  await page.getByRole("button", { name: "复制", exact: true }).click();
  await expect(page.locator(".card")).toHaveCount(2);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除", exact: true }).first().click();
  await expect(page.locator(".card")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("安装资源及离线应用壳可用", async ({ page, context }) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const manifest = await page
    .locator("link[rel=manifest]")
    .getAttribute("href");
  expect(manifest).toBeTruthy();
  const manifestURL = new URL(manifest!, page.url());
  expect(manifestURL.pathname).toBe("/moments-publisher/manifest.webmanifest");
  const response = await page.request.get(manifestURL.href);
  expect(response.ok()).toBe(true);
  const metadata = await response.json();
  expect(metadata.name).toBe("巴商相册");
  expect(metadata.short_name).toBe("巴商相册");
  await expect(page).toHaveTitle("巴商相册");
  await expect(
    page.locator('meta[name="apple-mobile-web-app-title"]'),
  ).toHaveAttribute("content", "巴商相册");
  expect(metadata.id).toBe("/moments-publisher/");
  expect(metadata.icons.map((icon: { src: string }) => icon.src)).toEqual(
    [192, 512].map(
      (size) => `/moments-publisher/icons/bashang-${iconVersion}-${size}.png`,
    ),
  );
  await expect(page.locator(".brand-logo")).toBeVisible();
  await expect(page.locator(".brand-logo")).toHaveAttribute(
    "src",
    `/moments-publisher/icons/bashang-${iconVersion}-192.png`,
  );
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    `/moments-publisher/icons/bashang-${iconVersion}-32.png`,
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    `/moments-publisher/icons/bashang-${iconVersion}-180.png`,
  );
  expect(metadata.start_url).toBe("/moments-publisher/");
  expect(metadata.scope).toBe("/moments-publisher/");
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return { scope: ready.scope, script: ready.active?.scriptURL };
  });
  expect(new URL(registration.scope).pathname).toBe("/moments-publisher/");
  expect(new URL(registration.script!).pathname).toBe(
    "/moments-publisher/sw.js",
  );
  const assets = await page
    .locator(
      'script[src], link[rel="stylesheet"], link[rel="apple-touch-icon"], link[rel="icon"]',
    )
    .evaluateAll((nodes) =>
      nodes.map(
        (node) => node.getAttribute("src") || node.getAttribute("href"),
      ),
    );
  for (const asset of [
    ...assets,
    ...metadata.icons.map((icon: { src: string }) => icon.src),
    registration.script,
  ]) {
    const url = new URL(asset!, page.url());
    expect(url.pathname).toMatch(/^\/moments-publisher\//);
    const assetResponse = await page.request.get(url.href);
    expect(assetResponse.ok()).toBe(true);
    expect(assetResponse.headers()["content-type"]).not.toContain("text/html");
  }
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "＋ 新建商品", exact: true }),
  ).toBeVisible();
  // Decode the actual versioned files offline: this catches invalid PNGs, wrong
  // dimensions and new icon URLs missing from the Service Worker precache.
  for (const size of [32, 180, 192, 512]) {
    const dimensions = await page.evaluate(
      async ({ size, version }) => {
        const image = new Image();
        image.src = `/moments-publisher/icons/bashang-${version}-${size}.png`;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      },
      { size, version: iconVersion },
    );
    expect(dimensions).toEqual([size, size]);
  }
});

test("复制与文件分享不可用时给出手动操作提示，不改发布状态", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () =>
          Promise.reject(new DOMException("Denied", "NotAllowedError")),
      },
      configurable: true,
    });
    Object.defineProperty(navigator, "canShare", {
      value: () => false,
      configurable: true,
    });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "＋ 新建商品", exact: true }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("请先填写商品名称");
  await page.getByLabel("商品名称 *", { exact: true }).fill("分享测试");
  await page.getByRole("textbox", { name: "朋友圈文案" }).fill("手动发布文案");
  await page
    .getByRole("button", { name: "复制朋友圈文案", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("长按复制");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4xkAAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "image.png", mimeType: "image/png", buffer: png });
  await expect(page.locator(".photo")).toHaveCount(1);
  await page.getByRole("button", { name: "分享图片 ↗", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("不支持图片分享");
  await expect(page.getByLabel("发布状态")).toHaveValue("pending");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
});

test("无图片草稿保存后重开并复制文案", async ({ page, browserName }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "＋ 新建商品", exact: true }).click();
  await page.getByLabel("商品名称 *", { exact: true }).fill("无图片草稿");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  await page.reload();
  await page
    .getByRole("button", { name: "编辑 无图片草稿", exact: true })
    .click();
  await page
    .getByRole("button", { name: "复制朋友圈文案", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("文案已复制");
  // Verify the real clipboard contents where Playwright can grant read access.
  // WebKit still exercises the native write path above, with no API mock.
  if (browserName === "chromium") {
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "无图片草稿\n喜欢可私信了解细节。",
    );
  }
  await expect(page.getByLabel("发布状态")).toHaveValue("pending");
});
