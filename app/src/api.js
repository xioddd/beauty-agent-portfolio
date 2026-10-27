const configuredBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
export const apiBase = configuredBase.replace(/\/+$/, '');

export function apiUrl(path) {
  if (!apiBase) return path;
  return `${apiBase}/${path.replace(/^\/+/, '')}`;
}

export function mediaUrl(path) {
  if (!path || !path.startsWith('/api/')) return path;
  return apiUrl(path);
}

export function apiFetch(path, options) {
  return fetch(apiUrl(path), options);
}
