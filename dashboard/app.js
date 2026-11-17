(() => {
  'use strict';
  const RADAR = window.RADAR;
  const fmtUsd = (n) => {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n}`;
  };
  const fmtPct = (n) => (n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // -------- meta header --------
  const meta = document.getElementById('meta');
  meta.innerHTML = `
    <span>As of <b>${esc(RADAR.as_of)}</b></span>
    <span><b>${RADAR.board_size}</b> ranked rows</span>
    <span><b>${RADAR.watchlist_size}</b> watchlist slugs, all covered</span>
    <span><b>${RADAR.early_size}</b> early finds below the $${(RADAR.floor_usd / 1e6).toFixed(0)}M floor</span>
    <span><b>${RADAR.live_size}</b> live tokens shown for context</span>
    <span>Model <b>${esc(RADAR.model_version)}</b></span>
  `;

  // -------- tabs --------
  const views = { board: document.getElementById('board-view'), live: document.getElementById('live-view'), about: document.getElementById('about-view'), watchlist: document.getElementById('board-view') };
  let currentTab = 'board';
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.view;
      document.getElementById('board-view').classList.toggle('hidden', currentTab !== 'board' && currentTab !== 'watchlist');
      document.getElementById('live-view').classList.toggle('hidden', currentTab !== 'live');
      document.getElementById('about-view').classList.toggle('hidden', currentTab !== 'about');
      document.getElementById('controls').classList.toggle('hidden', currentTab === 'about' || currentTab === 'live');
      const onlyWatch = document.getElementById('only-watchlist');
      if (currentTab === 'watchlist') { onlyWatch.checked = true; }
      render();
    });
  });

  // -------- filter controls --------
  const categorySel = document.getElementById('category');
  const chainSel = document.getElementById('chain');
  const cats = [...new Set(RADAR.rows.map((r) => r.category).filter(Boolean))].sort();
  const chains = [...new Set(RADAR.rows.flatMap((r) => r.chains))].sort();
  for (const c of cats) categorySel.insertAdjacentHTML('beforeend', `<option value="${esc(c)}">${esc(c)}</option>`);
  for (const c of chains) chainSel.insertAdjacentHTML('beforeend', `<option value="${esc(c)}">${esc(c)}</option>`);

  const search = document.getElementById('search');
  const onlyWatch = document.getElementById('only-watchlist');
  const sortSel = document.getElementById('sort');
  const countEl = document.getElementById('count');
  [search, categorySel, chainSel, onlyWatch, sortSel].forEach((el) => el.addEventListener('input', render));

  function filteredRows() {
    const q = search.value.trim().toLowerCase();
    const cat = categorySel.value;
    const chain = chainSel.value;
    const watchOnly = onlyWatch.checked;
    let rows = RADAR.rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.slug.toLowerCase().includes(q)) return false;
      if (cat && r.category !== cat) return false;
      if (chain && !r.chains.includes(chain)) return false;
      if (watchOnly && !r.on_watchlist) return false;
      return true;
    });
    const sort = sortSel.value;
    if (sort === 'tvl') rows = [...rows].sort((a, b) => b.tvl_usd - a.tvl_usd);
    else if (sort === 'change') rows = [...rows].sort((a, b) => (b.change_7d ?? -999) - (a.change_7d ?? -999));
    else if (sort === 'ripeness') rows = [...rows].sort((a, b) => b.ripeness_pct - a.ripeness_pct);
    else if (sort === 'name') rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }

  function rowHtml(r) {
    const changeCls = r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down';
    return `<tr data-slug="${esc(r.slug)}">
      <td class="rank">${r.rank}</td>
      <td class="name-cell"><strong>${esc(r.name)}</strong><span class="slug">${esc(r.slug)}</span></td>
      <td>${r.category ? `<span class="pill">${esc(r.category)}</span>` : '—'}</td>
      <td class="chains">${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}</td>
      <td class="num">${fmtUsd(r.tvl_usd)}</td>
      <td class="num ${changeCls}">${fmtPct(r.change_7d)}</td>
      <td><div class="ripebar"><div class="track"><div class="fill" style="width:${r.ripeness_pct}%"></div></div><span>${r.ripeness_pct.toFixed(0)}%</span></div></td>
      <td class="num implied">${fmtUsd(r.implied_value_usd)}</td>
      <td>${r.on_watchlist ? '<span class="pill watch-pill">watchlist</span>' : ''}</td>
    </tr>`;
  }

  const boardBody = document.getElementById('board-body');
  function render() {
    if (currentTab === 'board' || currentTab === 'watchlist') {
      const rows = filteredRows();
      boardBody.innerHTML = rows.map(rowHtml).join('');
      countEl.textContent = `${rows.length} of ${RADAR.rows.length} rows`;
      boardBody.querySelectorAll('tr').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.dataset.slug)));
    }
  }

  // -------- live token view --------
  const liveBody = document.getElementById('live-body');
  liveBody.innerHTML = RADAR.live
    .map(
      (r) => `<tr>
      <td>${esc(r.name)}</td>
      <td>${r.category ? esc(r.category) : '—'}</td>
      <td class="chains">${esc(r.chains.slice(0, 3).join(', '))}</td>
      <td>${r.symbol ? esc(r.symbol) : '—'}</td>
      <td class="num">${fmtUsd(r.tvl_usd)}</td>
      <td class="num">${r.mcap_usd === null ? '—' : fmtUsd(r.mcap_usd)}</td>
      <td class="num">${fmtPct(r.change_7d)}</td>
    </tr>`,
    )
    .join('');

  // -------- about / model view --------
  const dl = document.getElementById('model-dl');
  const m = RADAR.model;
  const rows = [
    ['Growth weight', m.growth_weight],
    ['Growth window', `${m.growth_floor_pct}% .. ${m.growth_cap_pct}%`],
    ['Ripeness peak', `${m.ripeness_peak_days} days`],
    ['Ripeness spread', `${m.ripeness_spread_days} days`],
    ['Maturity floor', m.maturity_floor],
    ['Chain bonus', `${m.chain_bonus_per_chain} per extra chain, capped at ${m.chain_bonus_cap}`],
    ['Near-floor bonus', `+${m.near_floor_bonus} within ${(m.near_floor_window * 100).toFixed(0)}% below the floor`],
  ];
  dl.innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');

  // -------- detail modal --------
  const detail = document.getElementById('detail');
  const detailBody = document.getElementById('detail-body');
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  detail.addEventListener('click', (e) => { if (e.target === detail) closeDetail(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

  function openDetail(slug) {
    const r = RADAR.rows.find((x) => x.slug === slug);
    if (!r) return;
    const changeCls = r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down';
    detailBody.innerHTML = `
      <h2>${esc(r.name)}</h2>
      <div class="d-slug">${esc(r.slug)} · rank #${r.rank} of ${RADAR.board_size} ${r.on_watchlist ? '· <span class="pill watch-pill">watchlist</span>' : ''}</div>
      <div class="detail-grid">
        <div class="box"><div class="k">Implied value</div><div class="v">${fmtUsd(r.implied_value_usd)}</div></div>
        <div class="box"><div class="k">TVL today</div><div class="v">${fmtUsd(r.tvl_usd)}</div></div>
        <div class="box"><div class="k">7-day change</div><div class="v ${changeCls}">${fmtPct(r.change_7d)}</div></div>
        <div class="box"><div class="k">Ripeness</div><div class="v">${r.ripeness_pct.toFixed(1)}%</div></div>
        <div class="box"><div class="k">Category</div><div class="v">${r.category ? esc(r.category) : '—'}</div></div>
        <div class="box"><div class="k">Age</div><div class="v">${r.age_days === null ? 'unknown' : `${Math.round(r.age_days / 30.44)} mo`}</div></div>
      </div>
      <h3>Chains</h3>
      <p>${esc(r.chains.join(', ') || '—')}</p>
      <h3>How to farm it</h3>
      <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    `;
    detail.classList.remove('hidden');
  }
  function closeDetail() { detail.classList.add('hidden'); }

  render();
})();
