const DATA_BASE = window.location.pathname.includes('/site/') ? '../data/' : 'data/';

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ''])));
}

async function loadData() {
  const [statusResponse, historyResponse] = await Promise.all([fetch(`${DATA_BASE}status.json`), fetch(`${DATA_BASE}history.csv`)]);
  if (!statusResponse.ok || !historyResponse.ok) throw new Error('Data files are not available yet. Run the pipeline once.');
  return { status: await statusResponse.json(), rows: parseCSV(await historyResponse.text()) };
}

function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function fmt(value, digits = 0) { const parsed = number(value); return parsed === null ? '—' : parsed.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }); }
function pct(value) { const parsed = number(value); return parsed === null ? '—' : `${(parsed * 100).toFixed(1)}%`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
function logoMarkup(row) { return row.team_logo ? `<img class="team-logo" src="${escapeHtml(row.team_logo)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<span class="team-logo-fallback">●</span>'; }
function latestRows(rows, date) { return rows.filter(row => row.date === date); }
function previousDate(rows, date) { return [...new Set(rows.map(row => row.date).filter(value => value < date))].sort().pop(); }
function movement(current, previous) { return Math.abs((number(current.points) || 0) - (number(previous.points) || 0)) + Math.abs((number(current.rank) || 0) - (number(previous.rank) || 0)); }
function playoffStatus(row, rows) {
  const rankIn = (field, item, collection) => number(item[field]) || (collection.slice().sort((a, b) => (number(a.rank) || 999) - (number(b.rank) || 999)).findIndex(candidate => candidate.item_id === item.item_id) + 1);
  const division = rows.filter(item => item.conference === row.conference && item.division === row.division);
  if (rankIn('division_rank', row, division) <= 3) return { label: 'DIV', className: 'division' };
  const conference = rows.filter(item => item.conference === row.conference);
  const divisionLeaders = new Set(conference.filter(item => rankIn('division_rank', item, rows.filter(candidate => candidate.conference === item.conference && candidate.division === item.division)) <= 3).map(item => item.item_id));
  const wildcard = conference.filter(item => !divisionLeaders.has(item.item_id)).sort((a, b) => (number(b.points) || 0) - (number(a.points) || 0) || (number(a.rank) || 999) - (number(b.rank) || 999));
  const wildcardIndex = wildcard.findIndex(item => item.item_id === row.item_id);
  return wildcardIndex >= 0 && wildcardIndex < 2 ? { label: 'WC', className: 'wildcard' } : { label: 'OUT', className: 'out' };
}
function computeMoves(currentRows, previousRows) {
  const current = Object.fromEntries(currentRows.map(row => [row.item_id, row]));
  const previous = Object.fromEntries(previousRows.map(row => [row.item_id, row]));
  return [...new Set([...Object.keys(current), ...Object.keys(previous)])].map(itemId => {
    const now = current[itemId], before = previous[itemId];
    if (!now) return { item_id: itemId, item: before.item, kind: 'gone', score: 0, current: null, previous: before };
    if (!before) return { item_id: itemId, item: now.item, kind: 'new', score: (number(now.points) || 0) + (number(now.rank) || 0), current: now, previous: null };
    return { item_id: itemId, item: now.item, kind: 'changed', score: movement(now, before), current: now, previous: before };
  }).filter(move => move.kind !== 'changed' || move.score > 0).sort((a, b) => b.score - a.score || a.item.localeCompare(b.item));
}

function registerOffline() { if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {})); }
registerOffline();
window.NHLTracker = { DATA_BASE, loadData, number, fmt, pct, escapeHtml, logoMarkup, latestRows, previousDate, movement, playoffStatus, computeMoves };
