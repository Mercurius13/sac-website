/* All api routes and errors handled here*/
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(body?.error || res.statusText || `Request failed (${res.status})`, res.status);
  }
  return body;
}

export const api = {
  session: () => request('/api/session'),
  login: (password) => request('/api/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request('/api/logout', { method: 'POST' }),
  content: () => request('/api/content'),
  media: () => request('/api/media'),
  deleteMedia: (path) => request('/api/media/delete', { method: 'POST', body: JSON.stringify({ path }) }),
  publish: (payload) => request('/api/publish', { method: 'POST', body: JSON.stringify(payload) }),

  async upload(file) {
    const form = new FormData();
    form.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(body?.error || 'Upload failed', res.status);
    return body;
  },
};
