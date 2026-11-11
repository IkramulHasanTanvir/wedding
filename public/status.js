'use strict';
const form = $('#statusForm');
const msg = $('#statusMsg');
const result = $('#result');
let timer = null;
let current = '';

function render(f) {
  const dl = $('#resultDetails');
  dl.innerHTML = '';
  const rows = [['Unique ID', f.id], ['Name', f.name], ['Panjabi Size', f.panjabiSize], ['Payment Method', methodLabel(f.paymentMethod)]];
  rows.forEach(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  });
  const dt = document.createElement('dt'); dt.textContent = 'Payment Status';
  const dd = document.createElement('dd'); dd.appendChild(badge(f.paymentStatus));
  dl.append(dt, dd);
  result.hidden = false;
}

async function lookup(q, { silent = false } = {}) {
  try {
    const { friend } = await api('/api/status', 'POST', { query: q });
    showMsg(msg, '');
    render(friend);
    current = friend.id; // poll by unique ID from now on
    return true;
  } catch (err) {
    if (!silent) { result.hidden = true; showMsg(msg, err.message); }
    return false;
  }
}

function startPolling() {
  clearInterval(timer);
  // Re-check every 10s so admin changes show up without reloading.
  timer = setInterval(() => { if (!document.hidden && current) lookup(current, { silent: true }); }, 10000);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#query').value.trim();
  if (!q) return showMsg(msg, 'Enter your mobile number or unique ID.');
  const btn = $('#checkBtn');
  btn.disabled = true; btn.textContent = 'Checking…';
  const ok = await lookup(q);
  btn.disabled = false; btn.textContent = 'Check Status';
  if (ok) startPolling();
});

document.addEventListener('visibilitychange', () => { if (!document.hidden && current) lookup(current, { silent: true }); });

const preset = new URLSearchParams(location.search).get('q');
if (preset) { $('#query').value = preset; lookup(preset).then((ok) => ok && startPolling()); }
