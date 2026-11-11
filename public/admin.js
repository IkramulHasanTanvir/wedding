'use strict';
const loginView = $('#loginView'), dashView = $('#dashView'), logoutLink = $('#logoutLink');
const rowsEl = $('#rows'), emptyEl = $('#empty'), dashMsg = $('#dashMsg');
const dlg = $('#editDlg');
let friends = [];
let editingId = null;
let timer = null;

function showLogin() {
  clearInterval(timer);
  loginView.hidden = false; dashView.hidden = true; logoutLink.hidden = true;
  $('#username').focus();
}
function showDash() {
  loginView.hidden = true; dashView.hidden = false; logoutLink.hidden = false;
}

async function load() {
  try {
    const data = await api('/api/admin/friends');
    friends = data.friends;
    $('#sTotal').textContent = data.stats.total;
    $('#sDone').textContent = data.stats.completed;
    $('#sPending').textContent = data.stats.pending;
    showMsg(dashMsg, '');
    render();
  } catch (err) {
    if (err.status === 401) return showLogin();
    showMsg(dashMsg, err.message);
  }
}

function td(label, content) {
  const el = document.createElement('td');
  el.dataset.label = label;
  if (content instanceof Node) el.appendChild(content); else el.textContent = content;
  return el;
}
function btn(text, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn small ' + cls; b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function render() {
  const q = $('#search').value.trim().toLowerCase();
  const f = $('#filter').value;
  const list = friends.filter((r) =>
    (!f || r.paymentStatus === f) &&
    (!q || [r.name, r.code, r.phone, r.senderNumber].some((v) => (v || '').toLowerCase().includes(q))));
  rowsEl.innerHTML = '';
  emptyEl.hidden = list.length > 0;

  for (const r of list) {
    const tr = document.createElement('tr');

    const nameCell = document.createElement('div');
    nameCell.textContent = r.name;
    const meta = document.createElement('span');
    meta.className = 'sub-cell';
    meta.textContent = r.code + ' · ' + r.phone;
    nameCell.appendChild(meta);

    const methodCell = document.createElement('div');
    methodCell.textContent = methodLabel(r.paymentMethod);
    if (r.paymentMethod === 'bkash' && r.senderNumber) {
      const s = document.createElement('span');
      s.className = 'sub-cell'; s.textContent = 'From ' + r.senderNumber;
      methodCell.appendChild(s);
    }

    const actions = document.createElement('td');
    actions.className = 'actions';
    if (r.paymentStatus === 'completed') {
      actions.appendChild(btn('Mark pending', 'ghost', () => setStatus(r, 'pending')));
    } else {
      actions.appendChild(btn('Mark paid', '', () => setStatus(r, 'completed')));
    }
    actions.appendChild(btn('Edit', 'ghost', () => openEdit(r)));
    actions.appendChild(btn('Delete', 'danger', () => remove(r)));

    tr.append(td('Name', nameCell), td('Panjabi Size', r.panjabiSize), td('Payment Method', methodCell),
      td('Payment Status', badge(r.paymentStatus)), actions);
    rowsEl.appendChild(tr);
  }
}

async function setStatus(r, status) {
  try { await api('/api/admin/friends/' + r.id, 'PATCH', { paymentStatus: status }); await load(); }
  catch (err) { if (err.status === 401) return showLogin(); showMsg(dashMsg, err.message); }
}

async function remove(r) {
  if (!confirm('Delete ' + r.name + ' (' + r.code + ')? This cannot be undone.')) return;
  try { await api('/api/admin/friends/' + r.id, 'DELETE'); await load(); }
  catch (err) { if (err.status === 401) return showLogin(); showMsg(dashMsg, err.message); }
}

/* edit dialog */
function syncSender() { $('#eSenderField').hidden = $('#eMethod').value !== 'bkash'; }
function openEdit(r) {
  editingId = r.id;
  $('#eName').value = r.name; $('#eSize').value = r.panjabiSize; $('#ePhone').value = r.phone;
  $('#eMethod').value = r.paymentMethod; $('#eSender').value = r.senderNumber; $('#eStatus').value = r.paymentStatus;
  showMsg($('#editMsg'), ''); syncSender();
  dlg.showModal();
}
$('#eMethod').addEventListener('change', syncSender);
$('#editCancel').addEventListener('click', () => dlg.close());
$('#editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const saveBtn = $('#editSave'); saveBtn.disabled = true;
  try {
    await api('/api/admin/friends/' + editingId, 'PATCH', {
      name: $('#eName').value, panjabiSize: $('#eSize').value, phone: $('#ePhone').value,
      method: $('#eMethod').value, senderNumber: $('#eSender').value, paymentStatus: $('#eStatus').value,
    });
    dlg.close(); await load();
  } catch (err) {
    if (err.status === 401) { dlg.close(); return showLogin(); }
    showMsg($('#editMsg'), err.message);
  } finally { saveBtn.disabled = false; }
});

/* login / logout */
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const b = $('#loginBtn'); b.disabled = true;
  try {
    await api('/api/admin/login', 'POST', { username: $('#username').value, password: $('#password').value });
    $('#password').value = ''; showMsg($('#loginMsg'), '');
    showDash(); await load(); startPolling();
  } catch (err) { showMsg($('#loginMsg'), err.message); }
  finally { b.disabled = false; }
});
logoutLink.addEventListener('click', async (e) => {
  e.preventDefault();
  try { await api('/api/admin/logout', 'POST', {}); } catch (_) {}
  friends = []; rowsEl.innerHTML = ''; showLogin();
});

$('#search').addEventListener('input', render);
$('#filter').addEventListener('change', render);

function startPolling() {
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden && !dlg.open) load(); }, 15000);
}

(async function init() {
  try {
    const { authenticated } = await api('/api/admin/session');
    if (authenticated) { showDash(); await load(); startPolling(); } else showLogin();
  } catch (_) { showLogin(); }
})();
