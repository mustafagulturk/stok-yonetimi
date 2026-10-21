const TOKEN_KEY = "depom.token";

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string[]>;
  constructor(status: number, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string | null) => {
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* gizli sekme */ }
  },
};

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
  }

  if (res.status === 401 && token) onUnauthorized();
  if (res.status === 204) return undefined as T;

  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) {
    const fields = data?.errors as Record<string, string[]> | undefined;
    const first = fields ? Object.values(fields)[0]?.[0] : undefined;
    const message = res.status === 403 ? "Bu işlem için yetkiniz yok." : first ?? data?.title ?? `İstek başarısız (${res.status}).`;
    throw new ApiError(res.status, message, fields);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: (path: string) => request<void>("DELETE", path),
};

/** Yetkili CSV indirme: token başlıkta gittiği için düz link yerine blob olarak indirilir. */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) throw new ApiError(res.status, "Dosya indirilemedi.");
  const name = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(res.headers.get("content-disposition") ?? "")?.[1];
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name ? decodeURIComponent(name) : fallbackName });
  a.click();
  URL.revokeObjectURL(url);
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}
