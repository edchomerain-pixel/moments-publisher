// Only application-owned messages may reach the inbox UI. Never display a
// response body, native exception message, URL, header, or secret value.
const messages = {
  endpoint: "请输入 HTTPS 云端服务根地址，不要包含路径、密钥或参数。",
  unauthorized: "查看凭据无效，请重新输入。",
  request: "云端请求失败，请稍后重试。",
  list: "云端数据格式不正确。",
  mismatch: "图片大小或格式不匹配，未导入。",
  integrity: "图片完整性校验失败，未导入。",
  decode: "图片无法解码，未导入。",
  selection: "每次请选择 1 至 9 张图片。",
};
type InboxErrorCode = keyof typeof messages;

export class InboxError extends Error {
  constructor(
    readonly code: InboxErrorCode,
    readonly status?: number,
  ) {
    super(messages[code]);
    this.name = "InboxError";
  }
}

export function inboxErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof InboxError) || !Object.hasOwn(messages, error.code))
    return undefined;
  const status = error.status;
  if (
    error.code === "request" &&
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
  )
    return `云端请求失败（${status}），请稍后重试。`;
  return messages[error.code];
}
