import { test, expect } from "@playwright/test";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=",
  "base64",
);
test.use({ serviceWorkers: "block" });
test("取消云端入口后不使用旧凭据或请求云端，仍可手动添加图片", async ({
  page,
}) => {
  let cloudRequests = 0;
  await page.route(
    "https://bashang-cloud-inbox.edchomerain.workers.dev/**",
    (route) => {
      cloudRequests++;
      return route.abort();
    },
  );
  await page.goto("./");
  await page.evaluate(() =>
    localStorage.setItem(
      "bashang:inbox-connection:v1",
      JSON.stringify({
        endpoint: "https://bashang-cloud-inbox.edchomerain.workers.dev",
        token: "synthetic-retired-read-token",
      }),
    ),
  );
  await page.reload();
  await expect(
    page.getByText("本机相册 · 自行添加图片", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "云端连接", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("region", { name: "云端收件箱" })).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bashang:inbox-connection:v1"),
    ),
  ).toBeNull();
  await page.getByRole("button", { name: "＋ 新建记录", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "机器人保存图.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.locator(".photo")).toHaveCount(1);
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await page.getByRole("button", { name: "← 返回相册", exact: true }).click();
  await expect(page.locator(".card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".card")).toHaveCount(1);
  expect(cloudRequests).toBe(0);
});
test("停用同步仍保留已导入云图、旧文案与数据库版本2", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(async (bytes) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("moments-publisher", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put({
      id: "cloud-inbox:https://old.example:" + "a".repeat(64),
      brand: "旧品牌",
      name: "",
      sku: "",
      size: "",
      price: "",
      notes: "保留字段",
      copy: "以前导入的文案",
      status: "pending",
      updatedAt: 123,
      photos: [
        {
          id: "photo",
          name: "旧云图.png",
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
  await expect(page.locator(".card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "编辑 以前导入的文案", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "朋友圈文案" })).toHaveValue(
    "以前导入的文案",
  );
  await expect(page.locator(".photo img")).toHaveAttribute("alt", "旧云图.png");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await page.reload();
  await expect(page.locator(".card")).toHaveCount(1);
});
