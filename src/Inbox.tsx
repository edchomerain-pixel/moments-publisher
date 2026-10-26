import { useEffect, useState } from "react";
import { InboxClient, importInbox, type InboxItem } from "./cloud-inbox";
import { storageErrorMessage } from "./storage-errors";
import { inboxErrorMessage } from "./inbox-errors";
function Preview({ client, item }: { client: InboxClient; item: InboxItem }) {
  const [show, setShow] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!show) return;
    let active = true;
    let objectUrl = "";
    void client
      .download(item)
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (active) setError("预览失败，请重试连接。");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, item, show]);
  if (!show)
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setShow(true);
        }}
      >
        预览
      </button>
    );
  return url ? (
    <img className="inbox-preview" src={url} alt={item.name} />
  ) : (
    <span>{error || "正在加载预览…"}</span>
  );
}
export function Inbox({
  onImported,
  onClose,
}: {
  onImported: () => Promise<void>;
  onClose: () => void;
}) {
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [client, setClient] = useState<InboxClient | null>(null);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load(more = false) {
    setBusy(true);
    setMessage("");
    try {
      const api = more && client ? client : new InboxClient(endpoint, token);
      const result = await api.list(more ? cursor || undefined : undefined);
      setClient(api);
      setItems((previous) =>
        more
          ? [
              ...previous,
              ...result.items.filter(
                (i) => !previous.some((p) => p.id === i.id),
              ),
            ]
          : result.items,
      );
      setCursor(result.cursor);
      if (!more) setSelected([]);
      if (!result.items.length) setMessage("云端暂无图片。");
    } catch (e) {
      setMessage(inboxErrorMessage(e) || "连接失败，请检查网络。");
    } finally {
      setBusy(false);
    }
  }
  async function importSelected() {
    if (!client) return;
    setBusy(true);
    try {
      // Selection order is preserved; each image becomes one independent record.
      const count = await importInbox(
        client,
        selected.map((id) => items.find((i) => i.id === id)!),
      );
      setSelected([]);
      setMessage(
        `已导入 ${count} 条记录到本机；已导入的图片会跳过。云端原图保留。`,
      );
      await onImported();
    } catch (e) {
      const safeMessage = inboxErrorMessage(e);
      setMessage(
        safeMessage
          ? `导入图片失败：${safeMessage}`
          : storageErrorMessage(e, "导入图片"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel inbox" aria-label="云端收件箱">
      <button className="quiet" disabled={busy} onClick={onClose}>
        关闭收件箱
      </button>
      <h2>云端收件箱</h2>
      <p>
        仅在点击连接后访问云端。每张图片导入为一条本地记录，原有记录与排序保持不变。
      </p>
      <fieldset disabled={busy}>
        <label>
          云端服务地址
          <input
            type="url"
            placeholder="https://你的服务.workers.dev"
            value={endpoint}
            onChange={(e) => {
              setEndpoint(e.target.value);
              setClient(null);
              setItems([]);
              setSelected([]);
            }}
          />
        </label>
        <label>
          查看凭据
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setClient(null);
              setItems([]);
              setSelected([]);
            }}
          />
        </label>
        <p>
          只输入查看凭据，勿输入上传密钥或管理令牌。地址和凭据仅在当前收件箱内存中保留，关闭后需重新输入。
        </p>
        <button disabled={!endpoint || !token} onClick={() => void load()}>
          连接 / 刷新
        </button>
        {items.map((item) => (
          <label className="inbox-item" key={item.id}>
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              disabled={!selected.includes(item.id) && selected.length >= 9}
              onChange={(e) =>
                setSelected((ids) =>
                  e.target.checked
                    ? [...ids, item.id]
                    : ids.filter((id) => id !== item.id),
                )
              }
            />
            {client && <Preview client={client} item={item} />}
            <span>
              {item.name} · {(item.size / 1024 / 1024).toFixed(2)} MB
            </span>
          </label>
        ))}
        {cursor && client && (
          <button onClick={() => void load(true)}>加载更多</button>
        )}
        <button
          className="primary"
          disabled={!client || !selected.length}
          onClick={() => void importSelected()}
        >
          导入所选到本机（{selected.length}/9）
        </button>
      </fieldset>
      {(busy || message) && (
        <p role="status">{busy ? "正在处理，请勿关闭…" : message}</p>
      )}
    </section>
  );
}
