import { newDraft, repository, type Draft } from "./model";
export interface InboxItem {
  id: string;
  name: string;
  size: number;
  type: string;
  uploaded: string;
}
export function inboxEndpoint(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("请输入 HTTPS 云端服务根地址，不要包含路径、密钥或参数。");
  return url.origin;
}
export class InboxClient {
  readonly endpoint: string;
  constructor(
    endpoint: string,
    private token: string,
  ) {
    this.endpoint = inboxEndpoint(endpoint);
  }
  private async request(path: string) {
    const response = await fetch(this.endpoint + path, {
      headers: { Authorization: `Bearer ${this.token}` },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "查看凭据无效，请重新输入。"
          : `云端请求失败（${response.status}），请稍后重试。`,
      );
    return response;
  }
  async list(
    cursor?: string,
  ): Promise<{ items: InboxItem[]; cursor: string | null }> {
    const data = await (
      await this.request(
        "/images" + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""),
      )
    ).json();
    if (
      !Array.isArray(data.items) ||
      data.items.some(
        (i: InboxItem) =>
          !/^[a-f0-9]{64}$/.test(i.id) ||
          typeof i.name !== "string" ||
          !Number.isSafeInteger(i.size) ||
          i.size < 1 ||
          i.size > 25 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp"].includes(i.type),
      ) ||
      !(data.cursor === null || typeof data.cursor === "string")
    )
      throw new Error("云端数据格式不正确。");
    return data;
  }
  async download(item: InboxItem) {
    const response = await this.request(`/images/${item.id}`);
    const blob = await response.blob();
    if (blob.size !== item.size || blob.type !== item.type)
      throw new Error("图片大小或格式不匹配，未导入。");
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== item.id) throw new Error("图片完整性校验失败，未导入。");
    await new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("图片无法解码，未导入。"));
      };
      img.src = url;
    });
    return blob;
  }
}
export async function importInbox(
  client: InboxClient,
  items: InboxItem[],
): Promise<number> {
  if (!items.length || items.length > 9)
    throw new Error("每次请选择 1 至 9 张图片。");
  const drafts: Draft[] = [];
  for (const item of items) {
    const blob = await client.download(item);
    drafts.push({
      ...newDraft(),
      id: `cloud-inbox:${client.endpoint}:${item.id}`,
      photos: [{ id: item.id, name: item.name, blob }],
    });
  }
  return repository.addMissing(drafts);
}
