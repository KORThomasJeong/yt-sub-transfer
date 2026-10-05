// Runs in the YouTube page's MAIN world (injected via chrome.scripting).
// Talks to YouTube's own InnerTube API (/youtubei/v1/*) with the user's
// existing session, exactly like youtube.com itself does. No API key or
// Google Cloud project is needed, and nothing leaves the browser.
//
// Auth scheme (SAPISIDHASH / 1P / 3P with the "_u" user-session suffix)
// follows yt-dlp's implementation: yt_dlp/extractor/youtube/_base.py.
(() => {
  const VERSION = 1;
  if (window.__YTS && window.__YTS.version === VERSION) return;

  const CHANNEL_ID_RE = /^UC[\w-]{22}$/;
  // Params YouTube's web client sends with subscribe / unsubscribe.
  const SUBSCRIBE_PARAMS = 'EgIIARgAUAE=';

  const cfg = (key) => {
    const yc = window.ytcfg;
    if (!yc) return undefined;
    if (typeof yc.get === 'function') return yc.get(key);
    return yc.data_ && yc.data_[key];
  };

  const readCookie = (name) => {
    for (const part of document.cookie.split(';')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
    }
    return undefined;
  };

  const sha1Hex = async (text) => {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const authorizationHeader = async () => {
    const origin = location.origin;
    const ts = Math.floor(Date.now() / 1000);
    const userSessionId = cfg('USER_SESSION_ID');
    const sapisid = readCookie('SAPISID') || readCookie('__Secure-3PAPISID');
    const schemes = [
      ['SAPISIDHASH', sapisid],
      ['SAPISID1PHASH', readCookie('__Secure-1PAPISID')],
      ['SAPISID3PHASH', readCookie('__Secure-3PAPISID')],
    ];
    const parts = [];
    for (const [scheme, sid] of schemes) {
      if (!sid) continue;
      const input = [userSessionId, ts, sid, origin].filter((x) => x !== undefined && x !== null && x !== '').join(' ');
      const hash = await sha1Hex(input);
      parts.push(`${scheme} ${ts}_${hash}${userSessionId ? '_u' : ''}`);
    }
    return parts.join(' ');
  };

  const api = async (endpoint, body) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Origin': location.origin,
      'X-Goog-AuthUser': String(cfg('SESSION_INDEX') ?? '0'),
      'X-Youtube-Client-Name': String(cfg('INNERTUBE_CONTEXT_CLIENT_NAME') ?? '1'),
      'X-Youtube-Client-Version': String(cfg('INNERTUBE_CLIENT_VERSION') ?? ''),
      'X-Youtube-Bootstrap-Logged-In': 'true',
    };
    const auth = await authorizationHeader();
    if (auth) headers.Authorization = auth;
    const visitor = cfg('VISITOR_DATA');
    if (visitor) headers['X-Goog-Visitor-Id'] = visitor;
    const delegated = cfg('DELEGATED_SESSION_ID');
    if (delegated) headers['X-Goog-PageId'] = delegated;

    const res = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ context: cfg('INNERTUBE_CONTEXT'), ...body }),
    });
    let json = null;
    try { json = await res.json(); } catch (_) { /* non-JSON error body */ }
    return { status: res.status, ok: res.ok && !(json && json.error), json };
  };

  const textOf = (t) => {
    if (!t) return '';
    if (typeof t.simpleText === 'string') return t.simpleText;
    if (Array.isArray(t.runs)) return t.runs.map((r) => r.text).join('');
    if (typeof t.content === 'string') return t.content;
    return '';
  };

  // Walk a browse response, collecting channelRenderer items and the
  // continuation token of the list itself. Sort-order chips also carry
  // continuationCommands, so only continuationItemRenderer is trusted.
  const collect = (node, channels, state) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) collect(n, channels, state); return; }
    for (const key of Object.keys(node)) {
      const val = node[key];
      if (key === 'channelRenderer' && val && val.channelId) {
        const canonical = val.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || '';
        const handle = canonical.startsWith('/@') ? decodeURIComponent(canonical.slice(1)) : '';
        channels.set(val.channelId, {
          channelId: val.channelId,
          title: textOf(val.title),
          handle,
          url: `https://www.youtube.com/channel/${val.channelId}`,
        });
      } else if (key === 'continuationItemRenderer') {
        const token = val?.continuationEndpoint?.continuationCommand?.token
          || val?.continuationEndpoint?.commandExecutorCommand?.commands?.find((c) => c.continuationCommand)?.continuationCommand?.token;
        if (token) state.token = token;
      } else if (key === 'chipViewModel' || key === 'chipBarViewModel' || key === 'frameworkUpdates') {
        // sort menus / entity store — never contain the list
      } else {
        collect(val, channels, state);
      }
    }
  };

  const status = () => ({
    onYouTube: location.hostname === 'www.youtube.com',
    ready: !!cfg('INNERTUBE_CONTEXT'),
    loggedIn: cfg('LOGGED_IN') === true,
  });

  const assertReady = () => {
    const s = status();
    if (!s.ready) throw new Error('NOT_READY');
    if (!s.loggedIn) throw new Error('NOT_LOGGED_IN');
  };

  const fetchSubscriptions = async (onPage) => {
    assertReady();
    const channels = new Map();
    const state = { token: null };
    let res = await api('browse', { browseId: 'FEchannels' });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    collect(res.json.contents, channels, state);
    let pages = 1;
    while (state.token && pages < 1000) {
      const token = state.token;
      state.token = null;
      res = await api('browse', { continuation: token });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      const before = channels.size;
      collect(res.json.onResponseReceivedActions || res.json.continuationContents, channels, state);
      pages++;
      if (onPage) onPage(channels.size);
      if (channels.size === before) break;
    }
    return [...channels.values()];
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const job = {
    running: false, stop: false, phase: 'idle',
    total: 0, done: 0, subscribed: 0, skipped: 0, failed: [], verified: null,
    current: '', error: '', finishedAt: null,
  };

  const snapshot = () => JSON.parse(JSON.stringify(job));

  const subscribeOne = async (channelId) => {
    let wait = 5000;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await api('subscription/subscribe', { channelIds: [channelId], params: SUBSCRIBE_PARAMS });
      if (res.ok) return { ok: true };
      if (res.status === 429 || res.status >= 500) { await sleep(wait); wait *= 2; continue; }
      return { ok: false, reason: res.json?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: false, reason: 'rate limited' };
  };

  const runImport = async (list, delayMs) => {
    Object.assign(job, {
      running: true, stop: false, phase: 'checking',
      total: list.length, done: 0, subscribed: 0, skipped: 0, failed: [], verified: null,
      current: '', error: '', finishedAt: null,
    });
    try {
      assertReady();
      const existing = new Set((await fetchSubscriptions()).map((c) => c.channelId));
      job.phase = 'subscribing';
      for (const ch of list) {
        if (job.stop) break;
        job.current = ch.title || ch.channelId;
        if (existing.has(ch.channelId)) {
          job.skipped++;
        } else {
          const r = await subscribeOne(ch.channelId);
          if (r.ok) { job.subscribed++; existing.add(ch.channelId); }
          else job.failed.push({ ...ch, reason: r.reason });
          if (!job.stop) await sleep(delayMs + Math.floor(Math.random() * Math.min(1000, delayMs / 2 + 1)));
        }
        job.done++;
      }
      // Re-read the list so the result reflects what YouTube actually saved.
      job.phase = 'verifying';
      job.current = '';
      const after = new Set((await fetchSubscriptions()).map((c) => c.channelId));
      const wanted = list.slice(0, job.done);
      const missing = wanted.filter((c) => !after.has(c.channelId));
      job.verified = wanted.length - missing.length;
      const failedIds = new Set(job.failed.map((f) => f.channelId));
      for (const m of missing) {
        if (!failedIds.has(m.channelId)) job.failed.push({ ...m, reason: 'not present after import' });
      }
    } catch (e) {
      job.error = String(e && e.message || e);
    } finally {
      job.running = false;
      job.phase = job.stop ? 'stopped' : 'done';
      job.finishedAt = Date.now();
    }
  };

  window.__YTS = {
    version: VERSION,
    status,
    fetchSubscriptions,
    startImport(list, delayMs) {
      if (job.running) return { started: false, reason: 'ALREADY_RUNNING' };
      const clean = [];
      const seen = new Set();
      for (const c of list || []) {
        if (c && CHANNEL_ID_RE.test(c.channelId) && !seen.has(c.channelId)) {
          seen.add(c.channelId);
          clean.push({ channelId: c.channelId, title: String(c.title || '') });
        }
      }
      runImport(clean, Math.max(500, Number(delayMs) || 2000));
      return { started: true, total: clean.length };
    },
    stopImport() { job.stop = true; return snapshot(); },
    progress: snapshot,
  };
})();
