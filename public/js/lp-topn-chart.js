// Top-N doughnut chart for LPs with "Other" roll-up and a safe "No data" fallback
// usage:
//   renderTopNPieChart('distributionChart', pools, {
//     metric: 'usd' | 'fish',  // default auto: 'usd' if usdValue present else 'fish'
//     topN: number,            // default auto: 5 (sm), 7 (md/lg), 8 (xl)
//     minOtherPct: 0.01        // hide "Other" if remainder < 1%
//   });
(function () {
  const palette = ['#05668D', '#427AA1', '#679436', '#A5BE00', '#F59E0B', '#EF4444', '#8B5CF6', '#10B981', '#3B82F6', '#EC4899'];
  const otherColor = '#9CA3AF';

  function pickMetric(p, metric) {
    if (metric === 'usd') return (typeof p.usdValue === 'number' && isFinite(p.usdValue)) ? p.usdValue : 0;
    return (typeof p.liquidityFish === 'number' && isFinite(p.liquidityFish)) ? p.liquidityFish : 0;
  }

  function autoTopN() {
    const xl = window.matchMedia('(min-width: 1280px)').matches;
    const md = window.matchMedia('(min-width: 768px)').matches;
    if (xl) return 8;
    if (md) return 7;
    return 5;
  }

  function autoMetric(pools) {
    const anyUsd = pools.some(p => typeof p.usdValue === 'number' && isFinite(p.usdValue) && p.usdValue > 0);
    return anyUsd ? 'usd' : 'fish';
  }

  function buildDataset(pools, opts = {}) {
    const metric = opts.metric || autoMetric(pools);
    const topN = Number.isFinite(opts.topN) ? opts.topN : autoTopN();
    const minOtherPct = opts.minOtherPct ?? 0.01;

    const withVal = (Array.isArray(pools) ? pools : []).map(p => ({ p, val: pickMetric(p, metric) }));
    withVal.sort((a, b) => b.val - a.val);

    const top = withVal.slice(0, Math.max(0, topN));
    const rest = withVal.slice(top.length);

    const total = withVal.reduce((s, x) => s + x.val, 0);

    // Handle no data
    if (!withVal.length || total <= 0) {
      return {
        labels: ['No data'],
        data: [1],
        colors: [otherColor],
        metric,
        total: 1
      };
    }

    const labels = top.map(x => x.p.name);
    const data = top.map(x => x.val);
    const colors = top.map((_, i) => palette[i % palette.length]);

    const restSum = rest.reduce((s, x) => s + x.val, 0);
    if (rest.length && restSum > 0 && (restSum / total) >= minOtherPct) {
      labels.push('Other');
      data.push(restSum);
      colors.push(otherColor);
    }

    return { labels, data, colors, metric, total };
  }

  function formatValue(v, metric) {
    if (metric === 'usd') {
      return '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return Number(v).toLocaleString() + ' XLMFISH';
  }

  function renderTopNPieChart(canvasId, pools, opts = {}) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx || typeof Chart === 'undefined') return null;

    const { labels, data, colors, metric, total } = buildDataset(pools, opts);

    // Destroy prior chart if present
    const key = '__lpTopNChart__' + canvasId;
    if (window[key]) {
      try { window[key].destroy(); } catch {}
    }

    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: '#fff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 14 } } },
          tooltip: {
            callbacks: {
              label: (item) => {
                const lbl = item.label || '';
                const val = item.raw || 0;
                const pct = total > 0 ? (val / total) * 100 : 0;
                return `${lbl}: ${formatValue(val, metric)} (${pct.toFixed(1)}%)`;
              }
            }
          }
        },
        cutout: '60%'
      }
    });

    window[key] = chart;
    return chart;
  }

  window.renderTopNPieChart = renderTopNPieChart;
})();