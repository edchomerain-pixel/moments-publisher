import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { zipSync } from "fflate";
import {
  repository,
  newDraft,
  draftTitle,
  matches,
  duplicate,
  movePhoto,
  type Draft,
  type Photo,
} from "./model";
import "./style.css";
import { storageErrorMessage } from "./storage-errors";
import { prepareSharing, preparationMessage } from "./share-preparation";
function PhotoView({ photo }: { photo: Photo }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(photo.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo.blob]);
  return <img src={url} alt={photo.name} />;
}
function App() {
  const [drafts, setDrafts] = useState<Draft[]>([]),
    [current, setCurrent] = useState<Draft | null>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [dirty, setDirty] = useState(false),
    [help, setHelp] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    copyInput = useRef<HTMLTextAreaElement>(null);
  const notify = (s: string) => setMessage(s);
  useEffect(() => {
    // Retire only the old connection credential; album records stay intact.
    try {
      localStorage.removeItem("bashang:inbox-connection:v1");
    } catch {
      /* Storage may be unavailable. */
    }
    repository
      .all()
      .then(setDrafts)
      .catch((error) => notify(storageErrorMessage(error, "读取草稿")))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function edit(d: Draft) {
    if (busy) return;
    if (dirty && !confirm("有尚未保存的修改，确定放弃吗？")) return;
    setCurrent(d);
    setDirty(false);
    window.scrollTo(0, 0);
  }
  function update(p: Partial<Draft>) {
    setCurrent((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
  }
  async function persist(d: Draft) {
    await repository.save(d);
    setDrafts((existing) =>
      [d, ...existing.filter((item) => item.id !== d.id)].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    );
  }
  async function save() {
    if (!current) return;
    if (!current.photos.length && !current.copy.trim()) {
      notify("请添加图片或填写朋友圈文案后再保存。");
      return;
    }
    setBusy(true);
    try {
      const d = {
        ...current,
        updatedAt: Date.now(),
      };
      await persist(d);
      setCurrent(d);
      setDirty(false);
      notify("草稿已保存到此设备。");
      void navigator.storage?.persist?.().catch(() => {});
    } catch (error) {
      notify(storageErrorMessage(error, "保存草稿"));
    } finally {
      setBusy(false);
    }
  }
  async function addPhotos(files: FileList | null) {
    if (!current || !files) return;
    const remaining = 9 - current.photos.length;
    const selected = Array.from(files);
    if (selected.length > remaining) {
      notify(`每条最多 9 张，本次只添加前 ${remaining} 张。`);
    }
    setBusy(true);
    try {
      const photos: Photo[] = [];
      for (const file of selected.slice(0, remaining)) {
        if (!file.type.startsWith("image/")) {
          notify("请选择图片文件。");
          continue;
        }
        if (file.size > 25 * 1024 * 1024) {
          notify("单张图片不能超过 25MB，请先缩小图片。");
          continue;
        }
        await new Promise<void>((resolve, reject) => {
          const url = URL.createObjectURL(file),
            img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("decode"));
          };
          img.src = url;
        });
        photos.push({ id: crypto.randomUUID(), name: file.name, blob: file });
      }
      update({ photos: [...current.photos, ...photos] });
    } catch {
      notify("部分图片无法读取，请在相册中转换为 JPEG 或 PNG 后重试。");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function copyText() {
    if (!current?.copy) {
      notify("请先填写文案。");
      return;
    }
    try {
      await navigator.clipboard.writeText(current.copy);
      notify("文案已复制，请打开微信朋友圈粘贴。");
    } catch {
      copyInput.current?.focus();
      copyInput.current?.select();
      notify("自动复制不可用，已选中文案，请长按复制。");
    }
  }
  function imageFiles() {
    return current!.photos.map(
      (p, i) =>
        new File(
          [p.blob],
          `${String(i + 1).padStart(2, "0")}-${p.name.replace(/[\\/]/g, "_")}`,
          {
            type: p.blob.type,
          },
        ),
    );
  }
  async function share() {
    const files = imageFiles();
    try {
      if (!navigator.canShare?.({ files }) || !navigator.share) {
        notify("此浏览器不支持图片分享，请使用「导出图片 ZIP」。");
        return;
      }
      await navigator.share({ files });
      notify("分享菜单已关闭。");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        notify("分享未完成，请尝试导出图片。");
    }
  }
  async function prepareShare() {
    if (!current || busy || (!current.photos.length && !current.copy.trim()))
      return;
    const files = imageFiles();
    setBusy(true);
    notify(
      "正在准备分享。请在 iPhone 分享菜单中选择「存储图像」（若提供），保存需要你确认。",
    );
    try {
      // No awaited save, file conversion or clipboard work before opening share.
      const result = await prepareSharing(current.copy, files, {
        clipboard: navigator.clipboard,
        canShare: navigator.canShare?.bind(navigator),
        share: navigator.share?.bind(navigator),
      });
      notify(preparationMessage(result));
      if (result.copy === "failed") {
        copyInput.current?.focus();
        copyInput.current?.select();
      }
    } finally {
      setBusy(false);
    }
  }
  async function exportImages() {
    setBusy(true);
    try {
      const entries: Record<string, Uint8Array> = {};
      for (const file of imageFiles())
        entries[file.name] = new Uint8Array(await file.arrayBuffer());
      const data = zipSync(entries, { level: 0 });
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(data)], { type: "application/zip" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "相册图片.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      notify("已导出 ZIP，在「文件」中解压后可将图片存入相册。");
    } catch {
      notify("导出失败，请尝试减少图片大小。");
    } finally {
      setBusy(false);
    }
  }
  async function action(d: Draft, type: "copy" | "delete") {
    if (
      type === "delete" &&
      !confirm(`删除「${draftTitle(d)}」及其图片？无法撤销。`)
    )
      return;
    setBusy(true);
    try {
      if (type === "delete") {
        await repository.remove(d.id);
        setDrafts((existing) => existing.filter((item) => item.id !== d.id));
      } else await persist(duplicate(d));
      notify(type === "copy" ? "已创建副本。" : "记录已删除。");
    } catch (error) {
      notify(storageErrorMessage(error, "操作记录"));
    } finally {
      setBusy(false);
    }
  }
  function back() {
    if (busy) return;
    if (!dirty || confirm("放弃尚未保存的修改？")) {
      setCurrent(null);
      setDirty(false);
    }
  }
  const visible = drafts.filter((d) => matches(d, query));
  return (
    <>
      <header>
        <a
          className="logo"
          href="./"
          onClick={(e) => {
            e.preventDefault();
            back();
          }}
        >
          <img
            className="brand-logo"
            src={`${import.meta.env.BASE_URL}icons/bashang-24e3ccde-192.png`}
            width="44"
            height="44"
            alt=""
          />
          <span>巴商相册</span>
        </a>
        <button className="quiet" onClick={() => setHelp(!help)}>
          使用指南 ↗
        </button>
      </header>
      <main>
        {help && (
          <aside className="help">
            <strong>图片与文案，随手整理。</strong>
            <p>
              添加图片、写好朋友圈文案，保存到本机。需要时可复制文字、分享图片或导出
              ZIP。
            </p>
            <p>
              Safari 分享按钮
              →「添加到主屏幕」即可安装。首次联网加载后可离线使用。清除网站数据可能丢失记录，请另存重要图片和文案。
            </p>
          </aside>
        )}
        {message && (
          <div className="notice" role="status">
            {message}
            <button aria-label="关闭提示" onClick={() => setMessage("")}>
              ×
            </button>
          </div>
        )}
        {!current ? (
          <>
            <section className="hero">
              <div className="eyebrow">PHOTOS & WORDS</div>
              <h1>
                收藏图片，
                <br />
                <em>留住灵感。</em>
              </h1>
              <p>把商品图片与朋友圈文案放在一起，随时查看、随手分享。</p>
              <button
                className="primary"
                disabled={busy || loading}
                onClick={() => edit(newDraft())}
              >
                ＋ 新建记录
              </button>
              <span className="local">◉ 本机相册 · 自行添加图片</span>
            </section>
            <section className="library">
              <div className="section-title">
                <h2>
                  我的相册 <span>{drafts.length}</span>
                </h2>
                <span>按最近更新排序</span>
              </div>
              <label className="search">
                <span>⌕</span>
                <input
                  aria-label="搜索记录"
                  placeholder="搜索朋友圈文案或图片文件名"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {loading ? (
                <p>正在读取本地记录…</p>
              ) : visible.length === 0 ? (
                <div className="empty">
                  <span>▧</span>
                  <h3>
                    {query
                      ? "没有找到符合条件的记录"
                      : "第一份图片与文案，从这里开始"}
                  </h3>
                  <p>添加商品图片，写下你想分享的文字。</p>
                  {!query && (
                    <button onClick={() => edit(newDraft())}>
                      ＋ 创建第一份记录
                    </button>
                  )}
                </div>
              ) : (
                <div className="cards">
                  {visible.map((d) => (
                    <article key={d.id} className="card">
                      <button
                        className="cover"
                        onClick={() => edit(d)}
                        aria-label={`编辑 ${draftTitle(d)}`}
                        disabled={busy}
                      >
                        {d.photos[0] ? (
                          <PhotoView photo={d.photos[0]} />
                        ) : (
                          <span>暂无图片</span>
                        )}
                        <span className="count">{d.photos.length} 张</span>
                      </button>
                      <div className="card-body">
                        <button
                          className="card-name"
                          disabled={busy}
                          onClick={() => edit(d)}
                        >
                          {draftTitle(d)}
                        </button>
                        <p className="copy-preview">{d.copy || "仅图片记录"}</p>
                        <small className="record-date">
                          {new Date(d.updatedAt).toLocaleDateString("zh-CN")}
                        </small>
                        <div className="card-actions">
                          <button
                            disabled={busy}
                            onClick={() => action(d, "copy")}
                          >
                            创建副本
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => action(d, "delete")}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <div className="editor-heading">
              <button className="quiet" onClick={back}>
                ← 返回相册
              </button>
              <span>
                {dirty
                  ? "有未保存修改"
                  : drafts.some((d) => d.id === current.id)
                    ? "已保存"
                    : "新记录"}
              </span>
            </div>
            <section className="share-shortcut" aria-label="半自动分享">
              <button
                className="primary wide"
                disabled={
                  busy || (!current.photos.length && !current.copy.trim())
                }
                onClick={() => void prepareShare()}
              >
                一键分享准备
              </button>
              <p>
                复制文案并打开图片分享菜单。请在 iPhone
                菜单中选择「存储图像」（若提供），再手动打开微信朋友圈。保存图片需要你确认，不会自动写入相册。
              </p>
              {dirty && <small>当前修改尚未保存，建议先点「保存记录」。</small>}
            </section>
            <fieldset disabled={busy} className="editor-layout">
              <div>
                <section className="panel">
                  <h2>
                    <span>01</span> 商品图片{" "}
                    <small>{current.photos.length} / 9</small>
                  </h2>
                  <p className="muted">相册多选，使用左右按钮调整图片顺序。</p>
                  <div className="photos">
                    {current.photos.map((p, i) => (
                      <div key={p.id} className="photo">
                        <PhotoView photo={p} />
                        <span className="photo-number">{i + 1}</span>
                        <button
                          className="remove"
                          aria-label={`删除第${i + 1}张图片`}
                          disabled={busy}
                          onClick={() =>
                            update({
                              photos: current.photos.filter(
                                (x) => x.id !== p.id,
                              ),
                            })
                          }
                        >
                          ×
                        </button>
                        <div className="reorder">
                          <button
                            aria-label={`前移第${i + 1}张图片`}
                            disabled={busy || i === 0}
                            onClick={() =>
                              update({
                                photos: movePhoto(current.photos, i, -1),
                              })
                            }
                          >
                            ←
                          </button>
                          <button
                            aria-label={`后移第${i + 1}张图片`}
                            disabled={busy || i === current.photos.length - 1}
                            onClick={() =>
                              update({
                                photos: movePhoto(current.photos, i, 1),
                              })
                            }
                          >
                            →
                          </button>
                        </div>
                      </div>
                    ))}
                    {current.photos.length < 9 && (
                      <button
                        className="add-photo"
                        disabled={busy}
                        onClick={() => fileInput.current?.click()}
                      >
                        <b>＋</b>添加图片
                      </button>
                    )}
                  </div>
                  <input
                    hidden
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => void addPhotos(e.target.files)}
                  />
                  <div className="export-actions">
                    <button
                      disabled={!current.photos.length || busy}
                      onClick={() => void share()}
                    >
                      分享图片 ↗
                    </button>
                    <button
                      disabled={!current.photos.length || busy}
                      onClick={() => void exportImages()}
                    >
                      导出图片 ZIP ↓
                    </button>
                  </div>
                </section>
              </div>
              <div>
                <section className="panel">
                  <h2>
                    <span>02</span>朋友圈文案
                  </h2>
                  <textarea
                    ref={copyInput}
                    className="copy-editor"
                    aria-label="朋友圈文案"
                    value={current.copy}
                    placeholder="写下或粘贴朋友圈文案…"
                    onChange={(e) => update({ copy: e.target.value })}
                  />
                  <div className="text-count">
                    {current.copy.length} 字 · 手动编辑
                  </div>
                  <button
                    className="primary wide"
                    onClick={() => void copyText()}
                  >
                    复制朋友圈文案
                  </button>
                </section>
              </div>
            </fieldset>
            <div className="save-bar">
              <span>
                {busy
                  ? "处理中…"
                  : dirty
                    ? "修改尚未保存"
                    : "图片与文案，仅在本机"}
              </span>
              <button
                disabled={busy}
                className="primary"
                onClick={() => void save()}
              >
                保存记录
              </button>
            </div>
          </>
        )}
        <footer>
          巴商相册 <span>图片与文案 · 随手整理</span>
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
