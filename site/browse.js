(async function () {
  const $ = id => document.getElementById(id);
  const state = { rows: [], filtered: [], sort: 'rank', direction: 1, shortlistOnly: false, stars: JSON.parse(localStorage.getItem('nhl-shortlist') || '[]') };
  try {
    const { status, rows } = await NHLTracker.loadData();
    const date = status.latest_data_date || [...new Set(rows.map(row => row.date))].sort().pop();
    state.rows = NHLTracker.latestRows(rows, date);
    $('run-label').textContent = date ? `Data · ${date}` : 'No run yet';
    for (const value of [...new Set(state.rows.map(row => row.conference))].sort()) $('conference').insertAdjacentHTML('beforeend', `<option>${value}</option>`);
    for (const value of [...new Set(state.rows.map(row => row.division))].sort()) $('division').insertAdjacentHTML('beforeend', `<option>${value}</option>`);
    render();
  } catch (error) { $('result-count').textContent = error.message; }

  ['search', 'conference', 'division'].forEach(id => $(id).addEventListener('input', render));
  $('shortlist-only').addEventListener('click', () => { state.shortlistOnly = !state.shortlistOnly; $('shortlist-only').classList.toggle('active', state.shortlistOnly); render(); });
  document.querySelectorAll('th[data-sort]').forEach(header => header.addEventListener('click', () => { const key = header.dataset.sort; state.direction = state.sort === key ? state.direction * -1 : 1; state.sort = key; render(); }));
  $('browse-table').addEventListener('click', event => { const button = event.target.closest('[data-star]'); if (!button) return; const id = button.dataset.star; state.stars = state.stars.includes(id) ? state.stars.filter(value => value !== id) : [...state.stars, id]; localStorage.setItem('nhl-shortlist', JSON.stringify(state.stars)); render(); });

  function render() {
    const query = $('search').value.trim().toLowerCase(), conference = $('conference').value, division = $('division').value;
    state.filtered = state.rows.filter(row => (!query || row.item.toLowerCase().includes(query)) && (!conference || row.conference === conference) && (!division || row.division === division) && (!state.shortlistOnly || state.stars.includes(row.item_id)));
    state.filtered.sort((a, b) => { const av = a[state.sort], bv = b[state.sort]; if (state.sort === 'item' || state.sort === 'conference' || state.sort === 'division') return state.direction * String(av).localeCompare(String(bv)); return state.direction * ((Number(av) || 0) - (Number(bv) || 0)); });
    $('shortlist-count').textContent = state.stars.length;
    $('result-count').textContent = `${state.filtered.length} team${state.filtered.length === 1 ? '' : 's'}`;
    $('browse-table').querySelector('tbody').innerHTML = state.filtered.map(row => `<tr><td class="rank">${row.rank}</td><td><strong>${row.item}</strong><small>${row.item_id}</small></td><td>${row.conference}</td><td>${row.division}</td><td>${row.games_played}</td><td>${row.wins}</td><td>${row.losses}</td><td>${row.ot_losses}</td><td class="points">${row.points}</td><td>${NHLTracker.pct(row.point_pct)}</td><td>${row.goals_for}</td><td>${row.goals_against}</td><td class="${Number(row.goal_differential) >= 0 ? 'positive' : 'negative'}">${Number(row.goal_differential) > 0 ? '+' : ''}${row.goal_differential}</td><td><button class="star ${state.stars.includes(row.item_id) ? 'selected' : ''}" data-star="${row.item_id}" aria-label="${state.stars.includes(row.item_id) ? 'Remove' : 'Add'} ${row.item} ${state.stars.includes(row.item_id) ? 'from' : 'to'} shortlist">${state.stars.includes(row.item_id) ? '★' : '☆'}</button></td></tr>`).join('') || '<tr><td colspan="14" class="empty">No teams match these filters.</td></tr>';
  }
}());
