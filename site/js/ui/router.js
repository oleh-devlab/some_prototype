// Hash-маршрути: працюють на будь-якому статичному хостингу й у підкаталозі без налаштувань сервера.
//   #/my?date=2026-09-28&view=week
//   #/rooms, #/rooms/<ключ>?date=…&view=…
//   #/teachers, #/teachers/<ключ>?date=…&view=…
//   #/settings, #/settings/group, #/settings/external[/<ключ викладача>]
//   #/setup, #/setup/options
//   #/issues — відомі проблеми прототипу

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(safeDecode);
  return { name: parts[0] ?? '', params: parts.slice(1), query: Object.fromEntries(new URLSearchParams(query)) };
}

function safeDecode(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export function href(name, params = [], query = {}) {
  const path = [name, ...params.map((p) => encodeURIComponent(p))].join('/');
  const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString();
  return `#/${path}${q ? `?${q}` : ''}`;
}

export function go(hash, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}
