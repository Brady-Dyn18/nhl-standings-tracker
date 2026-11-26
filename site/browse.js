(async function () {
  const $ = id => document.getElementById(id);
  const state = { rows: [], filtered: [], sort: 'rank', direction: 1, shortlistOnly: false, stars: JSON.parse(localStorage.getItem('nhl-shortlist') || '[]'), dates: [] };
  try {
    const { status, rows } = await NHLTracker.loadData();
    const date = status.latest_data_date || [...new Set(rows.map(row => row.date))].sort().pop();
    state.dates = [...new Set(rows.map(row => row.date))].sort();
    const firstDate = state.dates[0], sevenDayDate = state.dates[Math.max(0, state.dates.length - 8)];
    state.rows = NHLTracker.latestRows(rows, date).map(row => ({ ...row, delta_7: deltaSince(row, rows, sevenDayDate), delta_season: deltaSince(row, rows, firstDate) }));
    $('run-label').textContent = date ? `Data · ${date}` : 'No run yet';
    populateConferenceOptions();
    updateDivisionOptions();
    render();
  } catch (error) { $('result-count').textContent = error.message; }

  $('search').addEventListener('input', render);
  $('conference').addEventListener('change', () => { updateDivisionOptions(); render(); });
  $('division').addEventListener('change', render);
  $('shortlist-only').addEventListener('click', () => { state.shortlistOnly = !state.shortlistOnly; $('shortlist-only').classList.toggle('active', state.shortlistOnly); render(); });
  document.querySelectorAll('th[data-sort]').forEach(header => header.addEventListener('click', () => { const key = header.dataset.sort; state.direction = state.sort === key ? state.direction * -1 : 1; state.sort = key; render(); }));
  $('browse-table').addEventListener('click', event => { const button = event.target.closest('[data-star]'); if (!button) return; const id = button.dataset.star; state.stars = state.stars.includes(id) ? state.stars.filter(value => value !== id) : [...state.stars, id]; localStorage.setItem('nhl-shortlist', JSON.stringify(state.stars)); render(); });

  function render() {
    const query = $('search').value.trim().toLowerCase(), conference = $('conference').value, division = $('division').value;
    state.filtered = state.rows.filter(row => (!query || row.item.toLowerCase().includes(query)) && (!conference || row.conference === conference) && (!division || row.division === division) && (!state.shortlistOnly || state.stars.includes(row.item_id)));
    state.filtered.sort((a, b) => { const av = a[state.sort], bv = b[state.sort]; if (state.sort === 'item' || state.sort === 'conference' || state.sort === 'division') return state.direction * String(av).localeCompare(String(bv)); return state.direction * ((Number(av) || 0) - (Number(bv) || 0)); });
    $('shortlist-count').textContent = state.stars.length;
    $('result-count').textContent = `${state.filtered.length} team${state.filtered.length === 1 ? '' : 's'}`;
    $('browse-table').querySelector('tbody').innerHTML = state.filtered.map(row => { const playoff = NHLTracker.playoffStatus(row, state.rows); return `<tr><td class="rank">${row.rank}</td><td><div class="team-name">${NHLTracker.logoMarkup(row)}<span><strong>${NHLTracker.escapeHtml(row.item)}</strong><small>${NHLTracker.escapeHtml(row.item_id)}</small></span></div></td><td>${NHLTracker.escapeHtml(row.conference)}</td><td>${NHLTracker.escapeHtml(row.division)}</td><td>${row.games_played}</td><td>${row.wins}</td><td>${row.losses}</td><td>${row.ot_losses}</td><td class="points">${row.points}</td><td>${NHLTracker.pct(row.point_pct)}</td><td class="${Number(row.delta_7) >= 0 ? 'positive' : 'negative'}">${deltaText(row.delta_7)}</td><td class="${Number(row.delta_season) >= 0 ? 'positive' : 'negative'}">${deltaText(row.delta_season)}</td><td>${row.goals_for}</td><td>${row.goals_against}</td><td class="${Number(row.goal_differential) >= 0 ? 'positive' : 'negative'}">${Number(row.goal_differential) > 0 ? '+' : ''}${row.goal_differential}</td><td><span class="playoff-badge ${playoff.className}">${playoff.label}</span></td><td><button class="star ${state.stars.includes(row.item_id) ? 'selected' : ''}" data-star="${NHLTracker.escapeHtml(row.item_id)}" aria-label="${state.stars.includes(row.item_id) ? 'Remove' : 'Add'} ${NHLTracker.escapeHtml(row.item)} ${state.stars.includes(row.item_id) ? 'from' : 'to'} shortlist">${state.stars.includes(row.item_id) ? '★' : '☆'}</button></td></tr>`; }).join('') || '<tr><td colspan="17" class="empty">No teams match these filters.</td></tr>';
  }

  function populateConferenceOptions() {
    $('conference').insertAdjacentHTML('beforeend', [...new Set(state.rows.map(row => row.conference))].sort().map(value => `<option value="${NHLTracker.escapeHtml(value)}">${NHLTracker.escapeHtml(value)}</option>`).join(''));
  }

  function updateDivisionOptions() {
    const conference = $('conference').value;
    const currentDivision = $('division').value;
    const divisions = [...new Set(state.rows.filter(row => !conference || row.conference === conference).map(row => row.division))].sort();
    $('division').innerHTML = `<option value="">All divisions</option>${divisions.map(value => `<option value="${NHLTracker.escapeHtml(value)}">${NHLTracker.escapeHtml(value)}</option>`).join('')}`;
    if (divisions.includes(currentDivision)) $('division').value = currentDivision;
  }

  function deltaSince(row, allRows, date) { const old = allRows.find(item => item.item_id === row.item_id && item.date === date); return old ? Number(row.points) - Number(old.points) : 0; }
  function deltaText(value) { const delta = Number(value) || 0; return `${delta > 0 ? '+' : ''}${delta}`; }
}());
