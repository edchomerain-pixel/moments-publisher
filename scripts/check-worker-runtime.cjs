// Runs under npm exec --package=wrangler@4.152.0. Local workerd + synthetic R2 only.
// Never reads business credentials or calls Cloudflare management APIs.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
async function check(
  scriptFile = path.resolve(__dirname, "../cloud-inbox/worker.js"),
) {
  let runtimeRequire;
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    try {
      const bin = fs.realpathSync(path.join(dir, "wrangler"));
      const req = createRequire(bin);
      if (req("wrangler/package.json").version !== "4.152.0") continue;
      req.resolve("miniflare");
      runtimeRequire = req;
      break;
    } catch {}
  }
  assert(runtimeRequire, "Fixed Wrangler runtime missing");
  const { Miniflare, convertV4MiniflareOptions } = runtimeRequire("miniflare");
  const formal = "https://edchomerain-pixel.github.io";
  const temporary = "https://192.168.1.7:5443";
  const start = Date.now() - 1000;
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nGPQWJBCU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULAMZlsD2eiM3TAAAAAElFTkSuQmCC",
    "base64",
  );
  const id = crypto.createHash("sha256").update(bytes).digest("hex");
  const options = {
    modules: true,
    script: fs.readFileSync(scriptFile, "utf8"),
    compatibilityDate: "2026-10-01",
    r2Buckets: ["INBOX"],
    bindings: {
      ALLOWED_ORIGIN: formal,
      READ_TOKEN: "synthetic-read-only",
      UPLOAD_TOKEN: "synthetic-upload-only",
      TEST_CORS_START_MS: String(start),
      TEST_CORS_END_MS: String(start + 3600000),
    },
  };
  let mf;
  try {
    mf = new Miniflare(await convertV4MiniflareOptions(options));
    await mf.ready; // Unlike Node imports/dry-run, exercises Cloudflare's export validation.
    const bucket = await mf.getR2Bucket("INBOX");
    await bucket.put(id, bytes, { httpMetadata: { contentType: "image/png" } });
    const request = (origin, method = "GET", token, route = "/images") =>
      mf.dispatchFetch("https://worker.test" + route, {
        method,
        headers: {
          Origin: origin,
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
      });
    for (const origin of [formal]) {
      const preflight = await request(origin, "OPTIONS");
      assert.equal(preflight.status, 204);
      assert.equal(
        preflight.headers.get("access-control-allow-origin"),
        origin,
      );
      assert.equal((await request(origin)).status, 401);
      assert.equal((await request(origin, "GET", "wrong")).status, 401);
      assert.equal(
        (await request(origin, "GET", "synthetic-upload-only")).status,
        401,
      );
      const list = await request(origin, "GET", "synthetic-read-only");
      assert.equal(list.status, 200);
      assert.equal((await list.json()).items[0].id, id);
      const image = await request(
        origin,
        "GET",
        "synthetic-read-only",
        "/images/" + id,
      );
      assert.equal(image.status, 200);
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
    }
    // Release Worker has no LAN exception, even if obsolete temporary vars were injected.
    for (const method of ["GET", "OPTIONS", "POST"]) {
      const denied = await request(temporary, method, "synthetic-upload-only");
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get("access-control-allow-origin"), null);
    }
    assert.equal(
      (await request(formal, "POST", "synthetic-read-only")).status,
      401,
    );
    assert.equal(
      (await request("https://example.invalid", "OPTIONS")).status,
      403,
    );
    const expiredStart = Date.now() - 3600001;
    options.bindings.TEST_CORS_START_MS = String(expiredStart);
    options.bindings.TEST_CORS_END_MS = String(expiredStart + 3600000);
    await mf.setOptions(await convertV4MiniflareOptions(options));
    for (const method of ["GET", "OPTIONS"]) {
      const r = await request(temporary, method, "synthetic-read-only");
      assert.equal(r.status, 403);
      assert.equal(r.headers.get("access-control-allow-origin"), null);
    }
    assert.equal((await request(formal, "OPTIONS")).status, 204);
    console.log(
      "通过：正式 Worker 官方运行器启动、鉴权、私有模拟图片读取；临时来源始终拒绝。",
    );
  } finally {
    await mf?.dispose();
  }
}
if (require.main === module)
  check(process.argv[2]).catch(() => {
    console.error("未通过：官方 Workers 本地运行器检查失败；禁止部署。");
    process.exitCode = 1;
  });
module.exports = { check };
