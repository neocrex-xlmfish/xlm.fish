// LP page logic (migrated from old inline script). Fetches pools, computes values,
// renders table and calls renderTopNPieChart.
(function () {
  const HORIZON = 'https://horizon.stellar.org';
  const ASSET_CODE = 'XLMFISH';
  const ASSET_ISSUER = 'GAX3YQC26LTS6NLW2QGRQC4MK24XKL5JLZ7KFHNERWPC3HKCT2ABTEMT';
  const FISH_ASSET = `${ASSET_CODE}:${ASSET_ISSUER}`;

  let allPools = [];
  let filteredPools = [];
  let priceUsd = null;

  const num = (v) => typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
  const fmtUsd2 = (n) => (n == null || !isFinite(n)) ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function assetShort(asset) { if (asset === 'native') return 'XLM'; const [code] = String(asset).split(':'); return code || asset; }
  function poolNameFromReserves(reserves) { if (!Array.isArray(reserves) || reserves.length < 2) return '—'; const a = assetShort(reserves[0].asset); const b = assetShort(reserves[1].asset); return `${a}/${b}`; }
  function fishReserveFromReserves(reserves) { const fish = (reserves || []).find(r => r.asset === FISH_ASSET); return fish ? num(fish.amount) : 0; }

  async function getJSON(url, opts) { if (typeof window.cachedJSON === 'function') return window.cachedJSON(url, opts || {}); const res = await fetch(url); if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`); return res.json(); }

  async function fetchFishUsdPrice() {
    const params = new URLSearchParams({ base_asset_type:'credit_alphanum12', base_asset_code:ASSET_CODE, base_asset_issuer:ASSET_ISSUER, counter_asset_type:'native', resolution:String(24*60*60*1000), limit:'1', order:'desc' });
    const aggUrl = `${HORIZON}/trade_aggregations?${params.toString()}`;
    const aggData = await getJSON(aggUrl, { ttlMs: 60 * 1000 });
    const bucket = aggData?._embedded?.records?.[0];
    const priceInXLM = bucket ? (num(bucket.close) || num(bucket.avg) || null) : null;
    const cgUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd';
    const cgData = await getJSON(cgUrl, { ttlMs: 60 * 1000 });
    const xlmUsd = cgData?.stellar?.usd ?? null;
    return (priceInXLM != null && xlmUsd != null) ? priceInXLM * xlmUsd : null;
  }

  async function loadPoolsFromHorizon() {
    const reservesParam = encodeURIComponent(FISH_ASSET);
    const url = `${HORIZON}/liquidity_pools?reserves=${reservesParam}&limit=200&order=asc`;
    const data = await getJSON(url, { ttlMs: 2 * 60 * 1000 });
    const records = data?._embedded?.records ?? [];
    return records.map(rec => {
      const name = poolNameFromReserves(rec.reserves || []);
      const fishAmt = fishReserveFromReserves(rec.reserves || []);
      const status = num(rec.total_shares) > 0 ? 'active' : 'inactive';
      return { id: rec.id, name, liquidityFish: fishAmt, usdValue: null, status, reserves: rec.reserves || [] };
    });
  }

  function updateMetrics() {
    const totalFish = allPools.reduce((s, p) => s + num(p.liquidityFish), 0);
    const totalEl = document.getElementById('total-liquidity');
    if (totalEl) totalEl.textContent = `${totalFish.toLocaleString()} XLMFISH`;
    const totalUsdEl = document.getElementById('total-liquidity-usd');
    if (totalUsdEl) totalUsdEl.textContent = (priceUsd != null) ? `≈ ${fmtUsd2(totalFish * priceUsd)}` : '≈ —';

    const top10 = allPools.slice().sort((a, b) => num(b.liquidityFish) - num(a.liquidityFish)).slice(0, 10);
    const top10El = document.getElementById('top-10-pools');
    if (top10El) {
      top10El.innerHTML = top10.map((p, i) => {
        const fishText = p.liquidityFish ? `${p.liquidityFish.toLocaleString()} XLMFISH` : '—';
        const usdText = (priceUsd != null && p.liquidityFish) ? ` (≈ ${fmtUsd2(p.liquidityFish * priceUsd)})` : '';
        return `<li>${i + 1}. ${p.name} — ${fishText}${usdText}</li>`;
      }).join('');
    }
  }

  function renderTable() {
    const tbody = document.getElementById('pools-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    filteredPools.forEach((p, index) => {
      const statusBadge = p.status === 'active' ? '<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>' : '<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Inactive</span>';
      const fish = p.liquidityFish ? `${p.liquidityFish.toLocaleString()} XLMFISH` : '—';
      const usd = (priceUsd != null && p.liquidityFish) ? fmtUsd2(p.liquidityFish * priceUsd) : '—';
      const row = document.createElement('tr');
      row.className = 'border-b border-gray-200 hover:bg-gray-50 transition-colors';
      row.innerHTML = `
        <td class="px-4 py-3 text-gray-600">${index + 1}</td>
        <td class="px-4 py-3 font-medium text-gray-900">${p.name}</td>
        <td class="px-4 py-3 text-right text-gray-900">${fish}</td>
        <td class="px-4 py-3 text-right text-gray-900">${usd}</td>
        <td class="px-4 py-3 text-center">${statusBadge}</td>
      `;
      tbody.appendChild(row);
    });
  }

  function sortFilteredByCurrent() {
    const select = document.getElementById('sort-select');
    let sortType = select ? select.value : 'usd-desc';
    if ((sortType === 'usd-desc' || sortType === 'usd-asc') && priceUsd == null) sortType = 'liquidity-desc';
    switch (sortType) {
      case 'usd-desc': filteredPools.sort((a, b) => (num(b.liquidityFish) - num(a.liquidityFish)) * num(priceUsd || 0)); break;
      case 'usd-asc':  filteredPools.sort((a, b) => (num(a.liquidityFish) - num(b.liquidityFish)) * num(priceUsd || 0)); break;
      case 'liquidity-desc': filteredPools.sort((a, b) => num(b.liquidityFish) - num(a.liquidityFish)); break;
      case 'liquidity-asc':  filteredPools.sort((a, b) => num(a.liquidityFish) - num(b.liquidityFish)); break;
      case 'name-asc': filteredPools.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name-desc': filteredPools.sort((a, b) => b.name.localeCompare(a.name)); break;
    }
  }

  function setupControls() {
    const search = document.getElementById('search-input');
    if (search) {
      search.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        filteredPools = allPools.filter(p => p.name.toLowerCase().includes(q));
        sortFilteredByCurrent();
        renderTable();
      });
    }

    const sort = document.getElementById('sort-select');
    if (sort) {
      sort.addEventListener('change', () => {
        sortFilteredByCurrent();
        renderTable();
      });
    }
  }

  async function init() {
    try {
      setupControls();

      priceUsd = await fetchFishUsdPrice();
      const pools = await loadPoolsFromHorizon();
      pools.forEach(p => { p.usdValue = (priceUsd != null) ? num(p.liquidityFish) * priceUsd : null; });

      allPools = pools;
      filteredPools = pools.slice();

      const sortEl = document.getElementById('sort-select');
      if (sortEl) sortEl.value = 'usd-desc';
      sortFilteredByCurrent();

      updateMetrics();
      renderTable();

      // use the chart helper (lp-topn-chart.js) to render distribution
      if (typeof renderTopNPieChart === 'function') {
        try {
          renderTopNPieChart('distributionChart', allPools, {
            metric: (priceUsd != null) ? 'usd' : 'fish',
            minOtherPct: 0.01
          });
        } catch (e) { console.warn('Chart render failed', e); }
      }

      const loading = document.getElementById('loading-message');
      if (loading) loading.style.display = 'none';
      const updated = document.getElementById('pools-updated');
      if (updated) updated.textContent = 'Updated ' + new Date().toLocaleString();
    } catch (e) {
      console.error(e);
      const loading = document.getElementById('loading-message');
      if (loading) loading.textContent = 'Error loading data from Horizon';
    }
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', init);
})();
