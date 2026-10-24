import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";
const env = {
  READ_TOKEN: "read-only",
  UPLOAD_TOKEN: "upload-only",
  ALLOWED_ORIGIN: "https://edchomerain-pixel.github.io",
  INBOX: { list: async () => ({ objects: [], truncated: false }) },
};
const request = (path, token, method = "GET", extra = {}) =>
  new Request("https://inbox.test" + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...extra },
  });
test("reader and uploader cannot cross permission boundary", async () => {
  for (const [token, method, status] of [
    ["", "GET", 401],
    ["upload-only", "GET", 401],
    ["read-only", "POST", 401],
    ["read-only", "GET", 200],
  ]) {
    assert.equal(
      (await worker.fetch(request("/images", token, method), env)).status,
      status,
    );
  }
});
test("fails closed without distinct secrets", async () => {
  assert.equal(
    (
      await worker.fetch(request("/images", "read-only"), {
        ...env,
        UPLOAD_TOKEN: "read-only",
      })
    ).status,
    503,
  );
});
test("cors, cache and deletion restrictions", async () => {
  assert.equal(
    (
      await worker.fetch(
        request("/images", "read-only", "GET", { Origin: "https://evil.test" }),
        env,
      )
    ).status,
    403,
  );
  const result = await worker.fetch(
    request("/images", "read-only", "GET", { Origin: env.ALLOWED_ORIGIN }),
    env,
  );
  assert.equal(
    result.headers.get("Access-Control-Allow-Origin"),
    env.ALLOWED_ORIGIN,
  );
  assert.equal(result.headers.get("Cache-Control"), "no-store");
  assert.equal(
    (
      await worker.fetch(
        request("/images/" + "a".repeat(64), "read-only", "DELETE"),
        env,
      )
    ).status,
    404,
  );
});
test("validates bytes, bounds uploads and keeps content-addressed retries immutable", async () => {
  const puts = [];
  const storage = {
    ...env,
    INBOX: { put: async (...args) => puts.push(args) },
  };
  const upload = (body, type = "image/png", extra = {}) =>
    new Request("https://inbox.test/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer upload-only",
        "Content-Type": type,
        "X-File-Name": encodeURIComponent("测试.png"),
        ...extra,
      },
      body,
    });
  assert.equal(
    (await worker.fetch(upload("not an image"), storage)).status,
    415,
  );
  assert.equal(
    (
      await worker.fetch(
        upload("x", "image/png", {
          "Content-Length": String(26 * 1024 * 1024),
        }),
        storage,
      )
    ).status,
    413,
  );
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const first = await worker.fetch(upload(png), storage);
  const second = await worker.fetch(upload(png), storage);
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), await second.json());
  assert.equal(puts[0][2].customMetadata.name, "测试.png");
  assert.deepEqual(puts[0][2].onlyIf, { etagDoesNotMatch: "*" });
});
