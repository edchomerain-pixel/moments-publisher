// Static release gate. Never reads ignored local credentials or contacts a service.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
function validateCore(config, worker) {
  assert.match(config, /^name = "bashang-cloud-inbox"$/m);
  assert.match(config, /^main = "worker.js"$/m);
  assert.match(config, /^compatibility_date = "2026-10-01"$/m);
  assert.match(config, /^workers_dev = true$/m);
  const sections = [...config.matchAll(/^\[([^\n]+)\]$/gm)].map((m) => m[1]);
  assert.deepEqual(sections, ["vars", "[r2_buckets]"]);
  const vars = config.split("[vars]")[1].split("[[r2_buckets]]")[0].trim();
  assert.equal(vars, 'ALLOWED_ORIGIN = "https://edchomerain-pixel.github.io"');
  const bucket = config
    .split("[[r2_buckets]]")[1]
    .split("\n")
    .filter((s) => s.trim() && !s.trim().startsWith("#"))
    .join("\n");
  assert.equal(
    bucket,
    'binding = "INBOX"\nbucket_name = "bashang-album-images"',
  );
  assert(!/TEST_CORS_|TEMPORARY_TEST_ORIGIN|192\.168\./.test(worker));
  assert(!/^export\s+(?:const|let|var)\s/m.test(worker));
  assert(!/console\.(?:log|warn|error|debug|info|trace)\s*\(/.test(worker));
}
function containsCredential(text) {
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\bAKIA[A-Z0-9]{16}\b/.test(
      text,
    )
  )
    return true;
  for (const m of text.matchAll(
    /(?:READ_TOKEN|UPLOAD_TOKEN)["']?\s*[:=]\s*["']([^"'\r\n]+)["']/g,
  )) {
    if (
      !/^(?:read-only|upload-only|synthetic-read-only|synthetic-upload-only)$/.test(
        m[1],
      )
    )
      return true;
  }
  return false;
}
function check(root = path.resolve(__dirname, "..")) {
  validateCore(
    fs.readFileSync(path.join(root, "cloud-inbox/wrangler.toml"), "utf8"),
    fs.readFileSync(path.join(root, "cloud-inbox/worker.js"), "utf8"),
  );
  const files = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const forbidden =
    /(^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.wrangler|\.bashang-cloud-inbox-secrets\.json)(?:\/|$)/;
  const bad = [];
  for (const file of files) {
    if (
      forbidden.test(file) ||
      /\.(?:pem|key|p12|pfx|cer|crt|mobileconfig|zip|tgz)$/i.test(file) ||
      /^cloud-inbox\/(?:temporary-test|safari-live)\//.test(file)
    ) {
      bad.push(file);
      continue;
    }
    const data = fs.readFileSync(path.join(root, file));
    if (!data.includes(0) && containsCredential(data.toString("utf8")))
      bad.push(file);
  }
  const dist = path.join(root, "dist");
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else {
        const b = fs.readFileSync(file);
        if (!b.includes(0) && containsCredential(b.toString("utf8")))
          bad.push(path.relative(root, file));
      }
    }
  };
  if (fs.existsSync(dist)) walk(dist);
  // Only file paths are printed, never matching lines or values.
  if (bad.length) {
    console.error(
      "发布检查未通过：疑似敏感文件/内容（未显示值）：" +
        [...new Set(bad)].join(", "),
    );
    return false;
  }
  console.log(
    "通过：正式 Worker 配置、无临时来源、已跟踪文件与构建产物敏感信息检查。",
  );
  return true;
}
if (require.main === module) {
  try {
    if (!check()) process.exitCode = 1;
  } catch {
    console.error("发布静态检查未通过，未输出代码、异常或凭据。");
    process.exitCode = 1;
  }
}
module.exports = { check, validateCore, containsCredential };
