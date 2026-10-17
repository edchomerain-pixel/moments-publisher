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

describe("Safari 图片存储回归", () => {
  it("将 File 保存为字节，重读仍保留名称、MIME 和原始内容", async () => {
    const file = new File([new Uint8Array([0, 128, 255])], "原图.png", {
      type: "image/png",
    });
    const draft = {
      ...newDraft(),
      photos: [{ id: "file", name: file.name, blob: file }],
    };
    await repository.save(draft);
    const { openDB } = await import("idb");
    const raw = await openDB("moments-publisher", 1);
    try {
      const stored = await raw.get("drafts", draft.id);
      expect(stored.photos[0].blob).toBeUndefined();
      expect(stored.photos[0].bytes).toBeInstanceOf(ArrayBuffer);
      const reopened = (await repository.all()).find((d) => d.id === draft.id)!;
      expect(reopened.photos[0].name).toBe("原图.png");
      expect(reopened.photos[0].blob.type).toBe("image/png");
      expect(
        new Uint8Array(await reopened.photos[0].blob.arrayBuffer()),
      ).toEqual(new Uint8Array([0, 128, 255]));
    } finally {
      raw.close();
      await repository.remove(draft.id);
    }
  });

  it("读取旧版 Blob 草稿，再次保存时转为新格式而不丢数据", async () => {
    const { openDB } = await import("idb");
    const legacy = {
      ...newDraft(),
      name: "旧版草稿",
      photos: [
        {
          id: "legacy",
          name: "legacy.jpg",
          blob: new Blob(["legacy bytes"], { type: "image/jpeg" }),
        },
      ],
    };
    const raw = await openDB("moments-publisher", 1);
    try {
      await raw.put("drafts", legacy);
      const reopened = (await repository.all()).find(
        (d) => d.id === legacy.id,
      )!;
      expect(await reopened.photos[0].blob.text()).toBe("legacy bytes");
      await repository.save({ ...reopened, notes: "已编辑" });
      const stored = await raw.get("drafts", legacy.id);
      expect(stored.photos[0].bytes).toBeInstanceOf(ArrayBuffer);
      expect(stored.notes).toBe("已编辑");
      const updated = (await repository.all()).find((d) => d.id === legacy.id)!;
      expect(updated.photos[0].blob.type).toBe("image/jpeg");
      expect(await updated.photos[0].blob.text()).toBe("legacy bytes");
    } finally {
      raw.close();
      await repository.remove(legacy.id);
    }
  });

  it("图片读取失败时不覆盖已提交的草稿", async () => {
    const draft = { ...newDraft(), name: "原草稿" };
    await repository.save(draft);
    const photo = new Blob(["unreadable"]);
    Object.defineProperty(photo, "arrayBuffer", {
      value: () =>
        Promise.reject(new DOMException("read failure", "NotReadableError")),
    });
    await expect(
      repository.save({
        ...draft,
        name: "未完成修改",
        photos: [{ id: "bad", name: "bad.jpg", blob: photo }],
      }),
    ).rejects.toMatchObject({ name: "NotReadableError" });
    expect((await repository.all()).find((d) => d.id === draft.id)?.name).toBe(
      "原草稿",
    );
    await repository.remove(draft.id);
  });
});
