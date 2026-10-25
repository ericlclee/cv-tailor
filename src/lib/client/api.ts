// Tiny fetch wrapper for the app's JSON API. Throws with the server's message.
export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(url, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? (isForm ? (init.body as FormData) : JSON.stringify(init.body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}
