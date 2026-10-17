import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import {
  newDraft,
  generateCopy,
  duplicate,
  matches,
  movePhoto,
  repository,
} from "./model";
describe("商品草稿", () => {
  it("按真实信息生成中文文案，不添加成色或真伪承诺", () => {
    const d = {
      ...newDraft(),
      brand: "CHANEL",
      name: "手袋",
      price: "26800",
      sku: "A01",
      size: "中号",
      notes: "黑色",
    };
    expect(generateCopy(d)).toBe(
      "CHANEL · 手袋\n货号：A01\n尺码：中号\n价格：¥26,800\n黑色\n喜欢可私信了解细节。",
    );
    expect(generateCopy(newDraft())).not.toContain("¥");
  });
  it("复制时重置状态并保留独立图片顺序", () => {
    const d = {
      ...newDraft(),
      status: "published" as const,
      photos: [
        { id: "a", name: "a.png", blob: new Blob(["a"]) },
        { id: "b", name: "b.png", blob: new Blob(["b"]) },
      ],
    };
    const c = duplicate(d);
    expect(c.id).not.toBe(d.id);
    expect(c.status).toBe("pending");
    expect(c.photos[0].id).not.toBe("a");
    expect(movePhoto(c.photos, 0, 1).map((p) => p.name)).toEqual([
      "b.png",
      "a.png",
    ]);
    expect(d.photos[0].id).toBe("a");
    expect(movePhoto(d.photos, 0, -1)).toBe(d.photos);
  });
  it("支持大小写不敏感搜索及发布状态筛选", () => {
    const d = { ...newDraft(), brand: "CHANEL", sku: "A01" };
    expect(matches(d, "chanel", "pending")).toBe(true);
    expect(matches(d, "A01", "all")).toBe(true);
    expect(matches(d, "", "published")).toBe(false);
  });
  it("IndexedDB 保存图片 Blob、更新和删除", async () => {
    const d = {
      ...newDraft(),
      photos: [
        {
          id: "p",
          name: "p.png",
          blob: new Blob(["image"], { type: "image/png" }),
        },
      ],
    };
    await repository.save(d);
    let stored = (await repository.all()).find((x) => x.id === d.id)!;
    expect(await stored.photos[0].blob.text()).toBe("image");
    await repository.save({ ...stored, copy: "手动文案", status: "published" });
    stored = (await repository.all()).find((x) => x.id === d.id)!;
    expect(stored.copy).toBe("手动文案");
    expect(stored.status).toBe("published");
    await repository.remove(d.id);
    expect((await repository.all()).some((x) => x.id === d.id)).toBe(false);
  });
});
