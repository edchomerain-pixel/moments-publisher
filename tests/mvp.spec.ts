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
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4xkAAAAASUVORK5CYII=",
  "base64",
);

test("图片与文案：九图排序、保存重开、编辑、搜索、复制删除及 ZIP", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "＋ 新建记录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /商品信息|发布准备/ }),
  ).toHaveCount(0);
  await expect(page.locator("input:not([type=file]), select")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /生成/ })).toHaveCount(0);
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "请添加图片或填写朋友圈文案",
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
    .getByRole("textbox", { name: "朋友圈文案" })
    .fill("我的朋友圈文案");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  await page.reload();
  await page
    .getByRole("button", { name: "编辑 我的朋友圈文案", exact: true })
    .click();
  await expect(page.locator(".photo")).toHaveCount(8);
  await expect(page.locator(".photo img").first()).toHaveAttribute(
    "alt",
    "photo-1.png",
  );
  await expect
    .poll(() =>
      page
        .locator(".photo img")
        .first()
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBe(1);
  await expect(page.getByRole("textbox", { name: "朋友圈文案" })).toHaveValue(
    "我的朋友圈文案",
  );
  await page
    .getByRole("textbox", { name: "朋友圈文案" })
    .fill("再次编辑的文案");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  await page.reload();
  await page
    .getByRole("button", { name: "编辑 再次编辑的文案", exact: true })
    .click();
  await expect(page.locator(".photo")).toHaveCount(8);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出图片 ZIP ↓", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("相册图片.zip");
  await page.getByRole("button", { name: "返回相册", exact: false }).click();
  await expect(
    page.getByRole("button", { name: /标记已发布|待发布/ }),
  ).toHaveCount(0);
  await page.getByLabel("搜索记录").fill("not-found");
  await expect(page.locator(".card")).toHaveCount(0);
  await page.getByLabel("搜索记录").fill("再次编辑");
  await expect(page.locator(".card")).toHaveCount(1);
  await page.getByLabel("搜索记录").fill("photo-1");
  await expect(page.locator(".card")).toHaveCount(1);
  await page.getByRole("button", { name: "创建副本", exact: true }).click();
  await expect(page.locator(".card")).toHaveCount(2);
  page.once("dialog", (d) => d.accept());
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
    page.getByRole("button", { name: "＋ 新建记录", exact: true }),
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

test("文案复制及图片分享降级；允许仅图片记录", async ({ page }) => {
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
  await page.getByRole("button", { name: "＋ 新建记录", exact: true }).click();
  await page.getByRole("textbox", { name: "朋友圈文案" }).fill("手动文案");
  await page
    .getByRole("button", { name: "复制朋友圈文案", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("长按复制");
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "image.png", mimeType: "image/png", buffer: png });
  await expect(page.locator(".photo")).toHaveCount(1);
  await page.getByRole("button", { name: "分享图片 ↗", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("不支持图片分享");
  await page.getByRole("textbox", { name: "朋友圈文案" }).fill("");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  await page.reload();
  await page
    .getByRole("button", { name: "编辑 图片记录", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "朋友圈文案" })).toHaveValue(
    "",
  );
  await expect(page.locator(".photo")).toHaveCount(1);
});

test("仅文案保存后重开并复制真实文本", async ({ page, browserName }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "＋ 新建记录", exact: true }).click();
  await page
    .getByRole("textbox", { name: "朋友圈文案" })
    .fill("只保留我输入的文字");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  await page.reload();
  await page
    .getByRole("button", { name: "编辑 只保留我输入的文字", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "朋友圈文案" })).toHaveValue(
    "只保留我输入的文字",
  );
  await page
    .getByRole("button", { name: "复制朋友圈文案", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("文案已复制");
  await page.getByRole("button", { name: "一键分享准备", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("文案已复制");
  await expect(page.getByRole("status")).toContainText("没有图片，仅处理文案");
  if (browserName === "chromium")
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "只保留我输入的文字",
    );
});

test("旧商品草稿的图片文案与隐藏字段保持不变", async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "＋ 新建记录", exact: true }),
  ).toBeEnabled();
  await page.evaluate(async (bytes) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("moments-publisher");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put({
      id: "legacy-product",
      brand: "旧品牌",
      name: "旧商品",
      sku: "A01",
      size: "M",
      price: "123",
      notes: "原备注",
      copy: "旧文案",
      status: "published",
      updatedAt: Date.now(),
      photos: [
        {
          id: "oldphoto",
          name: "old.png",
          type: "image/png",
          bytes: new Uint8Array(bytes).buffer,
        },
      ],
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, Array.from(png));
  await page.reload();
  await page.getByRole("button", { name: "编辑 旧文案", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "朋友圈文案" })).toHaveValue(
    "旧文案",
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
    .getByRole("textbox", { name: "朋友圈文案" })
    .fill("编辑后的旧文案");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("moments-publisher");
      r.onsuccess = () => resolve(r.result);
    });
    const value = await new Promise<any>((resolve) => {
      const r = db
        .transaction("drafts")
        .objectStore("drafts")
        .get("legacy-product");
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return {
      version: db.version,
      brand: value.brand,
      name: value.name,
      sku: value.sku,
      size: value.size,
      price: value.price,
      notes: value.notes,
      status: value.status,
      copy: value.copy,
      bytes: Array.from(new Uint8Array(value.photos[0].bytes)),
    };
  });
  expect(stored).toEqual({
    version: 2,
    brand: "旧品牌",
    name: "旧商品",
    sku: "A01",
    size: "M",
    price: "123",
    notes: "原备注",
    status: "published",
    copy: "编辑后的旧文案",
    bytes: Array.from(png),
  });
});

for (const mode of [
  "success",
  "cancel",
  "unsupported",
  "copy-denied",
  "share-denied",
] as const) {
  test(`一键分享准备：${mode}`, async ({ page }) => {
    await page.addInitScript(
      ({ mode }) => {
        const probe = {
          calls: [] as string[],
          copy: "",
          files: [] as { name: string; type: string; size: number }[],
          text: undefined as string | undefined,
        };
        Object.defineProperty(window, "shareProbe", { value: probe });
        let finishCopy: (() => void) | undefined;
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: (text: string) => {
              probe.calls.push("copy");
              probe.copy = text;
              if (mode === "copy-denied")
                return Promise.reject(
                  new DOMException("denied", "NotAllowedError"),
                );
              if (mode === "unsupported") return Promise.resolve();
              return new Promise<void>((resolve) => {
                finishCopy = resolve;
              });
            },
          },
        });
        Object.defineProperty(navigator, "canShare", {
          configurable: true,
          value: () => mode !== "unsupported",
        });
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: (data: ShareData) => {
            probe.calls.push("share");
            probe.files = (data.files || []).map((f) => ({
              name: f.name,
              type: f.type,
              size: f.size,
            }));
            probe.text = data.text;
            finishCopy?.();
            if (mode === "cancel")
              return Promise.reject(
                new DOMException("cancelled", "AbortError"),
              );
            if (mode === "share-denied")
              return Promise.reject(
                new DOMException("denied", "NotAllowedError"),
              );
            return Promise.resolve();
          },
        });
      },
      { mode },
    );
    await page.goto("./");
    await page
      .getByRole("button", { name: "＋ 新建记录", exact: true })
      .click();
    const shortcut = page.getByRole("button", {
      name: "一键分享准备",
      exact: true,
    });
    await expect(shortcut).toBeDisabled();
    await page
      .getByRole("textbox", { name: "朋友圈文案" })
      .fill("半自动分享文案\n第二行");
    await page.locator("input[type=file]").setInputFiles(
      [0, 1].map((i) => ({
        name: `photo-${i}.png`,
        mimeType: "image/png",
        buffer: png,
      })),
    );
    await expect(page.locator(".photo")).toHaveCount(2);
    await page
      .getByRole("button", { name: "后移第1张图片", exact: true })
      .click();
    await shortcut.click();
    const expected = {
      success: "应用无法确认图片是否保存",
      cancel: "图片分享已取消",
      unsupported: "此浏览器不支持图片分享",
      "copy-denied": "文案未能自动复制",
      "share-denied": "图片分享未完成",
    }[mode];
    await expect(page.getByRole("status")).toContainText(expected);
    if (mode !== "copy-denied")
      await expect(page.getByRole("status")).toContainText("文案已复制");
    const probe = await page.evaluate(() => Reflect.get(window, "shareProbe"));
    expect(probe.calls).toEqual(
      mode === "unsupported" ? ["copy"] : ["copy", "share"],
    );
    expect(probe.copy).toBe("半自动分享文案\n第二行");
    if (mode !== "unsupported")
      expect(probe.files).toEqual(
        [1, 0].map((n, i) => ({
          name: `0${i + 1}-photo-${n}.png`,
          type: "image/png",
          size: png.length,
        })),
      );
    expect(probe.text).toBeUndefined();
    await expect(shortcut).toBeEnabled();
    await expect(page.getByRole("textbox", { name: "朋友圈文案" })).toHaveValue(
      "半自动分享文案\n第二行",
    );
    await expect(page.locator(".photo")).toHaveCount(2);
    // The shortcut must not save, delete or change the record behind the user.
    await expect(page.locator(".save-bar")).toContainText("修改尚未保存");
    await page.getByRole("button", { name: "保存记录", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("草稿已保存");
    await page.reload();
    await page
      .getByRole("button", { name: "编辑 半自动分享文案", exact: true })
      .click();
    await expect(page.locator(".photo")).toHaveCount(2);
    await expect(page.locator(".photo img").first()).toHaveAttribute(
      "alt",
      "photo-1.png",
    );
    await expect(page.getByRole("textbox", { name: "朋友圈文案" })).toHaveValue(
      "半自动分享文案\n第二行",
    );
  });
}
