(async function () {
  const $ = id => document.getElementById(id);
  try {
    const { status, rows } = await NHLTracker.loadData();
    const dates = [...new Set(rows.map(row => row.date))].sort();
    const teams = [...new Map(rows.map(row => [row.item_id, row])).values()].sort((a, b) => a.item.localeCompare(b.item));
    $('run-label').textContent = status.latest_data_date ? `Data · ${status.latest_data_date}` : 'No run yet';
    teams.forEach(team => $('trend-teams').insertAdjacentHTML('beforeend', `<option value="${team.item_id}">${team.item}</option>`));
    [...$('trend-teams').options].slice(0, 4).forEach(option => { option.selected = true; });
    $('trend-teams').addEventListener('change', drawMain); $('trend-metric').addEventListener('change', drawMain); window.addEventListener('resize', drawMain);
    drawMain(); buildFindings();

    function selectedTeams() { return [...$('trend-teams').selectedOptions].slice(0, 6).map(option => option.value); }
    function drawMain() {
      const selected = selectedTeams(), metric = $('trend-metric').value;
      drawChart($('main-chart'), dates, selected.map(id => ({ label: teams.find(team => team.item_id === id)?.item || id, values: dates.map(date => { const row = rows.find(item => item.date === date && item.item_id === id); return row ? Number(row[metric]) : null; }) })), { invert: metric === 'rank' });
    }
    function buildFindings() {
      const latestDate = dates.at(-1), firstDate = dates[0], latest = rows.filter(row => row.date === latestDate), first = rows.filter(row => row.date === firstDate);
      const leader = [...latest].sort((a, b) => Number(a.rank) - Number(b.rank))[0];
      const rises = latest.map(row => { const old = first.find(item => item.item_id === row.item_id); return { row, delta: old ? Number(row.points) - Number(old.points) : 0 }; }).sort((a, b) => b.delta - a.delta);
      const rise = rises[0];
      const points = latest.map(row => Number(row.points)).filter(Number.isFinite), max = Math.max(...points), min = Math.min(...points);
      const maxTeam = latest.find(row => Number(row.points) === max), minTeam = latest.find(row => Number(row.points) === min);
      const sorted = [...points].sort((a, b) => a - b), medianGap = sorted.length ? sorted[Math.floor(sorted.length / 2)] - sorted[Math.floor((sorted.length - 1) / 2)] : 0;
      $('finding-leader-title').textContent = leader ? `${leader.item} owns the top spot` : 'Waiting for history';
      $('finding-leader-copy').textContent = leader ? `The current league leader sits at rank ${leader.rank} with ${leader.points} points and a ${NHLTracker.pct(leader.point_pct)} points percentage. This is the first row after sorting the latest date by the source's league rank.` : 'The finding appears after the first successful run.';
      $('finding-rise-title').textContent = rise ? `${rise.row.item} gained the most points` : 'The biggest rise is forming';
      $('finding-rise-copy').textContent = rise ? `${rise.delta >= 0 ? 'Up' : 'Down'} ${Math.abs(rise.delta)} points since the first captured date (${firstDate}). The change is latest points minus first points for each team.` : 'Two snapshots are needed to compute a rise.';
      $('finding-gap-title').textContent = maxTeam && minTeam ? `${maxTeam.item} leads by ${max - min}` : 'The points gap is forming';
      $('finding-gap-copy').textContent = maxTeam && minTeam ? `${maxTeam.item} has ${max} points while ${minTeam.item} has ${min}. The gap is the maximum latest points minus the minimum latest points.` : 'A latest snapshot is needed to compute the gap.';
      $('finding-range-title').textContent = `${NHLTracker.fmt(medianGap, 0)}-point median split`;
      $('finding-range-copy').textContent = `The middle two teams are ${medianGap === 0 ? 'tied or separated by less than one point' : `separated by ${medianGap} points`} in the current sorted points list. This is computed from the two center values, not from ranks.`;
      drawChart($('leader-chart'), dates, leader ? [{ label: leader.item, values: dates.map(date => Number(rows.find(row => row.date === date && row.item_id === leader.item_id)?.points)) }] : [], {});
      drawChart($('rise-chart'), dates, rise ? [{ label: rise.row.item, values: dates.map(date => Number(rows.find(row => row.date === date && row.item_id === rise.row.item_id)?.points)) }] : [], {});
      drawChart($('gap-chart'), [latestDate], [{ label: 'Max points', values: [max] }, { label: 'Min points', values: [min] }], {});
      drawChart($('range-chart'), latest.map(row => row.item_id), [{ label: 'Points', values: latest.sort((a, b) => Number(a.points) - Number(b.points)).map(row => Number(row.points)) }], {});
    }
  } catch (error) { document.querySelector('.page-intro p:last-child').textContent = error.message; }

  function drawChart(canvas, labels, series, options = {}) {
    const rect = canvas.getBoundingClientRect(), width = Math.max(300, Math.floor(rect.width || 600)), height = Number(canvas.getAttribute('height')) || 240, ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio; canvas.height = height * ratio; const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height); if (!series.length || !labels.length) return;
    const padding = { top: 20, right: 18, bottom: 30, left: 42 }, values = series.flatMap(item => item.values).filter(value => Number.isFinite(value)); if (!values.length) return;
    let min = Math.min(...values), max = Math.max(...values); if (min === max) { min -= 1; max += 1; } const x = i => padding.left + (labels.length === 1 ? (width - padding.left - padding.right) / 2 : i * (width - padding.left - padding.right) / (labels.length - 1)); const y = value => padding.top + (max - value) * (height - padding.top - padding.bottom) / (max - min);
    ctx.strokeStyle = '#dbe4ee'; ctx.lineWidth = 1; for (let i = 0; i < 4; i += 1) { const yy = padding.top + i * (height - padding.top - padding.bottom) / 3; ctx.beginPath(); ctx.moveTo(padding.left, yy); ctx.lineTo(width - padding.right, yy); ctx.stroke(); }
    const colors = ['#e63946', '#0f7c78', '#f3a712', '#5b5bd6', '#8e6bc7', '#4d87a8'];
    series.forEach((item, seriesIndex) => { ctx.strokeStyle = colors[seriesIndex % colors.length]; ctx.lineWidth = 2.5; ctx.beginPath(); let started = false; item.values.forEach((value, i) => { if (!Number.isFinite(value)) { started = false; return; } if (!started) { ctx.moveTo(x(i), y(value)); started = true; } else ctx.lineTo(x(i), y(value)); }); ctx.stroke(); const last = item.values.map((value, i) => ({ value, i })).filter(point => Number.isFinite(point.value)).at(-1); if (last) { ctx.fillStyle = colors[seriesIndex % colors.length]; ctx.beginPath(); ctx.arc(x(last.i), y(last.value), 4, 0, Math.PI * 2); ctx.fill(); } });
    ctx.fillStyle = '#718096'; ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(NHLTracker.fmt(max, options.invert ? 0 : 1), 4, padding.top + 4); ctx.fillText(NHLTracker.fmt(min, options.invert ? 0 : 1), 4, height - padding.bottom); ctx.textAlign = 'center'; if (labels.length > 1) { ctx.fillText(String(labels[0]).slice(0, 10), x(0), height - 8); ctx.fillText(String(labels.at(-1)).slice(0, 10), x(labels.length - 1), height - 8); }
  }
}());
