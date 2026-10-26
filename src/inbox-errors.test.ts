import { describe, expect, it } from "vitest";
import { InboxError, inboxErrorMessage } from "./inbox-errors";

describe("safe inbox errors", () => {
  it("preserves known actionable messages without reflecting exception text", () => {
    const error = new InboxError("integrity");
    error.message = "Authorization: Bearer synthetic-sensitive-marker";
    error.name = "synthetic-sensitive-marker";
    expect(inboxErrorMessage(error)).toBe("图片完整性校验失败，未导入。");
    expect(inboxErrorMessage(new InboxError("request", 503))).toBe(
      "云端请求失败（503），请稍后重试。",
    );
    expect(inboxErrorMessage(new InboxError("unauthorized", 401))).toBe(
      "查看凭据无效，请重新输入。",
    );
  });

  it("does not reflect native errors, response bodies or invalid status values", () => {
    expect(
      inboxErrorMessage(new SyntaxError("synthetic-sensitive-marker")),
    ).toBeUndefined();
    expect(
      inboxErrorMessage({
        message: "synthetic-sensitive-marker",
        code: "list",
      }),
    ).toBeUndefined();
    const error = new InboxError("request", Number.NaN);
    expect(inboxErrorMessage(error)).toBe("云端请求失败，请稍后重试。");
  });
});
