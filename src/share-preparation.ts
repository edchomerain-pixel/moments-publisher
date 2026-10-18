export type CopyOutcome = "copied" | "empty" | "failed";
export type ImageOutcome =
  "shared" | "cancelled" | "unsupported" | "empty" | "failed";
export interface SharePreparationResult {
  copy: CopyOutcome;
  images: ImageOutcome;
}
interface ShareCapabilities {
  clipboard?: Pick<Clipboard, "writeText">;
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}

// Invoke BOTH native APIs synchronously in the original click handler. Awaiting
// clipboard first can lose Safari's transient user activation for file sharing.
export function prepareSharing(
  text: string,
  files: File[],
  browser: ShareCapabilities,
): Promise<SharePreparationResult> {
  let copying: Promise<CopyOutcome>;
  try {
    copying = !text.trim()
      ? Promise.resolve("empty")
      : browser.clipboard
        ? browser.clipboard.writeText(text).then(
            () => "copied" as const,
            () => "failed" as const,
          )
        : Promise.resolve("failed");
  } catch {
    copying = Promise.resolve("failed");
  }

  let sharing: Promise<ImageOutcome>;
  try {
    const data: ShareData = { files };
    sharing = !files.length
      ? Promise.resolve("empty")
      : !browser.share || !browser.canShare?.(data)
        ? Promise.resolve("unsupported")
        : browser.share(data).then(
            () => "shared" as const,
            (error: unknown) =>
              error instanceof DOMException && error.name === "AbortError"
                ? ("cancelled" as const)
                : ("failed" as const),
          );
  } catch {
    sharing = Promise.resolve("failed");
  }
  return Promise.all([copying, sharing]).then(([copy, images]) => ({
    copy,
    images,
  }));
}

export function preparationMessage(result: SharePreparationResult): string {
  const copy =
    result.copy === "copied"
      ? "文案已复制。"
      : result.copy === "failed"
        ? "文案未能自动复制，请点击「复制朋友圈文案」重试或长按文案复制。"
        : "没有文案。";
  const images: Record<ImageOutcome, string> = {
    shared:
      "图片分享菜单已关闭。请确认你已在菜单中选择「存储图像」；应用无法确认图片是否保存。之后可手动打开微信朋友圈。",
    cancelled: "图片分享已取消，未确认保存。可点击「分享图片」重试。",
    unsupported:
      "此浏览器不支持图片分享，请使用「导出图片 ZIP」，解压后存入相册。",
    empty: "没有图片，仅处理文案。",
    failed: "图片分享未完成，请点击「分享图片」重试，或使用「导出图片 ZIP」。",
  };
  return copy + images[result.images];
}
