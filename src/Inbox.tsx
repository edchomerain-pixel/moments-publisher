import { useEffect, useState } from "react";
import { InboxClient, importInbox, type InboxItem } from "./cloud-inbox";
import {
  readConnection,
  saveConnection,
  clearConnection,
} from "./inbox-connection";
import { storageErrorMessage } from "./storage-errors";
import { InboxError, inboxErrorMessage } from "./inbox-errors";
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
  const [saved] = useState(readConnection);
  const [endpoint, setEndpoint] = useState(saved?.endpoint || "");
  const [token, setToken] = useState(saved?.token || "");
  const [storageNotice, setStorageNotice] = useState("");
  const [client, setClient] = useState<InboxClient | null>(null);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (saved) void load();
  }, []);
  async function load(more = false) {
    setBusy(true);
    setMessage("");
    try {
      const api = more && client ? client : new InboxClient(endpoint, token);
      const result = await api.list(more ? cursor || undefined : undefined);
      setClient(api);
      if (!more) {
        try {
          saveConnection({ endpoint: api.endpoint, token });
          setStorageNotice("已记住连接，图片将自动进入正式相册。");
          void navigator.storage?.persist?.().catch(() => false);
        } catch {
          setStorageNotice("本机存储不可用，本次仍可使用；关闭后需重新连接。");
        }
      }
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
      if (e instanceof InboxError && e.code === "unauthorized") {
        try {
          clearConnection();
        } catch {
          /* Show the recovery action below. */
        }
        setToken("");
        setClient(null);
        setItems([]);
        setSelected([]);
        setCursor(null);
        setStorageNotice("保存的凭据已失效，请输入新的查看凭据后连接。");
      }
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
      <h2>云端连接</h2>
      <p>
        首次连接后，打开相册、回到前台或恢复网络时会自动同步，无需勾选导入。iPhone
        关闭应用后不能保证后台同步，下次打开会继续。
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
          只输入查看凭据，勿输入上传密钥或管理令牌。凭据保存在当前浏览器的网站存储中，不是系统钥匙串；同源网页脚本及可使用此设备的人可能访问。请仅在自己的设备连接。
          iPhone 请从主屏图标打开后连接一次，Safari
          与主屏应用不共享此存储。清除网站数据、移除应用或系统清理后可能需要重新连接。
        </p>
        <button disabled={!endpoint || !token} onClick={() => void load()}>
          连接 / 刷新
        </button>
        <button
          onClick={() => {
            try {
              clearConnection();
            } catch {
              setStorageNotice("清除失败，请在系统设置中清除此网站数据。");
              return;
            }
            setEndpoint("");
            setToken("");
            setClient(null);
            setItems([]);
            setSelected([]);
            setCursor(null);
            setMessage("");
            setStorageNotice("已断开并清除本机连接凭据，已导入的记录保留。");
          }}
        >
          断开 / 清除本机凭据
        </button>
        {storageNotice && <p role="note">{storageNotice}</p>}
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
