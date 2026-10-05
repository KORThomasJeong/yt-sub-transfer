import { toJSON, toCSV, parseImport } from './formats.js';

const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
const $ = (id) => document.getElementById(id);

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
document.title = t('extName');

let tabId = null;
let pending = [];
let pollTimer = null;
let lastFailed = [];

// Load page/yts.js into the tab's MAIN world (idempotent), then call fn there.
async function inPage(fn, ...args) {
  await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['page/yts.js'] });
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: fn, args });
  return res && res.result;
}

function setStatus(text, kind = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `status ${kind}`;
}

function setBusy(busy) {
  for (const id of ['export-json', 'export-csv', 'file']) $(id).disabled = busy;
  $('import-start').disabled = busy || pending.length === 0;
}

function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

function errorText(e) {
  const msg = String(e && e.message || e);
  if (msg.includes('NOT_LOGGED_IN')) return t('errNotLoggedIn');
  if (msg.includes('NOT_READY')) return t('errNotReady');
  return t('errGeneric', [msg]);
}

async function doExport(kind) {
  setBusy(true);
  $('export-result').textContent = t('exporting');
  try {
    const result = await inPage(async () => {
      try { return { channels: await window.__YTS.fetchSubscriptions() }; }
      catch (e) { return { error: String(e.message || e) }; }
    });
    if (!result || result.error) throw new Error(result ? result.error : 'no result');
    const { channels } = result;
    if (kind === 'json') download(`youtube-subscriptions-${stamp()}.json`, toJSON(channels), 'application/json');
    else download(`youtube-subscriptions-${stamp()}.csv`, toCSV(channels), 'text/csv');
    $('export-result').textContent = t('exportDone', [String(channels.length)]);
  } catch (e) {
    $('export-result').textContent = errorText(e);
  } finally {
    setBusy(false);
  }
}

async function onFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  pending = [];
  if (file) {
    pending = parseImport(await file.text());
    $('file-info').textContent = pending.length
      ? t('fileParsed', [String(pending.length)])
      : t('fileEmpty');
  } else {
    $('file-info').textContent = '';
  }
  $('import-start').disabled = pending.length === 0;
}

function renderProgress(p) {
  if (!p) return;
  const active = p.running || p.phase !== 'idle';
  $('progress').hidden = !active;
  if (!active) return;
  $('bar').max = Math.max(1, p.total);
  $('bar').value = p.done;
  const lines = [];
  if (p.phase === 'checking') lines.push(t('phaseChecking'));
  else if (p.phase === 'verifying') lines.push(t('phaseVerifying'));
  else if (p.running) lines.push(t('phaseSubscribing', [String(p.done), String(p.total), p.current || '']));
  lines.push(t('progressCounts', [String(p.subscribed), String(p.skipped), String(p.failed.length)]));
  if (!p.running) {
    if (p.error) lines.push(errorText(p.error));
    else lines.push(p.phase === 'stopped' ? t('importStopped') : t('importDone'));
    if (p.verified !== null) lines.push(t('verifiedCount', [String(p.verified), String(p.done)]));
  }
  $('progress-text').textContent = lines.join('\n');
  lastFailed = p.failed;
  $('download-failed').hidden = p.running || p.failed.length === 0;
  $('import-stop').hidden = !p.running;
  $('import-start').hidden = p.running;
  setBusy(p.running);
}

async function poll() {
  try {
    const p = await inPage(() => window.__YTS.progress());
    renderProgress(p);
    if (p && !p.running) stopPolling();
  } catch (_) { stopPolling(); }
}

function startPolling() {
  if (!pollTimer) pollTimer = setInterval(poll, 700);
}
function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

async function startImport() {
  if (!pending.length) return;
  if (!confirm(t('confirmImport', [String(pending.length)]))) return;
  const delayMs = Math.round(Math.max(0.5, Number($('delay').value) || 2) * 1000);
  const res = await inPage((list, d) => window.__YTS.startImport(list, d), pending, delayMs);
  if (!res || !res.started) {
    $('progress-text').textContent = t('errGeneric', [res ? res.reason : 'no result']);
    return;
  }
  $('progress').hidden = false;
  setBusy(true);
  startPolling();
  poll();
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onYT = tab && tab.url && new URL(tab.url).hostname === 'www.youtube.com';
  if (!onYT) {
    setStatus(t('statusNotYouTube'), 'err');
    $('open-yt').hidden = false;
    $('export-section').hidden = true;
    $('import-section').hidden = true;
    return;
  }
  tabId = tab.id;
  try {
    const s = await inPage(() => window.__YTS.status());
    if (!s.ready) { setStatus(t('errNotReady'), 'err'); setBusy(true); return; }
    if (!s.loggedIn) { setStatus(t('errNotLoggedIn'), 'err'); setBusy(true); return; }
    setStatus(t('statusReady'), 'ok');
    setBusy(false);
    // Re-attach to an import that is still running in this tab.
    const p = await inPage(() => window.__YTS.progress());
    renderProgress(p);
    if (p && p.running) startPolling();
  } catch (e) {
    setStatus(errorText(e), 'err');
  }
}

$('open-yt').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.youtube.com/feed/channels' });
  window.close();
});
$('export-json').addEventListener('click', () => doExport('json'));
$('export-csv').addEventListener('click', () => doExport('csv'));
$('file').addEventListener('change', onFile);
$('import-start').addEventListener('click', startImport);
$('import-stop').addEventListener('click', () => inPage(() => window.__YTS.stopImport()));
$('download-failed').addEventListener('click', () => {
  download(`youtube-import-failed-${stamp()}.csv`, toCSV(lastFailed.map((f) => ({
    channelId: f.channelId, title: f.title, url: `https://www.youtube.com/channel/${f.channelId}`,
  }))), 'text/csv');
});

init();
