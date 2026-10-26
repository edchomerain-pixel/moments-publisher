import { InboxError } from "./inbox-errors";
import { InboxClient, type InboxItem } from "./cloud-inbox";
import { newDraft, repository } from "./model";
export const cloudId = (client: InboxClient, item: InboxItem) =>
  `cloud-inbox:${client.endpoint}:${item.id}`;
// Read all pages: R2 lists by hash, not upload time. Never persist a cursor that
// could skip later uploads inserted before it. Commit each image independently.
export async function syncAlbum(
  client: InboxClient,
  active = () => true,
  changed = async () => {},
) {
  const known = await repository.cloudKeys();
  const seen = new Set<string>();
  let cursor: string | undefined;
  let added = 0,
    failed = 0;
  do {
    if (!active()) break;
    const page = await client.list(cursor);
    for (const item of page.items) {
      if (!active()) return { added, failed };
      const id = cloudId(client, item);
      if (known.has(id)) continue;
      try {
        const blob = await client.download(item);
        if (!active()) return { added, failed };
        const count = await repository.addMissing([
          {
            ...newDraft(),
            id,
            updatedAt: Date.parse(item.uploaded),
            photos: [{ id: item.id, name: item.name, blob }],
          },
        ]);
        known.add(id);
        added += count;
        if (count) await changed();
      } catch (error) {
        if (error instanceof InboxError && error.code === "unauthorized")
          throw error;
        failed++;
      }
    }
    cursor = page.cursor || undefined;
    if (cursor && seen.has(cursor))
      throw new Error("云端分页异常，请稍后重试。");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return { added, failed };
}
