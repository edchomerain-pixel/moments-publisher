// Private R2 binding; no public bucket URL and no browser upload capability.
const MAX = 25 * 1024 * 1024;
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function equal(a, b) {
  if (!a || !b) return false;
  const hash = async (value) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    );
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  return x.reduce((diff, byte, i) => diff | (byte ^ y[i]), 0) === 0;
}
export function imageType(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
    return "image/png";
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
async function route(request, env) {
  const url = new URL(request.url);
  const upload = request.method === "POST" && url.pathname === "/images";
  const read =
    request.method === "GET" &&
    (url.pathname === "/images" ||
      /^\/images\/[a-f0-9]{64}$/.test(url.pathname));
  if (!upload && !read) return json({ error: "Not found" }, 404);
  if (
    !env.READ_TOKEN ||
    !env.UPLOAD_TOKEN ||
    env.READ_TOKEN === env.UPLOAD_TOKEN
  )
    return json({ error: "Service not configured" }, 503);
  if (
    !(await equal(
      request.headers.get("Authorization"),
      `Bearer ${upload ? env.UPLOAD_TOKEN : env.READ_TOKEN}`,
    ))
  )
    return json({ error: "Unauthorized" }, 401);
  if (upload) {
    const length = Number(request.headers.get("Content-Length"));
    if (length > MAX) return json({ error: "Image too large" }, 413);
    if (!request.body) return json({ error: "Image required" }, 400);
    const reader = request.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX) {
        await reader.cancel();
        return json({ error: "Image too large" }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const type = imageType(bytes);
    if (!type || type !== request.headers.get("Content-Type"))
      return json(
        { error: "Use JPEG, PNG or WebP with matching Content-Type" },
        415,
      );
    const id = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    let name;
    try {
      name = decodeURIComponent(request.headers.get("X-File-Name") || "image");
    } catch {
      return json({ error: "Invalid filename" }, 400);
    }
    name = name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 180) || "image";
    // Immutable content-addressed keys: retrying an upload never duplicates bytes.
    await env.INBOX.put(id, bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: type },
      customMetadata: { name },
    });
    return json({ id }, 201);
  }
  if (url.pathname === "/images") {
    const result = await env.INBOX.list({
      limit: 50,
      cursor: url.searchParams.get("cursor") || undefined,
      include: ["customMetadata", "httpMetadata"],
    });
    return json({
      items: result.objects.map((o) => ({
        id: o.key,
        name: o.customMetadata?.name || "image",
        size: o.size,
        type: o.httpMetadata?.contentType,
        uploaded: o.uploaded.toISOString(),
      })),
      cursor: result.truncated ? result.cursor : null,
    });
  }
  const object = await env.INBOX.get(url.pathname.slice(8));
  if (!object) return json({ error: "Not found" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata.contentType,
      "Content-Length": String(object.size),
    },
  });
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = env.ALLOWED_ORIGIN;
    if (origin && origin !== allowed)
      return json({ error: "Origin denied" }, 403);
    let response;
    if (request.method === "OPTIONS")
      response = new Response(null, { status: 204 });
    else {
      try {
        response = await route(request, env);
      } catch {
        response = json({ error: "Service unavailable" }, 503);
      }
    }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Vary", "Origin");
    if (origin && origin === allowed) {
      headers.set("Access-Control-Allow-Origin", allowed);
      headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Authorization");
    }
    return new Response(response.body, { status: response.status, headers });
  },
};
