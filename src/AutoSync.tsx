import { useEffect, useState } from "react";
import { syncAlbum } from "./album-sync";
import { readConnection, clearConnection } from "./inbox-connection";
import { InboxClient } from "./cloud-inbox";
import { InboxError } from "./inbox-errors";
export function AutoSync({ onChanged }: { onChanged: () => Promise<void> }) {
  const [status, setStatus] = useState("");
  useEffect(() => {
    let stopped = false,
      running = false,
      generation = 0,
      delay = 15000;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      clearTimeout(timer);
      if (stopped || running || document.visibilityState === "hidden") return;
      const connection = readConnection();
      if (!connection) return;
      running = true;
      const version = generation;
      const active = () => !stopped && version === generation;
      try {
        setStatus("正在同步云端图片…");
        const result = await syncAlbum(
          new InboxClient(connection.endpoint, connection.token),
          active,
          onChanged,
        );
        if (active()) {
          setStatus(
            result.failed
              ? "部分图片暂未同步，将自动重试。"
              : "云端图片已自动同步到相册",
          );
          delay = result.failed ? Math.min(delay * 2, 300000) : 60000;
        }
      } catch (error) {
        if (active()) {
          if (error instanceof InboxError && error.code === "unauthorized") {
            try {
              clearConnection();
            } catch {
              /* Retry clearing on the next authenticated request. */
            }
            setStatus("连接凭据已失效，请在云端连接中更新一次。");
          } else
            setStatus("暂时无法同步，联网后自动重试；已有图片可继续使用。");
          delay = Math.min(delay * 2, 300000);
        }
      } finally {
        running = false;
        if (!stopped)
          timer = setTimeout(
            () => void run(),
            version === generation ? delay : 0,
          );
      }
    };
    const wake = () => {
      delay = 15000;
      void run();
    };
    const reconnect = () => {
      generation++;
      setStatus("");
      wake();
    };
    window.addEventListener("album-connection", reconnect);
    window.addEventListener("storage", reconnect);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    document.addEventListener("visibilitychange", wake);
    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("album-connection", reconnect);
      window.removeEventListener("storage", reconnect);
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [onChanged]);
  return status ? <p role="status">{status}</p> : null;
}
