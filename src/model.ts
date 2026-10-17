import { openDB, type IDBPDatabase, type DBSchema } from "idb";
export interface Photo {
  id: string;
  name: string;
  blob: Blob;
}
export interface Draft {
  id: string;
  brand: string;
  name: string;
  sku: string;
  size: string;
  price: string;
  notes: string;
  copy: string;
  photos: Photo[];
  status: "pending" | "published";
  updatedAt: number;
}
interface Store extends DBSchema {
  drafts: { key: string; value: Draft };
}
let connection: Promise<IDBPDatabase<Store>> | undefined;
const db = () =>
  (connection ??= openDB<Store>("moments-publisher", 1, {
    upgrade(db) {
      db.createObjectStore("drafts", { keyPath: "id" });
    },
  }));
export const repository = {
  async all() {
    return (await (await db()).getAll("drafts")).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  },
  async save(draft: Draft) {
    await (await db()).put("drafts", draft);
  },
  async remove(id: string) {
    await (await db()).delete("drafts", id);
  },
};
export function newDraft(): Draft {
  return {
    id: crypto.randomUUID(),
    brand: "",
    name: "",
    sku: "",
    size: "",
    price: "",
    notes: "",
    copy: "",
    photos: [],
    status: "pending",
    updatedAt: Date.now(),
  };
}
export function generateCopy(d: Draft) {
  return [
    [d.brand.trim(), d.name.trim()].filter(Boolean).join(" · "),
    d.sku.trim() && `货号：${d.sku.trim()}`,
    d.size.trim() && `尺码：${d.size.trim()}`,
    d.price.trim() && `价格：¥${Number(d.price).toLocaleString("zh-CN")}`,
    d.notes.trim(),
    "喜欢可私信了解细节。",
  ]
    .filter(Boolean)
    .join("\n");
}
export function matches(d: Draft, query: string, status: string) {
  return (
    (status === "all" || d.status === status) &&
    [d.brand, d.name, d.sku, d.size, d.notes, d.copy]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  );
}
export function duplicate(d: Draft): Draft {
  return {
    ...d,
    id: crypto.randomUUID(),
    status: "pending",
    updatedAt: Date.now(),
    photos: d.photos.map((p) => ({ ...p, id: crypto.randomUUID() })),
  };
}
export function movePhoto(photos: Photo[], index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= photos.length) return photos;
  const result = [...photos];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
