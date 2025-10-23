// Live market cards for index.html with sub-cent price, supply fallback, caching,
// and improved 24h volume by summing across all counter assets that have a pool.
(() => {
  const HORIZON = 'https://horizon.stellar.org';
  const ASSET_CODE = 'XLMFISH';
  const ASSET_ISSUER = 'GAX3YQC26LTS6NLW2QGRQC4MK24XKL5JLZ7KFHNERWPC3HKCT2ABTEMT';
  const FISH_ASSET = `${ASSET_CODE}:${ASSET_ISSUER}`;
  const TOTAL_SUPPLY = 1_000_000_000;

  const $ = id => document.getElementById(id);
  const num = v => typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;

  function fmtUsdPrice(n, max = 7) {
    if (n == null || !isFinite(n)) return '—';
    const s = n.toFixed(max).replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,'');
    return '$' + s;
  }
  function fmtUsd2(n) {
    if (n == null || !isFinite(n)) return '—';
    return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const useCache = typeof window.cachedJSON === 'function';
  const getJSON = async (url, opts) => useCache ? window.cachedJSON(url, opts) : (await fetch(url)).json();

  async function fetchAssetAmount() {
    const url = `${HORIZON}/assets?asset_code=${encodeURIComponent(ASSET_CODE)}&asset_issuer=${encodeURIComponent(ASSET_ISSUER)}&limit=1`;
    const data = await getJSON(url, { ttlMs: 10 * 60 * 1000 });
    const rec = data?._embedded?.records?.[0];
    return rec ? num(rec.amount) : null;
  }

  async function fetchXLMUSD() {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd';
    const data = await getJSON(url, { ttlMs: 60 * 1000 });
    return data?.stellar?.usd ?? null;
  }

  async function fetchFishPriceUsd() {
    // Price(XLMFISH in XLM) via 24h trade aggs (last close/avg), then * XLM/USD
    const params = new URLSearchParams({
      base_asset_type: 'credit_alphanum12',
      base_asset_code: ASSET_CODE,
      base_asset_issuer: ASSET_ISSUER,
      counter_asset_type: 'native',
      resolution: String(24 * 60 * 60 * 1000),
      limit: '1',
      order: 'desc'
    });
    const aggUrl = `${HORIZON}/trade_aggregations?${params}`;
    const aggData = await getJSON(aggUrl, { ttlMs: 60 * 1000 });
    const b = aggData?._embedded?.records?.[0];
    const pxXLM = b ? (num(b.close) || num(b.avg) || null) : null;
    const xlmUsd = await fetchXLMUSD();
    return (pxXLM != null && xlmUsd != null) ? pxXLM * xlmUsd : null;
  }

  async function fetchCounterAssetsFromPools() {
    // Discover counters from pools that contain XLMFISH (keeps request count minimal and relevant)
    const url = `${HORIZON}/liquidity_pools?reserves=${encodeURIComponent(FISH_ASSET)}&limit=200&order=asc`;
    const data = await getJSON(url, { ttlMs: 2 * 60 * 1000 });
    const records = data?._embedded?.records ?? [];
    const out = [];
    for (const rec of records) {
      for (const r of rec.reserves || []) {
        if (r.asset === FISH_ASSET) continue;
        if (r.asset === 'native') out.push({ type: 'native' });
        else {
          const [code, issuer] = String(r.asset).split(':');
          out.push({ type: code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12', code, issuer });
        }
      }
    }
    // unique by type/code/issuer
    const key = a => a.type + ':' + (a.code || '') + ':' + (a.issuer || '');
    const map = new Map();
    out.forEach(a => map.set(key(a), a));
    return Array.from(map.values());
  }

  async function fetch24hBaseVolumeAcrossPairs(counters) {
    // Sum base_volume (XLMFISH units) across all counter pairs over the last 24h
    const resMs = 60 * 60 * 1000; // hourly buckets
    const now = Date.now();
    const end = Math.floor(now / resMs) * resMs; // align to hour
    const start = end - 24 * resMs;

    let total = 0;
    for (const c of counters) {
      const params = new URLSearchParams({
        base_asset_type: 'credit_alphanum12',
        base_asset_code: ASSET_CODE,
        base_asset_issuer: ASSET_ISSUER,
        counter_asset_type: c.type,
        resolution: String(resMs),
        start_time: String(start),
        end_time: String(end),
        order: 'asc',
        limit: '200'
      });
      if (c.type !== 'native') {
        params.set('counter_asset_code', c.code);
        params.set('counter_asset_issuer', c.issuer);
      }
      const url = `${HORIZON}/trade_aggregations?${params}`;
      const data = await getJSON(url, { ttlMs: 60 * 1000 });
      const buckets = data?._embedded?.records ?? [];
      const sum = buckets.reduce((s, b) => s + num(b.base_volume), 0);
      total += sum;
    }
    return total; // in XLMFISH units
  }

  async function updateMarketCards() {
    try {
      const updatedEl = $('market-updated');
      if (updatedEl) updatedEl.textContent = 'Fetching live data...';

      // Fetch price and counters concurrently
      const [priceUsd, counters, amountRaw] = await Promise.all([
        fetchFishPriceUsd(),
        fetchCounterAssetsFromPools(),
        fetchAssetAmount()
      ]);

      // Compute 24h volume across all counters
      let volumeBase = 0;
      try {
        volumeBase = await fetch24hBaseVolumeAcrossPairs(counters); // XLMFISH units
      } catch (e) {
        console.warn('Volume aggregation failed, falling back to 0', e);
      }

      const volumeUsd = (priceUsd != null) ? volumeBase * priceUsd : null;
      const supply = (amountRaw && isFinite(amountRaw)) ? amountRaw : TOTAL_SUPPLY;
      const marketCap = (priceUsd != null && isFinite(supply)) ? (supply * priceUsd) : null;

      const priceEl = $('price-usd');
      const volEl = $('volume-24h-usd');
      const mcEl = $('market-cap-usd');

      if (priceEl) priceEl.textContent = fmtUsdPrice(priceUsd);
      if (volEl) volEl.textContent = fmtUsd2(volumeUsd);
      if (mcEl) mcEl.textContent = fmtUsd2(marketCap);

      if (updatedEl) updatedEl.textContent = 'Updated ' + new Date().toLocaleString();
    } catch (e) {
      console.error(e);
      const ids = ['price-usd','volume-24h-usd','market-cap-usd','market-updated'];
      ids.forEach(id => { const el = $(id); if (el) el.textContent = id === 'market-updated' ? 'Error fetching live data' : '—'; });
    }
  }

  document.addEventListener('DOMContentLoaded', updateMarketCards);
})();