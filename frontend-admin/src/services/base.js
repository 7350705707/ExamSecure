/** Base fetch wrapper — mirrors AI-agent-with-RAG services/base.js */
const BASE = import.meta.env.VITE_API_URL || '';

export function getToken() {
  return localStorage.getItem('exam_admin_token') || '';
}
export function setToken(t) {
  localStorage.setItem('exam_admin_token', t);
}
export function clearToken() {
  localStorage.removeItem('exam_admin_token');
  localStorage.removeItem('exam_admin_user');
}
export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('exam_admin_user') || 'null'); }
  catch { return null; }
}
export function setStoredUser(u) {
  localStorage.setItem('exam_admin_user', JSON.stringify(u));
}

export function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function request(method, path, body = null, isForm = false) {
  const headers = { ...authHeaders() };
  let bodyPayload = undefined;

  if (body && !isForm) {
    headers['Content-Type'] = 'application/json';
    bodyPayload = JSON.stringify(body);
  } else if (body && isForm) {
    bodyPayload = body; // FormData
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: bodyPayload,
  });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    return;
  }

  // 204 No Content — no body to parse (e.g. DELETE endpoints)
  if (res.status === 204) return null;

  const data = res.headers.get('content-type')?.includes('json')
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const msg = typeof data === 'object' ? (data.detail || JSON.stringify(data)) : data;
    throw new Error(msg);
  }
  return data;
}
