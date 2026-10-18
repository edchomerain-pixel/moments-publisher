import { describe, expect, it, vi } from "vitest";
import { preparationMessage, prepareSharing } from "./share-preparation";
const files = [new File(["image"], "01-image.png", { type: "image/png" })];
describe("半自动分享", () => {
  it("不等待剪贴板 Promise，立即在同一次调用中打开文件分享", async () => {
    const calls: string[] = [];
    let finishCopy!: () => void;
    const clipboard = {
      writeText: vi.fn(() => {
        calls.push("copy");
        return new Promise<void>((resolve) => {
          finishCopy = resolve;
        });
      }),
    };
    const share = vi.fn(async (data: ShareData) => {
      calls.push("share");
      expect(data).toEqual({ files });
    });
    const pending = prepareSharing("原始文案\n第二行", files, {
      clipboard,
      canShare: () => true,
      share,
    });
    expect(calls).toEqual(["copy", "share"]);
    expect(clipboard.writeText).toHaveBeenCalledWith("原始文案\n第二行");
    finishCopy();
    expect(await pending).toEqual({ copy: "copied", images: "shared" });
    expect(preparationMessage(await pending)).toContain(
      "应用无法确认图片是否保存",
    );
  });
  it("剪贴板被拒绝不会阻止图片分享", async () => {
    const share = vi.fn(async () => {});
    const result = await prepareSharing("文案", files, {
      clipboard: {
        writeText: async () => {
          throw new DOMException("denied", "NotAllowedError");
        },
      },
      canShare: () => true,
      share,
    });
    expect(share).toHaveBeenCalledOnce();
    expect(result).toEqual({ copy: "failed", images: "shared" });
    expect(preparationMessage(result)).toContain("文案未能自动复制");
  });
  it("图片不支持、取消和失败都保留真实复制结果", async () => {
    const clipboard = { writeText: vi.fn(async () => {}) };
    const share = vi.fn(async () => {
      throw new DOMException("cancel", "AbortError");
    });
    expect(
      await prepareSharing("文案", files, {
        clipboard,
        canShare: () => false,
        share,
      }),
    ).toEqual({ copy: "copied", images: "unsupported" });
    expect(share).not.toHaveBeenCalled();
    expect(
      await prepareSharing("文案", files, {
        clipboard,
        canShare: () => true,
        share,
      }),
    ).toEqual({ copy: "copied", images: "cancelled" });
    expect(
      await prepareSharing("文案", files, {
        clipboard,
        canShare: () => true,
        share: async () => {
          throw new DOMException("denied", "NotAllowedError");
        },
      }),
    ).toEqual({ copy: "copied", images: "failed" });
  });
  it("同步异常、缺失 API 及纯图片或纯文案均有降级结果", async () => {
    expect(await prepareSharing("文案", files, {})).toEqual({
      copy: "failed",
      images: "unsupported",
    });
    expect(
      await prepareSharing("文案", files, {
        clipboard: {
          writeText: () => {
            throw new Error("sync");
          },
        },
        canShare: () => {
          throw new Error("sync");
        },
        share: async () => {},
      }),
    ).toEqual({ copy: "failed", images: "failed" });
    const clipboard = { writeText: vi.fn(async () => {}) };
    expect(await prepareSharing("文案", [], { clipboard })).toEqual({
      copy: "copied",
      images: "empty",
    });
    expect(
      await prepareSharing("", files, {
        clipboard,
        canShare: () => true,
        share: async () => {},
      }),
    ).toEqual({ copy: "empty", images: "shared" });
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
  });
});
