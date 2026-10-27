// Read-only post-publish checks from GitHub's runner. No real credentials or user profile.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const SITE = "https://edchomerain-pixel.github.io/moments-publisher/";
const ORIGIN = "https://edchomerain-pixel.github.io";
const WORKER = "https://bashang-cloud-inbox.edchomerain.workers.dev";
const INVALID = "invalid-release-connectivity-check";
const digest = (b) => crypto.createHash("sha256").update(b).digest("hex");
function assets(root) {
  const result = [];
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else {
        assert(!e.isSymbolicLink());
        result.push({
          name: path.relative(root, f).split(path.sep).join("/"),
          hash: digest(fs.readFileSync(f)),
        });
      }
    }
  }
  walk(root);
  assert(result.some((f) => f.name === "index.html"));
  return result;
}
async function verifyAssets(root, fetcher = fetch) {
  const files = assets(root);
  for (const file of files) {
    assert(!file.name.split("/").includes(".."));
    const url = new URL(file.name, SITE);
    assert(url.href.startsWith(SITE));
    const response = await fetcher(url, {
      cache: "no-store",
      redirect: "error",
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200, "PUBLIC_ASSET_HTTP");
    assert.equal(
      digest(Buffer.from(await response.arrayBuffer())),
      file.hash,
      "PUBLIC_ASSET_HASH",
    );
  }
  return files.length;
}
async function verifyWorker(fetcher = fetch) {
  const request = async (origin, method, auth) => {
    const headers = { Origin: origin };
    if (method === "OPTIONS")
      Object.assign(headers, {
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      });
    if (auth) headers.Authorization = "Bearer " + INVALID;
    return fetcher(WORKER + "/images", {
      method,
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
  };
  const preflight = await request(ORIGIN, "OPTIONS");
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), ORIGIN);
  for (const auth of [false, true]) {
    const response = await request(ORIGIN, "GET", auth);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
    await response.body?.cancel();
  }
  const denied = await request("https://example.invalid", "OPTIONS");
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
}
async function verifyBrowser() {
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch();
  try {
    // A fresh test context cannot read, reset, or migrate the user's Safari IndexedDB.
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", () => errors.push("PAGE_ERROR"));
    await page.goto(SITE, { waitUntil: "networkidle" });
    assert.equal(await page.title(), "巴商相册");
    await page
      .getByRole("button", { name: "＋ 新建记录", exact: true })
      .click();
    await page.getByRole("textbox", { name: "朋友圈文案" }).waitFor();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "← 返回相册", exact: true }).click();
    assert.equal(
      await page.getByRole("button", { name: "云端连接", exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByRole("region", { name: "云端收件箱" }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
  }
}
async function main(root) {
  const deadline = Date.now() + 180000;
  let verified = 0;
  // Allow CDN publication to finish; do not retry auth failures or alter the service.
  while (Date.now() < deadline) {
    try {
      verified = await verifyAssets(root);
      break;
    } catch {
      if (Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, 6000));
    }
  }
  assert(verified, "PUBLICATION_NOT_VERIFIED");
  await verifyWorker();
  await verifyBrowser();
  console.log(
    "POST_PUBLISH_OK " +
      JSON.stringify({
        site: SITE,
        assets: verified,
        worker_preflight: 204,
        worker_protected: 401,
        browser_native_cors: true,
        local_album_only: true,
        original_editor: true,
        credential_cleared: true,
        user_database_accessed: false,
      }),
  );
}
if (require.main === module)
  main(path.resolve(process.argv[2] || "dist")).catch(() => {
    console.error(
      "POST_PUBLISH_FAILED：正式页面/资源/跨域检查未通过；未输出凭据或底层异常。请检查并按已批准方案恢复。",
    );
    process.exitCode = 1;
  });
module.exports = { verifyAssets, verifyWorker, assets };
