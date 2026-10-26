import { openDB, type IDBPDatabase, type DBSchema } from "idb";
export interface Photo {
  id: string;
  name: string;
  blob: Blob;
}
export interface Draft {
  id: string;
  // Legacy fields remain for backwards compatibility only; no product or status UI.
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
// Store image bytes rather than File/Blob handles. WebKit can reject the latter
// with UnknownError while preparing the object-store write (including in private
// browser contexts). Names, MIME types and byte contents remain unchanged.
interface StoredPhoto {
  id: string;
  name: string;
  type: string;
  bytes: ArrayBuffer;
}
type StoredDraft = Omit<Draft, "photos"> & {
  // Version 1 records containing Blob/File remain readable; no destructive
  // database migration is required for this value-format change.
  photos: (StoredPhoto | Photo)[];
};
interface Store extends DBSchema {
  drafts: { key: string; value: StoredDraft };
  dismissed: { key: string; value: string };
}
let connection: Promise<IDBPDatabase<Store>> | undefined;
function db(): Promise<IDBPDatabase<Store>> {
  if (!connection) {
    const opening = openDB<Store>("moments-publisher", 2, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          database.createObjectStore("drafts", { keyPath: "id" });
        }
        if (oldVersion < 2) database.createObjectStore("dismissed");
      },
      blocking() {
        // A newer app version in another tab must be allowed to upgrade.
        void opening.then((database) => database.close());
        if (connection === opening) connection = undefined;
      },
      terminated() {
        if (connection === opening) connection = undefined;
      },
    });
    connection = opening;
    // A denied/failed open should not poison every later attempt in this page.
    void opening.catch(() => {
      if (connection === opening) connection = undefined;
    });
  }
  return connection;
}
function restoreDraft(stored: StoredDraft): Draft {
  return {
    ...stored,
    photos: stored.photos.map((photo) =>
      "bytes" in photo
        ? {
            id: photo.id,
            name: photo.name,
            blob: new Blob([photo.bytes], { type: photo.type }),
          }
        : photo,
    ),
  };
}
export const repository = {
  async cloudKeys(): Promise<Set<string>> {
    const database = await db();
    return new Set([
      ...(await database.getAllKeys("drafts")),
      ...(await database.getAllKeys("dismissed")),
    ]);
  },
  async all(): Promise<Draft[]> {
    const stored = await (await db()).getAll("drafts");
    return stored.map(restoreDraft).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async save(draft: Draft) {
    const photos: StoredPhoto[] = [];
    // File reads are asynchronous tasks. Finish them BEFORE opening the IDB
    // transaction: awaiting them inside it lets Safari auto-commit the transaction.
    for (const photo of draft.photos) {
      photos.push({
        id: photo.id,
        name: photo.name,
        type: photo.blob.type,
        bytes: await photo.blob.arrayBuffer(),
      });
    }
    const stored: StoredDraft = { ...draft, photos };
    const transaction = (await db()).transaction("drafts", "readwrite");
    await Promise.all([transaction.store.put(stored), transaction.done]);
  },
  // Inbox imports only add new keys. Never put/overwrite an existing record.
  async addMissing(drafts: Draft[]): Promise<number> {
    const stored: StoredDraft[] = await Promise.all(
      drafts.map(async (draft) => ({
        ...draft,
        photos: await Promise.all(
          draft.photos.map(async (photo) => ({
            id: photo.id,
            name: photo.name,
            type: photo.blob.type,
            bytes: await photo.blob.arrayBuffer(),
          })),
        ),
      })),
    );
    const transaction = (await db()).transaction(
      ["drafts", "dismissed"],
      "readwrite",
    );
    let count = 0;
    try {
      for (const draft of stored) {
        if (
          !(await transaction.objectStore("drafts").get(draft.id)) &&
          !(await transaction.objectStore("dismissed").get(draft.id))
        ) {
          await transaction.objectStore("drafts").add(draft);
          count++;
        }
      }
      await transaction.done;
      return count;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* Already aborted. */
      }
      await transaction.done.catch(() => {});
      throw error;
    }
  },
  async remove(id: string) {
    const transaction = (await db()).transaction(
      ["drafts", "dismissed"],
      "readwrite",
    );
    await transaction.objectStore("drafts").delete(id);
    if (id.startsWith("cloud-inbox:"))
      await transaction.objectStore("dismissed").put(id, id);
    await transaction.done;
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
export function draftTitle(d: Draft): string {
  return d.copy.trim().split(/\r?\n/)[0].slice(0, 40) || "图片记录";
}
export function matches(d: Draft, query: string) {
  return [d.copy, ...d.photos.map((photo) => photo.name)]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase());
}
export function duplicate(d: Draft): Draft {
  return {
    ...d,
    id: crypto.randomUUID(),
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
