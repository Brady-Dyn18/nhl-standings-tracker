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
function latestRows(rows, date) { return rows.filter(row => row.date === date); }
function previousDate(rows, date) { return [...new Set(rows.map(row => row.date).filter(value => value < date))].sort().pop(); }
function movement(current, previous) { return Math.abs((number(current.points) || 0) - (number(previous.points) || 0)) + Math.abs((number(current.rank) || 0) - (number(previous.rank) || 0)); }
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
window.NHLTracker = { DATA_BASE, loadData, number, fmt, pct, latestRows, previousDate, movement, computeMoves };
