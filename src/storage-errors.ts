// Error messages, stacks, and even custom names can contain credentials or URLs.
// Log only known operation labels and known error categories.
const operations = new Set(["读取草稿", "保存草稿", "操作记录", "导入图片"]);
const errorNames = new Set([
  "Error",
  "TypeError",
  "SyntaxError",
  "TimeoutError",
  "UnknownError",
  "QuotaExceededError",
  "SecurityError",
  "NotAllowedError",
  "NotReadableError",
  "DataCloneError",
  "AbortError",
  "TransactionInactiveError",
  "InvalidStateError",
]);
export function storageErrorMessage(error: unknown, action: string): string {
  const rawName =
    error instanceof Error || error instanceof DOMException
      ? error.name
      : "UnknownError";
  const name = errorNames.has(rawName) ? rawName : "UnknownError";
  const operation = operations.has(action) ? action : "存储操作";
  console.error(`[IndexedDB/${operation}] ${name}`);
  const prefix = `${operation}失败`;
  switch (name) {
    case "QuotaExceededError":
      return `${prefix}：本机存储空间不足。请保留当前页面，导出重要图片后释放空间再重试。`;
    case "SecurityError":
    case "NotAllowedError":
      return `${prefix}：浏览器未允许本地存储，请检查 Safari 网站权限或隐私模式设置。`;
    case "NotReadableError":
      return `${prefix}：无法读取图片文件。请保留当前页面并重新选择该图片后重试。`;
    case "DataCloneError":
      return `${prefix}：浏览器无法序列化图片数据。请保留当前页面并导出图片后重试。`;
    case "AbortError":
    case "TransactionInactiveError":
    case "InvalidStateError":
      return `${prefix}：本地数据库连接或事务已中断，请重试；仍失败时请先导出图片再重新打开应用。`;
    default:
      return `${prefix}：本地数据库发生异常（${name}）。请保留当前页面，另存文案和图片后重试。`;
  }
}
