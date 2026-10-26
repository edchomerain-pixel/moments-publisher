import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
import { syncAlbum, cloudId } from "./album-sync";
import { InboxClient, type InboxItem } from "./cloud-inbox";
import { InboxError } from "./inbox-errors";
import { repository, newDraft } from "./model";
const item = (n: string, uploaded: string): InboxItem => ({
  id: n.repeat(64),
  name: n + ".png",
  size: 1,
  type: "image/png",
  uploaded,
});
it("syncs every page, orders by upload date, preserves edits, skips duplicates and remembers deletions", async () => {
  const client = new InboxClient("https://sync.example", "test-only");
  const a = item("a", "2026-10-20T00:00:00Z"),
    b = item("b", "2026-10-21T00:00:00Z");
  vi.spyOn(client, "list").mockImplementation(async (cursor) =>
    cursor ? { items: [b], cursor: null } : { items: [a], cursor: "next" },
  );
  const download = vi
    .spyOn(client, "download")
    .mockResolvedValue(new Blob(["x"]));
  const legacy = { ...newDraft(), copy: "旧文案", updatedAt: 1 };
  await repository.save(legacy);
  expect(await syncAlbum(client)).toEqual({ added: 2, failed: 0 });
  let rows = await repository.all();
  expect(rows.findIndex((d) => d.id === cloudId(client, b))).toBeLessThan(
    rows.findIndex((d) => d.id === cloudId(client, a)),
  );
  const saved = rows.find((d) => d.id === cloudId(client, a))!;
  await repository.save({ ...saved, copy: "已编辑" });
  await repository.remove(cloudId(client, b));
  download.mockClear();
  expect(await syncAlbum(client)).toEqual({ added: 0, failed: 0 });
  expect(download).not.toHaveBeenCalled();
  rows = await repository.all();
  expect(rows.find((d) => d.id === saved.id)?.copy).toBe("已编辑");
  expect(rows.find((d) => d.id === legacy.id)?.copy).toBe("旧文案");
});
it("retries failed images on the next scan without downloading successful records again", async () => {
  const client = new InboxClient("https://retry.example", "test-only");
  const a = item("c", "2026-10-20T00:00:00Z"),
    b = item("d", "2026-10-21T00:00:00Z");
  vi.spyOn(client, "list").mockResolvedValue({ items: [a, b], cursor: null });
  const download = vi
    .spyOn(client, "download")
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(new Blob(["x"]));
  expect(await syncAlbum(client)).toEqual({ added: 1, failed: 1 });
  download.mockClear();
  expect(await syncAlbum(client)).toEqual({ added: 1, failed: 0 });
  expect(download).toHaveBeenCalledTimes(1);
});
it("stops on revoked credentials and cancels writes when connection changes", async () => {
  const client = new InboxClient("https://cancel.example", "test-only");
  vi.spyOn(client, "list").mockResolvedValue({
    items: [item("e", "2026-10-20T00:00:00Z")],
    cursor: null,
  });
  const download = vi
    .spyOn(client, "download")
    .mockRejectedValue(new InboxError("unauthorized"));
  await expect(syncAlbum(client)).rejects.toMatchObject({
    code: "unauthorized",
  });
  let active = true;
  download.mockImplementation(async () => {
    active = false;
    return new Blob(["x"]);
  });
  expect(await syncAlbum(client, () => active)).toEqual({
    added: 0,
    failed: 0,
  });
  expect(
    (await repository.all()).some((d) => d.id.includes("cancel.example")),
  ).toBe(false);
});
