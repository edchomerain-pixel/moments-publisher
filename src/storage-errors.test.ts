import { afterEach, describe, expect, it, vi } from "vitest";
import { storageErrorMessage } from "./storage-errors";

afterEach(() => vi.restoreAllMocks());
describe("存储异常提示", () => {
  it("只对配额异常提示空间不足，并保留底层错误名称", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      storageErrorMessage(
        new DOMException("quota", "QuotaExceededError"),
        "保存草稿",
      ),
    ).toContain("存储空间不足");
    expect(
      storageErrorMessage(
        new DOMException("clone", "DataCloneError"),
        "保存草稿",
      ),
    ).toContain("无法序列化");
    expect(
      storageErrorMessage(
        new DOMException("denied", "SecurityError"),
        "读取草稿",
      ),
    ).toContain("未允许本地存储");
    expect(
      storageErrorMessage(
        new DOMException("inactive", "TransactionInactiveError"),
        "保存草稿",
      ),
    ).toContain("事务已中断");
    expect(
      storageErrorMessage(new Error("unexpected"), "保存草稿"),
    ).not.toContain("空间不足");
    expect(log).toHaveBeenCalledWith("[IndexedDB/保存草稿] Error: unexpected");
  });
});
