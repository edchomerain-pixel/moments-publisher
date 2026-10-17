import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { zipSync } from "fflate";
import {
  repository,
  newDraft,
  generateCopy,
  matches,
  duplicate,
  movePhoto,
  type Draft,
  type Photo,
} from "./model";
import "./style.css";
import { storageErrorMessage } from "./storage-errors";
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
    [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [dirty, setDirty] = useState(false),
    [help, setHelp] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    copyInput = useRef<HTMLTextAreaElement>(null);
  const notify = (s: string) => setMessage(s);
  useEffect(() => {
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
    if (!current.name.trim()) {
      notify("请先填写商品名称。");
      return;
    }
    if (
      current.price &&
      (!Number.isFinite(Number(current.price)) || Number(current.price) < 0)
    ) {
      notify("请输入有效的非负价格。");
      return;
    }
    setBusy(true);
    try {
      const d = {
        ...current,
        copy: current.copy || generateCopy(current),
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
      notify("请先生成或填写文案。");
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
      notify("分享菜单已关闭。完成朋友圈发布后，请手动标记已发布。");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        notify("分享未完成，请尝试导出图片。");
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
      a.download = "商品图片.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      notify("已导出 ZIP，在「文件」中解压后可将图片存入相册。");
    } catch {
      notify("导出失败，请尝试减少图片大小。");
    } finally {
      setBusy(false);
    }
  }
  async function action(d: Draft, type: "copy" | "delete" | "status") {
    if (type === "delete" && !confirm(`删除「${d.name}」及其图片？无法撤销。`))
      return;
    setBusy(true);
    try {
      if (type === "delete") {
        await repository.remove(d.id);
        setDrafts((existing) => existing.filter((item) => item.id !== d.id));
      } else
        await persist(
          type === "copy"
            ? duplicate(d)
            : {
                ...d,
                status: d.status === "pending" ? "published" : "pending",
                updatedAt: Date.now(),
              },
        );
      notify(
        type === "copy"
          ? "已复制为待发布草稿。"
          : type === "delete"
            ? "草稿已删除。"
            : "发布状态已更新。",
      );
    } catch (error) {
      notify(storageErrorMessage(error, "操作草稿"));
    } finally {
      setBusy(false);
    }
  }
  const visible = drafts.filter((d) => matches(d, query, filter));
  return (
    <>
      <header>
        <a
          className="logo"
          href="./"
          onClick={(e) => {
            e.preventDefault();
            if (busy) return;
            if (!dirty || confirm("放弃尚未保存的修改？")) {
              setCurrent(null);
              setDirty(false);
            }
          }}
        >
          <span className="logo-icon">拾</span>
          <span>
            拾光<small>MOMENTS STUDIO</small>
          </span>
        </a>
        <button className="quiet" onClick={() => setHelp(!help)}>
          使用指南 ↗
        </button>
      </header>
      <main>
        {help && (
          <aside className="help">
            <strong>把好物，分享给对的人。</strong>
            <p>
              Safari 分享按钮
              →「添加到主屏幕」即可安装。先保存草稿，再复制文案、分享或导出图片，最后手动打开微信发布。
            </p>
            <p>
              草稿仅保存在当前设备和浏览器，清除网站数据会丢失。建议导出重要图片并另存文案。首次联网打开后可离线使用。
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
              <div className="eyebrow">YOUR DAILY CURATION</div>
              <h1>
                好物有序，
                <br />
                <em>分享从容。</em>
              </h1>
              <p>从商品草稿到朋友圈，让每一次分享都恰到好处。</p>
              <button className="primary" onClick={() => edit(newDraft())}>
                ＋ 新建商品
              </button>
              <span className="local">◉ 仅本机保存 · 无需登录</span>
            </section>
            <section className="library">
              <div className="section-title">
                <h2>
                  商品草稿箱 <span>{drafts.length}</span>
                </h2>
                <span>按最近更新排序</span>
              </div>
              <label className="search">
                <span>⌕</span>
                <input
                  aria-label="搜索商品"
                  placeholder="搜索品牌、商品、货号或备注"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="tabs">
                {[
                  ["all", "全部"],
                  ["pending", "待发布"],
                  ["published", "已发布"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={filter === id ? "active" : ""}
                    aria-pressed={filter === id}
                    onClick={() => setFilter(id)}
                  >
                    {label}{" "}
                    <small>
                      {
                        drafts.filter((d) => id === "all" || d.status === id)
                          .length
                      }
                    </small>
                  </button>
                ))}
              </div>
              {loading ? (
                <p>正在读取本地草稿…</p>
              ) : visible.length === 0 ? (
                <div className="empty">
                  <span>▧</span>
                  <h3>
                    {query || filter !== "all"
                      ? "没有找到符合条件的商品"
                      : "第一件好物，从这里开始"}
                  </h3>
                  <p>添加商品信息与图片，准备属于你的朋友圈。</p>
                  {!query && filter === "all" && (
                    <button onClick={() => edit(newDraft())}>
                      ＋ 创建第一份草稿
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
                        aria-label={`编辑 ${d.name}`}
                      >
                        {d.photos[0] ? (
                          <PhotoView photo={d.photos[0]} />
                        ) : (
                          <span>暂无图片</span>
                        )}
                        <span className={`badge ${d.status}`}>
                          {d.status === "pending" ? "待发布" : "已发布"}
                        </span>
                        <span className="count">{d.photos.length} 张</span>
                      </button>
                      <div className="card-body">
                        <small className="brand">
                          {d.brand || "未填写品牌"}
                        </small>
                        <button className="card-name" onClick={() => edit(d)}>
                          {d.name}
                        </button>
                        <p>
                          {d.sku || "无货号"}
                          {d.size && ` · ${d.size}`}
                        </p>
                        <strong>
                          {d.price
                            ? `¥${Number(d.price).toLocaleString("zh-CN")}`
                            : "价格待定"}
                        </strong>
                        <div className="card-actions">
                          <button
                            disabled={busy}
                            onClick={() => action(d, "status")}
                          >
                            {d.status === "pending"
                              ? "标记已发布"
                              : "改为待发布"}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => action(d, "copy")}
                          >
                            复制
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
              <button
                className="quiet"
                onClick={() => {
                  if (busy) return;
                  if (!dirty || confirm("放弃尚未保存的修改？")) {
                    setCurrent(null);
                    setDirty(false);
                  }
                }}
              >
                ← 返回草稿箱
              </button>
              <span>{dirty ? "有未保存修改" : "已保存 / 新草稿"}</span>
            </div>
            <h1 className="editor-title">
              {drafts.some((d) => d.id === current.id)
                ? "编辑商品"
                : "记录一件好物"}
            </h1>
            <fieldset disabled={busy} className="editor-layout">
              <div>
                <section className="panel">
                  <h2>
                    <span>01</span> 商品信息
                  </h2>
                  <div className="fields">
                    {(
                      [
                        ["brand", "品牌", "如 CHANEL"],
                        ["name", "商品名称 *", "如 经典双翻盖手袋"],
                        ["sku", "货号", "如 A01112"],
                        ["size", "尺码", "如 Medium / 38"],
                        ["price", "价格（人民币）", "如 26800"],
                      ] as const
                    ).map(([key, label, placeholder]) => (
                      <label key={key}>
                        {label}
                        <input
                          maxLength={160}
                          type={key === "price" ? "number" : "text"}
                          min={key === "price" ? 0 : undefined}
                          step={key === "price" ? "0.01" : undefined}
                          inputMode={key === "price" ? "decimal" : undefined}
                          value={current[key]}
                          placeholder={placeholder}
                          onChange={(e) => update({ [key]: e.target.value })}
                        />
                      </label>
                    ))}
                    <label className="full">
                      备注
                      <textarea
                        maxLength={3000}
                        value={current.notes}
                        placeholder="成色、颜色、配件等，请填写真实商品信息"
                        onChange={(e) => update({ notes: e.target.value })}
                      />
                    </label>
                  </div>
                </section>
                <section className="panel">
                  <h2>
                    <span>02</span> 商品图片{" "}
                    <small>{current.photos.length} / 9</small>
                  </h2>
                  <p className="muted">相册多选，使用左右按钮调整发布顺序。</p>
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
                </section>
              </div>
              <div>
                <section className="panel">
                  <h2>
                    <span>03</span> 朋友圈文案
                  </h2>
                  <button
                    className="generate"
                    onClick={() => {
                      if (
                        !current.copy ||
                        confirm("重新生成将替换当前文案，继续吗？")
                      )
                        update({ copy: generateCopy(current) });
                    }}
                  >
                    ✧ 根据商品信息生成
                  </button>
                  <textarea
                    ref={copyInput}
                    className="copy-editor"
                    aria-label="朋友圈文案"
                    value={current.copy}
                    placeholder="点击生成，也可以直接在这里书写…"
                    onChange={(e) => update({ copy: e.target.value })}
                  />
                  <div className="text-count">
                    {current.copy.length} 字 · 可自由编辑
                  </div>
                </section>
                <section className="panel prepare">
                  <h2>
                    <span>04</span> 发布准备
                  </h2>
                  <p className="muted">
                    复制文案 → 保存图片 → 手动到朋友圈发布
                  </p>
                  <button
                    className="primary wide"
                    onClick={() => void copyText()}
                  >
                    复制朋友圈文案
                  </button>
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
                  <label className="status-select">
                    发布状态
                    <select
                      value={current.status}
                      onChange={(e) =>
                        update({ status: e.target.value as Draft["status"] })
                      }
                    >
                      <option value="pending">待发布</option>
                      <option value="published">已发布</option>
                    </select>
                  </label>
                  <p className="fine">分享不会自动发布，也不会自动更改状态。</p>
                </section>
              </div>
            </fieldset>
            <div className="save-bar">
              <span>
                {busy
                  ? "处理中…"
                  : dirty
                    ? "修改尚未保存"
                    : "本地草稿，安心整理"}
              </span>
              <button
                disabled={busy}
                className="primary"
                onClick={() => void save()}
              >
                保存草稿
              </button>
            </div>
          </>
        )}
        <footer>
          拾光 MOMENTS STUDIO <span>用心整理 · 自在分享</span>
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
