import { inboxEndpoint } from "./cloud-inbox";
const key = "bashang:inbox-connection:v1";
export type Connection = { endpoint: string; token: string };
export function readConnection(): Connection | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (!value || typeof value.token !== "string" || !value.token.trim())
      return null;
    return { endpoint: inboxEndpoint(value.endpoint), token: value.token };
  } catch {
    return null;
  }
}
export function saveConnection(value: Connection) {
  localStorage.setItem(
    key,
    JSON.stringify({
      endpoint: inboxEndpoint(value.endpoint),
      token: value.token,
    }),
  );
  window.dispatchEvent(new Event("album-connection"));
}
export function clearConnection() {
  localStorage.removeItem(key);
  window.dispatchEvent(new Event("album-connection"));
}
