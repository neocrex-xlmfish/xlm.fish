// Simple JSON cache with TTL and optional stale-while-revalidate
(function () {
  const NS = 'cache:';

  function get(key) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function set(key, data) {
    try { localStorage.setItem(NS + key, JSON.stringify({ ts: Date.now(), data })); } catch {}
  }
  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
    return res.json();
  }

  // cachedJSON(url, { ttlMs, staleWhileRevalidate })
  async function cachedJSON(url, { ttlMs = 60_000, staleWhileRevalidate = true } = {}) {
    const entry = get(url);
    const fresh = entry && (Date.now() - entry.ts < ttlMs);

    if (fresh) return entry.data;

    if (entry && staleWhileRevalidate) {
      fetchJSON(url).then(d => set(url, d)).catch(() => {});
      return entry.data;
    }

    const data = await fetchJSON(url);
    set(url, data);
    return data;
  }

  window.cachedJSON = cachedJSON;
})();