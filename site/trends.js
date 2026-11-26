(async function () {
  const $ = id => document.getElementById(id);
  const chartColors = ['#e63946', '#0f7c78', '#f3a712', '#5b5bd6', '#8e6bc7', '#4d87a8'];
  try {
    const { status, rows } = await NHLTracker.loadData();
    const dates = [...new Set(rows.map(row => row.date))].sort();
    const latestDate = dates.at(-1), firstDate = dates[0];
    const latest = rows.filter(row => row.date === latestDate);
    const teams = [...new Map(rows.map(row => [row.item_id, row])).values()].sort((a, b) => a.item.localeCompare(b.item));
    $('run-label').textContent = status.latest_data_date ? `Data · ${status.latest_data_date}` : 'No run yet';
    $('trend-summary').textContent = `${NHLTracker.fmt(dates.length)} captured day${dates.length === 1 ? '' : 's'} · ${NHLTracker.fmt(latest.length)} teams in the latest snapshot. Every number below is calculated in your browser from history.csv.`;
    const selectedTeamIds = new Set([...latest].sort((a, b) => Number(a.rank) - Number(b.rank)).slice(0, 4).map(team => team.item_id));
    renderTeamPicker();
    $('trend-teams').addEventListener('click', event => {
      const button = event.target.closest('[data-team]');
      if (!button) return;
      const id = button.dataset.team;
      if (selectedTeamIds.has(id)) selectedTeamIds.delete(id);
      else if (selectedTeamIds.size < 6) selectedTeamIds.add(id);
      renderTeamPicker();
      drawMain();
    });
    $('clear-trend').addEventListener('click', () => {
      selectedTeamIds.clear();
      renderTeamPicker();
      drawMain();
    });
    $('trend-metric').addEventListener('change', drawMain); window.addEventListener('resize', drawMain);
    drawMain(); buildFindings(); buildComparisons();

    function renderTeamPicker() {
      $('trend-teams').innerHTML = teams.map(team => {
        const selected = selectedTeamIds.has(team.item_id);
        return `<button type="button" class="team-option${selected ? ' selected' : ''}" data-team="${NHLTracker.escapeHtml(team.item_id)}" aria-pressed="${selected}"><span class="team-option-mark" aria-hidden="true"></span>${NHLTracker.escapeHtml(team.item)}</button>`;
      }).join('');
      $('selected-teams-label').textContent = `${selectedTeamIds.size} selected · max 6`;
    }
    function selectedTeams() { return [...selectedTeamIds]; }
    function drawMain() {
      const selected = selectedTeams(), metric = $('trend-metric').value;
      const descriptions = {
        points: 'Points are cumulative standings points. A rising line means a team is adding points faster than the others.',
        rank: 'League rank is ordered from 1 to 32. Lower numbers are better, so the best teams appear higher on this chart.',
        point_pct: 'Points percentage is points divided by possible points. It makes teams easier to compare when games played differ.',
        goal_differential: 'Goal differential is goals for minus goals against. Positive movement means a team is outscoring opponents overall.',
        wins: 'Wins are regulation or overtime wins recorded in each snapshot.'
      };
      $('metric-description').textContent = descriptions[metric];
      drawChart($('main-chart'), dates, selected.map(id => ({ label: teams.find(team => team.item_id === id)?.item || id, values: dates.map(date => { const row = rows.find(item => item.date === date && item.item_id === id); return row ? Number(row[metric]) : null; }) })), { invert: metric === 'rank', legendId: 'main-legend' });
    }
    function buildFindings() {
      const first = rows.filter(row => row.date === firstDate);
      const leader = [...latest].sort((a, b) => Number(a.rank) - Number(b.rank))[0];
      const climbs = latest.map(row => { const old = first.find(item => item.item_id === row.item_id); return { row, delta: old ? Number(old.rank) - Number(row.rank) : 0, oldRank: old?.rank }; }).sort((a, b) => b.delta - a.delta);
      const climb = climbs[0];
      const points = latest.map(row => Number(row.points)).filter(Number.isFinite), max = Math.max(...points), min = Math.min(...points);
      const maxTeam = latest.find(row => Number(row.points) === max), minTeam = latest.find(row => Number(row.points) === min);
      const sorted = [...points].sort((a, b) => a - b), medianGap = sorted.length ? sorted[Math.floor(sorted.length / 2)] - sorted[Math.floor((sorted.length - 1) / 2)] : 0;
      $('finding-leader-title').textContent = leader ? `${leader.item} owns the top spot` : 'Waiting for history';
      $('finding-leader-copy').textContent = leader ? `The current league leader sits at rank ${leader.rank} with ${leader.points} points and a ${NHLTracker.pct(leader.point_pct)} points percentage. This is the first row after sorting the latest date by source rank.` : 'The finding appears after the first successful run.';
      $('finding-rise-title').textContent = climb && climb.delta > 0 ? `${climb.row.item} climbed ${climb.delta} places` : 'The biggest climb is forming';
      $('finding-rise-copy').textContent = climb && climb.delta > 0 ? `${climb.row.item} moved from rank ${climb.oldRank} to ${climb.row.rank} since ${firstDate}. The climb is first rank minus latest rank, so positive means upward movement.` : 'Two snapshots with a rank change are needed to compute a climb.';
      $('finding-gap-title').textContent = maxTeam && minTeam ? `${maxTeam.item} leads by ${max - min}` : 'The points gap is forming';
      $('finding-gap-copy').textContent = maxTeam && minTeam ? `${maxTeam.item} has ${max} points while ${minTeam.item} has ${min}. The gap is maximum latest points minus minimum latest points.` : 'A latest snapshot is needed to compute the gap.';
      $('finding-range-title').textContent = `${NHLTracker.fmt(medianGap, 0)}-point median split`;
      $('finding-range-copy').textContent = `The middle two teams are ${medianGap === 0 ? 'tied or separated by less than one point' : `separated by ${medianGap} points`} in the current sorted points list. This is computed from the two center values.`;
      drawChart($('leader-chart'), dates, leader ? [{ label: leader.item, values: dates.map(date => Number(rows.find(row => row.date === date && row.item_id === leader.item_id)?.points)) }] : [], {});
      drawChart($('rise-chart'), dates, climb ? [{ label: climb.row.item, values: dates.map(date => Number(rows.find(row => row.date === date && row.item_id === climb.row.item_id)?.rank)) }] : [], { invert: true });
      drawChart($('gap-chart'), [latestDate], [{ label: 'Max points', values: [max] }, { label: 'Min points', values: [min] }], {});
      drawChart($('range-chart'), latest.map(row => row.item_id), [{ label: 'Points', values: [...latest].sort((a, b) => Number(a.points) - Number(b.points)).map(row => Number(row.points)) }], {});
    }
    function buildComparisons() {
      const averageBy = key => Object.entries(rows.filter(row => row.date === latestDate).reduce((groups, row) => { const group = row[key]; groups[group] = groups[group] || []; groups[group].push(Number(row.points)); return groups; }, {})).map(([label, values]) => ({ label, value: values.reduce((sum, value) => sum + value, 0) / values.length })).sort((a, b) => b.value - a.value);
      renderBars('conference-bars', averageBy('conference'));
      renderBars('division-bars', averageBy('division'));
    }
  } catch (error) { document.querySelector('.page-intro p:last-child').textContent = error.message; }

  function renderBars(id, values) {
    const max = Math.max(...values.map(item => item.value), 1);
    document.getElementById(id).innerHTML = values.map(item => `<div class="bar-row"><span>${NHLTracker.escapeHtml(item.label)}</span><div class="bar-track"><i style="width:${(item.value / max) * 100}%"></i></div><strong>${item.value.toFixed(1)} pts</strong></div>`).join('');
  }
  function drawLegend(id, series) {
    const legend = document.getElementById(id); if (!legend) return;
    legend.innerHTML = series.map((item, index) => `<span><i style="background:${chartColors[index % chartColors.length]}"></i>${NHLTracker.escapeHtml(item.label)}</span>`).join('');
  }
  function drawChart(canvas, labels, series, options = {}) {
    const rect = canvas.getBoundingClientRect(), width = Math.max(300, Math.floor(rect.width || 600)), height = Number(canvas.getAttribute('height')) || 240, ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio; canvas.height = height * ratio; const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height); if (options.legendId) drawLegend(options.legendId, series); if (!series.length || !labels.length) return;
    const padding = { top: 20, right: 18, bottom: 30, left: 42 }, values = series.flatMap(item => item.values).filter(value => Number.isFinite(value)); if (!values.length) return;
    let min = Math.min(...values), max = Math.max(...values); if (min === max) { min -= 1; max += 1; }
    const x = i => padding.left + (labels.length === 1 ? (width - padding.left - padding.right) / 2 : i * (width - padding.left - padding.right) / (labels.length - 1));
    const y = value => options.invert
      ? padding.top + (value - min) * (height - padding.top - padding.bottom) / (max - min)
      : padding.top + (max - value) * (height - padding.top - padding.bottom) / (max - min);
    ctx.strokeStyle = '#dbe4ee'; ctx.lineWidth = 1; for (let i = 0; i < 4; i += 1) { const yy = padding.top + i * (height - padding.top - padding.bottom) / 3; ctx.beginPath(); ctx.moveTo(padding.left, yy); ctx.lineTo(width - padding.right, yy); ctx.stroke(); }
    series.forEach((item, seriesIndex) => { ctx.strokeStyle = chartColors[seriesIndex % chartColors.length]; ctx.lineWidth = 2.5; ctx.beginPath(); let started = false; item.values.forEach((value, i) => { if (!Number.isFinite(value)) { started = false; return; } if (!started) { ctx.moveTo(x(i), y(value)); started = true; } else ctx.lineTo(x(i), y(value)); }); ctx.stroke(); const last = item.values.map((value, i) => ({ value, i })).filter(point => Number.isFinite(point.value)).at(-1); if (last) { ctx.fillStyle = chartColors[seriesIndex % chartColors.length]; ctx.beginPath(); ctx.arc(x(last.i), y(last.value), 4, 0, Math.PI * 2); ctx.fill(); } });
    const topLabel = options.invert ? min : max, bottomLabel = options.invert ? max : min;
    ctx.fillStyle = '#718096'; ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(NHLTracker.fmt(topLabel, options.invert ? 0 : 1), 4, padding.top + 4); ctx.fillText(NHLTracker.fmt(bottomLabel, options.invert ? 0 : 1), 4, height - padding.bottom); ctx.textAlign = 'center'; if (labels.length > 1) { ctx.fillText(String(labels[0]).slice(0, 10), x(0), height - 8); ctx.fillText(String(labels.at(-1)).slice(0, 10), x(labels.length - 1), height - 8); }
  }
}());
