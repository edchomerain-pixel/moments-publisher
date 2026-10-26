const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { verifyAssets, verifyWorker } = require("./check-live-pages.cjs");
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-pages-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "index.html"), "<title>test</title>");
  return dir;
}
test("assets verified by actual bytes; only expected public URLs requested", async (t) => {
  const dir = fixture(t);
  const requests = [];
  const count = await verifyAssets(dir, async (url) => {
    requests.push(url.href);
    return new Response(fs.readFileSync(path.join(dir, "index.html")));
  });
  assert.equal(count, 1);
  assert.deepEqual(requests, [
    "https://edchomerain-pixel.github.io/moments-publisher/index.html",
  ]);
});
test("old or altered published assets cannot pass", async (t) => {
  const dir = fixture(t);
  await assert.rejects(
    verifyAssets(dir, async () => new Response("wrong bytes")),
  );
  await assert.rejects(
    verifyAssets(dir, async () => new Response("not found", { status: 404 })),
  );
});
test("worker verification uses only OPTIONS/GET and invalid credentials", async () => {
  const methods = [];
  await verifyWorker(async (url, options) => {
    assert.equal(
      url,
      "https://bashang-cloud-inbox.edchomerain.workers.dev/images",
    );
    methods.push(options.method);
    if (options.headers.Authorization)
      assert.equal(
        options.headers.Authorization,
        "Bearer invalid-release-connectivity-check",
      );
    const allowed =
      options.headers.Origin === "https://edchomerain-pixel.github.io";
    const status = allowed ? (options.method === "OPTIONS" ? 204 : 401) : 403;
    return new Response(null, {
      status,
      headers: allowed
        ? { "Access-Control-Allow-Origin": options.headers.Origin }
        : {},
    });
  });
  assert.deepEqual(methods, ["OPTIONS", "GET", "GET", "OPTIONS"]);
});
test("worker auth/CORS failures are not reported as success", async () => {
  await assert.rejects(
    verifyWorker(async () => new Response(null, { status: 204 })),
  );
  await assert.rejects(
    verifyWorker(async () => new Response(null, { status: 200 })),
  );
});
