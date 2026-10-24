import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { inboxEndpoint } from "./cloud-inbox";
import { newDraft, repository } from "./model";
describe("cloud inbox", () => {
  it("requires a credential-free HTTPS origin", () => {
    expect(inboxEndpoint("https://example.com")).toBe("https://example.com");
    for (const url of [
      "http://example.com",
      "https://a:b@example.com",
      "https://example.com?token=x",
      "https://example.com/images",
      "https://example.com/#secret",
    ])
      expect(() => inboxEndpoint(url)).toThrow();
  });
  it("only adds missing records, preserving existing bytes, text and photo order", async () => {
    const original = {
      ...newDraft(),
      copy: "保留旧文案",
      updatedAt: 123,
      photos: [
        {
          id: "second",
          name: "2.png",
          blob: new Blob(["two"], { type: "image/png" }),
        },
        { id: "first", name: "1.png", blob: new Blob(["one"]) },
      ],
    };
    await repository.save(original);
    const incoming = {
      ...newDraft(),
      id: "cloud-inbox:test:hash",
      photos: [{ id: "cloud", name: "cloud.png", blob: new Blob(["cloud"]) }],
    };
    expect(
      await repository.addMissing([
        incoming,
        { ...original, copy: "不应覆盖", photos: [] },
      ]),
    ).toBe(1);
    await repository.save({ ...incoming, copy: "用户导入后编辑" });
    expect(await repository.addMissing([incoming])).toBe(0);
    const all = await repository.all();
    const old = all.find((d) => d.id === original.id)!;
    expect(old.copy).toBe(original.copy);
    expect(old.updatedAt).toBe(123);
    expect(old.photos.map((p) => p.id)).toEqual(["second", "first"]);
    expect(await old.photos[0].blob.text()).toBe("two");
    expect(all.find((d) => d.id === incoming.id)?.copy).toBe("用户导入后编辑");
  });
});
