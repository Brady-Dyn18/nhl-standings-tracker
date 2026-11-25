(async function () {
  const $ = id => document.getElementById(id);
  try {
    const { status, rows } = await NHLTracker.loadData();
    const date = status.latest_data_date || [...new Set(rows.map(row => row.date))].sort().pop();
    const previous = NHLTracker.previousDate(rows, date);
    const currentRows = NHLTracker.latestRows(rows, date).sort((a, b) => Number(a.rank) - Number(b.rank));
    const previousRows = NHLTracker.latestRows(rows, previous);
    const moves = NHLTracker.computeMoves(currentRows, previousRows);
    $('run-label').textContent = date ? `Data · ${date}` : 'No run yet';
    $('snapshot-date').textContent = date || 'not available';
    $('stat-items').textContent = NHLTracker.fmt(status.items || currentRows.length);
    $('stat-days').textContent = NHLTracker.fmt(status.days_with_success || 0);
    $('stat-new').textContent = NHLTracker.fmt((status.new_today || []).length);
    $('stat-health').textContent = (status.sources || []).every(source => source.ok) ? 'Good' : 'Check';
    $('run-time').textContent = status.run_time ? new Date(status.run_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    $('gone-count').textContent = NHLTracker.fmt((status.gone_today || []).length);
    $('today-table').querySelector('tbody').innerHTML = currentRows.map(row => `<tr><td class="rank">${row.rank}</td><td><strong>${row.item}</strong><small>${row.item_id} · ${row.conference}</small></td><td>${row.division}</td><td>${row.games_played}</td><td>${row.wins}</td><td>${row.losses}</td><td>${row.ot_losses}</td><td class="points">${row.points}</td><td>${NHLTracker.pct(row.point_pct)}</td><td>${changeBadge(row, previousRows)}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">No standings loaded yet.</td></tr>';
    $('moves-list').innerHTML = moves.filter(move => move.kind !== 'gone').slice(0, 6).map(move => `<div class="move-row"><div class="move-rank">${move.kind === 'new' ? 'NEW' : '↗'}</div><div class="move-team"><strong>${move.item}</strong><small>${move.item_id} · ${move.kind === 'new' ? 'New team' : `${move.previous.points} → ${move.current.points} pts`}</small></div><strong class="move-score">${move.score.toFixed(1)}</strong></div>`).join('') || '<div class="empty">No movement between snapshots yet.</div>';
    $('source-list').innerHTML = (status.sources || []).map(source => `<div class="source-row"><span class="source-status ${source.ok ? 'ok' : 'bad'}">${source.ok ? '✓' : '!'}</span><div><strong>${source.name}</strong><small>${source.ok ? `${source.count} teams received` : 'No raw file written'}</small></div><span class="source-pill ${source.ok ? 'ok' : 'bad'}">${source.ok ? 'OK' : 'FAILED'}</span></div>`).join('') || '<div class="empty">No source result recorded.</div>';
  } catch (error) {
    $('run-label').textContent = 'Waiting for first run';
    document.querySelectorAll('tbody').forEach(body => { body.innerHTML = `<tr><td colspan="14" class="empty">${error.message}</td></tr>`; });
  }

  function changeBadge(row, previousRows) {
    const old = previousRows.find(item => item.item_id === row.item_id);
    if (!old) return '<span class="change new">NEW</span>';
    const delta = Number(row.points) - Number(old.points);
    return delta === 0 ? '<span class="change flat">—</span>' : `<span class="change ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}</span>`;
  }
}());
