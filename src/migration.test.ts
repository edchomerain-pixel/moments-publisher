import "fake-indexeddb/auto";
import { it, expect } from "vitest";
it("upgrades a real v1 database without rewriting its old Blob records", async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("moments-publisher", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("drafts", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const tx = db.transaction("drafts", "readwrite");
  tx.objectStore("drafts").put({
    id: "legacy-v1",
    copy: "旧文案",
    updatedAt: 123,
    photos: [
      {
        id: "p",
        name: "old.png",
        blob: new Blob(["old"], { type: "image/png" }),
      },
    ],
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  const { repository } = await import("./model");
  const old = (await repository.all()).find((d) => d.id === "legacy-v1")!;
  expect(old.copy).toBe("旧文案");
  expect(old.updatedAt).toBe(123);
  expect(await old.photos[0].blob.text()).toBe("old");
  expect(await repository.cloudKeys()).toContain("legacy-v1");
});
