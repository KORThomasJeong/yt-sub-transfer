// Fake chrome.* APIs so the real popup can be rendered for screenshots.
(() => {
  const q = new URLSearchParams(location.search);
  const scene = q.get('mock');
  const lang = q.get('lang') || 'ko';

  const xhr = new XMLHttpRequest();
  xhr.open('GET', `/_locales/${lang}/messages.json`, false);
  xhr.send();
  const messages = JSON.parse(xhr.responseText);
  document.documentElement.lang = lang;

  const getMessage = (key, subs) => {
    const m = messages[key];
    if (!m) return '';
    const list = subs === undefined ? [] : [].concat(subs);
    return m.message.replace(/\$(\w+)\$/g, (_, name) => {
      const ph = m.placeholders && m.placeholders[name.toLowerCase()];
      const idx = ph ? Number(ph.content.slice(1)) - 1 : -1;
      return idx >= 0 ? String(list[idx] ?? '') : '';
    });
  };

  const sample = lang === 'ko' ? '오늘의 요리 채널' : 'Daily Cooking';
  const progress = {
    idle: { running: false, phase: 'idle', total: 0, done: 0, subscribed: 0, skipped: 0, failed: [], verified: null, current: '', error: '' },
    import: { running: true, phase: 'subscribing', total: 248, done: 131, subscribed: 119, skipped: 12, failed: [], verified: null, current: sample, error: '' },
    done: { running: false, phase: 'done', total: 248, done: 248, subscribed: 235, skipped: 13, failed: [], verified: 248, current: '', error: '' },
  };

  window.chrome = {
    i18n: { getMessage },
    tabs: {
      query: async () => [{ id: 1, url: 'https://www.youtube.com/feed/channels' }],
      create: () => {},
    },
    scripting: {
      executeScript: async ({ func }) => {
        if (!func) return [];
        const src = func.toString();
        if (src.includes('status()')) return [{ result: { onYouTube: true, ready: true, loggedIn: true } }];
        if (src.includes('progress()')) return [{ result: progress[scene] || progress.idle }];
        return [{ result: null }];
      },
    },
  };

  window.addEventListener('load', () => {
    setTimeout(() => {
      const $ = (id) => document.getElementById(id);
      if (scene === 'export') {
        $('export-result').textContent = getMessage('exportDone', ['248']);
      }
      if (scene === 'import' || scene === 'done') {
        const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const channels = Array.from({ length: 248 }, (_, i) => ({
          channelId: 'UC' + String(i).padStart(4, '0') + abc.slice(0, 18),
          title: '',
        }));
        const dt = new DataTransfer();
        dt.items.add(new File([JSON.stringify({ channels })], 'youtube-subscriptions-2026-10-05.json', { type: 'application/json' }));
        $('file').files = dt.files;
        $('file').dispatchEvent(new Event('change'));
      }
    }, 300);
    setTimeout(() => parent.postMessage({ popupHeight: document.documentElement.scrollHeight }, '*'), 900);
  });
})();
