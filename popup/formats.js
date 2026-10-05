// Export / import file formats. Pure functions, no chrome.* APIs.
// Import accepts:
//   - this extension's JSON export
//   - Google Takeout subscriptions.csv (Channel Id, Channel Url, Channel Title)
//   - NewPipe / FreeTube style JSON ({ subscriptions: [{ url, name }] })
//   - anything else that contains channel IDs (UC + 22 chars) or /channel/ URLs
const CHANNEL_ID_RE = /UC[\w-]{22}/;
const CHANNEL_ID_G = /UC[\w-]{22}/g;

export function toJSON(channels) {
  return JSON.stringify({
    format: 'yt-subscriptions',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: channels.length,
    channels,
  }, null, 2);
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Same header and column order as Google Takeout, so the file can be
// imported by FreeTube, NewPipe, Invidious, etc.
export function toCSV(channels) {
  const rows = [['Channel Id', 'Channel Url', 'Channel Title']];
  for (const c of channels) rows.push([c.channelId, c.url, c.title]);
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function parseCSVRows(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function fromCSV(text) {
  const rows = parseCSVRows(text);
  const out = [];
  for (const r of rows) {
    const idCell = r.find((c) => CHANNEL_ID_RE.test(c));
    if (!idCell) continue; // header or junk
    const channelId = idCell.match(CHANNEL_ID_RE)[0];
    const title = r.length >= 3 ? r[2] : r.find((c) => c && !CHANNEL_ID_RE.test(c) && !/^https?:/.test(c)) || '';
    out.push({ channelId, title: title.trim() });
  }
  return out;
}

function fromJSONValue(data) {
  const list = Array.isArray(data) ? data
    : Array.isArray(data?.channels) ? data.channels
    : Array.isArray(data?.subscriptions) ? data.subscriptions
    : null;
  if (!list) return null;
  const out = [];
  for (const item of list) {
    if (typeof item === 'string') {
      const m = item.match(CHANNEL_ID_RE);
      if (m) out.push({ channelId: m[0], title: '' });
      continue;
    }
    const candidates = [item?.channelId, item?.id, item?.channel_id, item?.url, item?.link];
    const hit = candidates.find((v) => typeof v === 'string' && CHANNEL_ID_RE.test(v));
    if (!hit) continue;
    out.push({
      channelId: hit.match(CHANNEL_ID_RE)[0],
      title: String(item.title ?? item.name ?? item.channelName ?? ''),
    });
  }
  return out;
}

export function parseImport(text) {
  const trimmed = text.replace(/^﻿/, '').trim();
  let list = null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { list = fromJSONValue(JSON.parse(trimmed)); } catch (_) { list = null; }
  }
  if (!list) list = fromCSV(trimmed);
  if (!list.length) {
    list = [...new Set(trimmed.match(CHANNEL_ID_G) || [])].map((channelId) => ({ channelId, title: '' }));
  }
  const seen = new Set();
  return list.filter((c) => !seen.has(c.channelId) && seen.add(c.channelId));
}
