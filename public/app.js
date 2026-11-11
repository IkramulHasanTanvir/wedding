'use strict';
/* Shared helpers */
const $ = (s, el = document) => el.querySelector(s);

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong.'); e.status = res.status; throw e; }
  return data;
}

function showMsg(el, text, type = 'err') {
  el.textContent = text;
  el.className = 'msg ' + type;
  el.hidden = !text;
}

const methodLabel = (m) => (m === 'bkash' ? 'bKash' : 'Cash');
const statusLabel = (s) => (s === 'completed' ? 'Payment Completed' : 'Pending');
function badge(status) {
  const b = document.createElement('span');
  b.className = 'badge ' + status;
  b.textContent = statusLabel(status);
  return b;
}

async function copyText(text, btn) {
  const original = btn.textContent;
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const t = document.createElement('textarea');
      t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    btn.textContent = 'Copied ✓';
  } catch (_) { btn.textContent = 'Copy failed'; }
  setTimeout(() => (btn.textContent = original), 1800);
}

/* Fill shared header/footer bits from config */
api('/api/config').then((c) => {
  document.querySelectorAll('[data-event-title]').forEach((e) => (e.textContent = c.eventTitle));
  document.title = document.title.replace('{event}', c.eventTitle);
}).catch(() => {});
