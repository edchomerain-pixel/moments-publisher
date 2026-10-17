// Keep diagnostics useful without logging product details or image contents.
export function storageErrorMessage(error: unknown, action: string): string {
  const name =
    error instanceof Error || error instanceof DOMException
      ? error.name
      : "UnknownError";
  const detail =
    error instanceof Error || error instanceof DOMException
      ? error.message
      : "Unknown storage failure";
  console.error(`[IndexedDB/${action}] ${name}: ${detail}`);
  const prefix = `${action}失败`;
  switch (name) {
    case "QuotaExceededError":
      return `${prefix}：本机存储空间不足。请保留当前页面，导出重要图片后释放空间再重试。`;
    case "SecurityError":
    case "NotAllowedError":
      return `${prefix}：浏览器未允许本地存储，请检查 Safari 网站权限或隐私模式设置。`;
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
